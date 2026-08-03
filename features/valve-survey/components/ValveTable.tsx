'use client';

import { useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Pencil, ChevronLeft, ChevronRight, Search, X, ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw, List, Map, Download, Camera } from 'lucide-react';
import type { ValveSortCol, ValveSortDir } from '@/features/valve-survey/api/actions';
import type { ValveRecord, ValveType } from '@/shared/types/valve-record';
import { VALVE_TYPE_LABEL } from '@/features/valve-survey/types/mappers';
import ValveFormModal from './ValveFormModal';
import ValveMapView from './ValveMapView';

type Props = {
  records: ValveRecord[];
  blocks: string[];
  selectedBlock: string | null;
  search: string;
  total: number;
  page: number;
  pageSize: number;
  sortCol: ValveSortCol;
  sortDir: ValveSortDir;
  valveType: ValveType | null;
  gateValveCount: number;
  hydrantCount: number;
  airValveCount: number;
};

function getPaginationRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

function Val({ value }: { value: string | null }) {
  if (!value) return <span className="text-text-secondary/50">-</span>;
  return <span className="text-text-primary">{value}</span>;
}

export default function ValveTable({
  records,
  blocks,
  selectedBlock,
  search,
  total,
  page,
  pageSize,
  sortCol,
  sortDir,
  valveType,
  gateValveCount,
  hydrantCount,
  airValveCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [editingRecord, setEditingRecord] = useState<ValveRecord | null>(null);
  const [searchInput, setSearchInput] = useState(search);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadBlock, setDownloadBlock] = useState('');
  const [isImageDownloading, setIsImageDownloading] = useState(false);
  const [imageProgress, setImageProgress] = useState<{ current: number; total: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function handleRefresh() {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  }

  async function handleImageDownload(block?: string) {
    if (!('showSaveFilePicker' in window)) {
      alert('이 기능은 Chrome 또는 Edge 브라우저에서만 사용 가능합니다.');
      return;
    }
    setIsImageDownloading(true);
    try {
      const params = new URLSearchParams();
      if (block) params.set('block', block);
      const listRes = await fetch(`/admin/api/valve-image-list?${params}`);
      if (!listRes.ok) { alert(await listRes.text()); return; }
      const images: { path: string; filename: string; url: string | null }[] = await listRes.json();
      if (images.length === 0) { alert('해당 조건에 이미지가 없습니다.'); return; }

      const label = block ? `블록${block}` : new Date().toISOString().slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: `밸브이미지_${label}.zip`,
        types: [{ description: 'ZIP 파일', accept: { 'application/zip': ['.zip'] } }],
      });
      const writable = await fileHandle.createWritable();

      const { Zip, ZipDeflate } = await import('fflate');

      let zipCtrl: ReadableStreamDefaultController<Uint8Array>;
      const zipStream = new ReadableStream<Uint8Array>({ start(c) { zipCtrl = c; } });
      const pipePromise = zipStream.pipeTo(writable);

      const zip = new Zip((err, data, final) => {
        if (err) { zipCtrl.error(err); return; }
        zipCtrl.enqueue(data);
        if (final) zipCtrl.close();
      });

      setImageProgress({ current: 0, total: images.length });
      for (let i = 0; i < images.length; i++) {
        const { path, filename, url } = images[i];
        const fetchUrl = url ?? `/admin/api/image-proxy?path=${encodeURIComponent(path)}`;
        const res = await fetch(fetchUrl);
        if (res.ok && res.body) {
          const zipFile = new ZipDeflate(filename, { level: 0 });
          zip.add(zipFile);
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) { zipFile.push(new Uint8Array(0), true); break; }
            zipFile.push(value, false);
          }
        }
        setImageProgress({ current: i + 1, total: images.length });
      }

      zip.end();
      await pipePromise;
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') alert('이미지 다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsImageDownloading(false);
      setImageProgress(null);
    }
  }

  const totalPages = Math.ceil(total / pageSize);
  const paginationRange = getPaginationRange(page, totalPages);

  function navigate(
    newPage: number,
    newBlock?: string | null,
    newSearch?: string,
    newSortCol?: ValveSortCol,
    newSortDir?: ValveSortDir,
    newType?: ValveType | null,
  ) {
    const params = new URLSearchParams();
    const b = newBlock !== undefined ? newBlock : selectedBlock;
    const q = newSearch !== undefined ? newSearch : search;
    const sc = newSortCol !== undefined ? newSortCol : sortCol;
    const sd = newSortDir !== undefined ? newSortDir : sortDir;
    const t = newType !== undefined ? newType : valveType;
    if (b) params.set('block', b);
    if (q) params.set('q', q);
    if (newPage > 1) params.set('page', String(newPage));
    if (sc !== 'created_at' || sd !== 'desc') { params.set('sort', sc); params.set('dir', sd); }
    if (t) params.set('type', t);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSort(col: ValveSortCol) {
    const newDir: ValveSortDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
    navigate(1, undefined, undefined, col, newDir);
  }

  function handleType(t: ValveType | null) {
    navigate(1, undefined, undefined, undefined, undefined, t);
  }

  function SortIcon({ col }: { col: ValveSortCol }) {
    if (sortCol !== col) return <ChevronsUpDown size={12} className="text-text-secondary/60" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(1, undefined, searchInput.trim());
  }

  function clearSearch() {
    setSearchInput('');
    navigate(1, undefined, '');
  }

  const isEmpty = records.length === 0;

  return (
    <div>
      {/* 블록 필터 + 뷰 토글 + 업/다운로드 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <select
          value={selectedBlock ?? ''}
          onChange={(e) => navigate(1, e.target.value || null)}
          className="px-2.5 py-1.5 text-xs rounded-lg font-mono bg-surface border border-border text-text-primary focus:outline-none focus:border-accent transition-colors max-w-[10rem]"
        >
          <option value="">전체 블록</option>
          {blocks.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center bg-surface rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'map' ? 'bg-border text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Map size={13} />
              <span className="hidden sm:inline">지도</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-border text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <List size={13} />
              <span className="hidden sm:inline">목록</span>
            </button>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface text-text-secondary hover:text-text-primary text-sm rounded-lg hover:bg-border/60 transition-colors"
            title="새로고침"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
          <button
            onClick={() => setShowDownloadModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-border text-text-primary font-semibold text-sm rounded-lg hover:opacity-80 transition-opacity"
          >
            <Download size={14} />
            <span className="hidden sm:inline">이미지 다운로드</span>
          </button>
        </div>
      </div>

      {/* 종류 필터 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap text-xs tabular-nums">
        {([
          { t: null, label: '전체', count: gateValveCount + hydrantCount + airValveCount, cls: 'bg-border text-text-primary' },
          { t: '제수밸브' as ValveType, label: VALVE_TYPE_LABEL['제수밸브'], count: gateValveCount, cls: 'bg-accent text-white dark:text-zinc-950' },
          { t: '소화전' as ValveType, label: VALVE_TYPE_LABEL['소화전'], count: hydrantCount, cls: 'bg-red-500 text-white' },
          { t: '공기밸브' as ValveType, label: VALVE_TYPE_LABEL['공기밸브'], count: airValveCount, cls: 'bg-violet-500 text-white' },
        ] as { t: ValveType | null; label: string; count: number; cls: string }[]).map(({ t, label, count, cls }) => (
          <button
            key={String(t)}
            onClick={() => handleType(t)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
              valveType === t ? cls : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${valveType === t ? 'bg-black/20' : 'bg-border text-text-secondary'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* 검색창 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="밸브번호 · 주소 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-8 pr-8 py-2 text-base md:text-sm text-text-primary placeholder-text-secondary/60 focus:outline-none focus:border-accent transition-colors"
          />
          {searchInput && (
            <button type="button" onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
        <button type="submit" className="px-4 py-2 bg-surface hover:bg-border/60 text-text-secondary hover:text-text-primary text-sm rounded-lg transition-colors">
          검색
        </button>
      </form>

      {search && (
        <p className="text-xs text-text-secondary mb-3">
          <span className="text-accent">&quot;{search}&quot;</span> 검색 결과 {total}개
        </p>
      )}

      {/* ─── 지도 모드 ─── */}
      {viewMode === 'map' ? (
        <ValveMapView />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-secondary border border-border rounded-lg">
          <p className="text-sm">데이터가 없습니다.</p>
          <p className="text-xs mt-1">지도에서 위치를 클릭해 등록하거나 엑셀관리자에서 업로드하세요.</p>
        </div>
      ) : (
        <>
          {/* ─── 데스크톱 테이블 ─── */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs min-w-max tabular-nums">
              <thead>
                <tr className="bg-surface border-b border-border">
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 w-12" />
                  <th
                    className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap cursor-pointer hover:text-text-primary select-none"
                    onClick={() => handleSort('valve_no')}
                  >
                    <span className="flex items-center gap-1">밸브번호 <SortIcon col="valve_no" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap">블록</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap">종류</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap">도로명주소</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap">형식</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap">개폐여부</th>
                  <th
                    className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap cursor-pointer hover:text-text-primary select-none"
                    onClick={() => handleSort('created_at')}
                  >
                    <span className="flex items-center gap-1">등록일 <SortIcon col="created_at" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="sticky left-0 z-10 px-2 py-2 border-r border-border bg-background">
                      <button
                        onClick={() => setEditingRecord(r)}
                        className="flex items-center gap-1 px-2 py-1.5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Pencil size={12} />
                        <span className="text-xs">수정</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-text-secondary font-mono">{r.valve_no ?? '-'}</td>
                    <td className="px-3 py-2 text-text-secondary font-mono">{r.block}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={VALVE_TYPE_LABEL[r.valve_type]} /></td>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate"><Val value={r.road_address ?? r.old_address} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.valve_form ?? r.hydrant_type} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.open_close} /></td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap"><Val value={r.created_at?.slice(0, 10) ?? null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── 모바일 카드 ─── */}
          <div className="md:hidden space-y-2">
            {records.map((r) => (
              <div key={r.id} className="border border-border rounded-xl overflow-hidden bg-surface">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    {r.valve_no && <span className="text-text-secondary text-xs font-mono shrink-0">#{r.valve_no}</span>}
                    <span className="text-[10px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">{VALVE_TYPE_LABEL[r.valve_type]}</span>
                    <span className="text-text-secondary text-xs font-mono">{r.block}</span>
                  </div>
                  <p className="text-text-primary text-sm font-semibold truncate">{r.road_address ?? r.old_address ?? '-'}</p>
                </div>
                <button
                  onClick={() => setEditingRecord(r)}
                  className="w-full flex items-center justify-center gap-2 py-3 border-t border-border text-sm text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <Pencil size={14} />
                  수정
                </button>
              </div>
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-text-secondary text-xs tabular-nums">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}개
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => navigate(page - 1)} disabled={page <= 1} className="p-1.5 bg-surface text-text-secondary hover:text-text-primary rounded-lg disabled:opacity-30 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <span className="md:hidden px-3 py-1.5 text-xs text-text-secondary tabular-nums">{page} / {totalPages}</span>
                <div className="hidden md:flex items-center gap-1 tabular-nums">
                  {paginationRange.map((p, i) =>
                    p === '…' ? (
                      <span key={`ell-${i}`} className="px-2 text-text-secondary/60 text-xs">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => navigate(p as number)}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${p === page ? 'bg-accent text-white dark:text-zinc-950 font-semibold' : 'bg-surface text-text-secondary hover:text-text-primary'}`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
                <button onClick={() => navigate(page + 1)} disabled={page >= totalPages} className="p-1.5 bg-surface text-text-secondary hover:text-text-primary rounded-lg disabled:opacity-30 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDownloadModal(false)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-text-primary font-semibold text-sm">이미지 다운로드</h3>
              <button onClick={() => setShowDownloadModal(false)} className="text-text-secondary hover:text-text-primary transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs text-text-secondary mb-2">블록 (비우면 전체)</p>
                <select
                  value={downloadBlock}
                  onChange={(e) => setDownloadBlock(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="">전체 블록</option>
                  {blocks.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => { setShowDownloadModal(false); await handleImageDownload(downloadBlock || undefined); }}
                disabled={isImageDownloading}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-border hover:opacity-80 text-text-primary font-semibold text-sm rounded-lg disabled:opacity-50 transition-opacity"
              >
                {isImageDownloading ? <RefreshCw size={14} className="animate-spin" /> : <Camera size={14} />}
                이미지 ZIP 다운로드
              </button>
            </div>
          </div>
        </div>
      )}
      {imageProgress && (
        <div className="fixed bottom-4 right-4 z-50 bg-surface border border-border rounded-xl px-4 py-3 shadow-2xl w-64">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw size={13} className="animate-spin text-accent shrink-0" />
            <p className="text-sm text-text-primary font-semibold">이미지 ZIP 생성 중</p>
          </div>
          <p className="text-xs text-text-secondary mb-2 tabular-nums">{imageProgress.current} / {imageProgress.total}개 완료</p>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-200"
              style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
      {editingRecord && (
        <ValveFormModal
          mode="edit"
          record={editingRecord}
          blocks={blocks}
          onClose={() => setEditingRecord(null)}
          onSaved={() => { setEditingRecord(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
