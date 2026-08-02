'use client';

import { useState, useRef, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, ChevronRight } from 'lucide-react';
import { importValvesFromExcel } from '@/features/valve-survey/api/actions';
import { getBlockList } from '@/features/meter-survey/api/actions';
import type { ValveInsert, ValveType } from '@/shared/types/valve-record';
import { valveRowSchema, hydrantRowSchema, validateRows } from '@/features/valve-survey/types/excel-row-schema';

type ParsedRow = Partial<Omit<ValveInsert, 'block'>> & { block: string | null };
type Format = 'gate' | 'air' | 'hydrant';

// ─── 제수(이토)밸브류 조서 ("밸브류 조서" 시트, 데이터 4행부터) ───────────────
const GATE_COL = {
  SURVEY_DATE_TEXT: 1,
  SURVEYOR: 2,
  VALVE_NO: 3,
  BLOCK: 4,
  OLD_ADDRESS: 5,
  ROAD_ADDRESS: 6,
  MAP_SHEET_NO: 7,
  VALVE_FORM: 8,
  VALVE_MATERIAL: 9,
  ROTATION_DIRECTION: 10,
  ROTATION_COUNT: 11,
  MANUFACTURER: 12,
  VALVE_ISSUE: 13,
  INSTALL_DATE: 14,
  VALVE_DIAMETER: 15,
  TOTAL_ROTATION_COUNT: 16,
  DRIVE_METHOD: 17,
  OPEN_CLOSE: 18,
  PROTECTION_PIPE_SPEC: 19,
  COVER_SPEC: 20,
  ISSUE: 21,
  VALVE_ROOM_SPEC: 22,
  VALVE_ROOM_DEPTH: 23,
  NOTE: 24,
} as const;

// ─── 공기변 조서 ("공기변 조서" 시트, 데이터 4행부터) ─────────────────────────
const AIR_COL = {
  SURVEY_DATE_TEXT: 1,
  SURVEYOR: 2,
  VALVE_NO: 3,
  BLOCK: 4,
  OLD_ADDRESS: 5,
  ROAD_ADDRESS: 6,
  MAP_SHEET_NO: 7,
  RELATED_VALVE_DIAMETER: 8,
  RELATED_VALVE_OPEN_CLOSE: 9,
  INSTALL_DATE: 10,
  VALVE_FORM: 11,
  VALVE_ISSUE: 12,
  VALVE_DIAMETER: 13,
  ELEVATION: 14,
  PROTECTION_PIPE_SPEC: 15,
  COVER_SPEC: 16,
  ISSUE: 17,
  VALVE_ROOM_SPEC: 18,
  VALVE_ROOM_DEPTH: 19,
  PRESSURE_LOCATION: 20,
  PRESSURE_ELEVATION: 21,
  PRESSURE_VALUE: 22,
  DYNAMIC_HEAD: 23,
  HEAD_DIFF: 24,
  NOTE: 25,
} as const;

// ─── 조서(소화전) ("조서(소화전)_DS01" 시트, 데이터 6행부터, 블록 컬럼 없음) ──
const HYDRANT_COL = {
  BLOCK: 3, // 소블록 (실사용시 대개 공란 — 공란이면 업로드 시 선택한 블록 적용)
  MAP_SHEET_NO: 4,
  VALVE_NO: 6,
  FACILITY_NAME: 7,
  ROAD_ADDRESS: 8,
  HYDRANT_DIAMETER: 10,
  OPEN_CLOSE: 11,
  VALVE_ISSUE: 12,
  HYDRANT_TYPE: 13,
  HYDRANT_VALVE_DIAMETER: 14,
  ELEVATION: 15,
  INSTALL_DATE: 16,
  WATER_TOWER_HEIGHT: 17,
  ISSUE: 18,
  NOTE: 19,
  SURVEY_DATE_TEXT: 20,
  SURVEYOR: 21,
} as const;

const PREVIEW_COLS: { key: keyof ValveInsert; label: string }[] = [
  { key: 'valve_no', label: '밸브번호' },
  { key: 'block', label: '블록' },
  { key: 'road_address', label: '도로명주소' },
  { key: 'old_address', label: '구주소' },
];

type Props = { onClose: () => void };

function str(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function detectFormat(wb: XLSX.WorkBook): Format | null {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }).slice(0, 3);
  const joined = rows.flat().join(' ');
  if (joined.includes('소화전현황')) return 'hydrant';
  if (joined.includes('공기밸브현황')) return 'air';
  if (joined.includes('밸브현황')) return 'gate';
  return null;
}

function parseGate(wb: XLSX.WorkBook): ParsedRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
  const dataRows = allRows.slice(3);
  return dataRows
    .filter((row) => row[GATE_COL.VALVE_NO] != null)
    .map((row): ParsedRow => ({
      valve_type: '제수밸브' as ValveType,
      valve_no: str(row[GATE_COL.VALVE_NO]),
      block: str(row[GATE_COL.BLOCK]),
      old_address: str(row[GATE_COL.OLD_ADDRESS]),
      road_address: str(row[GATE_COL.ROAD_ADDRESS]),
      map_sheet_no: str(row[GATE_COL.MAP_SHEET_NO]),
      survey_date_text: str(row[GATE_COL.SURVEY_DATE_TEXT]),
      surveyor: str(row[GATE_COL.SURVEYOR]),
      valve_form: str(row[GATE_COL.VALVE_FORM]),
      valve_material: str(row[GATE_COL.VALVE_MATERIAL]),
      rotation_direction: str(row[GATE_COL.ROTATION_DIRECTION]),
      rotation_count: str(row[GATE_COL.ROTATION_COUNT]),
      manufacturer: str(row[GATE_COL.MANUFACTURER]),
      valve_issue: str(row[GATE_COL.VALVE_ISSUE]),
      install_date: str(row[GATE_COL.INSTALL_DATE]),
      valve_diameter: str(row[GATE_COL.VALVE_DIAMETER]),
      total_rotation_count: str(row[GATE_COL.TOTAL_ROTATION_COUNT]),
      drive_method: str(row[GATE_COL.DRIVE_METHOD]),
      open_close: str(row[GATE_COL.OPEN_CLOSE]),
      protection_pipe_spec: str(row[GATE_COL.PROTECTION_PIPE_SPEC]),
      cover_spec: str(row[GATE_COL.COVER_SPEC]),
      issue: str(row[GATE_COL.ISSUE]),
      valve_room_spec: str(row[GATE_COL.VALVE_ROOM_SPEC]),
      valve_room_depth: str(row[GATE_COL.VALVE_ROOM_DEPTH]),
      note: str(row[GATE_COL.NOTE]),
    }));
}

function parseAir(wb: XLSX.WorkBook): ParsedRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
  const dataRows = allRows.slice(3);
  return dataRows
    .filter((row) => row[AIR_COL.VALVE_NO] != null)
    .map((row): ParsedRow => ({
      valve_type: '공기밸브' as ValveType,
      valve_no: str(row[AIR_COL.VALVE_NO]),
      block: str(row[AIR_COL.BLOCK]),
      old_address: str(row[AIR_COL.OLD_ADDRESS]),
      road_address: str(row[AIR_COL.ROAD_ADDRESS]),
      map_sheet_no: str(row[AIR_COL.MAP_SHEET_NO]),
      survey_date_text: str(row[AIR_COL.SURVEY_DATE_TEXT]),
      surveyor: str(row[AIR_COL.SURVEYOR]),
      related_valve_diameter: str(row[AIR_COL.RELATED_VALVE_DIAMETER]),
      related_valve_open_close: str(row[AIR_COL.RELATED_VALVE_OPEN_CLOSE]),
      install_date: str(row[AIR_COL.INSTALL_DATE]),
      valve_form: str(row[AIR_COL.VALVE_FORM]),
      valve_issue: str(row[AIR_COL.VALVE_ISSUE]),
      valve_diameter: str(row[AIR_COL.VALVE_DIAMETER]),
      elevation: str(row[AIR_COL.ELEVATION]),
      protection_pipe_spec: str(row[AIR_COL.PROTECTION_PIPE_SPEC]),
      cover_spec: str(row[AIR_COL.COVER_SPEC]),
      issue: str(row[AIR_COL.ISSUE]),
      valve_room_spec: str(row[AIR_COL.VALVE_ROOM_SPEC]),
      valve_room_depth: str(row[AIR_COL.VALVE_ROOM_DEPTH]),
      pressure_location: str(row[AIR_COL.PRESSURE_LOCATION]),
      pressure_elevation: str(row[AIR_COL.PRESSURE_ELEVATION]),
      pressure_value: str(row[AIR_COL.PRESSURE_VALUE]),
      dynamic_head: str(row[AIR_COL.DYNAMIC_HEAD]),
      head_diff: str(row[AIR_COL.HEAD_DIFF]),
      note: str(row[AIR_COL.NOTE]),
    }));
}

function parseHydrant(wb: XLSX.WorkBook): ParsedRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
  const dataRows = allRows.slice(5);
  return dataRows
    .filter((row) => row[HYDRANT_COL.VALVE_NO] != null)
    .map((row): ParsedRow => ({
      valve_type: '소화전' as ValveType,
      valve_no: str(row[HYDRANT_COL.VALVE_NO]),
      block: str(row[HYDRANT_COL.BLOCK]),
      road_address: str(row[HYDRANT_COL.ROAD_ADDRESS]),
      map_sheet_no: str(row[HYDRANT_COL.MAP_SHEET_NO]),
      facility_name: str(row[HYDRANT_COL.FACILITY_NAME]),
      hydrant_diameter: str(row[HYDRANT_COL.HYDRANT_DIAMETER]),
      open_close: str(row[HYDRANT_COL.OPEN_CLOSE]),
      valve_issue: str(row[HYDRANT_COL.VALVE_ISSUE]),
      hydrant_type: str(row[HYDRANT_COL.HYDRANT_TYPE]),
      hydrant_valve_diameter: str(row[HYDRANT_COL.HYDRANT_VALVE_DIAMETER]),
      elevation: str(row[HYDRANT_COL.ELEVATION]),
      install_date: str(row[HYDRANT_COL.INSTALL_DATE]),
      water_tower_height: str(row[HYDRANT_COL.WATER_TOWER_HEIGHT]),
      issue: str(row[HYDRANT_COL.ISSUE]),
      note: str(row[HYDRANT_COL.NOTE]),
      survey_date_text: str(row[HYDRANT_COL.SURVEY_DATE_TEXT]),
      surveyor: str(row[HYDRANT_COL.SURVEYOR]),
    }));
}

const FORMAT_LABEL: Record<Format, string> = { gate: '제수(이토)밸브', air: '공기밸브', hydrant: '소화전' };

export default function ValveExcelUpload({ onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [format, setFormat] = useState<Format | null>(null);
  const [allRows, setAllRows] = useState<ParsedRow[]>([]);
  const [blockOptions, setBlockOptions] = useState<string[]>([]);
  const [selectedBlock, setSelectedBlock] = useState('');
  const [filteredRows, setFilteredRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [skippedRowIssues, setSkippedRowIssues] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !format) return;
    setError(null);
    setSkippedRowIssues([]);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buf = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: 'array' });
        const detected = detectFormat(wb);
        if (detected !== format) {
          setError(
            detected
              ? `선택하신 '${FORMAT_LABEL[format]}' 양식이 아닙니다. (이 파일은 '${FORMAT_LABEL[detected]}' 양식으로 보입니다)`
              : `선택하신 '${FORMAT_LABEL[format]}' 양식이 아닙니다. 알 수 없는 양식의 파일입니다.`,
          );
          return;
        }

        if (format === 'hydrant') {
          const parsed = parseHydrant(wb);
          const { validRows, issues } = validateRows(parsed, hydrantRowSchema);
          if (validRows.length === 0) {
            setError('시트에 데이터가 없습니다.');
            return;
          }
          const blocks = await getBlockList();
          setAllRows(validRows);
          setBlockOptions(blocks);
          setSkippedRowIssues(issues);
          setStep(2);
        } else {
          const parsed = format === 'gate' ? parseGate(wb) : parseAir(wb);
          const { validRows, issues } = validateRows(parsed, valveRowSchema);
          const blocks = [...new Set(validRows.map((r) => r.block).filter((b): b is string => !!b))].sort();
          if (blocks.length === 0) {
            setError("'블록명' 열을 찾을 수 없습니다. 양식 파일을 확인하세요.");
            return;
          }
          setAllRows(validRows);
          setBlockOptions(blocks);
          setSkippedRowIssues(issues);
          setStep(2);
        }
      } catch {
        setError('파일을 읽는 중 오류가 발생했습니다.');
      } finally {
        if (fileRef.current) fileRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleBlockConfirm() {
    if (!selectedBlock) return;
    const rows =
      format === 'hydrant'
        ? allRows.map((r) => ({ ...r, block: selectedBlock }))
        : allRows.filter((r) => r.block === selectedBlock);
    setFilteredRows(rows);
    setStep(3);
  }

  function handleImport() {
    startTransition(async () => {
      const result = await importValvesFromExcel(selectedBlock, filteredRows as Partial<ValveInsert>[]);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const stepLabels = ['파일 선택', '블록 선택', '미리보기'];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-4">
            <h2 className="text-text-primary font-semibold">엑셀 업로드</h2>
            {format && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-accent/15 text-accent">
                {FORMAT_LABEL[format]}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs">
              {stepLabels.map((label, i) => {
                const s = (i + 1) as 1 | 2 | 3;
                return (
                  <span key={s} className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold ${
                        step >= s ? 'bg-accent text-white dark:text-zinc-950' : 'bg-background text-text-secondary'
                      }`}
                    >
                      {s}
                    </span>
                    <span className={step >= s ? 'text-text-primary' : 'text-text-secondary/70'}>{label}</span>
                    {s < 3 && <ChevronRight size={12} className="text-text-secondary/50" />}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div>
              <p className="text-text-secondary text-sm mb-3">업로드할 양식 종류를 먼저 선택하세요.</p>
              <div className="flex gap-2 mb-6">
                {(['gate', 'air', 'hydrant'] as Format[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setFormat(f); setError(null); }}
                    className={`flex-1 py-3 rounded-lg text-sm font-semibold border transition-colors ${
                      format === f
                        ? 'bg-accent border-accent text-white dark:text-zinc-950'
                        : 'bg-background border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {FORMAT_LABEL[f]}
                  </button>
                ))}
              </div>
              <div
                className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-20 transition-colors ${
                  format ? 'border-border cursor-pointer hover:border-accent/50' : 'border-border/50 opacity-50 cursor-not-allowed'
                }`}
                onClick={() => format && fileRef.current?.click()}
              >
                <Upload size={36} className="text-text-secondary mb-3" />
                <p className="text-text-primary font-medium">
                  {format ? '클릭하여 엑셀 파일 선택' : '먼저 위에서 양식 종류를 선택하세요'}
                </p>
                <p className="text-text-secondary text-sm mt-1">.xlsx, .xls 지원</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" disabled={!format} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              {skippedRowIssues.length > 0 && (
                <div className="mb-4 px-3 py-2 bg-warning/10 border border-warning/20 rounded-lg text-warning text-xs">
                  <p className="font-semibold mb-1">필수 항목 누락으로 {skippedRowIssues.length}개 행을 제외했습니다.</p>
                  <ul className="space-y-0.5 text-warning/80">
                    {skippedRowIssues.slice(0, 10).map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                  {skippedRowIssues.length > 10 && (
                    <p className="mt-1 text-warning/60">외 {skippedRowIssues.length - 10}건</p>
                  )}
                </div>
              )}
              <p className="text-text-secondary text-sm mb-5">
                {format === 'hydrant' ? (
                  <>
                    소화전 조서는 파일에 블록 정보가 없습니다. <span className="text-text-primary font-semibold">{allRows.length}개</span> 행을 가져올
                    블록을 선택하세요.
                  </>
                ) : (
                  <>
                    파일에서 <span className="text-text-primary font-semibold">{blockOptions.length}개</span>의 블록을 찾았습니다. 가져올 블록을
                    선택하세요.
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {blockOptions.map((b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedBlock(b)}
                    className={`px-4 py-2 rounded-lg font-mono text-sm font-semibold transition-colors ${
                      selectedBlock === b ? 'bg-accent text-white dark:text-zinc-950' : 'bg-background text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              {selectedBlock && (
                <p className="mt-5 text-text-secondary text-sm">
                  선택: <span className="text-accent font-mono font-semibold">{selectedBlock}</span>
                  {' — '}
                  {format === 'hydrant' ? allRows.length : allRows.filter((r) => r.block === selectedBlock).length}개 레코드
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="text-text-secondary text-sm mb-4">
                총 <span className="text-text-primary font-semibold">{filteredRows.length}</span>개 레코드를 가져옵니다. 기존에 같은 블록·밸브번호가
                있으면 덮어씁니다.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-background border-b border-border">
                      <th className="px-3 py-2 text-left text-text-secondary w-8">#</th>
                      {PREVIEW_COLS.map((c) => (
                        <th key={c.key} className="px-3 py-2 text-left text-text-secondary whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-text-secondary tabular-nums">{i + 1}</td>
                        {PREVIEW_COLS.map((c) => (
                          <td key={c.key} className="px-3 py-2 text-text-primary whitespace-nowrap">
                            {(row[c.key] as string) ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 10 && (
                <p className="text-text-secondary/70 text-xs mt-2 text-center tabular-nums">
                  처음 10개 미리보기 · 전체 {filteredRows.length}개 가져옵니다
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-2">
          <button
            onClick={step === 1 ? onClose : () => setStep((s) => (s - 1) as 1 | 2 | 3)}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary bg-background hover:bg-border/60 rounded-lg transition-colors"
          >
            {step === 1 ? '취소' : '이전'}
          </button>
          {step === 2 && (
            <button
              onClick={handleBlockConfirm}
              disabled={!selectedBlock}
              className="px-4 py-2 text-sm font-semibold bg-accent text-white dark:text-zinc-950 hover:opacity-90 rounded-lg disabled:opacity-40 transition-opacity"
            >
              다음
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleImport}
              disabled={isPending}
              className="px-4 py-2 text-sm font-semibold bg-accent text-white dark:text-zinc-950 hover:opacity-90 rounded-lg disabled:opacity-40 transition-opacity"
            >
              {isPending ? '가져오는 중...' : '가져오기'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
