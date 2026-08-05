'use server';

import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createClient as createServerClient } from '@/shared/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { MeterRecord, MeterInsert } from '@/shared/types/meter-record';
import { getUserRole, type UserRole } from '@/shared/lib/auth/get-user-role';
import { maskName } from '@/features/meter-survey/types/mappers';
import { deleteFromStorage } from '@/shared/lib/r2-storage';

async function requireAuth() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
}

// role이 admin이 아니면 실명을 마스킹해서 반환 (실명 원본이 네트워크 응답에 노출되지 않도록 반드시 여기서 결정)
function withNameMasking<T extends { name: string | null }>(rows: T[], role: UserRole): T[] {
  if (role === 'admin') return rows;
  return rows.map((r) => ({ ...r, name: maskName(r.name) }));
}

export type SortCol = 'row_no' | 'address' | 'survey_date';
export type SortDir = 'asc' | 'desc';

export type StatusFilter = 'processed' | 'unprocessed' | 'closed';

// 하나라도 비어있음
const ANY_EMPTY =
  'meter_number.is.null,reading.is.null,sealed.is.null,location.is.null,usage_type.is.null,floor.is.null';
// 종결(호폐/위치불명/적재) 아님 — note가 null이거나 closed 목록에 없는 경우
// note.is.null: null 허용 / note.not.in.(...): 호폐·위치불명·적재 제외
const NOT_CLOSED = 'note.is.null,note.not.in.(호폐,위치불명,적재)';

export async function getMeterRecords(
  page: number,
  pageSize: number,
  block?: string,
  search?: string,
  sortCol: SortCol = 'row_no',
  sortDir: SortDir = 'asc',
  status?: StatusFilter,
  dateFrom?: string,
  dateTo?: string,
  blockIn?: string[],
) {
  const admin = createAdminClient();
  const asc = sortDir === 'asc';

  let mainQuery = admin
    .from('meter_records')
    .select('*', { count: 'exact' })
    .order(sortCol, { ascending: asc, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  let totalQuery     = admin.from('meter_records').select('*', { count: 'exact', head: true });
  let closedQuery    = admin.from('meter_records').select('*', { count: 'exact', head: true }).or('note.eq.호폐,note.eq.위치불명,note.eq.적재');
  let processedQuery = admin.from('meter_records').select('*', { count: 'exact', head: true })
    .or(NOT_CLOSED)
    .not('meter_number', 'is', null).not('reading', 'is', null)
    .not('sealed', 'is', null).not('location', 'is', null)
    .not('usage_type', 'is', null).not('floor', 'is', null);

  if (blockIn && blockIn.length > 0) {
    mainQuery      = mainQuery.in('block', blockIn);
    totalQuery     = totalQuery.in('block', blockIn);
    closedQuery    = closedQuery.in('block', blockIn);
    processedQuery = processedQuery.in('block', blockIn);
  } else if (block) {
    mainQuery      = mainQuery.eq('block', block);
    totalQuery     = totalQuery.eq('block', block);
    closedQuery    = closedQuery.eq('block', block);
    processedQuery = processedQuery.eq('block', block);
  }
  if (search) {
    const term = `%${search}%`;
    const sf = `row_no.ilike.${term},address.ilike.${term},old_meter_number.ilike.${term}`;
    mainQuery      = mainQuery.or(sf);
    totalQuery     = totalQuery.or(sf);
    closedQuery    = closedQuery.or(sf);
    processedQuery = processedQuery.or(sf);
  }

  // 상태 필터는 메인 쿼리에만 적용
  if (status === 'closed') {
    mainQuery = mainQuery.or('note.eq.호폐,note.eq.위치불명,note.eq.적재');
  } else if (status === 'processed') {
    mainQuery = mainQuery.or(NOT_CLOSED)
      .not('meter_number', 'is', null).not('reading', 'is', null)
      .not('sealed', 'is', null).not('location', 'is', null)
      .not('usage_type', 'is', null).not('floor', 'is', null);
  } else if (status === 'unprocessed') {
    mainQuery = mainQuery.or(NOT_CLOSED).or(ANY_EMPTY);
  }

  if (dateFrom) {
    mainQuery      = mainQuery.gte('survey_date', dateFrom);
    totalQuery     = totalQuery.gte('survey_date', dateFrom);
    closedQuery    = closedQuery.gte('survey_date', dateFrom);
    processedQuery = processedQuery.gte('survey_date', dateFrom);
  }
  if (dateTo) {
    const nd = nextDay(dateTo);
    mainQuery      = mainQuery.lt('survey_date', nd);
    totalQuery     = totalQuery.lt('survey_date', nd);
    closedQuery    = closedQuery.lt('survey_date', nd);
    processedQuery = processedQuery.lt('survey_date', nd);
  }

  const [{ data, count, error }, { count: totalCount }, { count: closedCount }, { count: processedCount }] =
    await Promise.all([mainQuery, totalQuery, closedQuery, processedQuery]);

  const role = await getUserRole();

  return {
    data: withNameMasking((data ?? []) as MeterRecord[], role),
    count: count ?? 0,
    totalCount: totalCount ?? 0,
    processedCount: processedCount ?? 0,
    closedCount: closedCount ?? 0,
    error,
  };
}

export async function getBlockList(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('block_regions').select('block').order('block');
  return (data ?? []).map((r: { block: string }) => r.block);
}

export async function importFromExcel(block: string, rows: MeterInsert[]) {
  await requireAuth();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('meter_records')
    .select('id, row_no')
    .eq('block', block);

  const existingByRowNo = new Map(
    (existing ?? [])
      .filter((r): r is { id: number; row_no: string } => r.row_no != null)
      .map((r) => [r.row_no, r.id]),
  );

  const toInsert: MeterInsert[] = [];
  const toUpdate: { id: number; data: Partial<MeterInsert> }[] = [];

  for (const row of rows) {
    const existingId = row.row_no != null ? existingByRowNo.get(row.row_no) : undefined;
    if (existingId != null) {
      toUpdate.push({
        id: existingId,
        data: {
          name: row.name,
          address: row.address,
          old_meter_number: row.old_meter_number,
          final_reading: row.final_reading,
          block: row.block,
        },
      });
    } else {
      toInsert.push(row);
    }
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from('meter_records').insert(toInsert);
    if (error) return { error: error.message };
  }

  if (toUpdate.length > 0) {
    const { error } = await admin
      .from('meter_records')
      .upsert(
        toUpdate.map(({ id, data }) => ({ id, ...data })),
        { onConflict: 'id', ignoreDuplicates: false },
      );
    if (error) return { error: error.message };
  }

  // 새 블록이면 block_regions에 미분류(region_id=null)로 등록
  await admin.from('block_regions').upsert({ block }, { onConflict: 'block', ignoreDuplicates: true });

  revalidatePath('/admin/meter');
  return { success: true };
}

export async function updateMeterRecord(id: number, data: Partial<MeterInsert>) {
  await requireAuth();
  const admin = createAdminClient();
  const { error } = await admin.from('meter_records').update(data).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/meter');
  return { success: true };
}

export async function deleteMeterRecord(id: number) {
  await requireAuth();
  const admin = createAdminClient();
  const { error } = await admin.from('meter_records').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/admin/meter');
  return { success: true };
}

export async function getMeterRecordsWithSurveyData(): Promise<MeterRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  const { data } = await admin
    .from('meter_records')
    .select('*')
    .or('meter_number.not.is.null,reading.not.is.null,sealed.not.is.null,note.eq.호폐,note.eq.적재')
    .order('block', { ascending: true })
    .order('row_no', { ascending: true, nullsFirst: false });
  const role = await getUserRole();
  return withNameMasking((data ?? []) as MeterRecord[], role);
}

export async function getMeterRecordsForExport(blocks: string[]): Promise<MeterRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  const { data } = await admin
    .from('meter_records')
    .select('*')
    .in('block', blocks);
  const role = await getUserRole();
  return withNameMasking((data ?? []) as MeterRecord[], role);
}

function nextDay(date: string) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getCompletedRecords(dateFrom?: string, dateTo?: string): Promise<MeterRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('*')
    .or(
      `and(note.is.null,meter_number.not.is.null,reading.not.is.null,sealed.not.is.null,location.not.is.null,usage_type.not.is.null,floor.not.is.null),` +
      `and(note.not.in.(호폐,적재),meter_number.not.is.null,reading.not.is.null,sealed.not.is.null,location.not.is.null,usage_type.not.is.null,floor.not.is.null),` +
      `note.eq.호폐,` +
      `note.eq.적재`
    )
    .order('block', { ascending: true })
    .order('row_no', { ascending: true, nullsFirst: false });
  if (dateFrom) query = query.gte('survey_date', dateFrom);
  if (dateTo) query = query.lt('survey_date', nextDay(dateTo));
  const { data } = await query;
  const role = await getUserRole();
  return withNameMasking((data ?? []) as MeterRecord[], role);
}

export async function getRecordsWithImages(dateFrom?: string, dateTo?: string): Promise<Pick<MeterRecord, 'id' | 'block' | 'row_no' | 'image1_id' | 'image2_id' | 'image3_id' | 'image4_id' | 'survey_date'>[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('id, block, row_no, image1_id, image2_id, image3_id, image4_id, survey_date')
    .or('image1_id.not.is.null,image2_id.not.is.null,image3_id.not.is.null,image4_id.not.is.null')
    .order('block', { ascending: true })
    .order('row_no', { ascending: true, nullsFirst: false });
  if (dateFrom) query = query.gte('survey_date', dateFrom);
  if (dateTo) query = query.lt('survey_date', nextDay(dateTo));
  const { data } = await query;
  return (data ?? []) as Pick<MeterRecord, 'id' | 'block' | 'row_no' | 'image1_id' | 'image2_id' | 'image3_id' | 'image4_id' | 'survey_date'>[];
}

export async function getMeterRecordsForMap(block?: string, status?: StatusFilter): Promise<MeterRecord[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('*')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('block', { ascending: true })
    .order('row_no', { ascending: true, nullsFirst: false });
  if (block) query = query.eq('block', block);
  if (status === 'closed') {
    query = query.in('note', ['호폐', '적재']);
  } else if (status === 'processed') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query.or(NOT_CLOSED) as any)
      .not('meter_number', 'is', null).not('reading', 'is', null)
      .not('sealed', 'is', null).not('location', 'is', null)
      .not('usage_type', 'is', null).not('floor', 'is', null);
  } else if (status === 'unprocessed') {
    query = query.or(NOT_CLOSED).or(ANY_EMPTY);
  }
  const { data } = await query;
  const role = await getUserRole();
  return withNameMasking((data ?? []) as MeterRecord[], role);
}

export async function getBlockRowNos(block: string): Promise<string[]> {
  await requireAuth();
  const admin = createAdminClient();
  const { data } = await admin
    .from('meter_records')
    .select('row_no')
    .eq('block', block)
    .not('row_no', 'is', null);
  return (data ?? []).map((r: { row_no: string }) => r.row_no);
}

async function queryMeterImagesInRange(dateFrom: string, dateTo: string, block?: string) {
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('id, image1_id, image2_id, image3_id, image4_id')
    .or('image1_id.not.is.null,image2_id.not.is.null,image3_id.not.is.null,image4_id.not.is.null')
    .gte('survey_date', dateFrom)
    .lt('survey_date', nextDay(dateTo));
  if (block) query = query.eq('block', block);
  const { data, error } = await query;
  return {
    data: (data ?? []) as Pick<MeterRecord, 'id' | 'image1_id' | 'image2_id' | 'image3_id' | 'image4_id'>[],
    error,
  };
}

// 삭제 전 미리보기 — 몇 건의 레코드/이미지가 영향받는지 확인용 (실제 삭제는 수행하지 않음)
export async function getMeterImageDeletionPreview(
  dateFrom: string,
  dateTo: string,
  block?: string,
): Promise<{ recordCount: number; imageCount: number; error?: string }> {
  await requireAuth();
  const { data, error } = await queryMeterImagesInRange(dateFrom, dateTo, block);
  if (error) return { recordCount: 0, imageCount: 0, error: error.message };
  const imageCount = data.reduce(
    (sum, r) => sum + [r.image1_id, r.image2_id, r.image3_id, r.image4_id].filter(Boolean).length,
    0,
  );
  return { recordCount: data.length, imageCount };
}

// 지정 기간(조사일자 기준) 이미지 일괄 삭제 — R2 스토리지에서 파일 삭제 + DB 컬럼 null 처리. 복구 불가.
export async function bulkDeleteMeterImages(
  dateFrom: string,
  dateTo: string,
  block?: string,
): Promise<{ deletedCount?: number; error?: string }> {
  await requireAuth();
  const admin = createAdminClient();
  const { data, error } = await queryMeterImagesInRange(dateFrom, dateTo, block);
  if (error) return { error: error.message };

  let deletedCount = 0;
  for (const r of data) {
    const paths = [r.image1_id, r.image2_id, r.image3_id, r.image4_id].filter((p): p is string => !!p);
    await Promise.all(paths.map((p) => deleteFromStorage(p).catch(() => {})));
    deletedCount += paths.length;
  }

  if (data.length > 0) {
    const { error: updateError } = await admin
      .from('meter_records')
      .update({ image1_id: null, image2_id: null, image3_id: null, image4_id: null })
      .in('id', data.map((r) => r.id));
    if (updateError) return { error: updateError.message };
  }

  revalidatePath('/admin/meter');
  return { deletedCount };
}

export async function getUngeocodedRecords(block?: string): Promise<Pick<MeterRecord, 'id' | 'address'>[]> {
  await requireAuth();
  const admin = createAdminClient();
  let query = admin
    .from('meter_records')
    .select('id, address')
    .or('lat.is.null,lng.is.null')
    .not('address', 'is', null);
  if (block) query = query.eq('block', block);
  const { data } = await query;
  return (data ?? []) as Pick<MeterRecord, 'id' | 'address'>[];
}
