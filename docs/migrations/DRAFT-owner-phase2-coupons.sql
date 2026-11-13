BEGIN;
SET LOCAL lock_timeout = '2s';

-- Keep the existing browser redemption counter write and server campaign writes.
CREATE FUNCTION owner_portal_pilot.guard_coupon_content_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF TG_OP='UPDATE' THEN
      IF (to_jsonb(NEW)-'used_count'-'updated_at')=(to_jsonb(OLD)-'used_count'-'updated_at') THEN
        RETURN NEW;
      END IF;
    END IF;
    IF current_user <> 'authenticated' OR NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()
      AND (p.role='super_admin' OR (
        p.role='regional_editor' AND
        CASE p.area WHEN 'denver' THEN 'colorado' ELSE p.area END =
        CASE WHEN TG_OP='INSERT' THEN NEW.region ELSE OLD.region END
        AND (TG_OP <> 'UPDATE' OR NEW.region IS NOT DISTINCT FROM OLD.region)
      ))
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Coupon content requires administrator or owner service';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION owner_portal_pilot.guard_coupon_content_v1()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER owner_phase2_guard_coupon_content
BEFORE INSERT OR UPDATE OR DELETE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.guard_coupon_content_v1();

CREATE FUNCTION public.owner_pilot_coupon_v1(p_actor uuid,p_business uuid,p_command jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  existing public.coupons;
  fields public.coupons;
  source public.businesses;
  gallery jsonb;
  request_key uuid;
  command_receipt jsonb;
  prior owner_portal_pilot.commands;
  result jsonb;
BEGIN
  gallery := public.owner_pilot_gallery_v1(p_actor,p_business);
  IF p_command IS NULL THEN
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'title',c.title,'description',c.description,'discount_label',c.discount_label,
      'start_at',c.start_at,'end_at',c.end_at,'image_url',c.image_url,'is_active',c.is_active,
      'updated_at',c.updated_at) ORDER BY c.created_at DESC)
      FROM public.coupons c WHERE c.business_id=p_business AND c.delivery_mode='display'
      AND c.business_ids <@ ARRAY[p_business::text]),'[]'::jsonb);
  END IF;
  request_key := (p_command->>'key')::uuid;
  IF request_key IS NULL OR coalesce(p_command->>'action','') NOT IN ('save','end') THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid coupon command';
  END IF;
  command_receipt := jsonb_build_object('coupon_business',p_business,'command',p_command);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || request_key::text,0));
  SELECT * INTO prior FROM owner_portal_pilot.commands WHERE actor=p_actor AND key=request_key;
  IF FOUND THEN
    IF prior.command IS DISTINCT FROM command_receipt THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Request key already used';
    END IF;
    RETURN prior.result;
  END IF;

  IF p_command ? 'id' THEN
    SELECT * INTO existing FROM public.coupons WHERE id=(p_command->>'id')::uuid
      AND business_id=p_business AND delivery_mode='display'
      AND business_ids <@ ARRAY[p_business::text] FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Coupon is outside business scope'; END IF;
    IF existing.updated_at IS DISTINCT FROM (p_command->>'expected')::timestamptz THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Coupon changed';
    END IF;
  END IF;

  IF p_command->>'action'='end' THEN
    IF existing.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Coupon required'; END IF;
    UPDATE public.coupons SET is_active=false,updated_at=clock_timestamp() WHERE id=existing.id;
  ELSE
    fields := jsonb_populate_record(NULL::public.coupons,p_command->'fields');
    IF length(btrim(coalesce(fields.title,''))) NOT BETWEEN 1 AND 160
       OR length(coalesce(fields.description,'')) > 3000
       OR length(btrim(coalesce(fields.discount_label,''))) NOT BETWEEN 1 AND 160
       OR fields.start_at IS NULL OR fields.end_at IS NULL OR fields.start_at >= fields.end_at
       OR (fields.image_url IS NOT NULL AND fields.image_url IS DISTINCT FROM existing.image_url
           AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='public-images'
             AND split_part(o.name,'/',1)='owner-phase2' AND split_part(o.name,'/',2)=p_business::text
             AND o.name ~ '^owner-phase2/[a-f0-9-]+/[a-f0-9-]+[.](jpg|jpeg|png|webp)$'
             AND fields.image_url='https://ydrxuqmjzayejlnjzzew.supabase.co/storage/v1/object/public/public-images/' || o.name)) THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid coupon fields';
    END IF;
    IF existing.id IS NULL THEN
      SELECT * INTO STRICT source FROM public.businesses WHERE id=p_business;
      INSERT INTO public.coupons(business_id,business_ids,area,region,title,description,discount_label,start_at,end_at,image_url,is_active,delivery_mode)
      VALUES(p_business,ARRAY[p_business::text],source.area,source.region,btrim(fields.title),fields.description,
        btrim(fields.discount_label),fields.start_at,fields.end_at,fields.image_url,true,'display')
      RETURNING id INTO existing.id;
    ELSE
      UPDATE public.coupons SET title=btrim(fields.title),description=fields.description,discount_label=btrim(fields.discount_label),
        start_at=fields.start_at,end_at=fields.end_at,image_url=fields.image_url,updated_at=clock_timestamp() WHERE id=existing.id;
    END IF;
  END IF;
  result := jsonb_build_object('coupon_id',existing.id);
  INSERT INTO owner_portal_pilot.commands(actor,key,command,result) VALUES(p_actor,request_key,command_receipt,result);
  RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid coupon fields';
END $$;
REVOKE ALL ON FUNCTION public.owner_pilot_coupon_v1(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_pilot_coupon_v1(uuid,uuid,jsonb) TO service_role;
COMMIT;
