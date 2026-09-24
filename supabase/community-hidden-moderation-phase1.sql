-- Add hidden moderation without changing existing rows or public RPC contracts.
-- Apply only to isolated staging until the rollout is approved.
begin;

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
commit;
