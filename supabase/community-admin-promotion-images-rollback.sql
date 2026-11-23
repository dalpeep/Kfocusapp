-- Roll back the feature application deployment before removing this function.
begin;
drop function if exists public.community_admin_save_promotion_images(uuid,text,timestamptz,jsonb,jsonb,uuid,text,uuid,uuid);
commit;
