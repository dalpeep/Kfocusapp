-- DalTownMap v8.6: 한 업소에 여러 슬라이드 허용 + 업소 미연결 슬라이드 허용
-- Supabase SQL Editor에서 한 번 실행하세요.

begin;

-- 업소 연결을 선택 사항으로 변경
alter table public.slides
  alter column business_id drop not null;

-- business_id 하나당 한 행만 허용하던 UNIQUE 제약조건 제거
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'slides'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%business_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.slides DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- 제약조건이 아닌 UNIQUE INDEX로 만들어져 있던 경우도 제거
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'slides'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%business_id%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;
END $$;

-- 조회 성능용 일반 인덱스
create index if not exists slides_business_id_idx
  on public.slides (business_id);

create index if not exists slides_region_sort_idx
  on public.slides (region, home_fixed_sort, created_at desc);

commit;
