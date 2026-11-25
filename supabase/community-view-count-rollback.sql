-- Roll back the calling app first. Preserve recorded view totals.
begin;
drop function if exists public.community_record_public_view(uuid,text);
create or replace function public.community_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end
$$;
commit;
