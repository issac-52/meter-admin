'use client';

import { useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Pencil, Download, ChevronLeft, ChevronRight, Search, X, Camera, ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check, RefreshCw, MapPin, List, Map, Calendar } from 'lucide-react';
import { type SortCol, type SortDir, type StatusFilter } from '@/features/meter-survey/api/actions';
import { type RegionWithBlocks } from '@/features/meter-survey/api/regions-actions';
import { UNASSIGNED_REGION_ID, type MeterTableRow } from '@/features/meter-survey/types/mappers';
import MeterEditModal from './MeterEditModal';
import MeterMapView from './MeterMapView';

type Props = {
  records: MeterTableRow[];
  blocks: string[];
  selectedBlock: string | null;
  regions: RegionWithBlocks[];
  selectedRegion: string | null;
  search: string;
  total: number;
  page: number;
  pageSize: number;
  sortCol: SortCol;
  sortDir: SortDir;
  status: StatusFilter | null;
  processedCount: number;
  unprocessedCount: number;
  closedCount: number;
  dateFrom: string;
  dateTo: string;
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

export default function MeterTable({
  records,
  blocks,
  selectedBlock,
  regions,
  selectedRegion,
  search,
  total,
  page,
  pageSize,
  sortCol,
  sortDir,
  status,
  processedCount,
  unprocessedCount,
  closedCount,
  dateFrom,
  dateTo,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [editingRecord, setEditingRecord] = useState<MeterTableRow | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadDateFrom, setDownloadDateFrom] = useState('');
  const [downloadDateTo, setDownloadDateTo] = useState('');
  const [downloadBlock, setDownloadBlock] = useState('');
  const [isImageDownloading, setIsImageDownloading] = useState(false);
  const [imageProgress, setImageProgress] = useState<{ current: number; total: number } | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState(dateFrom);
  const [filterDateTo, setFilterDateTo] = useState(dateTo);
  const [searchInput, setSearchInput] = useState(search);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  function handleRefresh() {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  }

  async function handleImageDownload(dateFrom?: string, dateTo?: string, block?: string) {
    if (!('showSaveFilePicker' in window)) {
      alert('이 기능은 Chrome 또는 Edge 브라우저에서만 사용 가능합니다.');
      return;
    }
    setIsImageDownloading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (block) params.set('block', block);
      const listRes = await fetch(`/admin/api/image-list?${params}`);
      if (!listRes.ok) { alert(await listRes.text()); return; }
      const images: { path: string; filename: string; url: string | null }[] = await listRes.json();
      if (images.length === 0) { alert('해당 조건에 이미지가 없습니다.'); return; }

      const parts: string[] = [];
      if (block) parts.push(`블록${block}`);
      if (dateFrom && dateTo) parts.push(`${dateFrom}~${dateTo}`);
      else if (dateFrom) parts.push(dateFrom);
      else if (dateTo) parts.push(dateTo);
      if (parts.length === 0) parts.push(new Date().toISOString().slice(0, 10));
      const label = parts.join('_');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: `야장이미지_${label}.zip`,
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
        // url이 있으면 R2에서 직접 받아 Vercel bandwidth 소비 없음
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

  function copyAddress(r: MeterTableRow) {
    if (!r.address) return;
    navigator.clipboard.writeText(r.address);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1500);
  }
  const searchRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.ceil(total / pageSize);
  const paginationRange = getPaginationRange(page, totalPages);

  function navigate(
    newPage: number,
    newBlock?: string | null,
    newSearch?: string,
    newSortCol?: SortCol,
    newSortDir?: SortDir,
    newStatus?: StatusFilter | null,
    newDateFrom?: string,
    newDateTo?: string,
    newRegion?: string | null,
  ) {
    const params = new URLSearchParams();
    const b = newBlock !== undefined ? newBlock : selectedBlock;
    const q = newSearch !== undefined ? newSearch : search;
    const sc = newSortCol !== undefined ? newSortCol : sortCol;
    const sd = newSortDir !== undefined ? newSortDir : sortDir;
    const st = newStatus !== undefined ? newStatus : status;
    const df = newDateFrom !== undefined ? newDateFrom : filterDateFrom;
    const dt = newDateTo !== undefined ? newDateTo : filterDateTo;
    const rg = newRegion !== undefined ? newRegion : selectedRegion;
    if (rg) params.set('region', rg);
    if (b) params.set('block', b);
    if (q) params.set('q', q);
    if (newPage > 1) params.set('page', String(newPage));
    if (sc !== 'row_no' || sd !== 'asc') { params.set('sort', sc); params.set('dir', sd); }
    if (st) params.set('status', st);
    if (df) params.set('dateFrom', df);
    if (dt) params.set('dateTo', dt);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleRegion(regionId: string | null) {
    // 지역 변경 시 블록 선택 초기화
    navigate(1, null, undefined, undefined, undefined, undefined, undefined, undefined, regionId);
  }

  function handleSort(col: SortCol) {
    const newDir: SortDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
    navigate(1, undefined, undefined, col, newDir);
  }

  function handleStatus(s: StatusFilter | null) {
    navigate(1, undefined, undefined, undefined, undefined, s);
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronsUpDown size={12} className="text-text-secondary/60" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-accent" />
      : <ChevronDown size={12} className="text-accent" />;
  }

  function handleDateSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(1, undefined, undefined, undefined, undefined, undefined, filterDateFrom, filterDateTo);
  }

  function clearDateFilter() {
    setFilterDateFrom('');
    setFilterDateTo('');
    navigate(1, undefined, undefined, undefined, undefined, undefined, '', '');
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

  // 지역 선택 시 해당 지역(또는 미분류) 블록만 표시
  const assignedBlockSet = new Set(regions.flatMap((r) => r.blocks));
  const unassignedBlocks = blocks.filter((b) => !assignedBlockSet.has(b));
  const regionBlockSet =
    selectedRegion === UNASSIGNED_REGION_ID
      ? new Set(unassignedBlocks)
      : selectedRegion
        ? new Set(regions.find((r) => r.id === selectedRegion)?.blocks ?? [])
        : null;
  const visibleBlocks = regionBlockSet ? blocks.filter((b) => regionBlockSet.has(b)) : blocks;

  return (
    <div>
      {/* 지역 필터 */}
      {regions.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-xs text-text-secondary/70 mr-1">지역</span>
          {regions.map((r) => (
            <button
              key={r.id}
              onClick={() => handleRegion(r.id)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                selectedRegion === r.id
                  ? 'bg-accent text-white dark:text-zinc-950 font-semibold'
                  : 'bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              {r.name}
            </button>
          ))}
          {unassignedBlocks.length > 0 && (
            <button
              onClick={() => handleRegion(UNASSIGNED_REGION_ID)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                selectedRegion === UNASSIGNED_REGION_ID
                  ? 'bg-accent text-white dark:text-zinc-950 font-semibold'
                  : 'bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              미분류
            </button>
          )}
        </div>
      )}
      {/* 블록 필터 + 업로드 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <select
          value={selectedBlock ?? ''}
          onChange={(e) => navigate(1, e.target.value || null)}
          className="px-2.5 py-1.5 text-xs rounded-lg font-mono bg-surface border border-border text-text-primary focus:outline-none focus:border-accent transition-colors max-w-[10rem]"
        >
          <option value="">전체 블록 ({visibleBlocks.length})</option>
          {visibleBlocks.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex items-center bg-surface rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-border text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <List size={13} />
              <span className="hidden sm:inline">목록</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'map' ? 'bg-border text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Map size={13} />
              <span className="hidden sm:inline">지도</span>
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
            이미지 다운로드
          </button>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap text-xs tabular-nums">
        {([
          { s: null,            label: '전체',    count: processedCount + unprocessedCount + closedCount, cls: 'bg-border text-text-primary' },
          { s: 'processed',     label: '처리됨',  count: processedCount,   cls: 'bg-success text-white dark:text-zinc-950' },
          { s: 'unprocessed',   label: '미처리',  count: unprocessedCount, cls: 'bg-zinc-400 dark:bg-zinc-600 text-white' },
          { s: 'closed',        label: '종결',    count: closedCount,      cls: 'bg-warning text-white dark:text-zinc-950' },
        ] as { s: StatusFilter | null; label: string; count: number; cls: string }[]).map(({ s, label, count, cls }) => (
          <button
            key={String(s)}
            onClick={() => handleStatus(s)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
              status === s ? cls : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${status === s ? 'bg-black/20' : 'bg-border text-text-secondary'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* 날짜 검색 */}
      <form onSubmit={handleDateSearch} className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-text-secondary shrink-0">
          <Calendar size={12} />조사일자
        </span>
        <input
          type="date"
          value={filterDateFrom}
          max={filterDateTo || undefined}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary tabular-nums focus:outline-none focus:border-accent transition-colors [color-scheme:light] dark:[color-scheme:dark]"
        />
        <span className="text-text-secondary/60 text-xs shrink-0">~</span>
        <input
          type="date"
          value={filterDateTo}
          min={filterDateFrom || undefined}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary tabular-nums focus:outline-none focus:border-accent transition-colors [color-scheme:light] dark:[color-scheme:dark]"
        />
        <button
          type="submit"
          className="px-3 py-1.5 bg-surface hover:bg-border/60 text-text-secondary hover:text-text-primary text-xs rounded-lg transition-colors shrink-0"
        >
          검색
        </button>
        {(filterDateFrom || filterDateTo) && (
          <button
            type="button"
            onClick={clearDateFilter}
            className="flex items-center gap-1 px-2 py-1.5 text-text-secondary hover:text-text-primary text-xs rounded-lg transition-colors"
          >
            <X size={12} />초기화
          </button>
        )}
      </form>

      {/* 검색창 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="도면번호 · 도로명주소 · 기물번호(기존) 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-8 pr-8 py-2 text-base md:text-sm text-text-primary placeholder-text-secondary/60 focus:outline-none focus:border-accent transition-colors"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-surface hover:bg-border/60 text-text-secondary hover:text-text-primary text-sm rounded-lg transition-colors"
        >
          검색
        </button>
      </form>

      {search && (
        <p className="text-xs text-text-secondary mb-3">
          <span className="text-accent">"{search}"</span> 검색 결과 {total}개
        </p>
      )}

      {/* ─── 지도 모드 ─── */}
      {viewMode === 'map' ? (
        <MeterMapView selectedBlock={selectedBlock} status={status} />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-secondary border border-border rounded-lg">
          <p className="text-sm">데이터가 없습니다.</p>
          <p className="text-xs mt-1">엑셀 파일을 업로드하여 데이터를 가져오세요.</p>
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
                    onClick={() => handleSort('row_no')}
                  >
                    <span className="flex items-center gap-1">도면번호 <SortIcon col="row_no" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap">성명</th>
                  <th
                    className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap cursor-pointer hover:text-text-primary select-none"
                    onClick={() => handleSort('address')}
                  >
                    <span className="flex items-center gap-1">도로명주소 <SortIcon col="address" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap">기물번호(기존)</th>
                  <th className="w-px bg-border" />
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">기물번호</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">지침</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">봉인유무</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">위치</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">사용형태</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">층수</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">비고</th>
                  <th
                    className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap cursor-pointer hover:text-accent select-none"
                    onClick={() => handleSort('survey_date')}
                  >
                    <span className="flex items-center gap-1">조사일자 <SortIcon col="survey_date" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">보호통뚜껑양식</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">급수방식</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-text-primary whitespace-nowrap">계량기상태</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-border last:border-0 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${r.status === 'processed' ? 'bg-success/10' : r.status === 'closed' ? 'bg-warning/10' : ''}`}
                  >
                    {/* 수정 버튼 — sticky */}
                    <td className={`sticky left-0 z-10 px-2 py-2 border-r border-border ${r.status === 'processed' ? 'bg-success/15' : r.status === 'closed' ? 'bg-warning/15' : 'bg-background'}`}>
                      <button
                        onClick={() => setEditingRecord(r)}
                        className="flex items-center gap-1 px-2 py-1.5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Pencil size={12} />
                        <span className="text-xs">수정</span>
                      </button>
                      <div className="flex items-center gap-2 px-2 mt-0.5">
                        {r.status === 'processed' && <span className="text-[10px] text-success font-bold">✓</span>}
                        {r.status === 'closed' && <span className="text-[10px] text-warning font-bold">{r.note}</span>}
                        {r.imageCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Camera size={10} className="text-accent" />
                            <span className="text-[10px] text-accent">
                              {r.imageCount}
                            </span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-text-secondary font-mono">{r.row_no ?? '-'}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{r.name ?? '-'}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap max-w-[180px] truncate">{r.address ?? '-'}</td>
                    <td className="px-3 py-2 text-text-secondary font-mono whitespace-nowrap">{r.old_meter_number ?? '-'}</td>
                    <td className="w-px bg-border" />
                    <td className="px-3 py-2 font-mono whitespace-nowrap"><Val value={r.meter_number} /></td>
                    <td className="px-3 py-2"><Val value={r.reading} /></td>
                    <td className="px-3 py-2"><Val value={r.sealed} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.location} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.usage_type} /></td>
                    <td className="px-3 py-2"><Val value={r.floor} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.note} /></td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap"><Val value={r.survey_date?.slice(0, 10) ?? null} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.cover_type} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.water_supply_type} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><Val value={r.meter_condition} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── 모바일 정렬 바 ─── */}
          <div className="md:hidden flex items-center gap-1.5 mb-3 text-xs">
            <span className="text-text-secondary/70 shrink-0">정렬:</span>
            {([
              { col: 'row_no' as SortCol, label: '도면번호' },
              { col: 'address' as SortCol, label: '도로명주소' },
              { col: 'survey_date' as SortCol, label: '조사일자' },
            ]).map(({ col, label }) => (
              <button
                key={col}
                onClick={() => handleSort(col)}
                className={`flex items-center gap-0.5 px-2.5 py-1 rounded-lg transition-colors ${
                  sortCol === col
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'bg-surface text-text-secondary'
                }`}
              >
                {label}
                {sortCol === col && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
              </button>
            ))}
          </div>

          {/* ─── 모바일 카드 ─── */}
          <div className="md:hidden space-y-2">
            {records.map((r) => {
              const st = r.status;
              const cardCls =
                st === 'processed' ? 'bg-success/10 border-success/30' :
                st === 'closed'    ? 'bg-warning/10 border-warning/30' :
                'bg-surface border-border';
              return (
                <div key={r.id} className={`border rounded-xl overflow-hidden ${cardCls}`}>
                  {/* 카드 상단 정보 */}
                  <div className="p-4">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {r.row_no && (
                            <span className="text-text-secondary text-xs font-mono shrink-0">도면{r.row_no}</span>
                          )}
                          {st === 'processed' && (
                            <span className="shrink-0 text-[10px] font-semibold text-success bg-success/10 px-1.5 py-0.5 rounded-full">완료</span>
                          )}
                          {st === 'closed' && (
                            <span className="shrink-0 text-[10px] font-semibold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">{r.note}</span>
                          )}
                          {r.meter_number && (
                            <span className="text-text-primary text-xs font-mono truncate">{r.meter_number}</span>
                          )}
                        </div>
                        <p className="text-text-primary text-sm font-semibold truncate">{r.address ?? '-'}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.address && (
                          <>
                            <button
                              onClick={() => copyAddress(r)}
                              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                              {copiedId === r.id
                                ? <Check size={13} className="text-success" />
                                : <Copy size={13} />}
                            </button>
                            <button
                              onClick={() => {
                                const query = encodeURIComponent(r.address!);
                                window.location.href = `nmap://search?query=${query}`;
                              }}
                              className="p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                              <MapPin size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 수정 버튼 — 카드 하단 풀너비 */}
                  <button
                    onClick={() => setEditingRecord(r)}
                    className="w-full flex items-center justify-center gap-2 py-3 border-t border-border text-sm text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <Pencil size={14} />
                    수정
                  </button>
                </div>
              );
            })}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-text-secondary text-xs tabular-nums">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}개
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate(page - 1)}
                  disabled={page <= 1}
                  className="p-1.5 bg-surface text-text-secondary hover:text-text-primary rounded-lg disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="md:hidden px-3 py-1.5 text-xs text-text-secondary tabular-nums">
                  {page} / {totalPages}
                </span>
                <div className="hidden md:flex items-center gap-1 tabular-nums">
                  {paginationRange.map((p, i) =>
                    p === '…' ? (
                      <span key={`ell-${i}`} className="px-2 text-text-secondary/60 text-xs">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => navigate(p as number)}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                          p === page
                            ? 'bg-accent text-white dark:text-zinc-950 font-semibold'
                            : 'bg-surface text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
                <button
                  onClick={() => navigate(page + 1)}
                  disabled={page >= totalPages}
                  className="p-1.5 bg-surface text-text-secondary hover:text-text-primary rounded-lg disabled:opacity-30 transition-colors"
                >
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
                <p className="text-xs text-text-secondary mb-2">날짜 범위 (비우면 전체)</p>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="date"
                    value={downloadDateFrom}
                    max={downloadDateTo || undefined}
                    onChange={(e) => setDownloadDateFrom(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary tabular-nums focus:outline-none focus:border-accent transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                  />
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-text-secondary/60 text-xs">~</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <input
                    type="date"
                    value={downloadDateTo}
                    min={downloadDateFrom || undefined}
                    onChange={(e) => setDownloadDateTo(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary tabular-nums focus:outline-none focus:border-accent transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-2">블록 (이미지 다운로드에만 적용, 비우면 전체)</p>
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
                onClick={async () => { setShowDownloadModal(false); await handleImageDownload(downloadDateFrom || undefined, downloadDateTo || undefined, downloadBlock || undefined); }}
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
        <MeterEditModal record={editingRecord} onClose={() => setEditingRecord(null)} />
      )}
    </div>
  );
}
