-- Additive protocol boundary; historical campaigns/entries remain Legacy.
-- Apply after 07 only with separately approved operator access.
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.coupon_transition_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate transition approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Production project mismatch'; END IF;
 IF to_regclass('owner_portal_uuid_internal.coupon_plans') IS NULL OR to_regprocedure('owner_portal_uuid_internal.content_command_policy_r1(uuid,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Final policy missing or transition already installed'; END IF;
END $$;
ALTER TABLE public.coupons ADD COLUMN owner_coupon_protocol text NOT NULL DEFAULT 'legacy' CHECK(owner_coupon_protocol IN ('legacy','v2'));
CREATE FUNCTION owner_portal_uuid_internal.coupon_protocol_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user<>'postgres' AND ((TG_OP='INSERT' AND NEW.owner_coupon_protocol<>'legacy') OR (TG_OP='UPDATE' AND NEW.owner_coupon_protocol IS DISTINCT FROM OLD.owner_coupon_protocol)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Campaign protocol is server controlled'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.coupon_protocol_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER owner_coupon_protocol_guard BEFORE INSERT OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION owner_portal_uuid_internal.coupon_protocol_guard();
CREATE FUNCTION owner_portal_uuid_internal.coupon_entry_protocol_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE old_id text;new_id text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_id:=OLD.coupon_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.coupon_id; END IF;
 IF current_user<>'postgres' AND EXISTS(SELECT 1 FROM public.coupons WHERE id::text IN (old_id,new_id) AND owner_coupon_protocol='v2') THEN
  -- Keep the existing authenticated-admin redemption flow. This terminal change
  -- cannot alter codes, recipient, coupon, mail lease/state or issuance fields.
  IF TG_OP='UPDATE' AND OLD.status IN ('coupon_issued','winner') AND NEW.status='redeemed'
   AND (to_jsonb(NEW)-ARRAY['status','redeemed_at','updated_at'])=(to_jsonb(OLD)-ARRAY['status','redeemed_at','updated_at'])
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='V2 entries require the leased campaign RPC';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.coupon_entry_protocol_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER owner_coupon_entry_protocol_guard BEFORE INSERT OR UPDATE OR DELETE ON public.coupon_entries FOR EACH ROW EXECUTE FUNCTION owner_portal_uuid_internal.coupon_entry_protocol_guard();
ALTER FUNCTION public.owner_content_command(uuid,jsonb) RENAME TO content_command_policy_r1;
ALTER FUNCTION public.content_command_policy_r1(uuid,jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.content_command_policy_r1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_content_command(p_actor uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 result:=owner_portal_uuid_internal.content_command_policy_r1(p_actor,p_command);
 IF p_command->>'kind'='coupon' AND p_command->>'action'='save' AND NOT p_command ? 'record_id' THEN
  UPDATE public.coupons SET owner_coupon_protocol='v2' WHERE id::text=result->>'record_id' AND business_id=(p_command->>'business_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'New Owner campaign protocol registration failed'; END IF;
 END IF;
 RETURN result;
END $$;
ALTER FUNCTION public.owner_coupon_campaign(jsonb) RENAME TO campaign_pre_transition;
ALTER FUNCTION public.campaign_pre_transition(jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.campaign_pre_transition(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_coupon_campaign(p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid text;
BEGIN
 IF p_command->>'action'='reserve' THEN cid:=p_command->>'coupon_id';
 ELSE SELECT coupon_id INTO cid FROM public.coupon_entries WHERE id=(p_command->>'entry_id')::uuid; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.coupons WHERE id::text=cid AND owner_coupon_protocol='v2') THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Legacy campaign cannot enter the V2 ledger'; END IF;
 RETURN owner_portal_uuid_internal.campaign_pre_transition(p_command);
END $$;
REVOKE ALL ON FUNCTION public.owner_content_command(uuid,jsonb),public.owner_coupon_campaign(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_content_command(uuid,jsonb),public.owner_coupon_campaign(jsonb) TO service_role;
-- Keep this boundary during STOP/Rollback. Never convert v2 campaigns back to Legacy.
-- Old deployed code can send before DB writes: block ALL unpublished/old URLs
-- before activating v2; triggers alone do not replace edge access protection.
NOTIFY pgrst,'reload schema';
COMMIT;
