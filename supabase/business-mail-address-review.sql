begin;
create table business_mail.address_reviews (
  business_id uuid not null references public.businesses(id),
  email text not null,
  reviewed_at timestamptz not null default now(),
  basis text not null check(basis='operator_attested_prior_mail'),
  primary key(business_id,email),
  check(email=lower(btrim(email)) and length(email) between 1 and 254)
);
alter table business_mail.address_reviews enable row level security;
revoke all on business_mail.address_reviews from public,anon,authenticated,service_role;

create function public.business_mail_address_reviews_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); access_role text; result jsonb;
begin
  select role into access_role from public.profiles where user_id=actor;
  if actor is null or coalesce(access_role,auth.jwt()->'app_metadata'->>'role') is distinct from 'super_admin' then
    raise exception 'Administrator authorization required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('business_id',r.business_id,'email',r.email,
    'invalid',r.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),'[]'::jsonb)
  into result from business_mail.address_reviews r
  join public.businesses b on b.id=r.business_id and lower(btrim(b.email))=r.email and b.region='dallas';
  return result;
end;
$$;
revoke all on function public.business_mail_address_reviews_v1() from public,anon,authenticated,service_role;
grant execute on function public.business_mail_address_reviews_v1() to authenticated;
commit;
