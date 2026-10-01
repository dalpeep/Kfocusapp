-- Preview/isolated PostgreSQL only. Do not apply to Production without approval.
-- Legacy housing rows retain NULL expires_at; no existing post is backfilled.
begin;

alter table public.community_posts
  add column if not exists extension_count integer not null default 0;

alter table public.community_posts
  drop constraint if exists community_extension_count_check;
alter table public.community_posts
  add constraint community_extension_count_check check (extension_count between 0 and 1);

alter table public.community_posts
  drop constraint if exists community_marketplace_expiry_check;
alter table public.community_posts
  add constraint community_marketplace_expiry_check check (
    (category='marketplace' and expires_at is not null and
      ((status='hidden' and cleanup_after is null) or
       (status<>'hidden' and cleanup_after is not null)))
    or (category='housing' and
      ((expires_at is null and extension_count=0 and
        (cleanup_after is null or status in ('deleted','rejected','expired')))
       or (expires_at is not null and
        ((status='hidden' and cleanup_after is null) or
         (status<>'hidden' and cleanup_after is not null)))))
    or (category not in ('marketplace','housing') and expires_at is null and
      extension_count=0 and
      (cleanup_after is null or status in ('deleted','rejected','expired')))
  );

-- Existing image-edit RPCs retain the old housing expiry as NULL. Preserve
-- the stored deadline on same-category edits; assign a fresh policy deadline
-- only for an explicit administrator category change.
create or replace function public.community_retention_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare days integer;
begin
  if new.category is distinct from old.category then
    days := case new.category when 'marketplace' then 30 when 'housing' then 90 else null end;
    new.extension_count := 0;
    if days is null then
      new.expires_at := null;
      new.cleanup_after := null;
    else
      new.expires_at := now() + make_interval(days=>days);
      new.cleanup_after := new.expires_at + interval '7 days';
    end if;
  elsif new.category='housing' and old.expires_at is not null and
        new.expires_at is null and new.status='pending' then
    if old.status='hidden' then
      new.expires_at := now() + interval '90 days';
      new.cleanup_after := new.expires_at + interval '7 days';
    else
      new.expires_at := old.expires_at;
      new.cleanup_after := coalesce(old.cleanup_after,new.expires_at + interval '7 days');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists community_retention_guard_update on public.community_posts;
create trigger community_retention_guard_update before update on public.community_posts
  for each row execute function public.community_retention_guard();

-- Versioned public readers retain the v3 signatures for rollback.
create or replace function public.community_list_public_v4(
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
      and (p.category not in ('marketplace','housing') or p.expires_at is null or p.expires_at>now())
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

create or replace function public.community_get_public_v4(p_post_id uuid)
returns table(
  id uuid,region text,area text,category text,title text,body text,
  author_name text,contact_type text,contact_value text,view_count bigint,
  comment_count bigint,created_at timestamptz,images jsonb,
  video_url text,video_provider text,details jsonb,status text,
  expires_at timestamptz,extension_count integer
)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,p.region,p.area,p.category,p.title,p.body,p.author_name,
    case when p.status='sold' then null else p.contact_type end,
    case when p.status='sold' then null else p.contact_value end,
    p.view_count,p.comment_count,p.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'image_url',i.image_url,'width',i.width,'height',i.height,'sort_order',i.sort_order) order by i.sort_order,i.id)
      from public.community_post_images i where i.post_id=p.id),'[]'::jsonb),
    p.video_url,p.video_provider,p.details,p.status,p.expires_at,p.extension_count
  from public.community_posts p
  where p.id=p_post_id and p.status in ('approved','sold')
    and (p.status<>'sold' or p.category='marketplace')
    and (p.category not in ('marketplace','housing') or p.expires_at is null or p.expires_at>now());
$$;

create or replace function public.community_comments_public_v4(p_post_id uuid)
returns table(id uuid,post_id uuid,author_name text,body text,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select c.id,c.post_id,c.author_name,c.body,c.created_at
  from public.community_comments c join public.community_posts p on p.id=c.post_id
  where c.post_id=p_post_id and c.status='active' and p.status in ('approved','sold')
    and (p.status<>'sold' or p.category='marketplace')
    and (p.category not in ('marketplace','housing') or p.expires_at is null or p.expires_at>now())
  order by c.created_at,c.id;
$$;

revoke all on function public.community_list_public_v4(text,text,text,integer,integer),
  public.community_get_public_v4(uuid),public.community_comments_public_v4(uuid)
  from public,anon,authenticated;
grant execute on function public.community_list_public_v4(text,text,text,integer,integer),
  public.community_get_public_v4(uuid),public.community_comments_public_v4(uuid)
  to anon,authenticated;

commit;
