'use client';

import { useState, useTransition, useRef } from 'react';
import { X, Check, Trash2, ImagePlus, ExternalLink } from 'lucide-react';
import { createValveRecord, updateValveRecord } from '@/features/valve-survey/api/actions';
import type { ValveRecord, ValveInsert, ValveType } from '@/shared/types/valve-record';
import {
  VALVE_TYPE_OPTIONS,
  VALVE_TYPE_LABEL,
  HYDRANT_TYPE_OPTIONS,
  VALVE_MATERIAL_OPTIONS,
  DRIVE_METHOD_OPTIONS,
  OPEN_CLOSE_OPTIONS,
  getValveFormOptions,
  resolveSelectWithCustom,
  buildProtectionPipeSpec,
  buildCoverSpec,
  mapToEditFormValues,
  mapToCreateFormValues,
} from '@/features/valve-survey/types/mappers';

type Props = {
  blocks: string[];
  onClose: () => void;
  onSaved: () => void;
} & (
  | { mode: 'create'; oldAddress: string | null; roadAddress: string | null; lat: number; lng: number }
  | { mode: 'edit'; record: ValveRecord }
);

const labelCls = 'block text-xs font-semibold text-text-secondary mb-1.5';
const inputCls =
  'w-full bg-background border border-border rounded-lg px-3 py-2 text-base md:text-sm text-text-primary focus:outline-none focus:border-accent transition-colors';
const selectCls = inputCls;
const optionBtnCls = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-sm border transition-colors ${
    active
      ? 'bg-accent border-accent text-white dark:text-zinc-950 font-semibold'
      : 'bg-background border-border text-text-secondary hover:text-text-primary'
  }`;

const STORAGE_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
const thumbnailUrl = (path: string) => `${STORAGE_BASE}/${path}`;

type ImageSlot = 1 | 2;

function ValveImageSlotCard({
  slot,
  fileId,
  block,
  valveNo,
  recordId,
  onUploaded,
  onDeleted,
}: {
  slot: ImageSlot;
  fileId: string | null;
  block: string | null;
  valveNo: string | null;
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
    if (!block || !valveNo) {
      setError('밸브관리번호가 없어 이미지를 업로드할 수 없습니다.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        record_id: String(recordId),
        slot: String(slot),
        block,
        valve_no: valveNo,
        content_type: file.type || 'image/jpeg',
      });
      const presignRes = await fetch(`/admin/api/upload-valve-image?${params}`);
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

      const saveRes = await fetch('/admin/api/upload-valve-image', {
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
      const res = await fetch('/admin/api/upload-valve-image', {
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
        {valveNo && (
          <span className="text-text-secondary/70 font-mono">({valveNo}-{slot})</span>
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
              href={thumbnailUrl(fileId)}
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

export default function ValveFormModal(props: Props) {
  const { blocks, onClose, onSaved } = props;

  const [initial] = useState(() =>
    props.mode === 'create'
      ? mapToCreateFormValues('', props.oldAddress, props.roadAddress, props.lat, props.lng)
      : mapToEditFormValues(props.record),
  );

  const [valveType, setValveType] = useState<ValveType>(initial.values.valve_type ?? '제수밸브');
  const [block, setBlock] = useState(initial.values.block ?? '');
  const [valveNo, setValveNo] = useState((initial.values.valve_no as string) ?? '');
  const [oldAddress, setOldAddress] = useState(initial.values.old_address ?? '');
  const [roadAddress, setRoadAddress] = useState(initial.values.road_address ?? '');
  const [image1Id, setImage1Id] = useState<string | null>(props.mode === 'edit' ? props.record.image1_id : null);
  const [image2Id, setImage2Id] = useState<string | null>(props.mode === 'edit' ? props.record.image2_id : null);
  const [hydrantTypeSelect, setHydrantTypeSelect] = useState(initial.hydrantTypeSelect);
  const [hydrantTypeCustom, setHydrantTypeCustom] = useState(initial.hydrantTypeCustom);
  const [valveFormSelect, setValveFormSelect] = useState(initial.valveFormSelect);
  const [valveFormCustom, setValveFormCustom] = useState(initial.valveFormCustom);
  const [valveMaterialSelect, setValveMaterialSelect] = useState(initial.valveMaterialSelect);
  const [valveMaterialCustom, setValveMaterialCustom] = useState(initial.valveMaterialCustom);
  const [protectionPipeUnknown, setProtectionPipeUnknown] = useState(initial.protectionPipeUnknown);
  const [protectionPipeNumber, setProtectionPipeNumber] = useState(initial.protectionPipeNumber);
  const [coverSpecNumber, setCoverSpecNumber] = useState(initial.coverSpecNumber);
  const [values, setValues] = useState<Partial<ValveInsert>>(initial.values);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof ValveInsert>(key: K, val: ValveInsert[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  const isHydrant = valveType === '소화전';
  const isSluiceValve = valveType === '제수밸브';
  const isAirValve = valveType === '공기밸브';
  const isUndergroundHydrant = isHydrant && hydrantTypeSelect === '지하식';
  const valveFormOptions = getValveFormOptions(valveType);

  function handleSave() {
    if (!block) {
      setError('블록명을 선택해주세요.');
      return;
    }

    const payload: Partial<ValveInsert> & Pick<ValveInsert, 'block' | 'valve_type'> = {
      block,
      valve_no: valveNo.trim() || null,
      old_address: oldAddress || null,
      road_address: roadAddress || null,
      lat: values.lat ?? null,
      lng: values.lng ?? null,
      valve_type: valveType,
      hydrant_diameter: isHydrant ? (values.hydrant_diameter || null) : null,
      hydrant_valve_diameter: isHydrant ? (values.hydrant_valve_diameter || null) : null,
      hydrant_type: isHydrant ? resolveSelectWithCustom(hydrantTypeSelect, hydrantTypeCustom) : null,
      note: isHydrant ? (values.note || null) : null,
      open_close: values.open_close || null,
      valve_form: !isHydrant ? resolveSelectWithCustom(valveFormSelect, valveFormCustom) : null,
      valve_material: !isHydrant && !isAirValve ? resolveSelectWithCustom(valveMaterialSelect, valveMaterialCustom) : null,
      drive_method: !isHydrant ? (values.drive_method || null) : null,
      protection_pipe_spec: !isHydrant ? buildProtectionPipeSpec(protectionPipeUnknown, protectionPipeNumber) : null,
      cover_spec: !isHydrant || isUndergroundHydrant ? buildCoverSpec(coverSpecNumber) : null,
      issue: !isHydrant ? (values.issue || null) : null,
      valve_room_spec: !isHydrant || isUndergroundHydrant ? (values.valve_room_spec || null) : null,
      valve_room_depth: !isHydrant ? (values.valve_room_depth || null) : null,
      valve_diameter: isSluiceValve ? (values.valve_diameter || null) : null,
    };

    startTransition(async () => {
      const result =
        props.mode === 'create' ? await createValveRecord(payload) : await updateValveRecord(props.record.id, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  function handleImageUploaded(slot: ImageSlot, newFileId: string) {
    if (slot === 1) setImage1Id(newFileId);
    else setImage2Id(newFileId);
  }

  function handleImageDeleted(slot: ImageSlot) {
    if (slot === 1) setImage1Id(null);
    else setImage2Id(null);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-surface border border-border rounded-t-2xl md:rounded-xl w-full md:max-w-lg max-h-[92dvh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <p className="text-text-primary font-semibold text-sm">{props.mode === 'create' ? '밸브 등록' : '밸브 수정'}</p>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 폼 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs">{error}</div>
          )}

          {/* 매설위치 */}
          <div className="space-y-2">
            <div>
              <label className={labelCls}>구주소</label>
              <input
                type="text"
                value={oldAddress}
                onChange={(e) => setOldAddress(e.target.value)}
                placeholder="지번주소"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>도로명주소</label>
              <input
                type="text"
                value={roadAddress}
                onChange={(e) => setRoadAddress(e.target.value)}
                placeholder="도로명주소"
                className={inputCls}
              />
            </div>
          </div>

          {/* 블록명 */}
          <div>
            <label className={labelCls}>블록명</label>
            <select value={block} onChange={(e) => setBlock(e.target.value)} className={selectCls}>
              <option value="">— 선택 —</option>
              {blocks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* 밸브관리번호 */}
          <div>
            <label className={labelCls}>밸브관리번호</label>
            <input
              type="text"
              value={valveNo}
              onChange={(e) => setValveNo(e.target.value)}
              placeholder="예: 1, GV-001"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>

          {/* 이미지 (개당 2장, 저장 후 즉시 업로드) */}
          {props.mode === 'edit' && (
            <div>
              <label className={labelCls}>
                이미지
                <span className="ml-1.5 font-normal text-text-secondary/70">(최대 2장, 즉시 저장)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as ImageSlot[]).map((slot) => (
                  <ValveImageSlotCard
                    key={slot}
                    slot={slot}
                    fileId={slot === 1 ? image1Id : image2Id}
                    block={props.record.block}
                    valveNo={props.record.valve_no}
                    recordId={props.record.id}
                    onUploaded={handleImageUploaded}
                    onDeleted={handleImageDeleted}
                  />
                ))}
              </div>
              {!props.record.valve_no && (
                <p className="text-xs text-warning mt-1.5">밸브관리번호를 입력 후 저장하면 이미지를 업로드할 수 있습니다.</p>
              )}
            </div>
          )}

          {/* 종류 */}
          <div>
            <label className={labelCls}>종류</label>
            <div className="flex gap-2">
              {VALVE_TYPE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setValveType(t);
                    if (!getValveFormOptions(t).includes(valveFormSelect)) {
                      setValveFormSelect('');
                      setValveFormCustom('');
                    }
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    valveType === t
                      ? 'bg-accent border-accent text-white dark:text-zinc-950'
                      : 'bg-background border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {VALVE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {isHydrant ? (
            <>
              {/* 구경 */}
              <div>
                <label className={labelCls}>구경</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="숫자 입력"
                  value={(values.hydrant_diameter as string) ?? ''}
                  onChange={(e) => set('hydrant_diameter', e.target.value || null)}
                  className={`${inputCls} tabular-nums`}
                />
              </div>

              {/* 개폐여부 */}
              <div>
                <label className={labelCls}>개폐여부</label>
                <div className="flex gap-4 h-[42px] items-center">
                  {OPEN_CLOSE_OPTIONS.map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="open-close"
                        value={v}
                        checked={values.open_close === v}
                        onChange={() => set('open_close', v)}
                        className="w-4 h-4 accent-accent"
                      />
                      <span className="text-sm text-text-primary">{v}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 형식 */}
              <div>
                <label className={labelCls}>형식</label>
                <div className="flex flex-wrap gap-2">
                  {HYDRANT_TYPE_OPTIONS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        setHydrantTypeSelect(o);
                        if (o !== '기타') setHydrantTypeCustom('');
                      }}
                      className={optionBtnCls(hydrantTypeSelect === o)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                {hydrantTypeSelect === '기타' && (
                  <input
                    type="text"
                    placeholder="직접 입력"
                    value={hydrantTypeCustom}
                    onChange={(e) => setHydrantTypeCustom(e.target.value)}
                    className={`${inputCls} mt-2`}
                    autoFocus
                  />
                )}
              </div>

              {isUndergroundHydrant && (
                <>
                  {/* 철개규격 */}
                  <div>
                    <label className={labelCls}>철개규격</label>
                    <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-3 focus-within:border-accent transition-colors">
                      <span className="text-text-secondary text-sm">Φ</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="숫자 입력"
                        value={coverSpecNumber}
                        onChange={(e) => setCoverSpecNumber(e.target.value)}
                        className="w-full bg-transparent py-2 text-base md:text-sm text-text-primary tabular-nums focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* 밸브실규격 */}
                  <div>
                    <label className={labelCls}>밸브실규격</label>
                    <input
                      type="text"
                      placeholder="직접 입력"
                      value={(values.valve_room_spec as string) ?? ''}
                      onChange={(e) => set('valve_room_spec', e.target.value || null)}
                      className={inputCls}
                    />
                  </div>
                </>
              )}

              {/* 밸브구경 */}
              <div>
                <label className={labelCls}>밸브구경</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="숫자 입력"
                  value={(values.hydrant_valve_diameter as string) ?? ''}
                  onChange={(e) => set('hydrant_valve_diameter', e.target.value || null)}
                  className={`${inputCls} tabular-nums`}
                />
              </div>

              {/* 비고 */}
              <div>
                <label className={labelCls}>비고</label>
                <input
                  type="text"
                  placeholder="기타사항 직접 입력"
                  value={(values.note as string) ?? ''}
                  onChange={(e) => set('note', e.target.value || null)}
                  className={inputCls}
                />
              </div>
            </>
          ) : (
            <>
              {isSluiceValve && (
                /* 관경 */
                <div>
                  <label className={labelCls}>관경</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="숫자 입력"
                    value={(values.valve_diameter as string) ?? ''}
                    onChange={(e) => set('valve_diameter', e.target.value || null)}
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
              )}

              {/* 형식 */}
              <div>
                <label className={labelCls}>형식</label>
                <div className="flex flex-wrap gap-2">
                  {valveFormOptions.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        setValveFormSelect(o);
                        if (o !== '기타') setValveFormCustom('');
                      }}
                      className={optionBtnCls(valveFormSelect === o)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                {valveFormSelect === '기타' && (
                  <input
                    type="text"
                    placeholder="직접 입력"
                    value={valveFormCustom}
                    onChange={(e) => setValveFormCustom(e.target.value)}
                    className={`${inputCls} mt-2`}
                    autoFocus
                  />
                )}
              </div>

              {/* 밸브재질 (공기밸브는 미해당) */}
              {!isAirValve && (
                <div>
                  <label className={labelCls}>밸브재질</label>
                  <div className="flex flex-wrap gap-2">
                    {VALVE_MATERIAL_OPTIONS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => {
                          setValveMaterialSelect(o);
                          if (o !== '기타') setValveMaterialCustom('');
                        }}
                        className={optionBtnCls(valveMaterialSelect === o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                  {valveMaterialSelect === '기타' && (
                    <input
                      type="text"
                      placeholder="직접 입력"
                      value={valveMaterialCustom}
                      onChange={(e) => setValveMaterialCustom(e.target.value)}
                      className={`${inputCls} mt-2`}
                      autoFocus
                    />
                  )}
                </div>
              )}

              {/* 구동방법 */}
              <div>
                <label className={labelCls}>구동방법</label>
                <div className="flex gap-4 h-[42px] items-center">
                  {DRIVE_METHOD_OPTIONS.map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="drive-method"
                        value={v}
                        checked={values.drive_method === v}
                        onChange={() => set('drive_method', v)}
                        className="w-4 h-4 accent-accent"
                      />
                      <span className="text-sm text-text-primary">{v}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 개폐여부 */}
              <div>
                <label className={labelCls}>개폐여부</label>
                <div className="flex gap-4 h-[42px] items-center">
                  {OPEN_CLOSE_OPTIONS.map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="open-close"
                        value={v}
                        checked={values.open_close === v}
                        onChange={() => set('open_close', v)}
                        className="w-4 h-4 accent-accent"
                      />
                      <span className="text-sm text-text-primary">{v}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 보호통규격 */}
              <div>
                <label className={labelCls}>보호통규격</label>
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setProtectionPipeUnknown((v) => !v)}
                    className={optionBtnCls(protectionPipeUnknown)}
                  >
                    확인불가
                  </button>
                  <div className="flex-1 flex items-center gap-1.5 bg-background border border-border rounded-lg px-3 focus-within:border-accent transition-colors">
                    <span className="text-text-secondary text-sm">Φ</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="숫자 입력"
                      value={protectionPipeNumber}
                      disabled={protectionPipeUnknown}
                      onChange={(e) => setProtectionPipeNumber(e.target.value)}
                      className="w-full bg-transparent py-2 text-base md:text-sm text-text-primary tabular-nums focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* 철개규격 */}
              <div>
                <label className={labelCls}>철개규격</label>
                <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-3 focus-within:border-accent transition-colors">
                  <span className="text-text-secondary text-sm">Φ</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="숫자 입력"
                    value={coverSpecNumber}
                    onChange={(e) => setCoverSpecNumber(e.target.value)}
                    className="w-full bg-transparent py-2 text-base md:text-sm text-text-primary tabular-nums focus:outline-none"
                  />
                </div>
              </div>

              {/* 문제사항 */}
              <div>
                <label className={labelCls}>문제사항</label>
                <input
                  type="text"
                  placeholder="직접 입력"
                  value={(values.issue as string) ?? ''}
                  onChange={(e) => set('issue', e.target.value || null)}
                  className={inputCls}
                />
              </div>

              {/* 밸브실규격 */}
              <div>
                <label className={labelCls}>밸브실규격</label>
                <input
                  type="text"
                  placeholder="직접 입력"
                  value={(values.valve_room_spec as string) ?? ''}
                  onChange={(e) => set('valve_room_spec', e.target.value || null)}
                  className={inputCls}
                />
              </div>

              {/* 밸브실심도 */}
              <div>
                <label className={labelCls}>밸브실심도</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="예: 0.1"
                  value={(values.valve_room_depth as string) ?? ''}
                  onChange={(e) => set('valve_room_depth', e.target.value || null)}
                  className={`${inputCls} tabular-nums`}
                />
              </div>
            </>
          )}
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
