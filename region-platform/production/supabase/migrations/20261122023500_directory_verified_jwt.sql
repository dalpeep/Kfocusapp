begin;
grant online_directory_api to postgres;
grant create on schema public to online_directory_api;
set local role online_directory_api;
create or replace function public.online_directory_v1(op text, gate text, area text default null, expected uuid default null, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, online_directory
as $$
declare
  account online_directory.identities%rowtype;
  actor_id uuid := nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub';
  existing online_directory.regions%rowtype;
  image online_directory.images%rowtype;
  next_doc jsonb;
  upload jsonb;
  entries jsonb;
begin
  if gate is null or not exists (select 1 from online_directory.gateway
    where singleton and digest=sha256(convert_to(gate,'UTF8'))) then
    return jsonb_build_object('status',403);
  end if;
  perform set_config('online_directory.scope','',true);
  if actor_id is not null then
    select * into account from online_directory.identities i where i.user_id=actor_id;
    if not found then return jsonb_build_object('status',401); end if;
  end if;
  if op='identity' then
    if account.user_id::text is null then return jsonb_build_object('status',401); end if;
    return jsonb_build_object('status',200,'role',account.role,'region',account.region,'name',account.user_id::text);
  end if;
  if op='list' and account.role='superadmin' then
    perform set_config('online_directory.scope','*',true);
    return jsonb_build_object('status',200,'regions',coalesce(
      (select jsonb_agg(document order by slug) from online_directory.regions),'[]'::jsonb));
  end if;
  if area is null or area !~ '^[a-z][a-z0-9-]{1,62}$' or area='dallas' then
    return jsonb_build_object('status',404);
  end if;
  if account.region is not null and account.region<>area and op not in ('public','image') then
    return jsonb_build_object('status',404);
  end if;
  perform set_config('online_directory.scope',area,true);
  select * into existing from online_directory.regions where slug=area;

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
    select * into image from online_directory.images where region=area and id=(payload->>'id')::uuid;
    if not found then return jsonb_build_object('status',404); end if;
    if not coalesce(account.role='superadmin' or (account.region=area and
      (account.role='region-admin' or image.uploaded_by=account.user_id::text)),false)
      and not coalesce(existing.document->>'status'='demo' and exists (
        select 1 from jsonb_array_elements(coalesce(existing.document#>'{businessQa,records}','[]'))
        where value->>'visible'='true' and value#>>'{approved,image}'=image.url
      ),false) then return jsonb_build_object('status',404); end if;
    return jsonb_build_object('status',200,'type',image.content_type,'image',encode(image.bytes,'base64'));
  end if;
  if account.user_id::text is null then return jsonb_build_object('status',401); end if;
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
      insert into online_directory.regions(slug,document) values(area,next_doc)
        on conflict do nothing;
    else
      update online_directory.regions set document=next_doc,version=gen_random_uuid()
        where slug=area and version=expected;
    end if;
    if not found then return jsonb_build_object('status',409); end if;
    if jsonb_typeof(upload)='object' then
      if (select count(*) from online_directory.images where region=area)>=30 then
        raise exception 'Image quota exceeded';
      end if;
      insert into online_directory.images(region,id,url,content_type,bytes,uploaded_by)
        values(area,(upload->>'id')::uuid,upload->>'url',upload->>'type',decode(upload->>'bytes','base64'),account.user_id::text);
    end if;
    insert into online_directory.audit(region,actor,action)
      values(area,account.user_id::text,left(coalesce(payload->>'action','write'),80));
    return jsonb_build_object('status',200);
  end if;
  return jsonb_build_object('status',403);
end $$;
reset role;
revoke create on schema public from online_directory_api;
revoke online_directory_api from postgres;
commit;
