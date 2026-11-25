-- Review only. Apply to Dallas after explicit production DB approval.
begin;

-- A read counter must not invalidate a user's edit version.
create or replace function public.community_touch_updated_at()
returns trigger language plpgsql as $$
begin
  if new.view_count is distinct from old.view_count
    and (to_jsonb(new) - 'view_count') = (to_jsonb(old) - 'view_count') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create function public.community_record_public_view(p_post uuid, p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  post public.community_posts%rowtype;
  inserted integer;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor fingerprint' using errcode = '22023';
  end if;

  select * into post from public.community_posts
  where id = p_post and region = 'dallas' and status in ('approved','sold')
    and (status <> 'sold' or category = 'marketplace')
    and (category not in ('marketplace','housing','business_promotion') or expires_at is null or expires_at > now())
  for update;
  if not found then return null; end if;

  -- Reuse the existing expiry-cleaned ledger. Both statements commit together.
  if exists (
    select 1 from public.community_rate_limits
    where action = 'public_post_view' and ip_fingerprint = p_fingerprint
      and target_key = p_post::text and updated_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('view_count',post.view_count,'comment_count',post.comment_count,'counted',false);
  end if;
  insert into public.community_rate_limits(action,ip_fingerprint,target_key,window_started_at,attempts)
    values ('public_post_view',p_fingerprint,p_post::text,to_timestamp(floor(extract(epoch from now()) / 1800)*1800),1)
    on conflict (action,ip_fingerprint,target_key,window_started_at) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.community_posts set view_count = view_count + 1 where id = p_post returning * into post;
  end if;

  return jsonb_build_object('view_count',post.view_count,'comment_count',post.comment_count,'counted',inserted = 1);
end;
$$;

revoke all on function public.community_record_public_view(uuid,text) from public,anon,authenticated;
grant execute on function public.community_record_public_view(uuid,text) to service_role;

commit;
