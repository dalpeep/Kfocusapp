alter table public.dalpick add column if not exists target_categories text[] not null default '{}';
alter table public.dalpick add column if not exists show_in_dalpick boolean not null default false;

-- 기존 추천 테마가 지역 정보로 잘못 저장된 경우, 해당 행을 직접 선택해 category를 themed로 변경하세요.
