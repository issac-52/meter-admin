'use client';

import { useState, useTransition, useRef } from 'react';
import { X, Check, Camera, Trash2, ImagePlus, ExternalLink, ChevronDown } from 'lucide-react';
import { updateMeterRecord } from '@/features/meter-survey/api/actions';
import type { MeterRecord, MeterInsert } from '@/shared/types/meter-record';
import { mapToEditFormValues, USAGE_TYPES, LOCATION_DETAIL_OPTIONS } from '@/features/meter-survey/types/mappers';

const STORAGE_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
const thumbnailUrl = (path: string) => `${STORAGE_BASE}/${path}`;
const viewUrl = (path: string) => `${STORAGE_BASE}/${path}`;

const COVER_OPTIONS = ['', '뚜껑 파손', '뚜껑 없음', '없음'];
const WATER_SUPPLY_OPTIONS = ['직접', '간접', '물탱크', '저수조'];
const METER_CONDITION_OPTIONS = ['', '초파', '녹폐', '정상'];

type Props = {
  record: MeterRecord;
  onClose: () => void;
};

const labelCls = 'block text-xs font-semibold text-text-secondary mb-1.5';
const inputCls =
  'w-full bg-background border border-border rounded-lg px-3 py-2 text-base md:text-sm text-text-primary focus:outline-none focus:border-accent transition-colors';
const selectCls =
  'w-full bg-background border border-border rounded-lg px-3 py-2 text-base md:text-sm text-text-primary focus:outline-none focus:border-accent transition-colors';
const optionBtnCls = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-sm border transition-colors ${
    active
      ? 'bg-accent border-accent text-white dark:text-zinc-950 font-semibold'
      : 'bg-background border-border text-text-secondary hover:text-text-primary'
  }`;
const unselectBtnCls = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-sm border transition-colors ${
    active
      ? 'bg-border border-text-secondary/50 text-text-primary'
      : 'bg-background border-border text-text-secondary hover:text-text-primary'
  }`;

type ImageSlot = 1 | 2 | 3 | 4;

function ImageSlotCard({
  slot,
  fileId,
  rowNo,
  recordId,
  onUploaded,
  onDeleted,
}: {
  slot: ImageSlot;
  fileId: string | null;
  rowNo: string | null;
  recordId: number;
  onUploaded: (slot: ImageSlot, newFileId: string) => void;
  onDeleted: (slot: ImageSlot) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!rowNo) {
      setError('도면번호가 없어 이미지를 업로드할 수 없습니다.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        record_id: String(recordId),
        slot: String(slot),
        row_no: rowNo,
        content_type: file.type || 'image/jpeg',
      });
      const presignRes = await fetch(`/admin/api/upload-meter-image?${params}`);
      if (!presignRes.ok) {
        const j = await presignRes.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? '업로드 준비 실패');
      }
      const { presignedUrl, filePath } = await presignRes.json() as {
        presignedUrl: string;
        filePath: string;
      };

      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'image/jpeg' },
      });
      if (!uploadRes.ok) throw new Error('스토리지 업로드 실패');

      const saveRes = await fetch('/admin/api/upload-meter-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, slot, file_path: filePath }),
      });
      if (!saveRes.ok) {
        const j = await saveRes.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? '저장 실패');
      }

      setCacheBust(Date.now());
      onUploaded(slot, filePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete() {
    if (!fileId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/admin/api/upload-meter-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, slot, file_path: fileId }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? '삭제 실패');
      }
      onDeleted(slot);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-text-secondary">
        이미지 {slot}{' '}
        {rowNo && (
          <span className="text-text-secondary/70 font-mono">({rowNo}-{slot})</span>
        )}
      </span>

      {fileId ? (
        <div className="relative rounded-lg overflow-hidden border border-border bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${thumbnailUrl(fileId)}?t=${cacheBust}`}
            alt={`이미지 ${slot}`}
            className="w-full h-28 object-cover"
          />
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <a
              href={viewUrl(fileId)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-md transition-colors"
            >
              <ExternalLink size={12} />
            </a>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="p-1.5 bg-black/60 hover:bg-red-500/80 text-white rounded-md transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
            </button>
          </div>
          {loading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-xs text-white">처리 중...</span>
            </div>
          )}
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center gap-1.5 h-28 rounded-lg border border-dashed border-border bg-background/50 cursor-pointer hover:border-accent/50 hover:bg-background transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {loading ? (
            <span className="text-xs text-text-secondary">업로드 중...</span>
          ) : (
            <>
              <ImagePlus size={18} className="text-text-secondary" />
              <span className="text-xs text-text-secondary">이미지 추가</span>
            </>
          )}
        </label>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function MeterEditModal({ record, onClose }: Props) {
  const [initial] = useState(() => mapToEditFormValues(record));

  const [meterSame, setMeterSame] = useState(initial.meterSame);
  const [extraOpen, setExtraOpen] = useState(false);
  const [usageTypeSelect, setUsageTypeSelect] = useState(initial.usageTypeSelect);
  const [usageTypeCustom, setUsageTypeCustom] = useState(initial.usageTypeCustom);
  const [locationInOut, setLocationInOut] = useState(initial.locationInOut);
  const [locationDetail, setLocationDetail] = useState(initial.locationDetail);
  const [locationCustom, setLocationCustom] = useState(initial.locationCustom);
  const [values, setValues] = useState<Partial<MeterInsert>>(initial.values);
  const [image1Id, setImage1Id] = useState<string | null>(record.image1_id);
  const [image2Id, setImage2Id] = useState<string | null>(record.image2_id);
  const [image3Id, setImage3Id] = useState<string | null>(record.image3_id);
  const [image4Id, setImage4Id] = useState<string | null>(record.image4_id);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof MeterInsert>(key: K, val: MeterInsert[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function selectO() {
    setMeterSame(true);
    set('meter_number', record.old_meter_number);
  }

  function selectX() {
    setMeterSame(false);
    set('meter_number', initial.meterSame ? null : record.meter_number);
  }

  function handleSave() {
    startTransition(async () => {
      const resolvedUsageType =
        usageTypeSelect === '기타' ? (usageTypeCustom || null) : (usageTypeSelect || null);
      let resolvedLocation: string | null = null;
      if (locationInOut && locationDetail && locationDetail !== '기타') {
        resolvedLocation = `${locationInOut}(${locationDetail})`;
      } else if (locationInOut && locationDetail === '기타' && locationCustom) {
        resolvedLocation = `${locationInOut}(${locationCustom})`;
      }
      const payload: Partial<MeterInsert> = {
        ...values,
        meter_number: meterSame ? record.old_meter_number : (values.meter_number || null),
        reading: values.reading || null,
        sealed: values.sealed || null,
        location: resolvedLocation,
        usage_type: resolvedUsageType,
        floor: values.floor || null,
        note: values.note || null,
        cover_type: values.cover_type || null,
        water_supply_type: values.water_supply_type || null,
        meter_condition: values.meter_condition || null,
        manufacturer: values.manufacturer || null,
        relocation_needed: values.relocation_needed || null,
        replacement_needed: values.replacement_needed || null,
        water_tank_capacity: values.water_supply_type === '물탱크' ? (values.water_tank_capacity || null) : null,
        water_pressure: values.water_pressure || null,
        meter_type: values.meter_type || null,
        reading_method: values.meter_type === '기계식' ? '인력검침' : (values.reading_method || null),
      };
      const result = await updateMeterRecord(record.id, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  function handleImageUploaded(slot: ImageSlot, newFileId: string) {
    if (slot === 1) setImage1Id(newFileId);
    else if (slot === 2) setImage2Id(newFileId);
    else if (slot === 3) setImage3Id(newFileId);
    else setImage4Id(newFileId);
  }

  function handleImageDeleted(slot: ImageSlot) {
    if (slot === 1) setImage1Id(null);
    else if (slot === 2) setImage2Id(null);
    else if (slot === 3) setImage3Id(null);
    else setImage4Id(null);
  }

  const imageCount = [image1Id, image2Id, image3Id, image4Id].filter(Boolean).length;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-surface border border-border rounded-t-2xl md:rounded-xl w-full md:max-w-lg max-h-[92dvh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <p className="text-text-primary font-semibold text-sm flex items-center gap-2">
              수정
              {imageCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-normal text-accent tabular-nums">
                  <Camera size={12} />
                  {imageCount}
                </span>
              )}
            </p>
            <p className="text-text-secondary text-xs mt-0.5">
              {record.row_no && <span className="mr-2">도면번호 {record.row_no}</span>}
              {record.old_meter_number && (
                <span className="mr-2 font-mono text-text-primary">기존 {record.old_meter_number}</span>
              )}
              {record.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 식별 정보 */}
        <div className="px-5 py-3 bg-background/50 border-b border-border">
          <p className="text-xs text-text-secondary truncate">{record.address ?? '-'}</p>
        </div>

        {/* 폼 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs">
              {error}
            </div>
          )}

          {/* 기물번호 */}
          <div>
            <label className="block text-sm font-bold text-text-primary mb-2">기물번호</label>
            <div className="flex gap-2 mb-2">
              <button
                onClick={selectO}
                className={`flex-1 py-2.5 rounded-lg text-base font-bold border transition-colors ${
                  meterSame
                    ? 'bg-accent border-accent text-white dark:text-zinc-950'
                    : 'bg-background border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                O — 기존과 동일
              </button>
              <button
                onClick={selectX}
                className={`flex-1 py-2.5 rounded-lg text-base font-bold border transition-colors ${
                  !meterSame
                    ? 'bg-border border-border text-text-primary'
                    : 'bg-background border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                X — 직접 입력
              </button>
            </div>
            {meterSame ? (
              <div className="px-4 py-3 bg-background/50 border border-border rounded-lg text-xl font-bold text-accent font-mono tracking-wider tabular-nums">
                {record.old_meter_number ?? '-'}
              </div>
            ) : (
              <input
                type="text"
                placeholder="기물번호 입력"
                value={(values.meter_number as string) ?? ''}
                onChange={(e) => set('meter_number', e.target.value || null)}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-xl font-bold text-text-primary font-mono tracking-wider tabular-nums focus:outline-none focus:border-accent transition-colors"
              />
            )}
          </div>

          {/* 이미지 (최대 4장, 2×2) */}
          <div>
            <label className={labelCls}>
              이미지
              <span className="ml-1.5 font-normal text-text-secondary/70">(최대 4장, 즉시 저장)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2, 3, 4] as ImageSlot[]).map((slot) => {
                const fileId = slot === 1 ? image1Id : slot === 2 ? image2Id : slot === 3 ? image3Id : image4Id;
                return (
                  <ImageSlotCard
                    key={slot}
                    slot={slot}
                    fileId={fileId}
                    rowNo={record.row_no}
                    recordId={record.id}
                    onUploaded={handleImageUploaded}
                    onDeleted={handleImageDeleted}
                  />
                );
              })}
            </div>
          </div>

          {/* 지침 + 봉인유무 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>지침</label>
              <div className="flex gap-2 items-center">
                {record.final_reading != null && (
                  <div className="shrink-0 px-3 py-2 bg-background/60 border border-border rounded-lg text-center min-w-[72px]">
                    <p className="text-[10px] text-text-secondary mb-0.5">최종지침</p>
                    <p className="font-mono text-base font-bold text-warning leading-none tabular-nums">{record.final_reading}</p>
                  </div>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="숫자 입력"
                  value={(values.reading as string) ?? ''}
                  onChange={(e) => set('reading', e.target.value || null)}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="shrink-0">
              <label className={labelCls}>봉인여부</label>
              <div className="flex gap-3 h-[42px] items-center">
                {['봉인', '미봉인'].map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`sealed-${record.id}`}
                      value={v}
                      checked={values.sealed === v}
                      onChange={() => set('sealed', v)}
                      className="w-4 h-4 accent-accent"
                    />
                    <span className="text-sm text-text-primary">{v}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* 위치 */}
          <div>
            <label className={labelCls}>위치</label>
            {/* 1단계: 옥내/옥외 */}
            <div className="flex gap-2 mb-2">
              {(['옥내', '옥외'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setLocationInOut(v); setLocationDetail(''); setLocationCustom(''); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    locationInOut === v
                      ? 'bg-accent border-accent text-white dark:text-zinc-950'
                      : 'bg-background border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {v}
                </button>
              ))}
              {locationInOut && (
                <button
                  type="button"
                  onClick={() => { setLocationInOut(''); setLocationDetail(''); setLocationCustom(''); }}
                  className="px-3 py-2 text-xs text-text-secondary/70 hover:text-text-secondary border border-border rounded-lg transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
            {/* 2단계: 세부 위치 */}
            {locationInOut && (
              <div className="flex flex-wrap gap-2">
                {LOCATION_DETAIL_OPTIONS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setLocationDetail(v); if (v !== '기타') setLocationCustom(''); }}
                    className={optionBtnCls(locationDetail === v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
            {locationDetail === '기타' && (
              <input
                type="text"
                placeholder="직접 입력"
                value={locationCustom}
                onChange={(e) => setLocationCustom(e.target.value)}
                className={`${inputCls} mt-2`}
                autoFocus
              />
            )}
          </div>

          {/* 사용형태 */}
          <div>
            <label className={labelCls}>사용형태</label>
            <select
              value={usageTypeSelect}
              onChange={(e) => {
                setUsageTypeSelect(e.target.value);
                if (e.target.value !== '기타') setUsageTypeCustom('');
              }}
              className={selectCls}
            >
              <option value="">— 선택 —</option>
              {USAGE_TYPES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            {usageTypeSelect === '기타' && (
              <input
                type="text"
                placeholder="직접 입력"
                value={usageTypeCustom}
                onChange={(e) => setUsageTypeCustom(e.target.value)}
                className={`${inputCls} mt-2`}
                autoFocus
              />
            )}
          </div>

          {/* 층수 */}
          <div>
            <label className={labelCls}>층수</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="예: 1, 2, B1"
              value={(values.floor as string) ?? ''}
              onChange={(e) => set('floor', e.target.value || null)}
              className={inputCls}
            />
          </div>

          {/* 비고 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-text-secondary">비고</label>
              <div className="flex items-center gap-1.5">
                {(['호폐', '위치불명'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => set('note', values.note === preset ? null : preset)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      values.note === preset
                        ? 'bg-warning border-warning text-white dark:text-zinc-950'
                        : 'bg-background border-border text-warning hover:opacity-80'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              value={(values.note as string) ?? ''}
              onChange={(e) => set('note', e.target.value || null)}
              disabled={values.note === '호폐' || values.note === '위치불명'}
              placeholder={values.note === '호폐' || values.note === '위치불명' ? '' : '비고 직접 입력'}
              className={`${inputCls} ${values.note === '호폐' || values.note === '위치불명' ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* 조사일자 */}
          <div>
            <label className={labelCls}>
              조사일자
              <span className="ml-1.5 font-normal text-text-secondary/70">(입력 시각 자동 기록)</span>
            </label>
            <input
              type="text"
              value={(values.survey_date as string) ?? ''}
              onChange={(e) => set('survey_date', e.target.value || null)}
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>

          {/* 추가정보 아코디언 */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExtraOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-background/50 hover:bg-background transition-colors"
            >
              <span className="text-sm font-semibold text-text-primary">추가정보</span>
              <ChevronDown
                size={16}
                className={`text-text-secondary transition-transform ${extraOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {extraOpen && (
              <div className="px-4 py-4 space-y-4">
                {/* 계량기형식 */}
                <div>
                  <label className={labelCls}>계량기형식</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => set('meter_type', null)}
                      className={unselectBtnCls(!values.meter_type)}
                    >
                      미선택
                    </button>
                    {['기계식', '전자식'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          set('meter_type', v);
                          if (v === '기계식') set('reading_method', '인력검침');
                          else set('reading_method', null);
                        }}
                        className={optionBtnCls(values.meter_type === v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 검침방식 */}
                {values.meter_type && (
                  <div>
                    <label className={labelCls}>검침방식</label>
                    {values.meter_type === '기계식' ? (
                      <div className="px-3 py-2 bg-background/50 border border-border rounded-lg text-sm text-text-primary">
                        인력검침
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {['인력검침', '자동'].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => set('reading_method', v)}
                            className={optionBtnCls(values.reading_method === v)}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 보호통뚜껑양식 */}
                <div>
                  <label className={labelCls}>보호통뚜껑양식</label>
                  <select
                    value={(values.cover_type as string) ?? ''}
                    onChange={(e) => set('cover_type', e.target.value || null)}
                    className={selectCls}
                  >
                    {COVER_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o || '— 선택 —'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 급수방식 */}
                <div>
                  <label className={labelCls}>급수방식</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => set('water_supply_type', null)}
                      className={unselectBtnCls(!values.water_supply_type)}
                    >
                      미선택
                    </button>
                    {WATER_SUPPLY_OPTIONS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => set('water_supply_type', o)}
                        className={optionBtnCls(values.water_supply_type === o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                  {values.water_supply_type === '물탱크' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="물탱크 용량(㎥) 입력 (선택)"
                        value={(values.water_tank_capacity as string) ?? ''}
                        onChange={(e) => set('water_tank_capacity', e.target.value || null)}
                        className={inputCls}
                      />
                    </div>
                  )}
                </div>

                {/* 계량기 상태 */}
                <div>
                  <label className={labelCls}>계량기 상태</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => set('meter_condition', null)}
                      className={unselectBtnCls(!values.meter_condition)}
                    >
                      미선택
                    </button>
                    {METER_CONDITION_OPTIONS.filter(Boolean).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => set('meter_condition', o)}
                        className={optionBtnCls(values.meter_condition === o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 제작회사 */}
                <div>
                  <label className={labelCls}>제작회사</label>
                  <input
                    type="text"
                    placeholder="직접 입력"
                    value={(values.manufacturer as string) ?? ''}
                    onChange={(e) => set('manufacturer', e.target.value || null)}
                    className={inputCls}
                  />
                </div>

                {/* 이설필요여부 */}
                <div>
                  <label className={labelCls}>이설여부</label>
                  <div className="flex gap-4 h-[42px] items-center">
                    {['필요', '불필요'].map((v) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`relocation-${record.id}`}
                          value={v}
                          checked={values.relocation_needed === v}
                          onChange={() => set('relocation_needed', v)}
                          className="w-4 h-4 accent-accent"
                        />
                        <span className="text-sm text-text-primary">{v}</span>
                      </label>
                    ))}
                    {values.relocation_needed && (
                      <button
                        type="button"
                        onClick={() => set('relocation_needed', null)}
                        className="text-xs text-text-secondary/70 hover:text-text-secondary transition-colors"
                      >
                        초기화
                      </button>
                    )}
                  </div>
                </div>

                {/* 수압 */}
                <div>
                  <label className={labelCls}>수압</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="수압 입력"
                    value={(values.water_pressure as string) ?? ''}
                    onChange={(e) => set('water_pressure', e.target.value || null)}
                    className={inputCls}
                  />
                </div>

                {/* 교체필요 */}
                <div>
                  <label className={labelCls}>교체필요</label>
                  <div className="flex gap-4 h-[42px] items-center">
                    {['필요', '불필요'].map((v) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`replacement-${record.id}`}
                          value={v}
                          checked={values.replacement_needed === v}
                          onChange={() => set('replacement_needed', v)}
                          className="w-4 h-4 accent-accent"
                        />
                        <span className="text-sm text-text-primary">{v}</span>
                      </label>
                    ))}
                    {values.replacement_needed && (
                      <button
                        type="button"
                        onClick={() => set('replacement_needed', null)}
                        className="text-xs text-text-secondary/70 hover:text-text-secondary transition-colors"
                      >
                        초기화
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-text-secondary hover:text-text-primary bg-background hover:bg-border/60 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-accent text-white dark:text-zinc-950 hover:opacity-90 rounded-lg disabled:opacity-50 transition-opacity"
          >
            <Check size={15} />
            {isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
