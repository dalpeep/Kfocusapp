-- Dallas campaign foundation. No sender or scheduled task is enabled.
begin;
create schema business_mail;
revoke all on schema business_mail from public, anon, authenticated;
grant usage on schema business_mail to service_role;

create table business_mail.subscriptions(
  business_id uuid not null references public.businesses(id),
  email text not null check(email=lower(btrim(email)) and char_length(email)<=254),
  verified_at timestamptz,
  consented_at timestamptz,
  consent_version text,
  opted_out_at timestamptz,
  primary key(business_id,email),
  check(consented_at is null or (verified_at is not null and consent_version is not null))
);
create table business_mail.suppressions(
  email text not null,
  reason text not null check(reason in ('unsubscribe','hard_bounce','complaint','admin')),
  created_at timestamptz not null default now(),
  primary key(email,reason)
);
create table business_mail.tokens(
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  business_id uuid not null,
  email text not null,
  purpose text not null check(purpose in ('verify','unsubscribe')),
  expires_at timestamptz not null,
  used_at timestamptz,
  foreign key(business_id,email) references business_mail.subscriptions(business_id,email)
);
create table business_mail.campaigns(
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  subject text not null check(char_length(subject) between 1 and 160),
  body text not null check(char_length(body) between 1 and 10000),
  target_ids uuid[] not null check(cardinality(target_ids) between 1 and 1000),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approval_reference text,
  check((approved_at is null)=(approval_reference is null))
);
create table business_mail.deliveries(
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references business_mail.campaigns(id),
  business_id uuid not null,
  email text not null,
  state text not null default 'pending' check(state in ('pending','held','accepted','delivered','bounced','complaint','failed','uncertain','suppressed')),
  provider_id text unique,
  attempts integer not null default 0 check(attempts>=0),
  next_attempt_at timestamptz not null default now(),
  error_code text,
  updated_at timestamptz not null default now(),
  unique(campaign_id,email),
  foreign key(business_id,email) references business_mail.subscriptions(business_id,email)
);
create table business_mail.delivery_events(
  provider_event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table business_mail.subscriptions enable row level security;
alter table business_mail.suppressions enable row level security;
alter table business_mail.tokens enable row level security;
alter table business_mail.campaigns enable row level security;
alter table business_mail.deliveries enable row level security;
alter table business_mail.delivery_events enable row level security;
revoke all on all tables in schema business_mail from public,anon,authenticated;
grant select,insert,update on all tables in schema business_mail to service_role;

create function public.business_mail_admin_v1(p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); access_role text; result jsonb; targets uuid[];
begin
  select role into access_role from public.profiles where user_id=actor;
  if actor is null or coalesce(access_role,auth.jwt()->'app_metadata'->>'role') is distinct from 'super_admin' then
    raise exception 'Administrator authorization required' using errcode='42501';
  end if;
  if p_action='contacts' then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.id),'[]'::jsonb) into result from (
      select b.id,coalesce(b.name_ko,b.name_en,b.name,'') as name,b.area,b.category,
        lower(btrim(b.email)) as email,s.verified_at,s.consented_at,s.opted_out_at,
        exists(select 1 from business_mail.suppressions x where x.email=lower(btrim(b.email))) as suppressed
      from public.businesses b left join business_mail.subscriptions s on s.business_id=b.id and s.email=lower(btrim(b.email))
      where b.region='dallas' and b.is_active=true and nullif(btrim(b.email),'') is not null
    ) c;
    return result;
  elsif p_action='history' then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]'::jsonb) into result from (
      select id,subject,created_at,cardinality(target_ids) as target_count,approved_at,
        (select count(*) from business_mail.deliveries d where d.campaign_id=campaigns.id) as delivery_count
      from business_mail.campaigns order by created_at desc,id desc limit 100
    ) c;
    return result;
  elsif p_action='draft' then
    select array_agg(distinct value::uuid) into targets from jsonb_array_elements_text(p_input->'ids');
    if targets is null or cardinality(targets)>1000 or exists (
      select 1 from unnest(targets) target(id) where not exists (
        select 1 from public.businesses b where b.id=target.id and b.region='dallas' and b.is_active=true
          and nullif(btrim(b.email),'') is not null
      )
    ) then raise exception 'Invalid campaign recipients' using errcode='22023'; end if;
    insert into business_mail.campaigns(author_id,subject,body,target_ids)
    values(actor,btrim(p_input->>'subject'),btrim(p_input->>'body'),targets)
    returning jsonb_build_object('id',id) into result;
    return result;
  end if;
  raise exception 'Unknown campaign action' using errcode='22023';
end;
$$;
revoke all on function public.business_mail_admin_v1(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.business_mail_admin_v1(text,jsonb) to authenticated;

create function public.business_mail_consume_token_v1(p_hash text,p_purpose text,p_consent_version text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare proof business_mail.tokens%rowtype;
begin
  if p_purpose not in ('verify','unsubscribe') then return false; end if;
  select * into proof from business_mail.tokens where token_hash=p_hash and purpose=p_purpose
    and used_at is null and expires_at>now() for update;
  if not found then return false; end if;
  if p_purpose='verify' and not exists (
    select 1 from public.businesses b where b.id=proof.business_id and b.region='dallas'
      and b.is_active=true and lower(btrim(b.email))=proof.email
  ) then return false; end if;

  if p_purpose='unsubscribe' then
    insert into business_mail.suppressions(email,reason) values(proof.email,'unsubscribe') on conflict do nothing;
    update business_mail.subscriptions set opted_out_at=coalesce(opted_out_at,now()) where email=proof.email;
  else
    update business_mail.subscriptions set
      verified_at=coalesce(verified_at,now()),
      consented_at=case when p_consent_version is not null and opted_out_at is null then now() else consented_at end,
      consent_version=case when p_consent_version is not null and opted_out_at is null then p_consent_version else consent_version end
    where business_id=proof.business_id and email=proof.email;
  end if;
  update business_mail.tokens set used_at=now() where token_hash=p_hash;
  return true;
end;
$$;
revoke all on function public.business_mail_consume_token_v1(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.business_mail_consume_token_v1(text,text,text) to service_role;

create function public.business_mail_prepare_queue_v1(p_campaign_id uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
  perform 1 from business_mail.campaigns
  where id=p_campaign_id and approved_at is not null and nullif(btrim(approval_reference),'') is not null
  for update;
  if not found then raise exception 'Campaign authorization required' using errcode='42501'; end if;

  insert into business_mail.deliveries(campaign_id,business_id,email)
  select distinct on (s.email) p_campaign_id,s.business_id,s.email
  from business_mail.campaigns c
  join business_mail.subscriptions s on s.business_id=any(c.target_ids)
  join public.businesses b on b.id=s.business_id and lower(btrim(b.email))=s.email
  where c.id=p_campaign_id and b.region='dallas' and b.is_active=true
    and s.verified_at is not null and s.consented_at is not null and s.opted_out_at is null
    and not exists(select 1 from business_mail.suppressions x where x.email=s.email)
  order by s.email,s.business_id
  on conflict(campaign_id,email) do nothing;
  get diagnostics inserted=row_count;
  return inserted;
end;
$$;
revoke all on function public.business_mail_prepare_queue_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.business_mail_prepare_queue_v1(uuid) to service_role;

commit;
