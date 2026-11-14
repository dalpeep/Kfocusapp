BEGIN;
SET LOCAL lock_timeout='2s';
DROP TRIGGER owner_check_address_coordinates ON public.businesses;
DROP FUNCTION owner_portal_pilot.check_owner_address_coordinates();
DROP TRIGGER owner_publish_core_fields ON owner_portal_pilot.requests;
DROP FUNCTION owner_portal_pilot.publish_owner_core_fields();
CREATE OR REPLACE FUNCTION public.owner_business_hours_v1(p_actor uuid,p_business uuid,p_command jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  stored jsonb;
  changes jsonb := p_command->'days';
  expected jsonb := p_command->'expected';
  entry record;
  field record;
BEGIN
  IF p_command ? 'description' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('daltownmap:owner-phase1',0));
  END IF;
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
  SELECT business_hours INTO STRICT stored FROM public.businesses WHERE id=p_business;
  IF p_command IS NULL THEN RETURN jsonb_build_object('hours',stored); END IF;
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
  RETURN jsonb_build_object('hours',stored);
END $$;
REVOKE ALL ON FUNCTION public.owner_business_hours_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_business_hours_v1(uuid,uuid,jsonb) TO service_role;
COMMIT;
