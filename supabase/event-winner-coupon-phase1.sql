-- Prepare-only: independent draw/email/eGift tracking; never updates legacy rows.
begin;
create table if not exists public.event_draw_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.coupons(id),
  kind text not null check (kind in ('initial','redraw')),
  requested_count integer not null check (requested_count between 1 and 500),
  eligible_count integer not null check (eligible_count >= requested_count),
  drawn_at timestamptz not null default now(),
  drawn_by uuid not null
);
create unique index if not exists event_draw_one_initial_per_event
  on public.event_draw_batches(event_id) where kind='initial';
create table if not exists public.event_draw_winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.coupons(id),
  entry_id uuid not null references public.coupon_entries(id),
  draw_batch_id uuid not null references public.event_draw_batches(id),
  status text not null default 'winner' check (status in ('winner','cancelled')),
  winner_email_status text not null default 'not_sent'
    check (winner_email_status in ('not_sent','sending','sent','delivery_failed','unknown')),
  winner_email_sent_at timestamptz,
  gift_card_status text not null default 'not_sent'
    check (gift_card_status in ('not_sent','sent')),
  gift_card_sent_at timestamptz,
  drawn_at timestamptz not null default now(),
  drawn_by uuid not null,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  gift_card_marked_by uuid,
  unique(event_id,entry_id)
);
create index if not exists event_draw_winners_event_idx
  on public.event_draw_winners(event_id,status);
create table if not exists public.event_winner_email_attempts (
  id uuid primary key default gen_random_uuid(),
  winner_id uuid not null references public.event_draw_winners(id),
  kind text not null check (kind in ('initial','resend')),
  status text not null default 'sending'
    check (status in ('sending','accepted','failed','unknown')),
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  provider_message_id text,
  failure_code text
);
create unique index if not exists event_winner_one_active_email
  on public.event_winner_email_attempts(winner_id) where status='sending';
create unique index if not exists event_winner_one_initial_accepted
  on public.event_winner_email_attempts(winner_id)
  where kind='initial' and status='accepted';
alter table public.event_draw_batches enable row level security;
alter table public.event_draw_winners enable row level security;
alter table public.event_winner_email_attempts enable row level security;
revoke all on public.event_draw_batches,public.event_draw_winners,
  public.event_winner_email_attempts from public,anon,authenticated;
grant select,insert,update on public.event_draw_batches,public.event_draw_winners,
  public.event_winner_email_attempts to service_role;

create or replace function public.event_draw_run(
  p_event_id uuid,p_count integer,p_admin_id uuid,p_kind text default 'initial'
) returns table(batch_id uuid,selected_count integer,eligible_count integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.coupons%rowtype; v_eligible integer; v_batch uuid;
  v_cancelled integer; v_redrawn integer; v_selected integer;
begin
  if p_admin_id is null or p_event_id is null or p_count is null
    or p_count not between 1 and 500 or p_kind not in ('initial','redraw') then
    raise exception 'Invalid draw request' using errcode='22023';
  end if;
  select * into v_event from public.coupons
    where id=p_event_id and delivery_mode='raffle' for update;
  if not found then raise exception 'Raffle event not found' using errcode='22023'; end if;
  if coalesce(v_event.raffle_draw_mode,'manual')<>'manual' then
    raise exception 'Manual draw requires manual campaign mode' using errcode='22023';
  end if;
  if p_kind='initial' then
    if exists(select 1 from public.event_draw_batches where event_id=p_event_id) then
      raise exception 'Initial draw already exists' using errcode='23505';
    end if;
  else
    if p_count<>1 then raise exception 'Redraw must select one entry' using errcode='22023'; end if;
    select count(*) into v_cancelled from public.event_draw_winners
      where event_id=p_event_id and status='cancelled';
    select count(*) into v_redrawn from public.event_draw_batches
      where event_id=p_event_id and kind='redraw';
    if v_cancelled<=v_redrawn then
      raise exception 'No cancelled seat available for redraw' using errcode='22023';
    end if;
  end if;
  select count(*) into v_eligible from public.coupon_entries e
    where e.coupon_id=p_event_id::text and e.status='entered'
      and e.entry_code is not null
      and not exists(select 1 from public.event_draw_winners w
        where w.event_id=p_event_id and w.entry_id=e.id);
  if v_eligible<p_count then raise exception 'Not enough eligible entries' using errcode='22023'; end if;
  insert into public.event_draw_batches(event_id,kind,requested_count,eligible_count,drawn_by)
    values(p_event_id,p_kind,p_count,v_eligible,p_admin_id) returning id into v_batch;
  -- gen_random_uuid() uses PostgreSQL's cryptographic RNG.
  insert into public.event_draw_winners(event_id,entry_id,draw_batch_id,drawn_by)
    select p_event_id,e.id,v_batch,p_admin_id from public.coupon_entries e
    where e.coupon_id=p_event_id::text and e.status='entered'
      and e.entry_code is not null
      and not exists(select 1 from public.event_draw_winners w
        where w.event_id=p_event_id and w.entry_id=e.id)
    order by gen_random_uuid() limit p_count;
  get diagnostics v_selected=row_count;
  if v_selected<>p_count then raise exception 'Draw selection changed' using errcode='40001'; end if;
  return query select v_batch,v_selected,v_eligible;
end $$;

create or replace function public.event_winner_cancel(
  p_winner_id uuid,p_admin_id uuid,p_reason text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_winner public.event_draw_winners%rowtype;
begin
  select * into v_winner from public.event_draw_winners where id=p_winner_id for update;
  if v_winner.id is null or v_winner.status<>'winner' or p_admin_id is null
    or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Cancellation requires an active winner and reason' using errcode='22023';
  end if;
  if v_winner.winner_email_status in ('sending','sent','unknown')
    or v_winner.gift_card_status='sent' then
    raise exception 'Sent or uncertain delivery requires separate admin resolution' using errcode='22023';
  end if;
  update public.event_draw_winners set status='cancelled',cancelled_at=now(),
    cancelled_by=p_admin_id,cancel_reason=left(trim(p_reason),500) where id=p_winner_id;
end $$;

create or replace function public.event_winner_email_begin(
  p_winner_id uuid,p_admin_id uuid,p_kind text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_winner public.event_draw_winners%rowtype; v_attempt uuid;
begin
  select * into v_winner from public.event_draw_winners where id=p_winner_id for update;
  if v_winner.id is null or v_winner.status<>'winner' or p_admin_id is null
    or p_kind not in ('initial','resend') then
    raise exception 'Invalid winner email request' using errcode='22023';
  end if;
  if v_winner.winner_email_status in ('sending','unknown')
    or (p_kind='initial' and v_winner.winner_email_status='sent')
    or (p_kind='resend' and v_winner.winner_email_status<>'sent') then
    raise exception 'Email state does not allow this attempt' using errcode='22023';
  end if;
  insert into public.event_winner_email_attempts(winner_id,kind,requested_by)
    values(p_winner_id,p_kind,p_admin_id) returning id into v_attempt;
  update public.event_draw_winners set winner_email_status='sending' where id=p_winner_id;
  return v_attempt;
end $$;

create or replace function public.event_winner_email_finish(
  p_attempt_id uuid,p_status text,p_provider_id text,p_failure_code text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_attempt public.event_winner_email_attempts%rowtype;
begin
  select * into v_attempt from public.event_winner_email_attempts where id=p_attempt_id for update;
  if v_attempt.id is null or v_attempt.status<>'sending'
    or p_status not in ('accepted','failed','unknown') then
    raise exception 'Invalid email completion' using errcode='22023';
  end if;
  update public.event_winner_email_attempts set status=p_status,completed_at=now(),
    provider_message_id=case when p_status='accepted' then left(p_provider_id,200) else null end,
    failure_code=case when p_status='failed' then left(p_failure_code,100) else null end
    where id=p_attempt_id;
  update public.event_draw_winners set
    winner_email_status=case p_status when 'accepted' then 'sent'
      when 'failed' then case when v_attempt.kind='resend' then 'sent'
        else 'delivery_failed' end else 'unknown' end,
    winner_email_sent_at=case when p_status='accepted' then now()
      else winner_email_sent_at end
    where id=v_attempt.winner_id;
end $$;

create or replace function public.event_winner_mark_gift_sent(
  p_winner_id uuid,p_admin_id uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_winner public.event_draw_winners%rowtype;
begin
  select * into v_winner from public.event_draw_winners where id=p_winner_id for update;
  if v_winner.id is null or v_winner.status<>'winner' or p_admin_id is null
    or v_winner.winner_email_status<>'sent' or v_winner.gift_card_status='sent' then
    raise exception 'Gift card completion cannot be recorded' using errcode='22023';
  end if;
  update public.event_draw_winners set gift_card_status='sent',
    gift_card_sent_at=now(),gift_card_marked_by=p_admin_id where id=p_winner_id;
end $$;
revoke all on function public.event_draw_run(uuid,integer,uuid,text),
  public.event_winner_cancel(uuid,uuid,text),
  public.event_winner_email_begin(uuid,uuid,text),
  public.event_winner_email_finish(uuid,text,text,text),
  public.event_winner_mark_gift_sent(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.event_draw_run(uuid,integer,uuid,text),
  public.event_winner_cancel(uuid,uuid,text),
  public.event_winner_email_begin(uuid,uuid,text),
  public.event_winner_email_finish(uuid,text,text,text),
  public.event_winner_mark_gift_sent(uuid,uuid)
  to service_role;
commit;
