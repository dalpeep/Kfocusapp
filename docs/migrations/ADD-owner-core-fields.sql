BEGIN;
SET LOCAL lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.owner_business_hours_v1(p_actor uuid,p_business uuid,p_command jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  stored jsonb;
  business public.businesses;
  details jsonb;
  live jsonb;
  core jsonb := p_command->'core';
  request_result jsonb;
  changes jsonb := p_command->'days';
  expected jsonb := p_command->'expected';
  entry record;
  field record;
BEGIN
  IF p_command ?| ARRAY['description','core'] THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('daltownmap:owner-phase1',0));
  END IF;
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
  SELECT * INTO STRICT business FROM public.businesses WHERE id=p_business;
  stored := business.business_hours;
  live := jsonb_build_object('name_ko',business.name_ko,'name_en',business.name_en,'address',business.address,'phone',business.phone);
  IF p_command IS NULL THEN RETURN jsonb_build_object('hours',stored,'core',live); END IF;
  IF p_command ? 'core' THEN
    IF jsonb_typeof(core) IS DISTINCT FROM 'object' OR core='{}'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid public details';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(core) f
      WHERE NOT (live ? f.key) OR jsonb_typeof(f.value)<>'string'
        OR length(f.value#>>'{}')>500 OR (f.key IN ('address','phone') AND btrim(f.value#>>'{}')='')) THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid public details';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(core) k WHERE live->k IS DISTINCT FROM p_command->'core_expected'->k) THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Public details changed';
    END IF;
    IF coalesce(nullif(btrim((live||core)->>'name_ko'),''),nullif(btrim((live||core)->>'name_en'),'')) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Business name required';
    END IF;
    SELECT b.details INTO STRICT details FROM owner_portal_pilot.businesses b WHERE b.id=p_business;
    SELECT jsonb_object_agg(k,coalesce(details->k,'null'::jsonb)) INTO details FROM jsonb_object_keys(core) k;
    request_result:=public.owner_pilot_command_v1(p_actor,jsonb_build_object('action','submit','kind','core',
      'key',p_command->'core_key','business_id',p_business,'changes',core,
      'baseline',details||jsonb_build_object('public',live,'public_coordinates',jsonb_build_array(business.lat,business.lng)),
      'reason','업주센터 공개 정보 변경'));
  END IF;
  IF jsonb_typeof(changes) IS DISTINCT FROM 'object' OR jsonb_typeof(expected) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid hours';
  END IF;
  IF changes <> '{}'::jsonb AND stored IS NOT NULL AND jsonb_typeof(stored)<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Legacy hours require admin review';
  END IF;
  FOR entry IN SELECT * FROM jsonb_each(changes) LOOP
    IF entry.key NOT IN ('mon','tue','wed','thu','fri','sat','sun')
       OR jsonb_typeof(entry.value) IS DISTINCT FROM 'object' OR entry.value='{}'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid day';
    END IF;
    IF (coalesce(stored->entry.key,'null'::jsonb) IS DISTINCT FROM expected->entry.key
       AND NOT coalesce(stored->entry.key @> entry.value,false))
       OR (stored->entry.key IS NOT NULL AND jsonb_typeof(stored->entry.key)<>'object') THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Hours changed or require review';
    END IF;
    FOR field IN SELECT * FROM jsonb_each(entry.value) LOOP
      IF NOT ((field.key='closed' AND jsonb_typeof(field.value)='boolean')
         OR (field.key IN ('open1','close1','open2','close2') AND jsonb_typeof(field.value)='string'
           AND length(field.value#>>'{}')<=60)) THEN
        RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid hours field';
      END IF;
    END LOOP;
    stored:=jsonb_set(coalesce(stored,'{}'::jsonb),ARRAY[entry.key],
      coalesce(stored->entry.key,'{}'::jsonb)||entry.value,true);
  END LOOP;
  IF p_command ? 'description' THEN
    PERFORM public.owner_pilot_command_v1(p_actor,jsonb_build_object('action','update','key',p_command->'key',
      'business_id',p_business,'changes',jsonb_build_object('description',p_command->'description')));
  END IF;
  IF changes <> '{}'::jsonb THEN
    UPDATE public.businesses SET business_hours=stored WHERE id=p_business;
  END IF;
  RETURN jsonb_build_object('hours',stored,'core',live,'core_submitted',request_result IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.owner_business_hours_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_business_hours_v1(uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION owner_portal_pilot.publish_owner_core_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_business public.businesses;
BEGIN
  IF NEW.kind <> 'core' OR OLD.status <> 'pending' OR NEW.status <> 'approved'
     OR NOT (NEW.baseline ? 'public_coordinates') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO STRICT current_business FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
  IF NEW.changes ? 'address' AND (
    current_business.address IS DISTINCT FROM NEW.changes->>'address'
    OR (jsonb_build_array(current_business.lat,current_business.lng) = NEW.baseline->'public_coordinates'
        AND NEW.baseline->'public'->>'address' IS DISTINCT FROM NEW.changes->>'address')
    OR current_business.lat IS NULL OR current_business.lng IS NULL
    OR current_business.lat NOT BETWEEN -90 AND 90 OR current_business.lng NOT BETWEEN -180 AND 180
    OR (current_business.lat=0 AND current_business.lng=0)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Verify the address and coordinates in the business admin before approval';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW.changes) AS field
    WHERE field.key IN ('name_ko','name_en','phone')
      AND coalesce(to_jsonb(current_business)->field.key,'null'::jsonb) IS DISTINCT FROM NEW.baseline->'public'->field.key
      AND to_jsonb(current_business)->field.key IS DISTINCT FROM field.value) THEN
    RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Public details changed';
  END IF;
  IF NEW.changes ?| ARRAY['name_ko','name_en','phone'] THEN
    UPDATE public.businesses SET
      name_ko=CASE WHEN NEW.changes ? 'name_ko' THEN NEW.changes->>'name_ko' ELSE name_ko END,
      name_en=CASE WHEN NEW.changes ? 'name_en' THEN NEW.changes->>'name_en' ELSE name_en END,
      phone=CASE WHEN NEW.changes ? 'phone' THEN NEW.changes->>'phone' ELSE phone END
    WHERE id=NEW.business_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION owner_portal_pilot.publish_owner_core_fields() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER owner_publish_core_fields BEFORE UPDATE OF status ON owner_portal_pilot.requests
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.publish_owner_core_fields();
CREATE FUNCTION owner_portal_pilot.check_owner_address_coordinates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.address IS DISTINCT FROM OLD.address AND EXISTS (
    SELECT 1 FROM owner_portal_pilot.requests r WHERE r.business_id=NEW.id
      AND r.kind='core' AND r.status='pending' AND r.baseline ? 'public_coordinates'
      AND r.changes->>'address'=NEW.address
  ) AND (
    (NEW.lat,NEW.lng) IS NOT DISTINCT FROM (OLD.lat,OLD.lng)
    OR NEW.lat IS NULL OR NEW.lng IS NULL
    OR NEW.lat NOT BETWEEN -90 AND 90 OR NEW.lng NOT BETWEEN -180 AND 180
    OR (abs(NEW.lat)<0.0001 AND abs(NEW.lng)<0.0001)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Verify coordinates before publishing the owner address';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION owner_portal_pilot.check_owner_address_coordinates() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER owner_check_address_coordinates BEFORE UPDATE OF address ON public.businesses
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.check_owner_address_coordinates();
COMMIT;
