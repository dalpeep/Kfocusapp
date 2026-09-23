-- Permit deferred cleanup for terminal non-marketplace Community posts.
-- Existing rows are neither updated nor deleted. Apply after both Community Phase 1 migrations.
begin;

alter table public.community_posts
  drop constraint community_marketplace_expiry_check;

alter table public.community_posts
  add constraint community_marketplace_expiry_check check (
    (category = 'marketplace' and expires_at is not null and cleanup_after is not null)
    or (category <> 'marketplace' and expires_at is null
      and (cleanup_after is null or status in ('deleted','rejected','expired')))
  );

commit;
