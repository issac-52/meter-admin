import { z } from 'zod';

function requiredField(label: string) {
  return z.preprocess(
    (v) => (v == null ? '' : v),
    z.string().trim().min(1, `${label} 없음`),
  );
}

// 제수(이토)밸브류 조서 / 공기변 조서 — 행마다 블록명 컬럼이 있음
export const valveRowSchema = z
  .object({
    valve_no: requiredField('밸브번호'),
    block: requiredField('블록명'),
  })
  .loose();

// 조서(소화전) — 블록 컬럼이 없어 업로드 시 사용자가 선택한 블록을 일괄 적용
export const hydrantRowSchema = z
  .object({
    valve_no: requiredField('소화전번호'),
  })
  .loose();

// 필수 항목이 빠진 행은 제외하고, 제외된 행에 대한 사유를 반환 (전체 업로드를 막지 않음)
export function validateRows<T>(rows: T[], schema: z.ZodType): { validRows: T[]; issues: string[] } {
  const validRows: T[] = [];
  const issues: string[] = [];
  rows.forEach((row, i) => {
    const result = schema.safeParse(row);
    if (result.success) {
      validRows.push(row);
    } else {
      const reasons = [...new Set(result.error.issues.map((issue) => issue.message))].join(', ');
      issues.push(`${i + 1}번째 행: ${reasons}`);
    }
  });
  return { validRows, issues };
}
