-- ============================================================
-- profiles 테이블: 사용자 role (실명 조회 권한)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);

-- 기존 로그인 사용자 전부 admin으로 초기화
-- (필요 시 이후 특정 계정만 골라 role을 'viewer'로 UPDATE)
insert into profiles (id, role)
select id, 'admin' from auth.users
on conflict (id) do nothing;
