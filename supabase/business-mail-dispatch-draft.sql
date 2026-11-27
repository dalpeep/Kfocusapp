-- Review only. Existing tables and policies are unchanged.
begin;

create function public.business_mail_confirm_campaign_v1(p_id uuid,p_actor uuid,p_expected uuid[],p_confirmation uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare campaign business_mail.campaigns%rowtype; actual uuid[]; queued integer;
begin
  if p_actor is null or p_confirmation is null or cardinality(p_expected) not between 1 and 1000 then
    raise exception 'Invalid campaign confirmation' using errcode='22023';
  end if;
  select * into campaign from business_mail.campaigns where id=p_id for update;
  if not found or campaign.author_id is distinct from p_actor or campaign.approved_at is not null then
    raise exception 'Campaign unavailable for confirmation' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles where user_id=p_actor and role='super_admin') then
    raise exception 'Administrator authorization required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    campaign.subject||chr(31)||campaign.body||chr(31)||
    (select string_agg(x::text,',' order by x) from unnest(campaign.target_ids) x),159));
  if exists(select 1 from business_mail.campaigns prior
    where prior.approved_at>now()-interval '24 hours'
      and prior.subject=campaign.subject and prior.body=campaign.body
      and prior.target_ids @> campaign.target_ids and campaign.target_ids @> prior.target_ids) then
    raise exception 'Campaign already confirmed in the last 24 hours' using errcode='23505';
  end if;
  if (select array_agg(x order by x) from unnest(p_expected) x) is distinct from
     (select array_agg(x order by x) from unnest(campaign.target_ids) x) then
    raise exception 'Campaign recipients changed' using errcode='22023';
  end if;
  update business_mail.campaigns set approved_at=now(),approval_reference=p_confirmation::text where id=p_id;
  queued:=public.business_mail_prepare_queue_v1(p_id);
  select array_agg(business_id order by business_id) into actual
  from business_mail.deliveries where campaign_id=p_id;
  if actual is distinct from (select array_agg(x order by x) from unnest(p_expected) x) then
    raise exception 'Campaign eligibility changed or duplicate addresses exist' using errcode='22023';
  end if;
  return queued;
end;
$$;

create function public.business_mail_claim_delivery_v1(p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare recipient business_mail.deliveries%rowtype; message jsonb;
begin
  select * into recipient from business_mail.deliveries
  where campaign_id=p_id and state='pending' and next_attempt_at<=now()
  order by id limit 1 for update skip locked;
  if not found then return null; end if;
  select jsonb_build_object('id',recipient.id,'email',recipient.email,'business_id',recipient.business_id,
    'name',coalesce(nullif(b.name_ko,''),nullif(b.name_en,''),b.name,'업소'),'subject',c.subject,'body',c.body)
  into message
  from business_mail.subscriptions s
  join public.businesses b on b.id=s.business_id and lower(btrim(b.email))=s.email
  join business_mail.campaigns c on c.id=recipient.campaign_id
  where s.business_id=recipient.business_id and s.email=recipient.email and b.region='dallas' and b.is_active
    and s.verified_at is not null and s.consented_at is not null and s.opted_out_at is null
    and c.approved_at is not null and nullif(btrim(c.approval_reference),'') is not null
    and not exists(select 1 from business_mail.suppressions x where x.email=s.email);
  update business_mail.deliveries set state=case when message is null then 'suppressed' else 'held' end,
    attempts=attempts+case when message is null then 0 else 1 end,updated_at=now() where id=recipient.id;
  if message is null then return jsonb_build_object('suppressed',true); end if;
  return message;
end;
$$;

create function public.business_mail_finish_delivery_v1(p_id uuid,p_state text,p_provider_id text,p_error_code text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_state is null or p_state not in ('accepted','failed','uncertain') or
    (p_state='accepted') is distinct from (nullif(btrim(p_provider_id),'') is not null) then
    raise exception 'Invalid delivery outcome' using errcode='22023';
  end if;
  update business_mail.deliveries set state=p_state,provider_id=p_provider_id,
    error_code=left(p_error_code,80),updated_at=now()
  where id=p_id and state='held';
  return found;
end;
$$;

revoke all on function public.business_mail_confirm_campaign_v1(uuid,uuid,uuid[],uuid),
  public.business_mail_claim_delivery_v1(uuid), public.business_mail_finish_delivery_v1(uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.business_mail_confirm_campaign_v1(uuid,uuid,uuid[],uuid),
  public.business_mail_claim_delivery_v1(uuid), public.business_mail_finish_delivery_v1(uuid,text,text,text)
  to service_role;
commit;
