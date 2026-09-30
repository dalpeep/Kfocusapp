-- Read-only Production verification. Run after the approved migration.
-- No email, entry, coupon code, or gift-card value is returned.
select
  to_regclass('public.event_draw_batches') is not null as draw_batches_exists,
  to_regclass('public.event_draw_winners') is not null as draw_winners_exists,
  to_regclass('public.event_winner_email_attempts') is not null as email_attempts_exists,
  to_regprocedure('public.event_draw_run(uuid,integer,uuid,text)') is not null as draw_rpc_exists,
  to_regprocedure('public.event_winner_cancel(uuid,uuid,text)') is not null as cancel_rpc_exists,
  to_regprocedure('public.event_winner_email_begin(uuid,uuid,text)') is not null as email_begin_rpc_exists,
  to_regprocedure('public.event_winner_email_finish(uuid,text,text,text)') is not null as email_finish_rpc_exists,
  to_regprocedure('public.event_winner_mark_gift_sent(uuid,uuid)') is not null as egift_mark_rpc_exists;

select
  not has_table_privilege('anon','public.event_draw_winners','SELECT') as anon_cannot_read_winners,
  not has_table_privilege('authenticated','public.event_draw_winners','SELECT') as user_cannot_read_winners,
  not has_table_privilege('anon','public.event_winner_email_attempts','SELECT') as anon_cannot_read_email_history,
  not has_function_privilege('anon','public.event_draw_run(uuid,integer,uuid,text)','EXECUTE') as anon_cannot_draw,
  has_function_privilege('service_role','public.event_draw_run(uuid,integer,uuid,text)','EXECUTE') as service_role_can_draw;

select
  (select count(*) from public.event_draw_batches) as draw_batch_count,
  (select count(*) from public.event_draw_winners) as winner_count,
  (select count(*) from public.event_winner_email_attempts) as winner_email_attempt_count;

-- Compare these counts with the read-only counts captured immediately before
-- migration. The migration never writes to either legacy table.
select
  (select count(*) from public.coupons) as legacy_coupon_count,
  (select count(*) from public.coupon_entries) as legacy_entry_count;
