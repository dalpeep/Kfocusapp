-- Review only. Apply after01..08 with separate operational approval.
-- Owner-only policy hardening; does not change Legacy raffle or existing records.
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.owner_open_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate Owner open SQL approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Production target mismatch'; END IF;
 IF to_regprocedure('public.owner_content_command(uuid,jsonb)') IS NULL OR to_regprocedure('owner_portal_uuid_internal.content_command_preopen(uuid,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Prerequisite missing or already installed'; END IF;
END $$;
ALTER FUNCTION public.owner_feature_policy(uuid,uuid) RENAME TO feature_policy_preopen;
ALTER FUNCTION public.feature_policy_preopen(uuid,uuid) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.feature_policy_preopen(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_feature_policy(p_actor uuid,p_business uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT owner_portal_uuid_internal.feature_policy_preopen(p_actor,p_business)||jsonb_build_object('raffle',false);
$$;
REVOKE ALL ON FUNCTION public.owner_feature_policy(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_feature_policy(uuid,uuid) TO service_role;
ALTER FUNCTION public.owner_content_command(uuid,jsonb) RENAME TO content_command_preopen;
ALTER FUNCTION public.content_command_preopen(uuid,jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.content_command_preopen(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_content_command(p_actor uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_command->>'kind'='coupon' AND ((p_command->'changes'->>'delivery_mode')='raffle'
 OR coalesce(p_command->'changes','{}'::jsonb) ?| ARRAY['raffle_end_at','raffle_draw_mode','winner_count']
 OR EXISTS(SELECT 1 FROM public.coupons WHERE id::text=p_command->>'record_id' AND business_id=(p_command->>'business_id')::uuid AND delivery_mode='raffle')) THEN
 RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Owner raffle is disabled'; END IF;
 RETURN owner_portal_uuid_internal.content_command_preopen(p_actor,p_command);
END $$;
REVOKE ALL ON FUNCTION public.owner_content_command(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_content_command(uuid,jsonb) TO service_role;
ALTER FUNCTION public.owner_account_command(uuid,jsonb) RENAME TO account_command_preopen;
ALTER FUNCTION public.account_command_preopen(uuid,jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.account_command_preopen(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_account_command(p_actor uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bid uuid;request_key uuid;previous owner_portal_uuid_internal.commands;result jsonb;desired text;enabled boolean;why text;
BEGIN
 IF p_command->>'action'='plan_read' THEN
  IF jsonb_typeof(p_command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k<>ALL(ARRAY['action','business_id'])) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Plan read invalid';END IF;
  bid:=(p_command->>'business_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp())) OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=bid AND public.owner_uuid_admin_region(p_actor,region)) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Trusted regional admin required';END IF;
  RETURN (SELECT jsonb_build_object('business_id',b.id::text,'tier',coalesce(p.tier,'free'),'paid_enabled',coalesce(p.paid_enabled,false)) FROM public.businesses b LEFT JOIN owner_portal_uuid_internal.coupon_plans p ON p.business_id=b.id WHERE b.id=bid);
 END IF;
 IF p_command->>'action' IS DISTINCT FROM 'plan' THEN RETURN owner_portal_uuid_internal.account_command_preopen(p_actor,p_command); END IF;
 IF jsonb_typeof(p_command)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k<>ALL(ARRAY['action','key','business_id','tier','enabled','reason'])) OR jsonb_typeof(p_command->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Plan command invalid'; END IF;
 bid:=(p_command->>'business_id')::uuid;request_key:=(p_command->>'key')::uuid;desired:=p_command->>'tier';enabled:=(p_command->>'enabled')::boolean;why:=btrim(p_command->>'reason');
 IF bid IS NULL OR request_key IS NULL OR desired IS NULL OR desired NOT IN ('free','paid') OR why IS NULL OR length(why) NOT BETWEEN 1 AND 1000 OR (desired='free' AND enabled) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Plan command invalid'; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=p_actor FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp())) OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=bid AND public.owner_uuid_admin_region(p_actor,region)) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Trusted regional admin required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||request_key::text,0));
 SELECT * INTO previous FROM owner_portal_uuid_internal.commands WHERE actor=p_actor AND key=request_key;
 IF FOUND THEN IF previous.command<>p_command THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Idempotency conflict'; END IF;RETURN previous.result;END IF;
 PERFORM public.owner_plan_change(p_actor,bid,desired,enabled,why);
 result:=jsonb_build_object('business_id',bid::text,'tier',desired,'paid_enabled',enabled);
 INSERT INTO owner_portal_uuid_internal.commands(actor,key,command,result) VALUES(p_actor,request_key,p_command,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.owner_account_command(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_account_command(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
