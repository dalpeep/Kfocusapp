-- Review only. Apply separately after approval.
begin;

create function public.business_mail_issue_token_v1(
  p_business_id uuid,p_email text,p_hash text,p_purpose text
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_purpose is null or p_purpose not in ('verify','unsubscribe') then return false; end if;
  insert into business_mail.subscriptions(business_id,email)
  select id,lower(btrim(email)) from public.businesses
  where id=p_business_id and region='dallas' and is_active
    and lower(btrim(email))=p_email
  on conflict do nothing;
  insert into business_mail.tokens(token_hash,business_id,email,purpose,expires_at)
  select p_hash,s.business_id,s.email,p_purpose,
    now()+case when p_purpose='verify' then interval '24 hours' else interval '365 days' end
  from business_mail.subscriptions s join public.businesses b on b.id=s.business_id
  where s.business_id=p_business_id and s.email=p_email
    and b.region='dallas' and b.is_active and lower(btrim(b.email))=s.email
    and (p_purpose='unsubscribe' or (s.opted_out_at is null and not exists(
      select 1 from business_mail.suppressions x where x.email=s.email
    )));
  return found;
end;
$$;

create function public.business_mail_record_event_v1(p_event text,p_provider_id text,p_type text,p_hard_bounce boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare delivery business_mail.deliveries%rowtype;
begin
  if p_type is null or p_type not in ('email.delivered','email.bounced','email.complained','email.failed') then return false; end if;
  select * into delivery from business_mail.deliveries where provider_id=p_provider_id for update;
  if not found then return false; end if;
  insert into business_mail.delivery_events(provider_event_id,event_type) values(p_event,p_type)
  on conflict do nothing;
  if not found then return true; end if;

  if p_type='email.complained' or (p_type='email.bounced' and p_hard_bounce) then
    insert into business_mail.suppressions(email,reason)
    values(delivery.email,case when p_type='email.complained' then 'complaint' else 'hard_bounce' end)
    on conflict do nothing;
  end if;
  update business_mail.deliveries set
    state=case
      when state='complaint' or p_type='email.complained' then 'complaint'
      when state='bounced' or p_type='email.bounced' then 'bounced'
      when state='delivered' or p_type='email.delivered' then 'delivered'
      else 'failed' end,
    updated_at=now()
  where id=delivery.id;
  return true;
end;
$$;

create function public.business_mail_results_v1(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); access_role text; results jsonb;
begin
  select role into access_role from public.profiles where user_id=actor;
  if actor is null or coalesce(access_role,auth.jwt()->'app_metadata'->>'role') is distinct from 'super_admin' then
    raise exception 'Administrator authorization required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.email),'[]'::jsonb) into results
  from (select email,business_id,state,attempts,updated_at from business_mail.deliveries
        where campaign_id=p_campaign_id limit 1000) d;
  return results;
end;
$$;

revoke all on function public.business_mail_issue_token_v1(uuid,text,text,text),
  public.business_mail_record_event_v1(text,text,text,boolean),public.business_mail_results_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.business_mail_issue_token_v1(uuid,text,text,text),
  public.business_mail_record_event_v1(text,text,text,boolean) to service_role;
grant execute on function public.business_mail_results_v1(uuid) to authenticated;
commit;
