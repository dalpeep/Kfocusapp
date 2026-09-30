begin;
do $$ begin
  if has_table_privilege('anon','public.event_draw_winners','SELECT')
    or has_table_privilege('authenticated','public.event_winner_email_attempts','SELECT')
    or has_function_privilege('anon','public.event_draw_run(uuid,integer,uuid,text)','EXECUTE') then
    raise exception 'public draw data privilege leaked';
  end if;
end $$;
do $$
declare
  v_event uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_batch uuid;
  v_winner uuid;
  v_attempt uuid;
  v_count integer;
begin
  insert into public.coupons(id,delivery_mode) values(v_event,'raffle');
  insert into public.coupon_entries(coupon_id,email,email_normalized,entry_code)
    select v_event::text,'test'||g||'@example.invalid','test'||g||'@example.invalid','ENTRY-TEST-'||g
    from generate_series(1,11) g;
  insert into public.coupon_entries(coupon_id,email,email_normalized,entry_code,status)
    values(v_event::text,'excluded@example.invalid','excluded@example.invalid','ENTRY-EXCLUDED','cancelled');
  select batch_id into v_batch from public.event_draw_run(v_event,1,v_admin,'initial');
  select count(*) into v_count from public.event_draw_winners where draw_batch_id=v_batch;
  if v_count<>1 then raise exception 'one-winner draw failed'; end if;
  begin
    perform public.event_draw_run(v_event,1,v_admin,'initial');
    raise exception 'duplicate initial draw was allowed';
  exception when unique_violation then null;
  end;
  select id into v_winner from public.event_draw_winners where draw_batch_id=v_batch;
  perform public.event_winner_cancel(v_winner,v_admin,'isolated test cancellation');
  if (select status from public.event_draw_winners where id=v_winner)<>'cancelled' then
    raise exception 'winner cancellation failed';
  end if;
  select batch_id into v_batch from public.event_draw_run(v_event,1,v_admin,'redraw');
  if (select count(*) from public.event_draw_winners where draw_batch_id=v_batch)<>1 then
    raise exception 'redraw failed';
  end if;
  if (select count(distinct entry_id) from public.event_draw_winners where event_id=v_event)<>2 then
    raise exception 'redraw repeated an old winner';
  end if;
  begin
    perform public.event_draw_run(v_event,1,v_admin,'redraw');
    raise exception 'redraw without cancelled seat was allowed';
  exception when invalid_parameter_value then null;
  end;
end $$;
do $$
declare
  v_event uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_batch uuid;
  v_winner uuid;
  v_attempt uuid;
begin
  insert into public.coupons(id,delivery_mode) values(v_event,'raffle');
  insert into public.coupon_entries(coupon_id,email,email_normalized,entry_code)
    select v_event::text,'multi'||g||'@example.invalid','multi'||g||'@example.invalid','ENTRY-MULTI-'||g
    from generate_series(1,11) g;
  select batch_id into v_batch from public.event_draw_run(v_event,5,v_admin,'initial');
  if (select count(*) from public.event_draw_winners where draw_batch_id=v_batch)<>5 then
    raise exception 'multi-winner draw failed';
  end if;
  if (select count(distinct entry_id) from public.event_draw_winners where draw_batch_id=v_batch)<>5 then
    raise exception 'multi-winner draw duplicated an entry';
  end if;
  select id into v_winner from public.event_draw_winners where draw_batch_id=v_batch limit 1;
  v_attempt:=public.event_winner_email_begin(v_winner,v_admin,'initial');
  begin
    perform public.event_winner_email_begin(v_winner,v_admin,'initial');
    raise exception 'concurrent delivery attempt was allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.event_winner_cancel(v_winner,v_admin,'must not cancel sending');
    raise exception 'sending winner was cancelled';
  exception when invalid_parameter_value then null;
  end;
  perform public.event_winner_email_finish(v_attempt,'failed',null,'test_failure');
  if (select winner_email_status from public.event_draw_winners where id=v_winner)<>'delivery_failed' then
    raise exception 'failed email state not recorded';
  end if;
  v_attempt:=public.event_winner_email_begin(v_winner,v_admin,'initial');
  perform public.event_winner_email_finish(v_attempt,'accepted','test-provider-id',null);
  if (select winner_email_status from public.event_draw_winners where id=v_winner)<>'sent' then
    raise exception 'sent email state not recorded';
  end if;
  v_attempt:=public.event_winner_email_begin(v_winner,v_admin,'resend');
  perform public.event_winner_email_finish(v_attempt,'failed',null,'test_resend_failure');
  if (select winner_email_status from public.event_draw_winners where id=v_winner)<>'sent' then
    raise exception 'failed resend erased prior successful delivery';
  end if;
  v_attempt:=public.event_winner_email_begin(v_winner,v_admin,'resend');
  perform public.event_winner_email_finish(v_attempt,'accepted','test-resend-id',null);
  if (select count(*) from public.event_winner_email_attempts where winner_id=v_winner)<>4 then
    raise exception 'email resend history missing';
  end if;
  perform public.event_winner_mark_gift_sent(v_winner,v_admin);
  if (select gift_card_status from public.event_draw_winners where id=v_winner)<>'sent' then
    raise exception 'manual eGift completion missing';
  end if;
  begin
    perform public.event_winner_mark_gift_sent(v_winner,v_admin);
    raise exception 'duplicate eGift completion allowed';
  exception when invalid_parameter_value then null;
  end;
end $$;
rollback;
