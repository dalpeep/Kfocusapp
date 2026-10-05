-- PREPARED ONLY. Prerequisite: 08 reset + Storage API verification.
-- Canonical UUID coupon / bigint business contract. No populated-ID conversion.
begin;
do $$
declare t text;
begin
  if to_regclass('public.owner_test_project_marker') is null
    or to_regclass('public.owner_test_preview_state') is null then
    raise exception 'Verified owner-test reset marker required';
  end if;
  if not exists(select 1 from public.owner_test_preview_state where id=true
    and project_ref='aaikttogoejfvxbosktg' and phase='reset' and storage_ready=true) then
    raise exception '08 reset and Storage API verification must succeed first';
  end if;
  if to_regclass('owner_phase1b_internal.policy_backup') is not null
    or to_regclass('owner_phase1b_internal.grant_backup') is not null then
    raise exception 'Migration A must remain rolled back';
  end if;
  foreach t in array array['coupons','coupon_entries','coupon_redemptions',
    'event_draw_batches','event_draw_winners','event_winner_email_attempts',
    'community_posts','community_post_images','community_comments'] loop
    if to_regclass('public.'||t) is not null then raise exception 'Reset expected absent table %',t; end if;
  end loop;
  lock table public.businesses,public.posts,public.business_specials,public.business_special_items in access exclusive mode;
  if exists(select 1 from public.businesses) or exists(select 1 from public.posts)
    or exists(select 1 from public.business_specials) or exists(select 1 from public.business_special_items)
    or exists(select 1 from storage.objects) then
    raise exception 'Reset must leave application fixtures and Storage empty';
  end if;
  if not exists(select 1 from storage.buckets where id='community-images' and public=true) then
    raise exception 'Storage API must make the isolated community-images bucket public';
  end if;
  if (select format_type(atttypid,atttypmod) from pg_attribute
    where attrelid='public.businesses'::regclass and attname='id' and not attisdropped) <> 'bigint' then
    raise exception 'Expected bigint businesses.id contract';
  end if;
end $$;

-- The public UI uses an explicit business projection; every named column must
-- exist or PostgREST rejects the entire request, including Special rendering.
alter table public.businesses
  add column if not exists name text,
  add column if not exists name_en text,
  add column if not exists category text,
  add column if not exists map_category text,
  add column if not exists subcategory text,
  add column if not exists search_keywords text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists email text,
  add column if not exists image_urls text[],
  add column if not exists gallery_urls text[],
  add column if not exists description text,
  add column if not exists description_images jsonb,
  add column if not exists hours text,
  add column if not exists monday text,
  add column if not exists tuesday text,
  add column if not exists wednesday text,
  add column if not exists thursday text,
  add column if not exists friday text,
  add column if not exists saturday text,
  add column if not exists sunday text,
  add column if not exists business_hours jsonb,
  add column if not exists parking text,
  add column if not exists reservation text,
  add column if not exists languages text,
  add column if not exists insurance text,
  add column if not exists video_url text,
  add column if not exists youtube_url text,
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_rank integer,
  add column if not exists is_new boolean not null default false,
  add column if not exists new_rank integer,
  add column if not exists is_popular boolean not null default false,
  add column if not exists popular_rank integer,
  add column if not exists reservation_enabled boolean not null default false,
  add column if not exists paid_product text,
  add column if not exists paid_active boolean not null default false,
  add column if not exists paid_start_at timestamptz,
  add column if not exists paid_end_at timestamptz,
  add column if not exists paid_weight numeric,
  add column if not exists rotation_enabled boolean not null default false,
  add column if not exists promo_enabled boolean not null default false,
  add column if not exists promo_start_at timestamptz,
  add column if not exists promo_end_at timestamptz,
  add column if not exists home_fixed boolean not null default false,
  add column if not exists home_fixed_sort integer,
  add column if not exists promo_image_url text,
  add column if not exists promo_text text,
  add column if not exists order_url text,
  add column if not exists delivery_url text,
  add column if not exists reservation_url text,
  add column if not exists rating numeric,
  add column if not exists review_count integer,
  add column if not exists google_maps_url text,
  add column if not exists google_review_url text,
  add column if not exists google_place_id text,
  add column if not exists list_visible boolean not null default true;

-- Recreate from scratch AFTER reset; no ALTER TYPE or bigint-to-UUID mapping.
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  business_id bigint references public.businesses(id),
  business_ids bigint[] not null default '{}'::bigint[],
  title text not null,delivery_mode text not null default 'display',coupon_code text,
  image_url text,is_active boolean not null default true,sort_order integer not null default 0,
  created_at timestamptz not null default now(),description text,use_link_url text,
  discount_label text,start_at timestamptz,end_at timestamptz,
  is_today_coupon boolean not null default false,notify_emails text,notify_phones text,
  raffle_end_at timestamptz,winner_count integer not null default 1,
  raffle_draw_mode text not null default 'manual',one_per_email boolean not null default true,
  marketing_opt_in_enabled boolean not null default false,email_image_url text,
  winner_email_image_url text,used_count integer not null default 0
);
alter table public.coupons enable row level security;
grant select,insert,update,delete,truncate on public.coupons to anon,authenticated;
grant select,insert,update,delete on public.coupons to service_role;
create policy owner_test_coupon_public_read on public.coupons for select to anon,authenticated using(true);
-- Preserve all six legacy names so Migration A's 43-policy contract still holds.
create policy "Authenticated delete coupons" on public.coupons for delete to authenticated using(true);
create policy "Authenticated insert coupons" on public.coupons for insert to authenticated with check(true);
create policy "Authenticated update coupons" on public.coupons for update to authenticated using(true) with check(true);
create policy "public delete coupons" on public.coupons for delete to anon using(true);
create policy "public insert coupons" on public.coupons for insert to anon with check(true);
create policy "public update coupons" on public.coupons for update to anon using(true) with check(true);

create table if not exists public.coupon_entries (
  id uuid primary key default gen_random_uuid(),
  -- Existing coupon Functions and event_draw_run compare coupon_id as text.
  coupon_id text not null,
  business_id text,
  email text not null,
  email_normalized text not null,
  entry_code text,
  coupon_code text,
  status text not null default 'entered',
  marketing_opt_in boolean not null default false,
  source text,
  issued_at timestamptz,
  won_at timestamptz,
  redeemed_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(coupon_id,email_normalized)
);
create index if not exists coupon_entries_draw_idx on public.coupon_entries(coupon_id,status,created_at);
alter table public.coupon_entries enable row level security;
revoke all on public.coupon_entries from public,anon,authenticated;
grant select,insert,update,delete on public.coupon_entries to service_role;

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  business_id bigint,
  coupon_title text,
  business_name text,
  notify_emails text,
  notify_phones text,
  used_by text,
  created_at timestamptz not null default now()
);
alter table public.coupon_redemptions enable row level security;
create policy owner_test_redemption_insert on public.coupon_redemptions for insert to anon,authenticated with check(true);
create policy owner_test_redemption_admin_read on public.coupon_redemptions for select to authenticated
  using(exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='super_admin'));
grant insert on public.coupon_redemptions to anon,authenticated;
grant select on public.coupon_redemptions to authenticated;
grant select,insert,update,delete on public.coupon_redemptions to service_role;

alter table public.posts
  add column if not exists content text,
  add column if not exists region text not null default 'dallas',
  add column if not exists image_url text,
  add column if not exists image_link_url text,
  add column if not exists gallery_urls text[] not null default '{}'::text[],
  add column if not exists video_url text,
  add column if not exists external_url text,
  add column if not exists link_label text,
  add column if not exists author_name text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pin_order integer,
  add column if not exists is_alert_notice boolean not null default false,
  add column if not exists alert_order integer;
update public.posts set content=body where content is null;

alter table public.business_specials
  add column if not exists description text,
  add column if not exists price_text text,
  add column if not exists days_of_week smallint[] not null default '{}'::smallint[],
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists image_url text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
alter table public.business_special_items
  add column if not exists description text,
  add column if not exists price_text text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

-- Minimal Special tables are retained empty; restore canonical constraints.
alter table public.business_specials
  add constraint business_specials_title_check check(length(btrim(title)) between 1 and 160),
  add constraint business_specials_date_order check(start_date is null or end_date is null or start_date<=end_date),
  add constraint business_specials_time_pair check((start_time is null)=(end_time is null)),
  add constraint business_specials_days check(days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]);
alter table public.business_special_items
  add constraint business_special_items_item_name_check check(length(btrim(item_name)) between 1 and 160);
-- Match canonical delete behavior too; the retained minimal baseline used RESTRICT.
alter table public.business_specials drop constraint business_specials_business_id_fkey;
alter table public.business_specials add constraint business_specials_business_id_fkey
  foreign key(business_id) references public.businesses(id) on delete cascade;
alter table public.business_special_items drop constraint business_special_items_special_id_fkey;
alter table public.business_special_items add constraint business_special_items_special_id_fkey
  foreign key(special_id) references public.business_specials(id) on delete cascade;



-- BEGIN CANONICAL PREVIEW DEPENDENCIES

-- BEGIN SOURCE community-phase1.sql
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
-- END SOURCE community-phase1.sql

-- BEGIN SOURCE community-image-edit-phase1.sql
-- Additive Community image-edit transaction and deferred Storage cleanup.
create table if not exists public.community_image_edit_requests (
  request_id uuid primary key,
  post_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_image_cleanup_queue (
  storage_path text primary key check (storage_path like 'community-posts/%'),
  post_id uuid not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_image_cleanup_created_idx
  on public.community_image_cleanup_queue(created_at);

alter table public.community_image_edit_requests enable row level security;
alter table public.community_image_cleanup_queue enable row level security;
revoke all on public.community_image_edit_requests, public.community_image_cleanup_queue from anon, authenticated;
grant select, insert, update, delete on public.community_image_edit_requests, public.community_image_cleanup_queue to service_role;

create or replace function public.community_apply_post_image_edit(
  p_request_id uuid, p_post_id uuid, p_post jsonb, p_plan jsonb,
  p_draft_id uuid, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing_request public.community_image_edit_requests%rowtype;
  locked_post public.community_posts%rowtype;
  item jsonb;
  item_id uuid;
  item_kind text;
  ordinal integer := 0;
  max_images integer;
  retained_ids uuid[] := '{}'::uuid[];
  seen_ids uuid[] := '{}'::uuid[];
  upload public.community_upload_drafts%rowtype;
  outcome jsonb;
begin
  if p_request_id is null or p_post_id is null or jsonb_typeof(p_plan) <> 'array' then
    raise exception 'Invalid image edit request.' using errcode = '22023';
  end if;

  select * into locked_post from public.community_posts where id = p_post_id for update;
  if not found then raise exception 'Post not found.' using errcode = 'P0002'; end if;
  select * into existing_request from public.community_image_edit_requests where request_id = p_request_id;
  if found then
    if existing_request.post_id <> p_post_id then raise exception 'Request identity conflict.' using errcode = '22023'; end if;
    return existing_request.result;
  end if;

  max_images := case p_post->>'category'
    when 'job_hiring' then 1 when 'job_seeking' then 1 when 'marketplace' then 3
    when 'housing' then 3 when 'qna' then 2 when 'neighborhood' then 3 else 0 end;
  if max_images = 0 or jsonb_array_length(p_plan) > max_images then
    raise exception 'Image count exceeds category limit.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_plan) loop
    ordinal := ordinal + 1;
    item_kind := item->>'kind';
    if item_kind not in ('existing', 'upload') or (item->>'id') is null then
      raise exception 'Invalid image plan.' using errcode = '22023';
    end if;
    item_id := (item->>'id')::uuid;
    if item_id = any(seen_ids) then raise exception 'Duplicate image identity.' using errcode = '22023'; end if;
    seen_ids := array_append(seen_ids, item_id);
    if item_kind = 'existing' then
      perform 1 from public.community_post_images where id = item_id and post_id = p_post_id;
      if not found then raise exception 'Image does not belong to post.' using errcode = '22023'; end if;
      retained_ids := array_append(retained_ids, item_id);
    else
      select * into upload from public.community_upload_drafts where id = item_id for update;
      if not found or upload.post_id is distinct from p_post_id
        or upload.draft_id is distinct from p_draft_id
        or upload.ip_fingerprint is distinct from p_fingerprint
        or upload.status <> 'reserved'
        or upload.expires_at <= now()
        or upload.storage_path not like 'community-posts/%' then
        raise exception 'Upload does not belong to this edit.' using errcode = '22023';
      end if;
      if item->>'image_url' is null or item->>'image_url' = '' then
        raise exception 'Missing public image URL.' using errcode = '22023';
      end if;
    end if;
  end loop;

  insert into public.community_image_cleanup_queue(storage_path, post_id)
    select storage_path, p_post_id from public.community_post_images
    where post_id = p_post_id and not (id = any(retained_ids))
    on conflict (storage_path) do nothing;
  delete from public.community_post_images where post_id = p_post_id and not (id = any(retained_ids));

  ordinal := 0;
  for item in select value from jsonb_array_elements(p_plan) loop
    item_id := (item->>'id')::uuid;
    if item->>'kind' = 'existing' then
      update public.community_post_images set sort_order = ordinal where id = item_id and post_id = p_post_id;
    else
      select * into upload from public.community_upload_drafts where id = item_id;
      insert into public.community_post_images(post_id, storage_path, image_url, width, height, byte_size, sort_order)
        values (p_post_id, upload.storage_path,
          item->>'image_url', upload.width, upload.height, upload.byte_size, ordinal);
      update public.community_upload_drafts set status = 'linked', post_id = p_post_id where id = item_id;
    end if;
    ordinal := ordinal + 1;
  end loop;

  update public.community_posts set
    category = p_post->>'category', region = p_post->>'region', area = p_post->>'area',
    title = p_post->>'title', body = p_post->>'body', author_name = p_post->>'author_name',
    contact_type = nullif(p_post->>'contact_type',''), contact_value = nullif(p_post->>'contact_value',''),
    expires_at = case when p_post->>'category' = 'marketplace' then
      coalesce(locked_post.expires_at, locked_post.created_at + interval '30 days') else null end,
    cleanup_after = case when p_post->>'category' = 'marketplace' then
      coalesce(locked_post.cleanup_after, locked_post.created_at + interval '37 days') else null end,
    status = 'pending', approved_at = null
  where id = p_post_id;

  outcome := jsonb_build_object('ok', true, 'status', 'pending', 'image_count', jsonb_array_length(p_plan));
  insert into public.community_image_edit_requests(request_id, post_id, result)
    values (p_request_id, p_post_id, outcome);
  return outcome;
end;
$$;

revoke all on function public.community_apply_post_image_edit(uuid,uuid,jsonb,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.community_apply_post_image_edit(uuid,uuid,jsonb,jsonb,uuid,text) to service_role;
-- END SOURCE community-image-edit-phase1.sql

-- BEGIN SOURCE community-video-link-phase1.sql
-- Additive Community external-video links. No existing post rows are updated.
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
-- END SOURCE community-video-link-phase1.sql

-- BEGIN SOURCE community-board-phase3.sql
-- Phase 3: additive category details. Run on the intended Supabase project before deploying code.
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
-- END SOURCE community-board-phase3.sql

-- BEGIN SOURCE community-hidden-moderation-phase1.sql
-- Add hidden moderation without changing existing rows or public RPC contracts.
-- Apply only to isolated staging until the rollout is approved.
alter table public.community_posts
  add column if not exists moderation_reason text,
  add column if not exists moderation_note text;

alter table public.community_posts
  drop constraint if exists community_posts_status_check;
alter table public.community_posts
  add constraint community_posts_status_check check
    (status in ('pending','approved','rejected','expired','sold','deleted','hidden'));

alter table public.community_posts
  drop constraint if exists community_marketplace_expiry_check;
alter table public.community_posts
  add constraint community_marketplace_expiry_check check (
    (category = 'marketplace' and expires_at is not null
      and ((status = 'hidden' and cleanup_after is null)
        or (status <> 'hidden' and cleanup_after is not null)))
    or (category <> 'marketplace' and expires_at is null
      and (cleanup_after is null or status in ('deleted','rejected','expired')))
  );

alter table public.community_posts
  add constraint community_hidden_reason_check check (
    moderation_reason is null or moderation_reason in
      ('abuse','personal_info','off_topic','promotion','duplicate','other')
  );
alter table public.community_posts
  add constraint community_hidden_note_length_check check
    (moderation_note is null or char_length(moderation_note) <= 500);

-- Reuse the already-verified transactional image plan, then atomically clear
-- hidden moderation and start a fresh marketplace period for author resubmission.
create or replace function public.community_apply_hidden_post_image_edit(
  p_request_id uuid, p_post_id uuid, p_post jsonb, p_plan jsonb,
  p_draft_id uuid, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  perform 1 from public.community_posts where id=p_post_id and status='hidden' for update;
  if not found then raise exception 'Hidden post not found.' using errcode='P0002'; end if;
  result := public.community_apply_post_image_edit(
    p_request_id,p_post_id,p_post,p_plan,p_draft_id,p_fingerprint);
  update public.community_posts set
    moderation_reason=null, moderation_note=null,
    expires_at=case when category='marketplace' then now()+interval '30 days' else null end,
    cleanup_after=case when category='marketplace' then now()+interval '37 days' else null end
  where id=p_post_id and status='pending';
  return result;
end;
$$;
revoke all on function public.community_apply_hidden_post_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)
  from public,anon,authenticated;
grant execute on function public.community_apply_hidden_post_image_edit(uuid,uuid,jsonb,jsonb,uuid,text)
  to service_role;

-- Existing public list/detail/comment RPCs already require status = approved.
-- No anonymous table SELECT or new public RPC is granted here.
-- END SOURCE community-hidden-moderation-phase1.sql

-- BEGIN SOURCE community-cleanup-contract-phase1.sql
-- Permit deferred cleanup for terminal non-marketplace Community posts.
-- Existing rows are neither updated nor deleted. Apply after both Community Phase 1 migrations.
alter table public.community_posts
  drop constraint if exists community_marketplace_expiry_check;

alter table public.community_posts
  add constraint community_marketplace_expiry_check check (
    (category = 'marketplace' and expires_at is not null and cleanup_after is not null)
    or (category <> 'marketplace' and expires_at is null
      and (cleanup_after is null or status in ('deleted','rejected','expired')))
  );
-- END SOURCE community-cleanup-contract-phase1.sql

-- BEGIN SOURCE community-retention-extension-preview.sql
-- Final reviewed retention migration candidate. Do not apply to Production without explicit user approval.
-- Legacy housing rows retain NULL expires_at; no existing post is backfilled.
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

create index if not exists community_posts_retention_due_idx
  on public.community_posts (expires_at)
  where expires_at is not null
    and category in ('marketplace','housing')
    and status in ('approved','pending');

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
-- END SOURCE community-retention-extension-preview.sql

-- BEGIN SOURCE event-winner-coupon-phase1.sql
-- Prepare-only: independent draw/email/eGift tracking; never updates legacy rows.
create table if not exists public.event_draw_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.coupons(id),
  kind text not null check (kind in ('initial','redraw')),
  requested_count integer not null check (requested_count between 1 and 500),
  eligible_count integer not null check (eligible_count >= requested_count),
  drawn_at timestamptz not null default now(),
  drawn_by uuid not null
);
create unique index if not exists event_draw_one_initial_per_event
  on public.event_draw_batches(event_id) where kind='initial';
create table if not exists public.event_draw_winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.coupons(id),
  entry_id uuid not null references public.coupon_entries(id),
  draw_batch_id uuid not null references public.event_draw_batches(id),
  status text not null default 'winner' check (status in ('winner','cancelled')),
  winner_email_status text not null default 'not_sent'
    check (winner_email_status in ('not_sent','sending','sent','delivery_failed','unknown')),
  winner_email_sent_at timestamptz,
  gift_card_status text not null default 'not_sent'
    check (gift_card_status in ('not_sent','sent')),
  gift_card_sent_at timestamptz,
  drawn_at timestamptz not null default now(),
  drawn_by uuid not null,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  gift_card_marked_by uuid,
  unique(event_id,entry_id)
);
create index if not exists event_draw_winners_event_idx
  on public.event_draw_winners(event_id,status);
create table if not exists public.event_winner_email_attempts (
  id uuid primary key default gen_random_uuid(),
  winner_id uuid not null references public.event_draw_winners(id),
  kind text not null check (kind in ('initial','resend')),
  status text not null default 'sending'
    check (status in ('sending','accepted','failed','unknown')),
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  provider_message_id text,
  failure_code text
);
create unique index if not exists event_winner_one_active_email
  on public.event_winner_email_attempts(winner_id) where status='sending';
create unique index if not exists event_winner_one_initial_accepted
  on public.event_winner_email_attempts(winner_id)
  where kind='initial' and status='accepted';
alter table public.event_draw_batches enable row level security;
alter table public.event_draw_winners enable row level security;
alter table public.event_winner_email_attempts enable row level security;
revoke all on public.event_draw_batches,public.event_draw_winners,
  public.event_winner_email_attempts from public,anon,authenticated;
grant select,insert,update on public.event_draw_batches,public.event_draw_winners,
  public.event_winner_email_attempts to service_role;

create or replace function public.event_draw_run(
  p_event_id uuid,p_count integer,p_admin_id uuid,p_kind text default 'initial'
) returns table(batch_id uuid,selected_count integer,eligible_count integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.coupons%rowtype; v_eligible integer; v_batch uuid;
  v_cancelled integer; v_redrawn integer; v_selected integer;
begin
  if p_admin_id is null or p_event_id is null or p_count is null
    or p_count not between 1 and 500 or p_kind not in ('initial','redraw') then
    raise exception 'Invalid draw request' using errcode='22023';
  end if;
  select * into v_event from public.coupons
    where id=p_event_id and delivery_mode='raffle' for update;
  if not found then raise exception 'Raffle event not found' using errcode='22023'; end if;
  if coalesce(v_event.raffle_draw_mode,'manual')<>'manual' then
    raise exception 'Manual draw requires manual campaign mode' using errcode='22023';
  end if;
  if p_kind='initial' then
    if exists(select 1 from public.event_draw_batches where event_id=p_event_id) then
      raise exception 'Initial draw already exists' using errcode='23505';
    end if;
  else
    if p_count<>1 then raise exception 'Redraw must select one entry' using errcode='22023'; end if;
    select count(*) into v_cancelled from public.event_draw_winners
      where event_id=p_event_id and status='cancelled';
    select count(*) into v_redrawn from public.event_draw_batches
      where event_id=p_event_id and kind='redraw';
    if v_cancelled<=v_redrawn then
      raise exception 'No cancelled seat available for redraw' using errcode='22023';
    end if;
  end if;
  select count(*) into v_eligible from public.coupon_entries e
    where e.coupon_id=p_event_id::text and e.status='entered'
      and e.entry_code is not null
      and not exists(select 1 from public.event_draw_winners w
        where w.event_id=p_event_id and w.entry_id=e.id);
  if v_eligible<p_count then raise exception 'Not enough eligible entries' using errcode='22023'; end if;
  insert into public.event_draw_batches(event_id,kind,requested_count,eligible_count,drawn_by)
    values(p_event_id,p_kind,p_count,v_eligible,p_admin_id) returning id into v_batch;
  -- gen_random_uuid() uses PostgreSQL's cryptographic RNG.
  insert into public.event_draw_winners(event_id,entry_id,draw_batch_id,drawn_by)
    select p_event_id,e.id,v_batch,p_admin_id from public.coupon_entries e
    where e.coupon_id=p_event_id::text and e.status='entered'
      and e.entry_code is not null
      and not exists(select 1 from public.event_draw_winners w
        where w.event_id=p_event_id and w.entry_id=e.id)
    order by gen_random_uuid() limit p_count;
  get diagnostics v_selected=row_count;
  if v_selected<>p_count then raise exception 'Draw selection changed' using errcode='40001'; end if;
  return query select v_batch,v_selected,v_eligible;
end $$;

create or replace function public.event_winner_cancel(
  p_winner_id uuid,p_admin_id uuid,p_reason text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_winner public.event_draw_winners%rowtype;
begin
  select * into v_winner from public.event_draw_winners where id=p_winner_id for update;
  if v_winner.id is null or v_winner.status<>'winner' or p_admin_id is null
    or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Cancellation requires an active winner and reason' using errcode='22023';
  end if;
  if v_winner.winner_email_status in ('sending','sent','unknown')
    or v_winner.gift_card_status='sent' then
    raise exception 'Sent or uncertain delivery requires separate admin resolution' using errcode='22023';
  end if;
  update public.event_draw_winners set status='cancelled',cancelled_at=now(),
    cancelled_by=p_admin_id,cancel_reason=left(trim(p_reason),500) where id=p_winner_id;
end $$;

create or replace function public.event_winner_email_begin(
  p_winner_id uuid,p_admin_id uuid,p_kind text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_winner public.event_draw_winners%rowtype; v_attempt uuid;
begin
  select * into v_winner from public.event_draw_winners where id=p_winner_id for update;
  if v_winner.id is null or v_winner.status<>'winner' or p_admin_id is null
    or p_kind not in ('initial','resend') then
    raise exception 'Invalid winner email request' using errcode='22023';
  end if;
  if v_winner.winner_email_status in ('sending','unknown')
    or (p_kind='initial' and v_winner.winner_email_status='sent')
    or (p_kind='resend' and v_winner.winner_email_status<>'sent') then
    raise exception 'Email state does not allow this attempt' using errcode='22023';
  end if;
  insert into public.event_winner_email_attempts(winner_id,kind,requested_by)
    values(p_winner_id,p_kind,p_admin_id) returning id into v_attempt;
  update public.event_draw_winners set winner_email_status='sending' where id=p_winner_id;
  return v_attempt;
end $$;

create or replace function public.event_winner_email_finish(
  p_attempt_id uuid,p_status text,p_provider_id text,p_failure_code text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_attempt public.event_winner_email_attempts%rowtype;
begin
  select * into v_attempt from public.event_winner_email_attempts where id=p_attempt_id for update;
  if v_attempt.id is null or v_attempt.status<>'sending'
    or p_status not in ('accepted','failed','unknown') then
    raise exception 'Invalid email completion' using errcode='22023';
  end if;
  update public.event_winner_email_attempts set status=p_status,completed_at=now(),
    provider_message_id=case when p_status='accepted' then left(p_provider_id,200) else null end,
    failure_code=case when p_status='failed' then left(p_failure_code,100) else null end
    where id=p_attempt_id;
  update public.event_draw_winners set
    winner_email_status=case p_status when 'accepted' then 'sent'
      when 'failed' then case when v_attempt.kind='resend' then 'sent'
        else 'delivery_failed' end else 'unknown' end,
    winner_email_sent_at=case when p_status='accepted' then now()
      else winner_email_sent_at end
    where id=v_attempt.winner_id;
end $$;

create or replace function public.event_winner_mark_gift_sent(
  p_winner_id uuid,p_admin_id uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_winner public.event_draw_winners%rowtype;
begin
  select * into v_winner from public.event_draw_winners where id=p_winner_id for update;
  if v_winner.id is null or v_winner.status<>'winner' or p_admin_id is null
    or v_winner.winner_email_status<>'sent' or v_winner.gift_card_status='sent' then
    raise exception 'Gift card completion cannot be recorded' using errcode='22023';
  end if;
  update public.event_draw_winners set gift_card_status='sent',
    gift_card_sent_at=now(),gift_card_marked_by=p_admin_id where id=p_winner_id;
end $$;
revoke all on function public.event_draw_run(uuid,integer,uuid,text),
  public.event_winner_cancel(uuid,uuid,text),
  public.event_winner_email_begin(uuid,uuid,text),
  public.event_winner_email_finish(uuid,text,text,text),
  public.event_winner_mark_gift_sent(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.event_draw_run(uuid,integer,uuid,text),
  public.event_winner_cancel(uuid,uuid,text),
  public.event_winner_email_begin(uuid,uuid,text),
  public.event_winner_email_finish(uuid,text,text,text),
  public.event_winner_mark_gift_sent(uuid,uuid)
  to service_role;
-- END SOURCE event-winner-coupon-phase1.sql

-- BEGIN SOURCE business-specials-phase1.sql
-- Additive Phase 1 migration. Review businesses.id type before Production execution.
do $$
declare business_pk_type text;
begin
  select format_type(a.atttypid,a.atttypmod) into business_pk_type
  from pg_attribute a
  where a.attrelid='public.businesses'::regclass and a.attname='id' and not a.attisdropped;
  if business_pk_type is null then raise exception 'public.businesses.id type not found'; end if;
  execute format($ddl$
    create table if not exists public.business_specials (
      id bigint generated by default as identity primary key,
      business_id %s not null references public.businesses(id) on delete cascade,
      type text not null check (type in ('lunch_special','happy_hour')),
      title text not null check (length(btrim(title)) between 1 and 160),
      description text, price_text text,
      days_of_week smallint[] not null default '{}'::smallint[],
      start_time time without time zone, end_time time without time zone,
      start_date date, end_date date, image_url text,
      is_active boolean not null default true, sort_order integer not null default 0,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      constraint business_specials_date_order check (start_date is null or end_date is null or start_date <= end_date),
      constraint business_specials_time_pair check ((start_time is null) = (end_time is null)),
      constraint business_specials_days check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[])
    )
  $ddl$,business_pk_type);
end $$;

create index if not exists business_specials_business_id_idx on public.business_specials(business_id);
create index if not exists business_specials_public_order_idx on public.business_specials(is_active, end_date, sort_order, id);

create or replace function public.set_business_specials_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;
drop trigger if exists business_specials_set_updated_at on public.business_specials;
create trigger business_specials_set_updated_at before update on public.business_specials
for each row execute function public.set_business_specials_updated_at();

alter table public.business_specials enable row level security;
create or replace function public.business_specials_admin_access(target_business_id text)
returns boolean language plpgsql security definer set search_path=public,auth as $$
declare admin_role text; admin_area text;
begin
  if auth.uid() is null then return false; end if;
  if to_regclass('public.profiles') is not null then
    execute 'select role, area from public.profiles where user_id=$1 limit 1'
      into admin_role,admin_area using auth.uid();
  end if;
  if coalesce(admin_role,'')='' then
    admin_role=coalesce(auth.jwt()->'app_metadata'->>'role',auth.jwt()->'user_metadata'->>'role','');
    admin_area=coalesce(auth.jwt()->'app_metadata'->>'area',auth.jwt()->'user_metadata'->>'area','');
  end if;
  if admin_role='super_admin' then return true; end if;
  if admin_role<>'regional_editor' then return false; end if;
  if admin_area='denver' then admin_area='colorado'; end if;
  return exists(select 1 from public.businesses b where b.id::text=target_business_id and b.region=admin_area);
end;
$$;
revoke all on function public.business_specials_admin_access(text) from public,anon;
grant execute on function public.business_specials_admin_access(text) to authenticated;
drop policy if exists business_specials_public_read on public.business_specials;
create policy business_specials_public_read on public.business_specials
for select to anon using (is_active=true);
drop policy if exists business_specials_admin_read on public.business_specials;
create policy business_specials_admin_read on public.business_specials
for select to authenticated using (public.business_specials_admin_access(business_id::text));
drop policy if exists business_specials_admin_insert on public.business_specials;
create policy business_specials_admin_insert on public.business_specials
for insert to authenticated with check (public.business_specials_admin_access(business_id::text));
drop policy if exists business_specials_admin_update on public.business_specials;
create policy business_specials_admin_update on public.business_specials
for update to authenticated using (public.business_specials_admin_access(business_id::text))
with check (public.business_specials_admin_access(business_id::text));
drop policy if exists business_specials_admin_delete on public.business_specials;
create policy business_specials_admin_delete on public.business_specials
for delete to authenticated using (public.business_specials_admin_access(business_id::text));

grant select on public.business_specials to anon;
revoke insert,update,delete on public.business_specials from anon;
grant select,insert,update,delete on public.business_specials to authenticated;
grant usage,select on sequence public.business_specials_id_seq to authenticated;
notify pgrst, 'reload schema';
-- END SOURCE business-specials-phase1.sql

-- BEGIN SOURCE business-special-items-phase1.sql
-- Additive Restaurant Specials Phase 1.1 migration. Does not modify existing special/business rows.
create table if not exists public.business_special_items (
  id bigint generated by default as identity primary key,
  special_id bigint not null references public.business_specials(id) on delete cascade,
  item_name text not null check (length(btrim(item_name)) between 1 and 160),
  description text,
  price_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_special_items_special_order_idx
  on public.business_special_items(special_id,sort_order,id);

create or replace function public.set_business_special_items_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;
drop trigger if exists business_special_items_set_updated_at on public.business_special_items;
create trigger business_special_items_set_updated_at before update on public.business_special_items
for each row execute function public.set_business_special_items_updated_at();

alter table public.business_special_items enable row level security;
drop policy if exists business_special_items_public_read on public.business_special_items;
create policy business_special_items_public_read on public.business_special_items
for select to anon using (exists(
  select 1 from public.business_specials s where s.id=special_id and s.is_active=true
));
drop policy if exists business_special_items_admin_read on public.business_special_items;
create policy business_special_items_admin_read on public.business_special_items
for select to authenticated using (exists(
  select 1 from public.business_specials s where s.id=special_id
    and public.business_specials_admin_access(s.business_id::text)
));
drop policy if exists business_special_items_admin_insert on public.business_special_items;
create policy business_special_items_admin_insert on public.business_special_items
for insert to authenticated with check (exists(
  select 1 from public.business_specials s where s.id=special_id
    and public.business_specials_admin_access(s.business_id::text)
));
drop policy if exists business_special_items_admin_update on public.business_special_items;
create policy business_special_items_admin_update on public.business_special_items
for update to authenticated using (exists(
  select 1 from public.business_specials s where s.id=special_id
    and public.business_specials_admin_access(s.business_id::text)
)) with check (exists(
  select 1 from public.business_specials s where s.id=special_id
    and public.business_specials_admin_access(s.business_id::text)
));
drop policy if exists business_special_items_admin_delete on public.business_special_items;
create policy business_special_items_admin_delete on public.business_special_items
for delete to authenticated using (exists(
  select 1 from public.business_specials s where s.id=special_id
    and public.business_specials_admin_access(s.business_id::text)
));

grant select on public.business_special_items to anon;
revoke insert,update,delete on public.business_special_items from anon;
grant select,insert,update,delete on public.business_special_items to authenticated;
grant usage,select on sequence public.business_special_items_id_seq to authenticated;
notify pgrst, 'reload schema';
-- END SOURCE business-special-items-phase1.sql

-- Service Functions own writes; public access is through the canonical read RPCs.
grant select,insert,update,delete on public.community_posts,public.community_post_images,public.community_comments,public.community_upload_drafts,public.community_rate_limits,public.community_image_edit_requests,public.community_image_cleanup_queue to service_role;
update public.owner_test_preview_state set phase='schema' where id=true;
notify pgrst, 'reload schema';
commit;
