begin;

create extension if not exists pgcrypto;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  region text not null default 'dallas',
  area text not null,
  category text not null check (category in ('job_hiring','job_seeking','marketplace','housing','qna','neighborhood')),
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 5000),
  author_name text not null check (char_length(author_name) between 1 and 40),
  contact_type text check (contact_type is null or contact_type in ('phone','text','email','kakao','other')),
  contact_value text,
  password_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','sold','deleted')),
  expires_at timestamptz,
  cleanup_after timestamptz,
  sold_at timestamptz,
  view_count bigint not null default 0 check (view_count >= 0),
  comment_count bigint not null default 0 check (comment_count >= 0),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_marketplace_expiry_check check (
    (category = 'marketplace' and expires_at is not null and cleanup_after is not null)
    or (category <> 'marketplace' and expires_at is null and cleanup_after is null)
  )
);

create table if not exists public.community_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  storage_path text not null unique,
  image_url text not null,
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  byte_size integer not null check (byte_size between 1 and 1048576),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  body text not null check (char_length(body) between 1 and 1500),
  password_hash text not null,
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  created_at timestamptz not null default now()
);

create table if not exists public.community_upload_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  region text not null,
  ip_fingerprint text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type = 'image/webp'),
  byte_size integer not null check (byte_size between 1 and 1048576),
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  status text not null default 'reserved' check (status in ('reserved','uploaded','linked','cleanup_failed')),
  post_id uuid references public.community_posts(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now()
);

create table if not exists public.community_rate_limits (
  action text not null,
  ip_fingerprint text not null,
  target_key text not null default '',
  window_started_at timestamptz not null,
  attempts integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (action, ip_fingerprint, target_key, window_started_at)
);

create index if not exists community_posts_public_idx on public.community_posts(region,status,created_at desc);
create index if not exists community_posts_category_idx on public.community_posts(region,category,status,created_at desc);
create index if not exists community_posts_cleanup_idx on public.community_posts(status,cleanup_after) where cleanup_after is not null;
create index if not exists community_images_post_idx on public.community_post_images(post_id,sort_order,id);
create index if not exists community_comments_post_idx on public.community_comments(post_id,status,created_at);
create index if not exists community_upload_expiry_idx on public.community_upload_drafts(status,expires_at);
create index if not exists community_rate_limit_expiry_idx on public.community_rate_limits(updated_at);

create or replace function public.community_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists community_posts_touch on public.community_posts;
create trigger community_posts_touch before update on public.community_posts for each row execute function public.community_touch_updated_at();

create or replace function public.community_sync_comment_count() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.community_posts set comment_count=(select count(*) from public.community_comments where post_id=target and status='active') where id=target;
  return coalesce(new,old);
end $$;
drop trigger if exists community_comments_count on public.community_comments;
create trigger community_comments_count after insert or update or delete on public.community_comments for each row execute function public.community_sync_comment_count();

create or replace function public.community_list_public(p_region text default 'dallas',p_category text default null,p_query text default null,p_offset integer default 0,p_limit integer default 100)
returns table(id uuid,region text,area text,category text,title text,body_preview text,author_name text,image_url text,image_count bigint,view_count bigint,comment_count bigint,created_at timestamptz,total_count bigint)
language sql stable security definer set search_path=public as $$
  with eligible as (
    select p.* from public.community_posts p
    where p.status='approved' and p.region=lower(coalesce(p_region,'dallas'))
      and (p.category<>'marketplace' or p.expires_at>now())
      and (p_category is null or p_category='' or p.category=p_category)
      and (p_query is null or p_query='' or p.title ilike '%'||p_query||'%' or p.body ilike '%'||p_query||'%' or p.area ilike '%'||p_query||'%')
  )
  select e.id,e.region,e.area,e.category,e.title,left(regexp_replace(e.body,E'[\n\r\t ]+',' ','g'),220),e.author_name,
    (select i.image_url from public.community_post_images i where i.post_id=e.id order by i.sort_order,i.id limit 1),
    (select count(*) from public.community_post_images i where i.post_id=e.id),e.view_count,e.comment_count,e.created_at,count(*) over()
  from eligible e order by e.created_at desc,e.id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;

create or replace function public.community_get_public(p_post_id uuid)
returns table(id uuid,region text,area text,category text,title text,body text,author_name text,contact_type text,contact_value text,view_count bigint,comment_count bigint,created_at timestamptz,images jsonb)
language sql stable security definer set search_path=public as $$
  select p.id,p.region,p.area,p.category,p.title,p.body,p.author_name,p.contact_type,p.contact_value,p.view_count,p.comment_count,p.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'image_url',i.image_url,'width',i.width,'height',i.height,'sort_order',i.sort_order) order by i.sort_order,i.id) from public.community_post_images i where i.post_id=p.id),'[]'::jsonb)
  from public.community_posts p where p.id=p_post_id and p.status='approved' and (p.category<>'marketplace' or p.expires_at>now());
$$;

create or replace function public.community_comments_public(p_post_id uuid)
returns table(id uuid,post_id uuid,author_name text,body text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select c.id,c.post_id,c.author_name,c.body,c.created_at from public.community_comments c join public.community_posts p on p.id=c.post_id
  where c.post_id=p_post_id and c.status='active' and p.status='approved' and (p.category<>'marketplace' or p.expires_at>now()) order by c.created_at,c.id;
$$;

create or replace function public.community_rate_limit_take(p_action text,p_fingerprint text,p_target text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare bucket timestamptz; n integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'not authorized'; end if;
  bucket=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
  insert into public.community_rate_limits(action,ip_fingerprint,target_key,window_started_at,attempts) values(p_action,p_fingerprint,coalesce(p_target,''),bucket,1)
  on conflict(action,ip_fingerprint,target_key,window_started_at) do update set attempts=community_rate_limits.attempts+1,updated_at=now()
  returning attempts into n;
  return n<=p_limit;
end $$;

alter table public.community_posts enable row level security;
alter table public.community_post_images enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_upload_drafts enable row level security;
alter table public.community_rate_limits enable row level security;

revoke all on public.community_posts,public.community_post_images,public.community_comments,public.community_upload_drafts,public.community_rate_limits from anon,authenticated;
revoke all on function public.community_rate_limit_take(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.community_rate_limit_take(text,text,text,integer,integer) to service_role;
grant execute on function public.community_list_public(text,text,text,integer,integer),public.community_get_public(uuid),public.community_comments_public(uuid) to anon,authenticated;

commit;
