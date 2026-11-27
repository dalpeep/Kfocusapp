-- Restore the previous web deployment first. Retain dates for recovery.
begin;
revoke execute on function public.admin_set_legacy_post_period(uuid,text,timestamptz,timestamptz,date,date) from authenticated;
do $$
begin
  if exists(select 1 from public.posts
    where community_publish_starts_at is not null and
      (community_publish_starts_at>now() or community_publish_ends_at<=now())) then
    raise notice 'Public date guard retained to protect scheduled or elapsed posts';
  else
    drop policy posts_community_publication_period on public.posts;
  end if;
end $$;
commit;
