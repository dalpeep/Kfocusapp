-- Additive Community external-video links. No existing post rows are updated.
begin;

alter table public.community_posts
  add column if not exists video_url text,
  add column if not exists video_provider text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and conname = 'community_video_link_check'
  ) then
    alter table public.community_posts
      add constraint community_video_link_check check (
        (video_url is null and video_provider is null)
        or (
          category in ('marketplace','housing')
          and video_url is not null
          and char_length(video_url) between 1 and 2048
          and video_url like 'https://%'
          and video_provider in ('youtube','instagram','facebook')
        )
      );
  end if;
end $$;

-- Versioned public RPCs keep the original return signatures available for rollback.
create or replace function public.community_list_public_v2(
  p_region text default 'dallas', p_category text default null,
  p_query text default null, p_offset integer default 0, p_limit integer default 100
)
returns table(
  id uuid, region text, area text, category text, title text,
  body_preview text, author_name text, image_url text, image_count bigint,
  view_count bigint, comment_count bigint, created_at timestamptz,
  total_count bigint, video_provider text
)
language sql stable security definer set search_path = public, pg_temp as $$
  with eligible as (
    select p.* from public.community_posts p
    where p.status = 'approved' and p.region = lower(coalesce(p_region,'dallas'))
      and (p.category <> 'marketplace' or p.expires_at > now())
      and (p_category is null or p_category = '' or p.category = p_category)
      and (p_query is null or p_query = '' or p.title ilike '%'||p_query||'%'
        or p.body ilike '%'||p_query||'%' or p.area ilike '%'||p_query||'%')
  )
  select e.id,e.region,e.area,e.category,e.title,
    left(regexp_replace(e.body,E'[\n\r\t ]+',' ','g'),220),e.author_name,
    (select i.image_url from public.community_post_images i
      where i.post_id=e.id order by i.sort_order,i.id limit 1),
    (select count(*) from public.community_post_images i where i.post_id=e.id),
    e.view_count,e.comment_count,e.created_at,count(*) over(),e.video_provider
  from eligible e order by e.created_at desc,e.id desc
  offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.community_get_public_v2(p_post_id uuid)
returns table(
  id uuid, region text, area text, category text, title text, body text,
  author_name text, contact_type text, contact_value text, view_count bigint,
  comment_count bigint, created_at timestamptz, images jsonb,
  video_url text, video_provider text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id,p.region,p.area,p.category,p.title,p.body,p.author_name,
    p.contact_type,p.contact_value,p.view_count,p.comment_count,p.created_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'image_url',i.image_url,'width',i.width,'height',i.height,
      'sort_order',i.sort_order) order by i.sort_order,i.id)
      from public.community_post_images i where i.post_id=p.id),'[]'::jsonb),
    p.video_url,p.video_provider
  from public.community_posts p
  where p.id=p_post_id and p.status='approved'
    and (p.category<>'marketplace' or p.expires_at>now());
$$;

revoke all on function public.community_list_public_v2(text,text,text,integer,integer),
  public.community_get_public_v2(uuid) from public,anon,authenticated;
grant execute on function public.community_list_public_v2(text,text,text,integer,integer),
  public.community_get_public_v2(uuid) to anon,authenticated;

-- Keep the previously verified image-edit RPCs intact. Calling them inside
-- this wrapper and then storing video metadata is one database transaction.
create or replace function public.community_apply_post_video_image_edit(
  p_request_id uuid, p_post_id uuid, p_post jsonb, p_plan jsonb,
  p_draft_id uuid, p_fingerprint text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  previous jsonb;
  was_hidden boolean;
  outcome jsonb;
begin
  select result into previous from public.community_image_edit_requests
    where request_id=p_request_id and post_id=p_post_id;
  if found then return previous; end if;
  select status='hidden' into was_hidden from public.community_posts
    where id=p_post_id for update;
  if not found then raise exception 'Post not found.' using errcode='P0002'; end if;
  if was_hidden then
    outcome := public.community_apply_hidden_post_image_edit(
      p_request_id,p_post_id,p_post,p_plan,p_draft_id,p_fingerprint);
  else
    outcome := public.community_apply_post_image_edit(
      p_request_id,p_post_id,p_post,p_plan,p_draft_id,p_fingerprint);
  end if;
  update public.community_posts set
    video_url=nullif(p_post->>'video_url',''),
    video_provider=nullif(p_post->>'video_provider','')
  where id=p_post_id and status='pending';
  if not found then raise exception 'Post edit was not applied.' using errcode='P0002'; end if;
  return outcome;
end;
$$;
revoke all on function public.community_apply_post_video_image_edit(
  uuid,uuid,jsonb,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.community_apply_post_video_image_edit(
  uuid,uuid,jsonb,jsonb,uuid,text) to service_role;

commit;
