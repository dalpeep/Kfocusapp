-- Additive Community image-edit transaction and deferred Storage cleanup.
begin;

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

commit;
