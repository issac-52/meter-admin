'use client';

import { useState } from 'react';
import { X, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';

type Preview = { recordCount: number; imageCount: number; error?: string };
type DeleteResult = { deletedCount?: number; error?: string };

type Props = {
  title: string;
  blocks: string[];
  onClose: () => void;
  onDeleted: () => void;
  getPreview: (dateFrom: string, dateTo: string, block?: string) => Promise<Preview>;
  deleteImages: (dateFrom: string, dateTo: string, block?: string) => Promise<DeleteResult>;
};

type Step = 'input' | 'confirm' | 'done';

export default function BulkImageDeleteModal({ title, blocks, onClose, onDeleted, getPreview, deleteImages }: Props) {
  const [step, setStep] = useState<Step>('input');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [block, setBlock] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);

  async function handleCheck() {
    if (!dateFrom || !dateTo) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getPreview(dateFrom, dateTo, block || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview(result);
      setConfirmed(false);
      setStep('confirm');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirmed) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await deleteImages(dateFrom, dateTo, block || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeletedCount(result.deletedCount ?? 0);
      setStep('done');
      onDeleted();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-text-primary font-semibold text-sm flex items-center gap-1.5">
            <Trash2 size={15} className="text-red-500" />
            {title}
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs">{error}</div>
        )}

        {step === 'input' && (
          <>
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs text-text-secondary mb-2">삭제할 기간 (필수)</p>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary tabular-nums focus:outline-none focus:border-accent transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                  />
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-text-secondary/60 text-xs">~</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary tabular-nums focus:outline-none focus:border-accent transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-text-secondary mb-2">블록 (선택, 비우면 전체)</p>
                <select
                  value={block}
                  onChange={(e) => setBlock(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="">전체 블록</option>
                  {blocks.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleCheck}
              disabled={!dateFrom || !dateTo || isLoading}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-border hover:opacity-80 text-text-primary font-semibold text-sm rounded-lg disabled:opacity-50 transition-opacity"
            >
              {isLoading && <RefreshCw size={14} className="animate-spin" />}
              삭제 대상 조회
            </button>
          </>
        )}

        {step === 'confirm' && preview && (
          <>
            <div className="mb-4 px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-text-primary">
              <span className="tabular-nums font-semibold">{dateFrom} ~ {dateTo}</span>
              {block && <span className="text-text-secondary"> · {block}블록</span>}
              <p className="mt-1 tabular-nums">
                <span className="text-accent font-semibold">{preview.recordCount.toLocaleString()}</span>건의 레코드,{' '}
                <span className="text-accent font-semibold">{preview.imageCount.toLocaleString()}</span>개의 이미지가 대상입니다.
              </p>
            </div>

            {preview.imageCount === 0 ? (
              <button
                onClick={() => setStep('input')}
                className="w-full py-2.5 text-sm text-text-secondary hover:text-text-primary bg-background hover:bg-border/60 rounded-lg transition-colors"
              >
                다시 조회
              </button>
            ) : (
              <>
                <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex gap-2">
                  <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-500 font-semibold leading-relaxed">
                    이미지 삭제시 복구가 불가능합니다.
                  </p>
                </div>
                <label className="flex items-center gap-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="w-4 h-4 accent-red-500"
                  />
                  <span className="text-sm text-text-primary">위 내용을 확인했습니다.</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep('input')}
                    className="flex-1 py-2.5 text-sm text-text-secondary hover:text-text-primary bg-background hover:bg-border/60 rounded-lg transition-colors"
                  >
                    이전
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={!confirmed || isLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-red-500 text-white hover:opacity-90 rounded-lg disabled:opacity-40 transition-opacity"
                  >
                    {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    영구 삭제
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'done' && (
          <>
            <div className="mb-4 px-3 py-2.5 bg-success/10 border border-success/20 rounded-lg text-sm text-text-primary">
              <span className="text-success font-semibold tabular-nums">{deletedCount.toLocaleString()}개</span> 이미지를 삭제했습니다.
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-semibold bg-accent text-white dark:text-zinc-950 hover:opacity-90 rounded-lg transition-opacity"
            >
              확인
            </button>
          </>
        )}
      </div>
    </div>
  );
}
