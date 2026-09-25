-- Isolated staging only. Do not apply to Production.
-- Rollback: drop the four community_video_* capability functions, then
-- drop public.community_video_upload_jobs. No existing Community rows change.

create table if not exists public.community_video_upload_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  object_id uuid not null unique,
  object_key text not null unique,
  expected_byte_size bigint not null check (expected_byte_size between 1 and 157286400),
  actual_byte_size bigint,
  ticket_hash text not null,
  worker_token_hash text,
  status text not null default 'pending' check
    (status in ('pending','uploading','processing','uploaded','failed','needs_review')),
  processing_lock uuid,
  youtube_video_id text,
  error_category text,
  expires_at timestamptz not null,
  cleanup_after timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_video_job_object_key_check check
    (object_key = 'staging/' || id::text || '/' || object_id::text || '.mp4'),
  constraint community_video_job_token_hash_check check
    (ticket_hash ~ '^[0-9a-f]{64}$' and
     (worker_token_hash is null or worker_token_hash ~ '^[0-9a-f]{64}$'))
);

create unique index if not exists community_video_one_active_job_per_post
  on public.community_video_upload_jobs(post_id)
  where status in ('pending','uploading','processing','needs_review');

create index if not exists community_video_jobs_cleanup_idx
  on public.community_video_upload_jobs(cleanup_after);

alter table public.community_video_upload_jobs enable row level security;
revoke all on public.community_video_upload_jobs from public, anon, authenticated;
grant select, insert, update on public.community_video_upload_jobs to service_role;

create or replace function public.community_video_claim_admission(
  p_job_id uuid, p_ticket text, p_worker_token_hash text
) returns table(object_key text, expected_byte_size bigint)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if length(coalesce(p_ticket,'')) < 40 or
     p_worker_token_hash !~ '^[0-9a-f]{64}$' then return; end if;
  return query
  update public.community_video_upload_jobs j
     set status = 'uploading', worker_token_hash = p_worker_token_hash,
         updated_at = now()
    from public.community_posts p
   where j.id = p_job_id and j.post_id = p.id
     and j.status = 'pending' and j.expires_at > now()
     and p.status in ('pending','approved')
     and p.category in ('marketplace','housing')
     and p.video_url is null and p.video_provider is null
     and j.ticket_hash = encode(digest(p_ticket,'sha256'),'hex')
  returning j.object_key, j.expected_byte_size;
end $$;

create or replace function public.community_video_claim_processing(
  p_job_id uuid, p_worker_token text, p_object_key text, p_actual_byte_size bigint
) returns table(post_id uuid, processing_lock uuid)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if length(coalesce(p_worker_token,'')) < 40 or
     p_actual_byte_size not between 1 and 157286400 then return; end if;
  return query
  update public.community_video_upload_jobs j
     set status = 'processing', actual_byte_size = p_actual_byte_size,
         processing_lock = gen_random_uuid(), updated_at = now()
    from public.community_posts p
   where j.id = p_job_id and j.post_id = p.id
     and j.status = 'uploading'
     and j.object_key = p_object_key
     and j.expected_byte_size = p_actual_byte_size
     and j.worker_token_hash = encode(digest(p_worker_token,'sha256'),'hex')
     and p.status in ('pending','approved')
     and p.category in ('marketplace','housing')
     and p.video_url is null and p.video_provider is null
  returning j.post_id, j.processing_lock;
end $$;

create or replace function public.community_video_fail_admission(
  p_job_id uuid, p_worker_token text
) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare changed integer;
begin
  if length(coalesce(p_worker_token,'')) < 40 then return false; end if;
  update public.community_video_upload_jobs
     set status = 'failed', error_category = 'session_failed', updated_at = now()
   where id = p_job_id and status = 'uploading'
     and worker_token_hash = encode(digest(p_worker_token,'sha256'),'hex');
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

create or replace function public.community_video_finish_dry_run(
  p_job_id uuid, p_worker_token text, p_processing_lock uuid,
  p_result text
) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare changed integer;
begin
  if length(coalesce(p_worker_token,'')) < 40 or
     p_result not in ('dry_run_ready','invalid_format','too_long','object_missing','validation_failed')
    then return false; end if;
  update public.community_video_upload_jobs
     set status = case when p_result = 'dry_run_ready' then 'needs_review' else 'failed' end,
         error_category = p_result, updated_at = now()
   where id = p_job_id and status = 'processing'
     and processing_lock = p_processing_lock
     and worker_token_hash = encode(digest(p_worker_token,'sha256'),'hex');
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

revoke all on function public.community_video_claim_admission(uuid,text,text)
  from public, authenticated;
revoke all on function public.community_video_claim_processing(uuid,text,text,bigint)
  from public, authenticated;
revoke all on function public.community_video_fail_admission(uuid,text)
  from public, authenticated;
revoke all on function public.community_video_finish_dry_run(uuid,text,uuid,text)
  from public, authenticated;
grant execute on function public.community_video_claim_admission(uuid,text,text) to anon;
grant execute on function public.community_video_claim_processing(uuid,text,text,bigint) to anon;
grant execute on function public.community_video_fail_admission(uuid,text) to anon;
grant execute on function public.community_video_finish_dry_run(uuid,text,uuid,text) to anon;
