import { getRegionsWithBlocks, getRegions } from '@/features/meter-survey/api/regions-actions';
import { getBlockList } from '@/features/meter-survey/api/actions';
import RegionsClient from '@/features/meter-survey/components/RegionsClient';

export const metadata = { title: '분류관리' };

export default async function RegionsPage() {
  const [regions, allBlocks] = await Promise.all([
    getRegionsWithBlocks(),
    getBlockList(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">분류관리</h1>
        <p className="text-sm text-text-secondary mt-1">블록을 지역 단위로 묶어 관리합니다.</p>
      </div>
      <RegionsClient regions={regions} allBlocks={allBlocks} />
    </div>
  );
}
