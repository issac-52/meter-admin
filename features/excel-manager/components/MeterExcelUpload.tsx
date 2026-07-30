'use client';

import { useState, useRef, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, ChevronRight } from 'lucide-react';
import { importFromExcel, getBlockRowNos } from '@/features/meter-survey/api/actions';
import type { MeterInsert } from '@/shared/types/meter-record';
import { oldFormatRowSchema, daebulFormatRowSchema, validateRows } from '@/features/excel-manager/types/excel-row-schema';

// ─── 기존 형식 (금산군수용가조사기록지) ───────────────────────────────────────
const EXCEL_MAP_OLD: Record<string, keyof MeterInsert> = {
  '도면번호': 'row_no',
  '성명': 'name',
  '도로명주소': 'address',
  '블록\r\n구분': 'block',
  '__EMPTY_7': 'old_meter_number',
  '__EMPTY_8': 'meter_number',
  '__EMPTY_13': 'reading',
  '__EMPTY_14': 'sealed',
  '__EMPTY_15': 'meter_condition',
  '__EMPTY_16': 'cover_type',
  '__EMPTY_17': 'location',
  '__EMPTY_23': 'usage_type',
  '__EMPTY_26': 'floor',
  '비고': 'note',
  '조사일자': 'survey_date',
  '보호통뚜껑양식': 'cover_type',
};

// ─── 대불 형식 컬럼 인덱스 (0-based, "수도미터목록" 시트, 헤더 4행, 데이터 5행~) ─
const DB_COL = {
  ROW_NO: 0,        // A: 번호
  NAME: 2,          // C: 성명
  ADDRESS: 3,       // D: 주소
  OLD_METER: 5,     // F: 계량기번호 (기존)
  GIMUL_NO: 15,     // P: 기물번호 (조사된 실물 번호)
  READING: 13,      // N: 지침(금회)
  SEALED: 14,       // O: 봉인유무
  METER_COND: 19,   // T: 수도미터 상태
  MANUFACTURER: 20, // U: 제작 회사
  LOCATION: 22,     // W: 보호통위치
  COVER_TYPE: 23,   // X: 보호통상태
  RELOCATION: 24,   // Y: 이설필요여부
  W_DIRECT: 25,     // Z: 직접급수
  W_INDIRECT: 26,   // AA: 간접급수
  W_TANK: 27,       // AB: 물탱크 유/무
  TANK_CAP: 28,     // AC: 용량(㎥)
  USAGE_TYPE: 34,   // AI: 사용형태
  FLOOR: 37,        // AL: 건물층수
  NOTE: 39,         // AN: 기타내용
  BLOCK: 48,        // AW: 소블록
  FINAL_READING: 8, // I: 지침(최종)
} as const;

const PREVIEW_COLS: { key: keyof MeterInsert; label: string }[] = [
  { key: 'row_no', label: 'NO' },
  { key: 'name', label: '성명' },
  { key: 'address', label: '주소' },
  { key: 'old_meter_number', label: '기물번호' },
  { key: 'reading', label: '지침' },
  { key: 'sealed', label: '봉인유무' },
];

type Props = { onClose: () => void };

function str(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

export default function MeterExcelUpload({ onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [allRows, setAllRows] = useState<MeterInsert[]>([]);
  const [blockOptions, setBlockOptions] = useState<string[]>([]);
  const [selectedBlock, setSelectedBlock] = useState('');
  const [filteredRows, setFilteredRows] = useState<MeterInsert[]>([]);
  const [existingRowNos, setExistingRowNos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [skippedRowIssues, setSkippedRowIssues] = useState<string[]>([]);
  const [format, setFormat] = useState<'old' | 'daebul'>('old');
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSkippedRowIssues([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buf = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: 'array' });

        // ── 대불 형식 감지: "수도미터목록" 시트 존재 여부 ──────────────────
        if (wb.SheetNames.includes('수도미터목록')) {
          parseDaebul(wb);
        } else {
          parseOld(wb);
        }
      } catch {
        setError('파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function parseDaebul(wb: XLSX.WorkBook) {
    const ws = wb.Sheets['수도미터목록'];
    // header:1 → 각 행이 배열, 헤더 4행 skip (데이터는 index 4부터)
    const allArrays = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      raw: false,
    });

    const dataRows = allArrays.slice(4); // 5행부터

    if (dataRows.length === 0) {
      setError('수도미터목록 시트에 데이터가 없습니다.');
      return;
    }

    const parsed: MeterInsert[] = dataRows
      .filter((row) => row[DB_COL.ROW_NO] != null) // 번호(A) 있는 행만
      .map((row) => {
        // 급수방식: Z(직접) / AA(간접) / AB(물탱크 유/무)
        const wDirect = str(row[DB_COL.W_DIRECT]);
        const wIndirect = str(row[DB_COL.W_INDIRECT]);
        const wTank = str(row[DB_COL.W_TANK]);

        let water_supply_type: string | null = null;
        if (wDirect) water_supply_type = '직접';
        else if (wIndirect) water_supply_type = '간접';
        else if (wTank === '유') water_supply_type = '물탱크';

        const oldMeter = str(row[DB_COL.OLD_METER]);

        return {
          row_no: str(row[DB_COL.ROW_NO]),
          name: str(row[DB_COL.NAME]),
          address: str(row[DB_COL.ADDRESS]),
          block: str(row[DB_COL.BLOCK]),
          old_meter_number: oldMeter,
          meter_number: str(row[DB_COL.GIMUL_NO]),
          reading: str(row[DB_COL.READING]),
          sealed: str(row[DB_COL.SEALED]),
          meter_condition: str(row[DB_COL.METER_COND]),
          manufacturer: str(row[DB_COL.MANUFACTURER]),
          location: str(row[DB_COL.LOCATION]),
          cover_type: str(row[DB_COL.COVER_TYPE]),
          relocation_needed: str(row[DB_COL.RELOCATION]),
          water_supply_type,
          water_tank_capacity: str(row[DB_COL.TANK_CAP]),
          usage_type: str(row[DB_COL.USAGE_TYPE]),
          floor: str(row[DB_COL.FLOOR]),
          note: str(row[DB_COL.NOTE]),
          final_reading: str(row[DB_COL.FINAL_READING]),
          survey_date: null,
          image1_id: null,
          image2_id: null,
          image3_id: null,
          image4_id: null,
          water_pressure: null,
          lat: null,
          lng: null,
        } as MeterInsert;
      });

    const { validRows, issues } = validateRows(parsed, daebulFormatRowSchema);

    const blocks = [
      ...new Set(validRows.map((r) => r.block).filter((b): b is string => !!b)),
    ].sort();

    if (blocks.length === 0) {
      setError("'소블록' 열을 찾을 수 없습니다. 대불 형식 파일을 확인하세요.");
      return;
    }

    setFormat('daebul');
    setAllRows(validRows);
    setBlockOptions(blocks);
    setSkippedRowIssues(issues);
    setStep(2);
  }

  function parseOld(wb: XLSX.WorkBook) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allParsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: false,
    });

    // 서브헤더 2행 skip
    const dataRows = allParsed.slice(2);

    if (dataRows.length === 0) {
      setError('시트에 데이터가 없습니다.');
      return;
    }

    const parsed: MeterInsert[] = dataRows.map((r) => {
      const row: Partial<MeterInsert> = {};
      for (const [excelKey, dbKey] of Object.entries(EXCEL_MAP_OLD)) {
        const raw = r[excelKey];
        const val =
          raw !== null && raw !== undefined && String(raw).trim() !== ''
            ? String(raw).trim()
            : null;
        (row as Record<string, unknown>)[dbKey] = val;
      }
      // 급수방식: 3개 컬럼 → 1개 필드
      const wDirect = r['__EMPTY_19'] != null && String(r['__EMPTY_19']).trim() ? String(r['__EMPTY_19']).trim() : null;
      const wTank   = r['__EMPTY_20'] != null && String(r['__EMPTY_20']).trim() ? String(r['__EMPTY_20']).trim() : null;
      const wCist   = r['__EMPTY_21'] != null && String(r['__EMPTY_21']).trim() ? String(r['__EMPTY_21']).trim() : null;
      if (wDirect) row.water_supply_type = wDirect;
      else if (wTank) row.water_supply_type = '물탱크';
      else if (wCist) row.water_supply_type = '저수조';
      else row.water_supply_type = null;

      // 신규 필드 기본값
      row.image4_id = null;
      row.manufacturer = null;
      row.relocation_needed = null;
      row.water_tank_capacity = null;
      row.water_pressure = null;

      return row as MeterInsert;
    });

    const { validRows, issues } = validateRows(parsed, oldFormatRowSchema);

    const blocks = [
      ...new Set(validRows.map((r) => r.block).filter((b): b is string => !!b)),
    ].sort();

    if (blocks.length === 0) {
      setError("'블록구분' 열을 찾을 수 없습니다. 엑셀 파일을 확인하세요.");
      return;
    }

    setFormat('old');
    setAllRows(validRows);
    setBlockOptions(blocks);
    setSkippedRowIssues(issues);
    setStep(2);
  }

  function handleBlockConfirm() {
    if (!selectedBlock) return;
    const rows = allRows.filter((r) => r.block === selectedBlock);
    setFilteredRows(rows);
    startTransition(async () => {
      const existing = await getBlockRowNos(selectedBlock);
      setExistingRowNos(new Set(existing));
      setStep(3);
    });
  }

  function handleImport() {
    startTransition(async () => {
      const result = await importFromExcel(selectedBlock, filteredRows);
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
            {step > 1 && (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${format === 'daebul' ? 'bg-accent/15 text-accent' : 'bg-background text-text-secondary'}`}>
                {format === 'daebul' ? '대불 형식' : '기존 형식'}
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
            <div
              className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center py-20 cursor-pointer hover:border-accent/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={36} className="text-text-secondary mb-3" />
              <p className="text-text-primary font-medium">클릭하여 엑셀 파일 선택</p>
              <p className="text-text-secondary text-sm mt-1">.xlsx, .xls 지원 · 기존/대불 형식 자동 감지</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                className="hidden"
              />
            </div>
          )}

          {step === 2 && (
            <div>
              {skippedRowIssues.length > 0 && (
                <div className="mb-4 px-3 py-2 bg-warning/10 border border-warning/20 rounded-lg text-warning text-xs">
                  <p className="font-semibold mb-1">
                    필수 항목 누락으로 {skippedRowIssues.length}개 행을 제외했습니다.
                  </p>
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
                파일에서{' '}
                <span className="text-text-primary font-semibold">{blockOptions.length}개</span>의 블록을
                찾았습니다. 가져올 블록을 선택하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                {blockOptions.map((b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedBlock(b)}
                    className={`px-4 py-2 rounded-lg font-mono text-sm font-semibold transition-colors ${
                      selectedBlock === b
                        ? 'bg-accent text-white dark:text-zinc-950'
                        : 'bg-background text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              {selectedBlock && (
                <p className="mt-5 text-text-secondary text-sm">
                  선택:{' '}
                  <span className="text-accent font-mono font-semibold">{selectedBlock}</span>
                  {' — '}
                  {allRows.filter((r) => r.block === selectedBlock).length}개 레코드
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              {(() => {
                const newRows = filteredRows.filter((r) => !r.row_no || !existingRowNos.has(r.row_no));
                const updateRows = filteredRows.filter((r) => r.row_no && existingRowNos.has(r.row_no));
                return (
                  <>
                    <div className="flex gap-2 mb-4">
                      <div className="flex-1 bg-success/10 border border-success/20 rounded-lg px-4 py-3 text-center">
                        <p className="text-2xl font-bold text-success tabular-nums">{newRows.length}</p>
                        <p className="text-xs text-text-secondary mt-0.5">신규 추가</p>
                      </div>
                      <div className="flex-1 bg-accent/10 border border-accent/20 rounded-lg px-4 py-3 text-center">
                        <p className="text-2xl font-bold text-accent tabular-nums">{updateRows.length}</p>
                        <p className="text-xs text-text-secondary mt-0.5">기본정보 업데이트</p>
                        <p className="text-[10px] text-text-secondary/70 mt-0.5">조사 데이터 보존</p>
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-background border-b border-border">
                      <th className="px-3 py-2 text-left text-text-secondary w-8">#</th>
                      {PREVIEW_COLS.map((c) => (
                        <th
                          key={c.key}
                          className="px-3 py-2 text-left text-text-secondary whitespace-nowrap"
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 10).map((row, i) => {
                      const isExisting = row.row_no != null && existingRowNos.has(row.row_no);
                      return (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-text-secondary tabular-nums">{i + 1}</td>
                          {PREVIEW_COLS.map((c) => (
                            <td key={c.key} className="px-3 py-2 text-text-primary whitespace-nowrap tabular-nums">
                              {(row[c.key] as string) ?? '-'}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {isExisting
                              ? <span className="text-[10px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">업데이트</span>
                              : <span className="text-[10px] font-semibold text-success bg-success/10 px-1.5 py-0.5 rounded-full">신규</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
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
