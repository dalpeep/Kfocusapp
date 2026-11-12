-- Review before applying. Installs only a service-role RPC. No data is changed at install.
BEGIN;
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public.owner_pilot_gallery_v1(
  p_actor uuid, p_business uuid, p_expected jsonb DEFAULT NULL, p_urls jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  current_urls jsonb;
BEGIN
  PERFORM public.owner_pilot_status_v1(p_actor);

  -- Lock the existing approval while checking scope and changing the gallery.
  PERFORM 1
  FROM owner_portal_pilot.businesses approved
  JOIN owner_portal_pilot.business_scope scope ON scope.business_id = approved.public_id
  WHERE approved.public_id = p_business AND approved.user_id = p_actor
  FOR SHARE OF approved, scope;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Approved ownership required';
  END IF;

  SELECT coalesce(to_jsonb(b.gallery_urls), '[]'::jsonb) INTO current_urls
  FROM public.businesses b WHERE b.id = p_business FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Business unavailable';
  END IF;
  IF p_expected IS NULL AND p_urls IS NULL THEN
    RETURN current_urls;
  END IF;

  IF jsonb_typeof(p_urls) IS DISTINCT FROM 'array' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid gallery';
  END IF;
  IF jsonb_array_length(p_urls) > greatest(20, jsonb_array_length(current_urls)) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_urls) u(value)
    WHERE jsonb_typeof(value) <> 'string' OR length(value #>> '{}') > 2048
       OR (NOT current_urls @> jsonb_build_array(value)
           AND NOT EXISTS (
             SELECT 1 FROM storage.objects object
             WHERE object.bucket_id = 'public-images'
               AND object.name LIKE 'owner-phase2/' || p_business::text || '/%'
               AND object.name ~ '^owner-phase2/[a-f0-9-]+/[a-f0-9-]+[.](jpg|jpeg|png|webp)$'
               AND (value #>> '{}') =
                 'https://ydrxuqmjzayejlnjzzew.supabase.co/storage/v1/object/public/public-images/' || object.name
           ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid gallery image';
  END IF;
  IF current_urls = p_urls THEN
    RETURN current_urls;
  END IF;
  IF current_urls <> p_expected THEN
    RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Gallery changed';
  END IF;

  -- Populate the existing native column type (jsonb, json or text[]).
  UPDATE public.businesses b SET gallery_urls = converted.gallery_urls
  FROM jsonb_populate_record(NULL::public.businesses, jsonb_build_object('gallery_urls', p_urls)) converted
  WHERE b.id = p_business;
  RETURN p_urls;
END $$;

REVOKE ALL ON FUNCTION public.owner_pilot_gallery_v1(uuid,uuid,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_pilot_gallery_v1(uuid,uuid,jsonb,jsonb) TO service_role;
COMMIT;
