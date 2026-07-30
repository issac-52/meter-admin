import { z } from 'zod';

function requiredField(label: string) {
  return z.preprocess(
    (v) => (v == null ? '' : v),
    z.string().trim().min(1, `${label} 없음`),
  );
}

// 기존 형식(금산군수용가조사기록지) — 헤더 키 기반 매핑 결과 검증
export const oldFormatRowSchema = z
  .object({
    row_no: requiredField('도면번호'),
    name: requiredField('성명'),
    address: requiredField('도로명주소'),
    block: requiredField('블록구분'),
  })
  .loose();

// 대불 형식("수도미터목록" 시트) — 컬럼 인덱스 기반 매핑 결과 검증
export const daebulFormatRowSchema = z
  .object({
    row_no: requiredField('번호'),
    name: requiredField('성명'),
    address: requiredField('주소'),
    block: requiredField('소블록'),
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
