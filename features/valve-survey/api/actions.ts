'use server';

import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createClient as createServerClient } from '@/shared/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ValveRecord, ValveInsert, ValveType } from '@/shared/types/valve-record';
import { deleteFromStorage } from '@/shared/lib/r2-storage';

function nextDay(date: string) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function requireAuth() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
}

export async function createValveRecord(
  data: Partial<ValveInsert> & Pick<ValveInsert, 'block' | 'valve_type'>,
): Promise<{ error?: string; id?: number }> {
  await requireAuth();
  const admin = createAdminClient();
  const { data: inserted, error } = await admin.from('valve_records').insert(data).select('id').single();
  if (error) return { error: error.message };
  revalidatePath('/admin/valve');
  return { id: inserted.id };
}

export async function updateValveRecord(id: number, data: Partial<ValveInsert>): Promise<{ error?: string }> {
  await requireAuth();
  const admin = createAdminClient();
  const { error } = await admin.from('valve_records').update(data).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/valve');
  return {};
}

export async function deleteValveRecord(id: number): Promise<{ error?: string }> {
  await requireAuth();
  const admin = createAdminClient();
  const { error } = await admin.from('valve_records').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/valve');
  return {};
}

export async function getValveRecordsForMap(block?: string, valveType?: ValveType): Promise<ValveRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('valve_records')
    .select('*')
    .not('lat', 'is', null)
    .not('lng', 'is', null);
  if (block) query = query.eq('block', block);
  if (valveType) query = query.eq('valve_type', valveType);
  const { data } = await query;
  return (data ?? []) as ValveRecord[];
}

export type ValveSortCol = 'valve_no' | 'created_at';
export type ValveSortDir = 'asc' | 'desc';

export async function getValveRecords(
  page: number,
  pageSize: number,
  block?: string,
  valveType?: ValveType,
  search?: string,
  sortCol: ValveSortCol = 'created_at',
  sortDir: ValveSortDir = 'desc',
) {
  await requireAuth();
  const admin = createAdminClient();
  const asc = sortDir === 'asc';

  let mainQuery = admin
    .from('valve_records')
    .select('*', { count: 'exact' })
    .order(sortCol, { ascending: asc, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  let gateValveQuery = admin.from('valve_records').select('*', { count: 'exact', head: true }).eq('valve_type', '제수밸브');
  let hydrantQuery = admin.from('valve_records').select('*', { count: 'exact', head: true }).eq('valve_type', '소화전');
  let airValveQuery = admin.from('valve_records').select('*', { count: 'exact', head: true }).eq('valve_type', '공기밸브');

  if (block) {
    mainQuery = mainQuery.eq('block', block);
    gateValveQuery = gateValveQuery.eq('block', block);
    hydrantQuery = hydrantQuery.eq('block', block);
    airValveQuery = airValveQuery.eq('block', block);
  }
  if (valveType) {
    mainQuery = mainQuery.eq('valve_type', valveType);
  }
  if (search) {
    const term = `%${search}%`;
    mainQuery = mainQuery.or(`valve_no.ilike.${term},old_address.ilike.${term},road_address.ilike.${term}`);
  }

  const [{ data, count, error }, { count: gateValveCount }, { count: hydrantCount }, { count: airValveCount }] =
    await Promise.all([mainQuery, gateValveQuery, hydrantQuery, airValveQuery]);

  return {
    data: (data ?? []) as ValveRecord[],
    count: count ?? 0,
    gateValveCount: gateValveCount ?? 0,
    hydrantCount: hydrantCount ?? 0,
    airValveCount: airValveCount ?? 0,
    error,
  };
}

async function queryValveImagesInRange(dateFrom: string, dateTo: string, block?: string) {
  const admin = createAdminClient();
  let query = admin
    .from('valve_records')
    .select('id, image1_id, image2_id')
    .or('image1_id.not.is.null,image2_id.not.is.null')
    .gte('survey_date', dateFrom)
    .lt('survey_date', nextDay(dateTo));
  if (block) query = query.eq('block', block);
  const { data, error } = await query;
  return {
    data: (data ?? []) as { id: number; image1_id: string | null; image2_id: string | null }[],
    error,
  };
}

// 삭제 전 미리보기 — 몇 건의 레코드/이미지가 영향받는지 확인용 (실제 삭제는 수행하지 않음)
export async function getValveImageDeletionPreview(
  dateFrom: string,
  dateTo: string,
  block?: string,
): Promise<{ recordCount: number; imageCount: number; error?: string }> {
  await requireAuth();
  const { data, error } = await queryValveImagesInRange(dateFrom, dateTo, block);
  if (error) return { recordCount: 0, imageCount: 0, error: error.message };
  const imageCount = data.reduce((sum, r) => sum + [r.image1_id, r.image2_id].filter(Boolean).length, 0);
  return { recordCount: data.length, imageCount };
}

// 지정 기간(조사일자 기준) 이미지 일괄 삭제 — R2 스토리지에서 파일 삭제 + DB 컬럼 null 처리. 복구 불가.
export async function bulkDeleteValveImages(
  dateFrom: string,
  dateTo: string,
  block?: string,
): Promise<{ deletedCount?: number; error?: string }> {
  await requireAuth();
  const admin = createAdminClient();
  const { data, error } = await queryValveImagesInRange(dateFrom, dateTo, block);
  if (error) return { error: error.message };

  let deletedCount = 0;
  for (const r of data) {
    const paths = [r.image1_id, r.image2_id].filter((p): p is string => !!p);
    await Promise.all(paths.map((p) => deleteFromStorage(p).catch(() => {})));
    deletedCount += paths.length;
  }

  if (data.length > 0) {
    const { error: updateError } = await admin
      .from('valve_records')
      .update({ image1_id: null, image2_id: null })
      .in('id', data.map((r) => r.id));
    if (updateError) return { error: updateError.message };
  }

  revalidatePath('/admin/valve');
  return { deletedCount };
}

export async function importValvesFromExcel(block: string, rows: Partial<ValveInsert>[]) {
  await requireAuth();
  const admin = createAdminClient();

  // valve_records.block은 block_regions(block)을 FK로 참조 — 새 블록이면 먼저 등록 (미분류로)
  await admin.from('block_regions').upsert({ block }, { onConflict: 'block', ignoreDuplicates: true });

  const { data: existing } = await admin.from('valve_records').select('id, valve_no').eq('block', block);
  const existingByValveNo = new Map(
    (existing ?? [])
      .filter((r): r is { id: number; valve_no: string } => r.valve_no != null)
      .map((r) => [r.valve_no, r.id]),
  );

  const toInsert: Partial<ValveInsert>[] = [];
  const toUpdate: { id: number; data: Partial<ValveInsert> }[] = [];

  for (const row of rows) {
    const existingId = row.valve_no != null ? existingByValveNo.get(row.valve_no) : undefined;
    if (existingId != null) {
      toUpdate.push({ id: existingId, data: row });
    } else {
      toInsert.push({ ...row, block });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from('valve_records').insert(toInsert);
    if (error) return { error: error.message };
  }

  if (toUpdate.length > 0) {
    const { error } = await admin
      .from('valve_records')
      .upsert(
        toUpdate.map(({ id, data }) => ({ id, block, ...data })),
        { onConflict: 'id', ignoreDuplicates: false },
      );
    if (error) return { error: error.message };
  }

  revalidatePath('/admin/valve');
  return { success: true };
}
