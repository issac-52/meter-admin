'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { type RegionWithBlocks, createRegion, deleteRegion, assignBlockToRegion } from '@/features/meter-survey/api/regions-actions';
import { useRouter } from 'next/navigation';

type Props = {
  regions: RegionWithBlocks[];
  allBlocks: string[];
};

export default function RegionsClient({ regions, allBlocks }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const blockRegionMap = new Map<string, string | null>();
  for (const r of regions) {
    for (const b of r.blocks) blockRegionMap.set(b, r.id);
  }
  const unassigned = allBlocks.filter((b) => !blockRegionMap.has(b));

  function refresh() {
    router.refresh();
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    startTransition(async () => {
      const res = await createRegion(newName.trim());
      if (res.error) { setError(res.error); return; }
      setNewName('');
      refresh();
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`'${name}' 지역을 삭제하시겠습니까? 블록 할당이 모두 해제됩니다.`)) return;
    startTransition(async () => {
      await deleteRegion(id);
      refresh();
    });
  }

  function handleAssign(block: string, regionId: string | null) {
    startTransition(async () => {
      await assignBlockToRegion(block, regionId);
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* 지역 추가 폼 */}
      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 지역명 (예: 진안, 금산)"
          className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder-text-secondary/60 focus:outline-none focus:border-accent w-64"
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:opacity-90 disabled:bg-border disabled:opacity-100 disabled:text-text-secondary text-white dark:text-zinc-950 disabled:dark:text-text-secondary text-sm rounded-lg transition-colors"
        >
          <Plus size={14} />
          추가
        </button>
        {error && <span className="text-red-500 text-sm">{error}</span>}
      </form>

      {/* 지역 목록 */}
      {regions.length === 0 ? (
        <div className="text-text-secondary text-sm py-8 text-center border border-border rounded-xl">
          지역을 추가해주세요.
        </div>
      ) : (
        <div className="space-y-3">
          {regions.map((region) => (
            <div key={region.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-accent" />
                  <span className="text-text-primary font-semibold">{region.name}</span>
                  <span className="text-xs text-text-secondary tabular-nums">블록 {region.blocks.length}개</span>
                </div>
                <button
                  onClick={() => handleDelete(region.id, region.name)}
                  disabled={isPending}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Trash2 size={13} />
                  삭제
                </button>
              </div>
              {/* 이 지역에 속한 블록들 */}
              <div className="flex flex-wrap gap-1.5">
                {region.blocks.length === 0 && (
                  <span className="text-xs text-text-secondary/70">할당된 블록 없음</span>
                )}
                {region.blocks.map((b) => (
                  <button
                    key={b}
                    onClick={() => handleAssign(b, null)}
                    disabled={isPending}
                    title="클릭하면 지역 해제"
                    className="px-2.5 py-1 text-xs bg-accent/10 text-accent border border-accent/30 rounded-lg font-mono hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-colors group"
                  >
                    {b} <span className="opacity-0 group-hover:opacity-100 transition-opacity">×</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 미분류 블록 */}
      {unassigned.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-text-secondary font-semibold text-sm">미분류 블록</span>
            <span className="text-xs text-text-secondary/70 tabular-nums">{unassigned.length}개</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((b) => (
              <div key={b} className="flex items-center gap-1">
                <span className="px-2.5 py-1 text-xs bg-background text-text-secondary rounded-lg font-mono">{b}</span>
                {regions.length > 0 && (
                  <select
                    disabled={isPending}
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) handleAssign(b, e.target.value); }}
                    className="text-xs bg-background border border-border text-text-secondary rounded px-1.5 py-1 focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="" disabled>지역 지정</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {allBlocks.length === 0 && (
        <div className="text-text-secondary text-sm py-8 text-center border border-border rounded-xl">
          엑셀 업로드로 블록을 먼저 등록해주세요.
        </div>
      )}
    </div>
  );
}
