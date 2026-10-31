-- REVIEW ONLY. Add an Owner-only validator, preserve all existing rows/routes.
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.special_validation_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate special validation approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'hseaeafmmjnbynfyynao' THEN RAISE EXCEPTION 'Project mismatch'; END IF;
 IF to_regprocedure('public.owner_content_command(uuid,jsonb)') IS NULL OR to_regprocedure('owner_portal_uuid_internal.content_command_pre_special_validation(uuid,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Prerequisite missing or already installed';END IF;
END $$;
ALTER FUNCTION public.owner_content_command(uuid,jsonb) RENAME TO content_command_pre_special_validation;
ALTER FUNCTION public.content_command_pre_special_validation(uuid,jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.content_command_pre_special_validation(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_content_command(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_data jsonb;effective jsonb;bid uuid:=(p_command->>'business_id')::uuid;d jsonb;
BEGIN
 IF p_command->>'kind'='special' AND p_command->>'action'='save' THEN
  -- Preserve the existing actor -> business lock order, including mixed clients.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  PERFORM 1 FROM public.businesses WHERE id=bid FOR UPDATE;
  IF NOT FOUND OR NOT owner_portal_uuid_internal.content_access(p_actor,bid) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Approved business permission required';END IF;
  IF p_command ? 'record_id' THEN
   SELECT to_jsonb(s) INTO old_data FROM public.business_specials s WHERE id::text=p_command->>'record_id' AND business_id=bid;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Special business mismatch';END IF;
  END IF;
  effective:=coalesce(old_data,'{}'::jsonb)||coalesce(p_command->'changes','{}'::jsonb);
  IF nullif(effective->>'start_date','')::date>nullif(effective->>'end_date','')::date THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Special date range invalid';END IF;
  IF nullif(effective->>'start_time','') IS NULL AND nullif(effective->>'end_time','') IS NOT NULL OR nullif(effective->>'start_time','') IS NOT NULL AND nullif(effective->>'end_time','') IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Both special times required';END IF;
  -- The existing customer renderer supports overnight windows. Preserve them.
  IF nullif(effective->>'start_time','') IS NOT NULL AND ((effective->>'start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' OR (effective->>'end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Special clock time invalid';END IF;
  IF effective ? 'days_of_week' AND effective->'days_of_week'<>'null'::jsonb THEN
   IF jsonb_typeof(effective->'days_of_week')<>'array' OR jsonb_array_length(effective->'days_of_week')>7 THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Special weekdays invalid';END IF;
   FOR d IN SELECT value FROM jsonb_array_elements(effective->'days_of_week') LOOP
    IF jsonb_typeof(d)<>'number' OR d::text !~ '^[0-6]$' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Special weekdays invalid';END IF;
   END LOOP;
  END IF;
 END IF;
 RETURN owner_portal_uuid_internal.content_command_pre_special_validation(p_actor,p_command);
END $$;
REVOKE ALL ON FUNCTION public.owner_content_command(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_content_command(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
