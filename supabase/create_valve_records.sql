-- ============================================================
-- valve_records 테이블: 밸브(제수/소화전/공기) 현장 조사 기록
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

create table if not exists valve_records (
  id bigint generated always as identity primary key,
  block text not null references block_regions(block),
  old_address text,        -- 구주소(지번)
  road_address text,       -- 도로명주소
  lat double precision,
  lng double precision,
  valve_type text not null check (valve_type in ('제수밸브', '소화전', '공기밸브')),
  survey_date date not null default current_date,

  -- 소화전 전용
  hydrant_diameter text,
  hydrant_valve_diameter text,
  hydrant_type text,
  note text,

  -- 제수/공기밸브 공용 (open_close는 소화전과도 공용)
  open_close text check (open_close in ('OPEN', 'CLOSE')),
  valve_form text,
  valve_material text,
  drive_method text check (drive_method in ('수동', '자동')),
  protection_pipe_spec text,
  cover_spec text,
  issue text,
  valve_room_spec text,
  valve_room_depth text,

  created_at timestamptz not null default now()
);

create index if not exists idx_vr_block on valve_records (block);
create index if not exists idx_vr_valve_type on valve_records (valve_type);
create index if not exists idx_vr_coords on valve_records (lat, lng) where lat is not null and lng is not null;
