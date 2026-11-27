begin;
alter table public.posts add column community_publish_starts_at timestamptz;
alter table public.posts add column community_publish_ends_at timestamptz;

create function public.can_manage_legacy_post_period(p_region text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from (
      select coalesce(p.role,auth.jwt()->'app_metadata'->>'role') as role,
        case when p.role is not null then p.area else auth.jwt()->'app_metadata'->>'area' end as area
      from (select auth.uid() as id) actor
      left join public.profiles p on p.user_id=actor.id
    ) scope
    where scope.role in ('admin','super_admin') or
      (scope.role='regional_editor' and lower(scope.area)=lower(p_region))
  );
$$;
revoke all on function public.can_manage_legacy_post_period(text) from public,anon,authenticated;
grant execute on function public.can_manage_legacy_post_period(text) to anon,authenticated;

create function public.guard_legacy_post_period()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and new.community_publish_starts_at is not distinct from old.community_publish_starts_at
    and new.community_publish_ends_at is not distinct from old.community_publish_ends_at then return new; end if;
  if tg_op='INSERT' and new.community_publish_starts_at is null and new.community_publish_ends_at is null then return new; end if;
  if coalesce(auth.role(),'')<>'service_role' and not public.can_manage_legacy_post_period(new.region) then
    raise exception 'Administrator authorization required' using errcode='42501';
  end if;
  if (new.community_publish_starts_at is null)<>(new.community_publish_ends_at is null)
    or new.community_publish_starts_at>=new.community_publish_ends_at then
    raise exception 'Invalid publication dates' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger posts_guard_community_publication_period
  before insert or update of community_publish_starts_at,community_publish_ends_at on public.posts
  for each row execute function public.guard_legacy_post_period();

create policy posts_community_publication_period
  on public.posts as restrictive for select to anon, authenticated
  using (
    (community_publish_starts_at is null and community_publish_ends_at is null)
    or (community_publish_starts_at <= now() and community_publish_ends_at > now())
    or public.can_manage_legacy_post_period(region)
  );

create function public.admin_set_legacy_post_period(
  p_post_id uuid,p_region text,p_expected_start timestamptz,p_expected_end timestamptz,p_start date,p_end date
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.can_manage_legacy_post_period(p_region) then
    raise exception 'Administrator authorization required' using errcode='42501';
  end if;
  if p_start is null or p_end is null or p_end<p_start or p_end>=date '9999-12-31' then
    raise exception 'Invalid publication dates' using errcode='22023';
  end if;
  update public.posts set
    community_publish_starts_at=p_start::timestamp at time zone 'America/Chicago',
    community_publish_ends_at=(p_end+1)::timestamp at time zone 'America/Chicago'
  where id=p_post_id and region=p_region
    and community_publish_starts_at is not distinct from p_expected_start
    and community_publish_ends_at is not distinct from p_expected_end;
  if not found then raise exception 'Publication period changed' using errcode='40001'; end if;
end;
$$;
revoke all on function public.admin_set_legacy_post_period(uuid,text,timestamptz,timestamptz,date,date)
  from public,anon,authenticated;
grant execute on function public.admin_set_legacy_post_period(uuid,text,timestamptz,timestamptz,date,date) to authenticated;
commit;
