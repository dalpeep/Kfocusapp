-- REVIEW ONLY. Storage compatibility r1. Explicit approval guard remains false.
BEGIN;
SET LOCAL owner_preview.production_storage_approved='false';
DO $$ BEGIN 
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Postgres operator required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Production project mismatch'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NULL
 AND obj_description(to_regnamespace('owner_portal_uuid_internal'),'pg_namespace') IS DISTINCT FROM 'daltownmap-owner-production:ydrxuqmjzayejlnjzzew:idset-sha256:27bcd9d953d2106aa9e00e42cda48b8502e04a9a9ae3323d4c5bcdb281c0b28d' THEN
  IF current_setting('owner_preview.production_fingerprint_approved',true) IS DISTINCT FROM 'true'
  OR (SELECT count(*) FROM public.businesses)<>238
  OR (SELECT encode(sha256(convert_to(coalesce(string_agg(id::text,',' ORDER BY id),''),'UTF8')),'hex') FROM public.businesses)<>'27bcd9d953d2106aa9e00e42cda48b8502e04a9a9ae3323d4c5bcdb281c0b28d'
  OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.businesses'::regclass AND attname='id') IS DISTINCT FROM 'uuid'
  OR (SELECT count(*) FROM pg_constraint WHERE confrelid='public.businesses'::regclass AND connamespace='public'::regnamespace AND contype='f')<>8
  THEN RAISE EXCEPTION 'Production identity unavailable or fingerprint changed'; END IF;
 END IF;
 END $$;
DO $$ BEGIN
 IF current_setting('owner_preview.production_storage_approved',true) IS DISTINCT FROM 'true' OR current_user<>'postgres' THEN RAISE EXCEPTION 'Separate approval required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='public-images' AND public) THEN RAISE EXCEPTION 'Existing public bucket required'; END IF;
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='owner-portal-quarantine') THEN RAISE EXCEPTION 'Duplicate installation'; END IF;
 IF to_regclass('owner_portal_uuid_internal.memberships') IS NULL THEN RAISE EXCEPTION 'Owner migration required'; END IF;
END $$;
CREATE FUNCTION public.owner_uuid_image_access(p_actor uuid,p_business uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM owner_portal_uuid_internal.memberships WHERE user_id=p_actor AND business_id=p_business AND active AND revoked_at IS NULL) $$;
ALTER FUNCTION public.owner_uuid_image_access(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_uuid_image_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_uuid_image_access(uuid,uuid) TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('owner-portal-quarantine','owner-portal-quarantine',false,5242880,ARRAY['image/png','image/jpeg','image/webp']);
-- Existing administrator clients keep their legacy Storage API; Owner paths stay gateway-only.
CREATE FUNCTION public.owner_storage_legacy_admin(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(p_name !~* '^(owner-v1|coupon-templates)(/|$)'
 AND EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id
 WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
 AND coalesce(to_jsonb(u)->>'deleted_at','')=''
 AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()
 AND (p.role='super_admin' OR (p.role='regional_editor' AND p.area IN ('dallas','colorado','denver')))),false)
$$;
ALTER FUNCTION public.owner_storage_legacy_admin(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_storage_legacy_admin(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_storage_legacy_admin(text) TO anon,authenticated;
CREATE POLICY owner_compat_image_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id NOT IN ('public-images','business-media','coupon-media','media','owner-portal-quarantine') OR (bucket_id<>'owner-portal-quarantine' AND public.owner_storage_legacy_admin(name)));
CREATE POLICY owner_compat_image_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id NOT IN ('public-images','business-media','coupon-media','media','owner-portal-quarantine') OR (bucket_id<>'owner-portal-quarantine' AND public.owner_storage_legacy_admin(name))) WITH CHECK(bucket_id NOT IN ('public-images','business-media','coupon-media','media','owner-portal-quarantine') OR (bucket_id<>'owner-portal-quarantine' AND public.owner_storage_legacy_admin(name)));
CREATE POLICY owner_compat_image_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id NOT IN ('public-images','business-media','coupon-media','media','owner-portal-quarantine') OR (bucket_id<>'owner-portal-quarantine' AND public.owner_storage_legacy_admin(name)));
CREATE POLICY owner_compat_quarantine_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'owner-portal-quarantine');
COMMIT;
