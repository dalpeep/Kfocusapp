-- 달타운 알림에 남은 테스트용 '평일 운영' 루틴 제거
-- 실행 전 현재 설정 백업 확인용:
select region, home_config->'event_routines' as event_routines
from newsroom_settings where region='dallas';

update newsroom_settings
set home_config = jsonb_set(
  coalesce(home_config,'{}'::jsonb),
  '{event_routines}',
  coalesce((
    select jsonb_agg(r)
    from jsonb_array_elements(coalesce(home_config->'event_routines','[]'::jsonb)) r
    where trim(coalesce(r->>'name','')) <> '평일 운영'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(r#>'{actions,alert,custom_items}','[]'::jsonb)) c
        where trim(coalesce(c->>'text', trim(both '"' from c::text))) = '평일 운영'
      )
  ), '[]'::jsonb),
  true
), updated_at=now()
where region='dallas';
