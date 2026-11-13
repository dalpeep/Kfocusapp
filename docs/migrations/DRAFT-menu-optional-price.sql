BEGIN;
SET LOCAL lock_timeout='2s';
ALTER TABLE public.business_menu_items ALTER COLUMN price_cents DROP NOT NULL;
CREATE OR REPLACE FUNCTION public.owner_menu_v1(p_actor uuid,p_business uuid,p_command jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  previous public.business_menu_items;
  draft public.business_menu_items;
  request_key uuid;
  receipt jsonb;
  prior owner_portal_pilot.commands;
  result jsonb;
BEGIN
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
  IF p_command IS NULL THEN
    RETURN coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sort_order,e.id) FROM public.business_menu_items e
      WHERE e.business_id=p_business),'[]'::jsonb);
  END IF;
  request_key := (p_command->>'key')::uuid;
  IF request_key IS NULL OR coalesce(p_command->>'action','') NOT IN ('save','end') THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid menu command';
  END IF;
  receipt := jsonb_build_object('menu_business',p_business,'command',p_command);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || request_key::text,0));
  SELECT * INTO prior FROM owner_portal_pilot.commands WHERE actor=p_actor AND key=request_key;
  IF FOUND THEN
    IF prior.command IS DISTINCT FROM receipt THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Request key already used';
    END IF;
    RETURN prior.result;
  END IF;
  IF p_command ? 'id' THEN
    SELECT * INTO previous FROM public.business_menu_items
      WHERE id=(p_command->>'id')::uuid AND business_id=p_business FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Menu item outside business scope'; END IF;
    IF previous.updated_at IS DISTINCT FROM (p_command->>'expected')::timestamptz THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Menu item changed';
    END IF;
  END IF;
  IF p_command->>'action'='end' THEN
    IF previous.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Menu item required'; END IF;
    UPDATE public.business_menu_items SET is_active=false,updated_at=clock_timestamp() WHERE id=previous.id;
  ELSE
    draft := jsonb_populate_record(NULL::public.business_menu_items,p_command->'fields');
    IF length(btrim(coalesce(draft.title,''))) NOT BETWEEN 1 AND 160
      OR length(coalesce(draft.title_en,''))>160 OR length(coalesce(draft.description,''))>3000
      OR draft.price_cents NOT BETWEEN 0 AND 100000000
      OR draft.sort_order IS NULL OR draft.sort_order NOT BETWEEN 0 AND 100000
      OR draft.sold_out IS NULL OR draft.is_active IS NULL
      OR (draft.image_url IS NOT NULL AND draft.image_url IS DISTINCT FROM previous.image_url
        AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='public-images'
          AND split_part(o.name,'/',2)=p_business::text
          AND o.name ~ '^owner-phase2/[a-f0-9-]+/[a-f0-9-]+[.](jpg|jpeg|png|webp)$'
          AND draft.image_url='https://ydrxuqmjzayejlnjzzew.supabase.co/storage/v1/object/public/public-images/' || o.name)) THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid menu fields';
    END IF;
    IF previous.id IS NULL THEN
      INSERT INTO public.business_menu_items(business_id,title,title_en,description,price_cents,sort_order,sold_out,is_active,image_url)
      VALUES(p_business,btrim(draft.title),draft.title_en,draft.description,draft.price_cents,draft.sort_order,
        draft.sold_out,draft.is_active,draft.image_url)
      RETURNING id INTO STRICT previous.id;
    ELSE
      UPDATE public.business_menu_items SET title=btrim(draft.title),title_en=draft.title_en,description=draft.description,
        price_cents=draft.price_cents,sort_order=draft.sort_order,sold_out=draft.sold_out,
        is_active=draft.is_active,image_url=draft.image_url,
        updated_at=clock_timestamp() WHERE id=previous.id;
    END IF;
  END IF;
  result := jsonb_build_object('id',previous.id);
  INSERT INTO owner_portal_pilot.commands(actor,key,command,result) VALUES(p_actor,request_key,receipt,result);
  RETURN result;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid menu fields';
END $$;
COMMIT;
