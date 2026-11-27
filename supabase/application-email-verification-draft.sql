-- Review only. This migration does not activate an intake gate.
begin;

create table business_mail.application_email_proofs (
  id uuid primary key default gen_random_uuid(),
  intake text not null check (intake in ('public_business','public_ad','owner_new')),
  email text not null check (email=lower(btrim(email)) and length(email)<=254),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 minutes',
  verified_at timestamptz,
  consented_at timestamptz,
  consent_version text,
  request_id text,
  check (consented_at is null or verified_at is not null),
  check ((consented_at is null) = (consent_version is null)),
  check (request_id is null or verified_at is not null),
  unique (intake,request_id)
);
alter table business_mail.application_email_proofs enable row level security;
revoke all on business_mail.application_email_proofs from public,anon,authenticated;
grant select,insert,update on business_mail.application_email_proofs to service_role;

create function public.application_email_verify_v1(p_hash text,p_consent boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update business_mail.application_email_proofs p
  set verified_at=now(),
    consented_at=case when p_consent is true and not exists
      (select 1 from business_mail.suppressions s where s.email=p.email) then now() end,
    consent_version=case when p_consent is true and not exists
      (select 1 from business_mail.suppressions s where s.email=p.email) then 'application-email-v1' end
  where p.token_hash=p_hash and p.expires_at>now() and p.verified_at is null;
  return found;
end;
$$;

-- Call in the same transaction as a verified request INSERT. A failure must
-- abort the INSERT so the existing AFTER INSERT alert is never queued early.
create function public.application_email_bind_v1(p_id uuid,p_intake text,p_email text,p_request_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if nullif(btrim(p_request_id),'') is null then return false; end if;
  update business_mail.application_email_proofs
  set request_id=p_request_id
  where id=p_id and intake=p_intake and email=lower(btrim(p_email))
    and expires_at>now() and verified_at is not null and request_id is null;
  return found;
end;
$$;

revoke all on function public.application_email_verify_v1(text,boolean),
  public.application_email_bind_v1(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.application_email_verify_v1(text,boolean),
  public.application_email_bind_v1(uuid,text,text,text) to service_role;

commit;
