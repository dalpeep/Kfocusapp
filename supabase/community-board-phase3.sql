-- Phase 3: additive category details. Run on the intended Supabase project before deploying code.
begin;

alter table public.community_posts add column if not exists details jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.community_posts'::regclass and conname='community_details_object_check') then
    alter table public.community_posts add constraint community_details_object_check
      check (details is null or (jsonb_typeof(details)='object' and pg_column_size(details)<=4096)) not valid;
  end if;
end $$;

-- Versioned readers leave existing RPC signatures untouched for rollback.
create or replace function public.community_list_public_v3(
  p_region text default 'dallas', p_category text default null,
  p_query text default null, p_offset integer default 0, p_limit integer default 100
)
returns table(
  id uuid, region text, area text, category text, title text,
  body_preview text, author_name text, image_url text, image_count bigint,
  view_count bigint, comment_count bigint, created_at timestamptz,
  total_count bigint, video_provider text, details jsonb, status text
)
language sql stable security definer set search_path=public,pg_temp as $$
  with eligible as (
    select p.* from public.community_posts p
    where p.status in ('approved','sold') and p.region=lower(coalesce(p_region,'dallas'))
      and (p.status<>'sold' or p.category='marketplace')
      and (p.category<>'marketplace' or p.expires_at>now())
      and (p_category is null or p_category='' or p.category=p_category)
      and (p_query is null or p_query='' or p.title ilike '%'||p_query||'%' or p.body ilike '%'||p_query||'%' or p.area ilike '%'||p_query||'%')
  )
  select e.id,e.region,e.area,e.category,e.title,
    left(regexp_replace(e.body,E'[\n\r\t ]+',' ','g'),220),e.author_name,
    (select i.image_url from public.community_post_images i where i.post_id=e.id order by i.sort_order,i.id limit 1),
    (select count(*) from public.community_post_images i where i.post_id=e.id),
    e.view_count,e.comment_count,e.created_at,count(*) over(),e.video_provider,e.details,e.status
  from eligible e order by e.created_at desc,e.id desc
  offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.community_get_public_v3(p_post_id uuid)
returns table(
  id uuid,region text,area text,category text,title text,body text,
  author_name text,contact_type text,contact_value text,view_count bigint,
  comment_count bigint,created_at timestamptz,images jsonb,
  video_url text,video_provider text,details jsonb,status text
)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,p.region,p.area,p.category,p.title,p.body,p.author_name,
    case when p.status='sold' then null else p.contact_type end,
    case when p.status='sold' then null else p.contact_value end,
    p.view_count,p.comment_count,p.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'image_url',i.image_url,'width',i.width,'height',i.height,'sort_order',i.sort_order) order by i.sort_order,i.id)
      from public.community_post_images i where i.post_id=p.id),'[]'::jsonb),
    p.video_url,p.video_provider,p.details,p.status
  from public.community_posts p
  where p.id=p_post_id and p.status in ('approved','sold')
    and (p.status<>'sold' or p.category='marketplace')
    and (p.category<>'marketplace' or p.expires_at>now());
$$;

create or replace function public.community_comments_public_v3(p_post_id uuid)
returns table(id uuid,post_id uuid,author_name text,body text,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select c.id,c.post_id,c.author_name,c.body,c.created_at
  from public.community_comments c join public.community_posts p on p.id=c.post_id
  where c.post_id=p_post_id and c.status='active' and p.status in ('approved','sold')
    and (p.status<>'sold' or p.category='marketplace')
    and (p.category<>'marketplace' or p.expires_at>now())
  order by c.created_at,c.id;
$$;

revoke all on function public.community_list_public_v3(text,text,text,integer,integer),public.community_get_public_v3(uuid),public.community_comments_public_v3(uuid) from public,anon,authenticated;
grant execute on function public.community_list_public_v3(text,text,text,integer,integer),public.community_get_public_v3(uuid),public.community_comments_public_v3(uuid) to anon,authenticated;

-- The existing image and video edit procedures run in this transaction. Only
-- after they succeed is the validated details object persisted atomically.
create or replace function public.community_apply_post_details_image_edit(
  p_request_id uuid,p_post_id uuid,p_post jsonb,p_plan jsonb,
  p_draft_id uuid,p_fingerprint text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare outcome jsonb; existing_result jsonb;
begin
  if p_post->'details' is not null and jsonb_typeof(p_post->'details') not in ('object','null') then
    raise exception 'Invalid category details.' using errcode='22023';
  end if;
  perform 1 from public.community_posts where id=p_post_id for update;
  if not found then raise exception 'Post not found.' using errcode='P0002'; end if;
  select result into existing_result from public.community_image_edit_requests
    where request_id=p_request_id and post_id=p_post_id;
  if found then return existing_result; end if;
  outcome:=public.community_apply_post_video_image_edit(p_request_id,p_post_id,p_post,p_plan,p_draft_id,p_fingerprint);
  update public.community_posts set details=nullif(p_post->'details','null'::jsonb)
  where id=p_post_id and status='pending';
  if not found then raise exception 'Post edit was not applied.' using errcode='P0002'; end if;
  return outcome;
end;
$$;
revoke all on function public.community_apply_post_details_image_edit(uuid,uuid,jsonb,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.community_apply_post_details_image_edit(uuid,uuid,jsonb,jsonb,uuid,text) to service_role;

commit;
