-- Production review only. Existing IDs, images and memberships remain unchanged.
BEGIN;
DO $target$ BEGIN 
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

 IF current_setting('owner_preview.production_image_link_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate image link approval required'; END IF; END $target$;
CREATE FUNCTION public.owner_uuid_image_link(p_actor uuid,p_business uuid,p_path text,p_url text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous text;
BEGIN
 -- Serialize with ownership revocation; a stale upload cannot attach after revocation.
 PERFORM 1 FROM owner_portal_uuid_internal.memberships WHERE business_id=p_business AND user_id=p_actor AND active AND revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Active ownership required'; END IF;
 IF p_path<>'' AND (p_path NOT LIKE 'owner-v1/owner/'||p_business::text||'/'||p_actor::text||'/%'
   OR p_path ~ '(^|/)\.\.(/|$)' OR p_url NOT LIKE '%/storage/v1/object/public/public-images/'||p_path
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='public-images' AND name=p_path)) THEN RAISE EXCEPTION 'Validated image required'; END IF;
 IF p_path='' AND p_url<>'' THEN RAISE EXCEPTION 'Invalid clear request'; END IF;
 SELECT image_url INTO previous FROM public.businesses WHERE id=p_business FOR UPDATE;
 UPDATE public.businesses SET image_url=nullif(p_url,''),updated_at=now() WHERE id=p_business;
 INSERT INTO owner_portal_uuid_internal.audit(actor,business_id,action,before_value,after_value)
 VALUES(p_actor,p_business,'image',jsonb_build_object('image_url',previous),jsonb_build_object('image_url',nullif(p_url,'')));
 RETURN true;
END $$;
ALTER FUNCTION public.owner_uuid_image_link(uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_uuid_image_link(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_uuid_image_link(uuid,uuid,text,text) TO service_role;
COMMIT;
