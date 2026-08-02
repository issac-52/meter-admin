'use server';

import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createClient as createServerClient } from '@/shared/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ValveRecord, ValveInsert, ValveType } from '@/shared/types/valve-record';

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

export async function importValvesFromExcel(block: string, rows: Partial<ValveInsert>[]) {
  await requireAuth();
  const admin = createAdminClient();

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
