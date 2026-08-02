-- ============================================================
-- valve_records 컬럼 추가: 엑셀 업로드(실제 현장 조사 양식) 지원
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

alter table valve_records
  add column if not exists valve_no text,              -- 밸브번호/소화전번호 (블록 내 식별자, 업로드 매칭 키)
  add column if not exists map_sheet_no text,           -- 도엽번호
  add column if not exists surveyor text,                -- 조사자
  add column if not exists survey_date_text text,        -- 조사일자/조사일시 (엑셀 원문 텍스트 그대로)
  add column if not exists rotation_direction text,       -- 회전방향
  add column if not exists rotation_count text,           -- 현회전수
  add column if not exists total_rotation_count text,     -- 총회전수
  add column if not exists manufacturer text,             -- 제작회사
  add column if not exists install_date text,             -- 설치일자
  add column if not exists valve_diameter text,           -- 밸브구경(제수/공기밸브 자체 구경)
  add column if not exists valve_issue text,              -- 문제사항(밸브현황 그룹)
  add column if not exists related_valve_diameter text,   -- 관련 제수밸브 구경 (공기밸브)
  add column if not exists related_valve_open_close text, -- 관련 제수밸브 개폐여부 (공기밸브)
  add column if not exists elevation text,                -- 표고
  add column if not exists pressure_location text,        -- 수압측정위치
  add column if not exists pressure_elevation text,       -- 수압측정표고
  add column if not exists pressure_value text,           -- 수압(kgf/㎠)
  add column if not exists dynamic_head text,             -- 동수두(m)
  add column if not exists head_diff text,                -- 차이(m)
  add column if not exists facility_name text,            -- 시설명 (소화전)
  add column if not exists water_tower_height text;       -- 급수탑높이 (소화전)

-- 실제 현장 데이터에 개폐여부="X"(확인불가) 등 비정형 값이 존재 → 자유 텍스트로 완화
alter table valve_records drop constraint if exists valve_records_open_close_check;
alter table valve_records drop constraint if exists valve_records_drive_method_check;

create index if not exists idx_vr_block_valve_no on valve_records (block, valve_no);
