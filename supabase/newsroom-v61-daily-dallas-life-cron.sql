-- DalTownMap V61: 오전 자료 수집 + 하루 1건 달라스 라이프 게시
-- Supabase SQL Editor에서 실행 전 아래 두 값을 실제 값으로 교체하세요.
-- PROJECT_REF: ydrxuqmjzayejlnjzzew
-- SERVICE_ROLE_KEY: Supabase Settings > API의 service_role key

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 기존 동일 작업이 있으면 제거
select cron.unschedule(jobid) from cron.job where jobname in (
  'daltown-newsroom-morning-collect-1',
  'daltown-newsroom-morning-collect-2',
  'daltown-newsroom-morning-collect-3',
  'daltown-newsroom-daily-publish'
);

-- UTC 기준. 달라스 서머타임 동안 13/15/17/18 UTC는 대략 오전 8/10/12/1시입니다.
-- 오전 동안 3회 자료를 모으고 마지막 작업에서 하루 1건만 게시합니다.
select cron.schedule('daltown-newsroom-morning-collect-1','0 13 * * *', $$
  select net.http_post(
    url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"auto_run","region":"dallas"}'::jsonb
  );
$$);
select cron.schedule('daltown-newsroom-morning-collect-2','0 15 * * *', $$
  select net.http_post(
    url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"auto_run","region":"dallas"}'::jsonb
  );
$$);
select cron.schedule('daltown-newsroom-morning-collect-3','0 17 * * *', $$
  select net.http_post(
    url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"auto_run","region":"dallas"}'::jsonb
  );
$$);
select cron.schedule('daltown-newsroom-daily-publish','0 18 * * *', $$
  select net.http_post(
    url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"daily_dallas_life","region":"dallas"}'::jsonb
  );
$$);
