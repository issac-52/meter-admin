import { getValveRecords, type ValveSortCol, type ValveSortDir } from '@/features/valve-survey/api/actions';
import { getBlockList } from '@/features/meter-survey/api/actions';
import { VALVE_TYPE_OPTIONS } from '@/features/valve-survey/types/mappers';
import type { ValveType } from '@/shared/types/valve-record';
import ValveTable from '@/features/valve-survey/components/ValveTable';

export const metadata = { title: '밸브관리' };

const PAGE_SIZE = 20;
const VALID_SORT_COLS: ValveSortCol[] = ['valve_no', 'created_at'];
const VALID_SORT_DIRS: ValveSortDir[] = ['asc', 'desc'];

export default async function ValvePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; block?: string; q?: string; sort?: string; dir?: string; type?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const block = params.block;
  const search = params.q?.trim() || undefined;
  const sortCol = (VALID_SORT_COLS.includes(params.sort as ValveSortCol) ? params.sort : 'created_at') as ValveSortCol;
  const sortDir = (VALID_SORT_DIRS.includes(params.dir as ValveSortDir) ? params.dir : 'desc') as ValveSortDir;
  const valveType = (VALVE_TYPE_OPTIONS.includes(params.type as ValveType) ? params.type : undefined) as ValveType | undefined;

  const [blocks, { data, count, gateValveCount, hydrantCount, airValveCount }] = await Promise.all([
    getBlockList(),
    getValveRecords(page, PAGE_SIZE, block, valveType, search, sortCol, sortDir),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">밸브관리</h1>
      </div>
      <ValveTable
        records={data}
        blocks={blocks}
        selectedBlock={block ?? null}
        search={search ?? ''}
        total={count}
        page={page}
        pageSize={PAGE_SIZE}
        sortCol={sortCol}
        sortDir={sortDir}
        valveType={valveType ?? null}
        gateValveCount={gateValveCount}
        hydrantCount={hydrantCount}
        airValveCount={airValveCount}
      />
    </div>
  );
}
