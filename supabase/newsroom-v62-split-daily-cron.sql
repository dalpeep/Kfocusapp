-- DalTownMap V91: 125초 시간 제한을 피하는 분할형 오전 자동 수집/기사/브리핑
-- SQL Editor에서 SERVICE_ROLE_KEY를 실제 service_role 키로 교체한 뒤 실행하세요.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname like 'daltown-newsroom-%';

-- 달라스 서머타임 기준 대략 오전 8시부터 단계별 실행
select cron.schedule('daltown-newsroom-scheduled-topics','0 13 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"collect_scheduled_topics","region":"dallas"}'::jsonb);
$$);
select cron.schedule('daltown-newsroom-practical','15 13 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"collect","region":"dallas","lane":"practical"}'::jsonb);
$$);
select cron.schedule('daltown-newsroom-events','0 14 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"collect","region":"dallas","lane":"events"}'::jsonb);
$$);
select cron.schedule('daltown-newsroom-korean','0 15 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"collect","region":"dallas","lane":"korean"}'::jsonb);
$$);
select cron.schedule('daltown-newsroom-shopping','0 16 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"collect","region":"dallas","lane":"shopping"}'::jsonb);
$$);
select cron.schedule('daltown-newsroom-markets','15 16 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"collect_markets","region":"dallas"}'::jsonb);
$$);
select cron.schedule('daltown-newsroom-analyze-1','0 17 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"analyze","region":"dallas","limit":4}'::jsonb);
$$);
select cron.schedule('daltown-newsroom-analyze-2','20 17 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"analyze","region":"dallas","limit":4}'::jsonb);
$$);
select cron.schedule('daltown-newsroom-daily-publish','0 18 * * *', $$
  select net.http_post(url := 'https://ydrxuqmjzayejlnjzzew.supabase.co/functions/v1/newsroom',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_KEY'),
    body := '{"action":"daily_dallas_life","region":"dallas"}'::jsonb);
$$);
