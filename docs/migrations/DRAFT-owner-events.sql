BEGIN;
SET LOCAL lock_timeout='2s';
ALTER TABLE public.events
  ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT,
  ADD COLUMN title_en text,
  ADD COLUMN updated_at timestamptz;

CREATE FUNCTION public.event_admin_access_v1(p_region text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()
    AND (p.role IN ('admin','super_admin') OR (p.role='regional_editor'
      AND lower(nullif(p.area,''))=lower(nullif(p_region,'')))));
$$;
REVOKE ALL ON FUNCTION public.event_admin_access_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_admin_access_v1(text) TO authenticated;
CREATE POLICY events_anon_no_insert ON public.events AS RESTRICTIVE FOR INSERT TO anon WITH CHECK(false);
CREATE POLICY events_anon_no_update ON public.events AS RESTRICTIVE FOR UPDATE TO anon USING(false);
CREATE POLICY events_anon_no_delete ON public.events AS RESTRICTIVE FOR DELETE TO anon USING(false);
CREATE POLICY events_admin_insert ON public.events AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(business_id IS NULL AND public.event_admin_access_v1(region));
CREATE POLICY events_admin_update ON public.events AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(business_id IS NULL AND public.event_admin_access_v1(region))
  WITH CHECK(business_id IS NULL AND public.event_admin_access_v1(region));
CREATE POLICY events_admin_delete ON public.events AS RESTRICTIVE FOR DELETE TO authenticated
  USING(business_id IS NULL AND public.event_admin_access_v1(region));
CREATE POLICY events_public_window ON public.events AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING(business_id IS NULL OR (is_active AND start_at<=now() AND end_at>now()
    AND EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=business_id AND b.is_active AND b.list_visible)));

CREATE FUNCTION public.owner_events_v1(p_actor uuid,p_business uuid,p_command jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  previous public.events;
  draft public.events;
  request_key uuid;
  receipt jsonb;
  prior owner_portal_pilot.commands;
  result jsonb;
BEGIN
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
  IF p_command IS NULL THEN
    RETURN coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC) FROM public.events e
      WHERE e.business_id=p_business),'[]'::jsonb);
  END IF;
  request_key := (p_command->>'key')::uuid;
  IF request_key IS NULL OR coalesce(p_command->>'action','') NOT IN ('save','end') THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid event command';
  END IF;
  receipt := jsonb_build_object('event_business',p_business,'command',p_command);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || request_key::text,0));
  SELECT * INTO prior FROM owner_portal_pilot.commands WHERE actor=p_actor AND key=request_key;
  IF FOUND THEN
    IF prior.command IS DISTINCT FROM receipt THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Request key already used';
    END IF;
    RETURN prior.result;
  END IF;
  IF p_command ? 'id' THEN
    SELECT * INTO previous FROM public.events
      WHERE id=(p_command->>'id')::uuid AND business_id=p_business FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Event outside business scope'; END IF;
    IF previous.updated_at IS DISTINCT FROM (p_command->>'expected')::timestamptz THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Event changed';
    END IF;
  END IF;
  IF p_command->>'action'='end' THEN
    IF previous.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Event required'; END IF;
    UPDATE public.events SET is_active=false,updated_at=clock_timestamp() WHERE id=previous.id;
  ELSE
    draft := jsonb_populate_record(NULL::public.events,p_command->'fields');
    IF length(btrim(coalesce(draft.title,''))) NOT BETWEEN 1 AND 160
      OR length(coalesce(draft.title_en,''))>160 OR length(coalesce(draft.description,''))>3000
      OR length(btrim(coalesce(draft.address,''))) NOT BETWEEN 1 AND 400
      OR draft.start_at IS NULL OR draft.end_at IS NULL OR draft.end_at<=draft.start_at
      OR (draft.image_url IS NOT NULL AND draft.image_url IS DISTINCT FROM previous.image_url
        AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='public-images'
          AND split_part(o.name,'/',2)=p_business::text
          AND o.name ~ '^owner-phase2/[a-f0-9-]+/[a-f0-9-]+[.](jpg|jpeg|png|webp)$'
          AND draft.image_url='https://ydrxuqmjzayejlnjzzew.supabase.co/storage/v1/object/public/public-images/' || o.name)) THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid event fields';
    END IF;
    IF previous.id IS NULL THEN
      INSERT INTO public.events(business_id,title,title_en,description,address,start_at,end_at,image_url,region,is_active,updated_at)
      SELECT p_business,btrim(draft.title),draft.title_en,draft.description,draft.address,draft.start_at,draft.end_at,
        draft.image_url,b.region,true,clock_timestamp() FROM public.businesses b WHERE b.id=p_business
      RETURNING id INTO STRICT previous.id;
    ELSE
      UPDATE public.events SET title=btrim(draft.title),title_en=draft.title_en,description=draft.description,
        address=draft.address,start_at=draft.start_at,end_at=draft.end_at,image_url=draft.image_url,
        updated_at=clock_timestamp() WHERE id=previous.id;
    END IF;
  END IF;
  result := jsonb_build_object('id',previous.id);
  INSERT INTO owner_portal_pilot.commands(actor,key,command,result) VALUES(p_actor,request_key,receipt,result);
  RETURN result;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid event fields';
END $$;
REVOKE ALL ON FUNCTION public.owner_events_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_events_v1(uuid,uuid,jsonb) TO service_role;
COMMIT;
