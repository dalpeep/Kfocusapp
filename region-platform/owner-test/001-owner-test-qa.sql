-- QA ONLY. Apply exclusively to owner-test (aaikttogoejfvxbosktg).
-- This transaction creates feature-specific objects only.
begin;
create schema online_directory_qa;
create role online_directory_qa_api nologin noinherit nobypassrls;
grant usage on schema online_directory_qa, public to online_directory_qa_api;

create table online_directory_qa.gateway (
  singleton boolean primary key check (singleton),
  digest bytea not null check (octet_length(digest) = 32)
);
create table online_directory_qa.identities (
  name text primary key,
  digest bytea not null check (octet_length(digest) = 32),
  role text not null check (role in ('superadmin','region-admin','owner')),
  region text,
  check ((role = 'superadmin') = (region is null))
);
create table online_directory_qa.regions (
  slug text primary key check (slug ~ '^[a-z][a-z0-9-]{1,62}$' and slug <> 'dallas'),
  version uuid not null default gen_random_uuid(),
  document jsonb not null check (document->>'slug' is not null and document->>'slug'=slug)
);
create table online_directory_qa.images (
  region text not null references online_directory_qa.regions(slug),
  id uuid not null,
  url text not null,
  content_type text not null check (content_type in ('image/png','image/jpeg')),
  bytes bytea not null check (octet_length(bytes) between 12 and 358400),
  uploaded_by text not null,
  primary key (region,id)
);
create table online_directory_qa.audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  region text not null,
  actor text not null,
  action text not null
);

alter table online_directory_qa.regions enable row level security;
alter table online_directory_qa.images enable row level security;
alter table online_directory_qa.audit enable row level security;
alter table online_directory_qa.regions force row level security;
alter table online_directory_qa.images force row level security;
alter table online_directory_qa.audit force row level security;

create policy directory_region_scope on online_directory_qa.regions to online_directory_qa_api
  using (current_setting('online_directory_qa.scope',true) in ('*',slug))
  with check (current_setting('online_directory_qa.scope',true) in ('*',slug));
create policy directory_image_scope on online_directory_qa.images to online_directory_qa_api
  using (region=current_setting('online_directory_qa.scope',true))
  with check (region=current_setting('online_directory_qa.scope',true));
create policy directory_audit_scope on online_directory_qa.audit for insert to online_directory_qa_api
  with check (current_setting('online_directory_qa.scope',true) in ('*',region));

revoke all on schema online_directory_qa from public, anon, authenticated, service_role;
grant select on online_directory_qa.gateway, online_directory_qa.identities to online_directory_qa_api;
grant select,insert,update on online_directory_qa.regions to online_directory_qa_api;
grant select,insert on online_directory_qa.images to online_directory_qa_api;
grant insert on online_directory_qa.audit to online_directory_qa_api;

create function public.online_directory_qa_v1(op text, gate text, actor text default null,
  proof text default null, area text default null, expected uuid default null, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, online_directory_qa
as $$
declare
  account online_directory_qa.identities%rowtype;
  existing online_directory_qa.regions%rowtype;
  image online_directory_qa.images%rowtype;
  next_doc jsonb;
  upload jsonb;
  entries jsonb;
begin
  if gate is null or not exists (select 1 from online_directory_qa.gateway
    where singleton and digest=sha256(convert_to(gate,'UTF8'))) then
    return jsonb_build_object('status',403);
  end if;
  perform set_config('online_directory_qa.scope','',true);
  if actor is not null then
    if proof is null then return jsonb_build_object('status',401); end if;
    select * into account from online_directory_qa.identities i
      where i.name=actor and i.digest=sha256(convert_to(proof,'UTF8'));
    if not found then return jsonb_build_object('status',401); end if;
  end if;
  if op='identity' then
    if account.name is null then return jsonb_build_object('status',401); end if;
    return jsonb_build_object('status',200,'role',account.role,'region',account.region,'name',account.name);
  end if;
  if op='list' and account.role='superadmin' then
    perform set_config('online_directory_qa.scope','*',true);
    return jsonb_build_object('status',200,'regions',coalesce(
      (select jsonb_agg(document order by slug) from online_directory_qa.regions),'[]'::jsonb));
  end if;
  if area is null or area !~ '^[a-z][a-z0-9-]{1,62}$' or area='dallas' then
    return jsonb_build_object('status',404);
  end if;
  if account.region is not null and account.region<>area and op not in ('public','image') then
    return jsonb_build_object('status',404);
  end if;
  perform set_config('online_directory_qa.scope',area,true);
  select * into existing from online_directory_qa.regions where slug=area;

  if op='public' then
    if existing.document->>'status' is distinct from 'demo' then return jsonb_build_object('status',404); end if;
    select coalesce(jsonb_agg(value - 'claims' - 'pending' - 'ownerAccount'),'[]'::jsonb) into entries
      from jsonb_array_elements(coalesce(existing.document#>'{businessQa,records}','[]')) where
      value->>'visible'='true' and jsonb_typeof(value->'approved')='object';
    next_doc := existing.document - 'businessQa' || jsonb_build_object('businessQa',
      jsonb_build_object('categories',coalesce(existing.document#>'{businessQa,categories}','[]'),'records',entries));
    return jsonb_build_object('status',200,'region',next_doc);
  end if;
  if op='image' then
    select * into image from online_directory_qa.images where region=area and id=(payload->>'id')::uuid;
    if not found then return jsonb_build_object('status',404); end if;
    if not coalesce(account.role='superadmin' or (account.region=area and
      (account.role='region-admin' or image.uploaded_by=account.name)),false)
      and not coalesce(existing.document->>'status'='demo' and exists (
        select 1 from jsonb_array_elements(coalesce(existing.document#>'{businessQa,records}','[]'))
        where value->>'visible'='true' and value#>>'{approved,image}'=image.url
      ),false) then return jsonb_build_object('status',404); end if;
    return jsonb_build_object('status',200,'type',image.content_type,'image',encode(image.bytes,'base64'));
  end if;
  if account.name is null then return jsonb_build_object('status',401); end if;
  if op='read' then
    if existing.slug is null then return jsonb_build_object('status',404); end if;
    return jsonb_build_object('status',200,'region',existing.document,'version',existing.version);
  end if;
  if op='write' then
    next_doc := payload->'document';
    upload := payload->'upload';
    if account.role <> 'superadmin' and
       (existing.slug is null or (existing.document-'businessQa') is distinct from (next_doc-'businessQa')) then
      return jsonb_build_object('status',403);
    end if;
    if existing.slug is null then
      if expected is not null then return jsonb_build_object('status',409); end if;
      insert into online_directory_qa.regions(slug,document) values(area,next_doc)
        on conflict do nothing;
    else
      update online_directory_qa.regions set document=next_doc,version=gen_random_uuid()
        where slug=area and version=expected;
    end if;
    if not found then return jsonb_build_object('status',409); end if;
    if jsonb_typeof(upload)='object' then
      if (select count(*) from online_directory_qa.images where region=area)>=30 then
        raise exception 'QA image quota exceeded';
      end if;
      insert into online_directory_qa.images(region,id,url,content_type,bytes,uploaded_by)
        values(area,(upload->>'id')::uuid,upload->>'url',upload->>'type',decode(upload->>'bytes','base64'),account.name);
    end if;
    insert into online_directory_qa.audit(region,actor,action)
      values(area,account.name,left(coalesce(payload->>'action','write'),80));
    return jsonb_build_object('status',200);
  end if;
  return jsonb_build_object('status',403);
end $$;

grant online_directory_qa_api to postgres;
grant create on schema public to online_directory_qa_api;
alter function public.online_directory_qa_v1(text,text,text,text,text,uuid,jsonb)
  owner to online_directory_qa_api;
revoke create on schema public from online_directory_qa_api;
revoke online_directory_qa_api from postgres;
revoke all on function public.online_directory_qa_v1(text,text,text,text,text,uuid,jsonb) from public, authenticated, service_role;
grant execute on function public.online_directory_qa_v1(text,text,text,text,text,uuid,jsonb) to anon;
commit;


