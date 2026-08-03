-- ============================================================
-- valve_records 컬럼 추가: 현장 사진 (밸브당 2장, 블록별 폴더에 저장)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

alter table valve_records
  add column if not exists image1_id text,
  add column if not exists image2_id text;
