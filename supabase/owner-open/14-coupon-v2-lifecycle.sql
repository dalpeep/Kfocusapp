-- REVIEW ONLY. Never apply to shared QA/production without separate approval.
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.coupon_lifecycle_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate coupon lifecycle approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'hseaeafmmjnbynfyynao' THEN RAISE EXCEPTION 'Project mismatch'; END IF;
 IF to_regprocedure('public.owner_coupon_v2_command(uuid,jsonb)') IS NULL OR to_regclass('owner_portal_uuid_internal.notification_outbox') IS NULL THEN RAISE EXCEPTION 'V2/notification prerequisites required'; END IF;
END $$;
CREATE TABLE owner_portal_uuid_internal.coupon_v2_cancellations(
 entry_id uuid PRIMARY KEY REFERENCES public.coupon_entries(id),
 coupon_id uuid NOT NULL REFERENCES public.coupons(id),
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 actor uuid NOT NULL REFERENCES auth.users(id),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE owner_portal_uuid_internal.coupon_v2_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_uuid_internal.coupon_v2_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_coupon_v2_lifecycle(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.coupons;e public.coupon_entries;old owner_portal_uuid_internal.coupon_v2_requests;cancel owner_portal_uuid_internal.coupon_v2_cancellations;
 key uuid;why text;result jsonb;page_offset integer;page_limit integer;
BEGIN
 IF p_actor IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'action' IS NULL OR p_command->>'action' NOT IN ('list','cancel') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Lifecycle action required';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k<>ALL(ARRAY['action','coupon_id','entry_id','key','reason','offset','limit'])) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Unknown lifecycle field'; END IF;
 SELECT * INTO c FROM public.coupons WHERE id=(p_command->>'coupon_id')::uuid FOR UPDATE;
 IF NOT FOUND OR c.owner_coupon_protocol IS DISTINCT FROM 'v2' OR c.delivery_mode IS DISTINCT FROM 'instant_email' OR NOT owner_portal_uuid_internal.content_access(p_actor,c.business_id) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Approved V2 business permission required';END IF;
 IF p_command->>'action'='list' THEN
  IF p_command ?| ARRAY['key','entry_id','reason'] THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Invalid list fields';END IF;
  page_offset:=coalesce((p_command->>'offset')::integer,0);page_limit:=coalesce((p_command->>'limit')::integer,50);
  IF page_offset<0 OR page_offset>100000 OR page_limit<1 OR page_limit>100 THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Invalid pagination';END IF;
  RETURN jsonb_build_object('cancellation_enabled',true,'offset',page_offset,'limit',page_limit,'has_more',(SELECT count(*)>page_offset+page_limit FROM public.coupon_entries WHERE coupon_id=c.id::text),
   'entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'coupon_code',t.coupon_code,'created_at',t.created_at,'use_id',u.id,'used_at',u.created_at,'cancelled_at',x.created_at,'cancel_reason',x.reason,'can_use',t.status='coupon_issued' AND c.is_active AND coalesce(c.start_at,'-infinity')<=now() AND coalesce(c.end_at,'infinity')>now()) ORDER BY t.created_at DESC,t.id DESC)
    FROM (SELECT * FROM public.coupon_entries WHERE coupon_id=c.id::text ORDER BY created_at DESC,id DESC OFFSET page_offset LIMIT page_limit) t
    LEFT JOIN owner_portal_uuid_internal.coupon_v2_uses u ON u.entry_id=t.id LEFT JOIN owner_portal_uuid_internal.coupon_v2_cancellations x ON x.entry_id=t.id),'[]'::jsonb));
 END IF;
 IF p_command ?| ARRAY['offset','limit'] THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Invalid cancel fields';END IF;
 key:=(p_command->>'key')::uuid;why:=btrim(p_command->>'reason');
 IF key IS NULL OR why IS NULL OR length(why) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Cancellation key and reason required';END IF;
 -- Same coupon -> request key -> entry order as existing V2 redemption.
 PERFORM pg_advisory_xact_lock(hashtextextended(key::text,0));
 SELECT * INTO old FROM owner_portal_uuid_internal.coupon_v2_requests WHERE request_key=key;
 IF FOUND THEN IF old.actor IS DISTINCT FROM p_actor OR old.command<>p_command THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Request key conflict';END IF;RETURN old.result;END IF;
 SELECT * INTO e FROM public.coupon_entries WHERE id=(p_command->>'entry_id')::uuid AND coupon_id=c.id::text FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Entry business mismatch';END IF;
 SELECT * INTO cancel FROM owner_portal_uuid_internal.coupon_v2_cancellations WHERE entry_id=e.id;
 IF FOUND THEN result:=jsonb_build_object('cancelled',true,'existing',true,'entry_id',e.id);
 ELSE
  IF e.status IS DISTINCT FROM 'coupon_issued' OR EXISTS(SELECT 1 FROM owner_portal_uuid_internal.coupon_v2_uses WHERE entry_id=e.id) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Only unused issued coupons can be cancelled';END IF;
  -- Do not race an in-flight/uncertain external delivery. Accepted history stays.
  PERFORM 1 FROM owner_portal_uuid_internal.notification_outbox WHERE kind='coupon_issued' AND source_id=e.id::text ORDER BY id FOR UPDATE;
  IF e.mail_state='sending' OR EXISTS(SELECT 1 FROM owner_portal_uuid_internal.notification_outbox WHERE kind='coupon_issued' AND source_id=e.id::text AND state='sending') THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Issuance delivery in progress; review before cancellation';END IF;
  INSERT INTO owner_portal_uuid_internal.coupon_v2_cancellations(entry_id,coupon_id,business_id,actor,reason) VALUES(e.id,c.id,c.business_id,p_actor,why);
  UPDATE public.coupon_entries SET status='cancelled',updated_at=now() WHERE id=e.id;
  UPDATE owner_portal_uuid_internal.notification_outbox SET state='review',last_error='COUPON_CANCELLED',lease=NULL,locked_until=NULL WHERE kind='coupon_issued' AND source_id=e.id::text AND state IN ('pending','retry');
  UPDATE owner_portal_uuid_internal.coupon_v2_outbox SET state='review',last_error_code='COUPON_CANCELLED',lease=NULL,locked_until=NULL,updated_at=now() WHERE entry_id=e.id AND use_id IS NULL AND state IN ('pending','retry');
  result:=jsonb_build_object('cancelled',true,'existing',false,'entry_id',e.id);
 END IF;
 INSERT INTO owner_portal_uuid_internal.coupon_v2_requests(request_key,coupon_id,actor,command,result) VALUES(key,c.id,p_actor,p_command,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.owner_coupon_v2_lifecycle(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_coupon_v2_lifecycle(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
