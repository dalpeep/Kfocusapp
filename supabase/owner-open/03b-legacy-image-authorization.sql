-- Production-only legacy image authorization; no business/file updates.
BEGIN;
SET LOCAL owner_preview.legacy_image_approved='false';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.legacy_image_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate approval required'; END IF;
 
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
CREATE OR REPLACE FUNCTION public.owner_uuid_image_delete_access(p_actor uuid,p_url text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH refs AS (
 SELECT b.id,b.region FROM public.businesses b
 WHERE jsonb_path_exists(jsonb_build_array(b.image_url,b.image_urls,b.gallery_images,b.promo_image_url,b.promo_image,b.gallery_urls,b.description_image_url,b.description_images),'$.** ? (@ == $url)',jsonb_build_object('url',p_url))
 )
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor AND role='super_admin')
 OR (EXISTS(SELECT 1 FROM refs) AND NOT EXISTS(
 SELECT 1 FROM refs r WHERE NOT (public.owner_uuid_admin_region(p_actor,r.region)
 OR EXISTS(SELECT 1 FROM owner_portal_uuid_internal.memberships m WHERE m.user_id=p_actor AND m.business_id=r.id AND m.active AND m.revoked_at IS NULL))))
 OR (NOT EXISTS(SELECT 1 FROM refs) AND EXISTS(
 SELECT 1 FROM regexp_match(p_url,'/storage/v1/object/public/public-images/owner-v1/owner/([0-9a-f-]{36})/([0-9a-f-]{36})/[0-9a-f-]{36}\.(png|jpe?g|webp)$','i') x(parts)
 JOIN public.businesses b ON b.id::text=lower(x.parts[1])
 WHERE public.owner_uuid_admin_region(p_actor,b.region) OR
 (p_actor::text=lower(x.parts[2]) AND EXISTS(SELECT 1 FROM owner_portal_uuid_internal.memberships m WHERE m.business_id=b.id AND m.user_id=p_actor AND m.active AND m.revoked_at IS NULL))))
 OR (NOT EXISTS(SELECT 1 FROM refs) AND EXISTS(
 SELECT 1 FROM regexp_match(p_url,'/storage/v1/object/public/public-images/owner-v1/(dallas|colorado)/(uploads|business-gallery|business-description)/[0-9a-f-]{36}\.(png|jpe?g|webp)$','i') x(parts)
 WHERE public.owner_uuid_admin_region(p_actor,lower(x.parts[1]))));
$$;
ALTER FUNCTION public.owner_uuid_image_delete_access(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_uuid_image_delete_access(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_uuid_image_delete_access(uuid,text) TO service_role;
COMMIT;
