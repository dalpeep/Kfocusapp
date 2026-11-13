BEGIN;
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public.owner_pilot_special_v2(p_actor uuid, p_business uuid, p_command jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  existing public.business_specials;
  changes public.business_specials;
  request_key uuid;
  receipt owner_portal_pilot.commands;
  result jsonb;
  item jsonb;
BEGIN
  -- Reuse the gallery RPC's active pilot, approved ownership and public scope checks.
  PERFORM public.owner_pilot_gallery_v1(p_actor, p_business);
  IF p_command IS NULL THEN
    RETURN coalesce((SELECT jsonb_agg(to_jsonb(s) || jsonb_build_object('id',s.id::text,'items',coalesce(
      (SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('id',i.id::text) ORDER BY i.sort_order,i.id)
       FROM public.business_special_items i WHERE i.special_id=s.id),'[]'::jsonb))
      ORDER BY s.sort_order,s.id) FROM public.business_specials s WHERE s.business_id=p_business),'[]'::jsonb);
  END IF;
  request_key := (p_command->>'key')::uuid;
  IF request_key IS NULL OR coalesce(p_command->>'action','') NOT IN ('save','end') THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid special command';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || request_key::text,0));
  SELECT * INTO receipt FROM owner_portal_pilot.commands WHERE actor=p_actor AND key=request_key;
  IF FOUND THEN
    IF receipt.command <> (p_command || jsonb_build_object('special_business',p_business)) THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Request key already used';
    END IF;
    RETURN receipt.result;
  END IF;
  IF p_command ? 'id' THEN
    SELECT * INTO existing FROM public.business_specials
    WHERE id=(p_command->>'id')::bigint AND business_id=p_business FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Special is outside business scope'; END IF;
    IF existing.updated_at IS DISTINCT FROM (p_command->>'expected')::timestamptz THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Special changed';
    END IF;
  END IF;

  IF p_command->>'action'='end' THEN
    IF existing.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Special required'; END IF;
    UPDATE public.business_specials SET is_active=false,updated_at=clock_timestamp() WHERE id=existing.id;
  ELSE
    changes := jsonb_populate_record(NULL::public.business_specials,p_command->'fields');
    IF coalesce(changes.type,'') NOT IN ('lunch_special','happy_hour')
       OR length(btrim(coalesce(changes.title,''))) NOT BETWEEN 1 AND 120
       OR length(coalesce(changes.description,'')) > 2000
       OR length(coalesce(changes.price_text,'')) > 80
       OR changes.days_of_week IS NULL OR NOT changes.days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
       OR (changes.start_time IS NULL) <> (changes.end_time IS NULL)
       OR changes.start_time=changes.end_time OR changes.start_date>changes.end_date
       OR (changes.image_url IS NOT NULL AND changes.image_url IS DISTINCT FROM existing.image_url
           AND NOT EXISTS (
             SELECT 1 FROM storage.objects o
             WHERE o.bucket_id='public-images'
               AND split_part(o.name,'/',1)='owner-phase2'
               AND split_part(o.name,'/',2)=p_business::text
               AND o.name ~ '^owner-phase2/[a-f0-9-]+/[a-f0-9-]+[.](jpg|jpeg|png|webp)$'
               AND changes.image_url='https://ydrxuqmjzayejlnjzzew.supabase.co/storage/v1/object/public/public-images/' || o.name
           )) THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid special fields';
    END IF;
    IF existing.id IS NULL THEN
      INSERT INTO public.business_specials
        (business_id,type,title,description,price_text,days_of_week,start_time,end_time,start_date,end_date,image_url,is_active)
      VALUES (p_business,changes.type,btrim(changes.title),changes.description,changes.price_text,
        changes.days_of_week,changes.start_time,changes.end_time,changes.start_date,changes.end_date,changes.image_url,true)
      RETURNING id INTO existing.id;
    ELSE
      UPDATE public.business_specials SET type=changes.type,title=btrim(changes.title),description=changes.description,
        price_text=changes.price_text,days_of_week=changes.days_of_week,start_time=changes.start_time,end_time=changes.end_time,
        start_date=changes.start_date,end_date=changes.end_date,image_url=changes.image_url,
        updated_at=clock_timestamp() WHERE id=existing.id;
    END IF;
  END IF;
  IF p_command->>'action'='save' AND p_command ? 'items' THEN
    IF jsonb_typeof(p_command->'items') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_command->'items') > 50 THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid special items';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_command->'items') LOOP
      IF length(btrim(coalesce(item->>'item_name',''))) NOT BETWEEN 1 AND 160
         OR length(coalesce(item->>'description','')) > 2000
         OR length(coalesce(item->>'price_text','')) > 80 THEN
        RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid special item fields';
      END IF;
      IF item ? 'id' THEN
        UPDATE public.business_special_items
        SET item_name=btrim(item->>'item_name'),description=item->>'description',price_text=item->>'price_text',
            updated_at=clock_timestamp()
        WHERE id=(item->>'id')::bigint AND special_id=existing.id
          AND updated_at IS NOT DISTINCT FROM (item->>'expected')::timestamptz;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Special item changed or unavailable'; END IF;
      ELSE
        INSERT INTO public.business_special_items(special_id,item_name,description,price_text,sort_order)
        VALUES(existing.id,btrim(item->>'item_name'),item->>'description',item->>'price_text',
          coalesce((SELECT max(sort_order)+1 FROM public.business_special_items WHERE special_id=existing.id),0));
      END IF;
    END LOOP;
  END IF;
  result := jsonb_build_object('special_id',existing.id::text);
  INSERT INTO owner_portal_pilot.commands(actor,key,command,result)
  VALUES(p_actor,request_key,p_command || jsonb_build_object('special_business',p_business),result);
  RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid special fields';
END $$;

REVOKE ALL ON FUNCTION public.owner_pilot_special_v2(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_pilot_special_v2(uuid,uuid,jsonb) TO service_role;
COMMIT;
