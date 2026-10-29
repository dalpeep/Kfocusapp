-- REVIEW ONLY. Apply after 09 with separate production approval.
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.coupon_v2_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate V2 approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Project mismatch'; END IF;
 IF to_regprocedure('public.owner_coupon_campaign(jsonb)') IS NULL THEN RAISE EXCEPTION 'V2 base missing'; END IF;
END $$;
CREATE TABLE owner_portal_uuid_internal.coupon_v2_requests(
 request_key uuid PRIMARY KEY, coupon_id uuid NOT NULL REFERENCES public.coupons(id),
 actor uuid, command jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_portal_uuid_internal.coupon_v2_uses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL UNIQUE REFERENCES public.coupon_entries(id),
 coupon_id uuid NOT NULL REFERENCES public.coupons(id),business_id uuid NOT NULL REFERENCES public.businesses(id),
 redemption_id uuid NOT NULL UNIQUE REFERENCES public.coupon_redemptions(id),actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_portal_uuid_internal.coupon_v2_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL UNIQUE,
 entry_id uuid NOT NULL REFERENCES public.coupon_entries(id),use_id uuid UNIQUE REFERENCES owner_portal_uuid_internal.coupon_v2_uses(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','retry','accepted','mocked','review')),
 attempts integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(),last_error_code text,
 lease uuid,locked_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE owner_portal_uuid_internal.coupon_v2_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_uuid_internal.coupon_v2_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_uuid_internal.coupon_v2_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_uuid_internal.coupon_v2_requests,owner_portal_uuid_internal.coupon_v2_uses,owner_portal_uuid_internal.coupon_v2_outbox FROM PUBLIC,anon,authenticated,service_role;
-- Close the old direct terminal-state exception for V2 only.
CREATE OR REPLACE FUNCTION owner_portal_uuid_internal.coupon_entry_protocol_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE old_id text;new_id text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_id:=OLD.coupon_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.coupon_id; END IF;
 IF current_user<>'postgres' AND EXISTS(SELECT 1 FROM public.coupons WHERE id::text IN (old_id,new_id) AND owner_coupon_protocol='v2') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='V2 requires atomic server RPC'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION owner_portal_uuid_internal.coupon_v2_redemption_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE old_id uuid;new_id uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN old_id:=OLD.coupon_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.coupon_id; END IF;
 IF current_user<>'postgres' AND EXISTS(SELECT 1 FROM public.coupons WHERE id IN (old_id,new_id) AND owner_coupon_protocol='v2') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='V2 requires atomic server RPC'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER owner_coupon_v2_redemption_guard BEFORE INSERT OR UPDATE OR DELETE ON public.coupon_redemptions FOR EACH ROW EXECUTE FUNCTION owner_portal_uuid_internal.coupon_v2_redemption_guard();
CREATE FUNCTION public.owner_coupon_v2_command(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.coupons;e public.coupon_entries;u owner_portal_uuid_internal.coupon_v2_uses;o owner_portal_uuid_internal.coupon_v2_outbox;
 previous owner_portal_uuid_internal.coupon_v2_requests; action text:=p_command->>'action'; key uuid;result jsonb;reserved jsonb;rid uuid;
BEGIN
 IF action IS NULL OR action NOT IN ('reserve','list','redeem','notify','claim_notification','finish_notification') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Unsupported V2 action'; END IF;
 -- Match the existing reserve RPC's email-before-coupon lock order.
 IF action='reserve' THEN PERFORM pg_advisory_xact_lock(hashtextextended('coupon-email:'||lower(btrim(p_command->>'email')),0)); END IF;
 SELECT * INTO c FROM public.coupons WHERE id=(p_command->>'coupon_id')::uuid FOR UPDATE;
 IF NOT FOUND OR c.owner_coupon_protocol<>'v2' OR c.delivery_mode<>'instant_email' THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='V2 instant email only'; END IF;
 IF action<>'reserve' AND (p_actor IS NULL OR NOT owner_portal_uuid_internal.content_access(p_actor,c.business_id)) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Approved business permission required'; END IF;
 IF action='list' THEN
  RETURN jsonb_build_object('entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'coupon_code',coupon_code,'created_at',created_at) ORDER BY created_at DESC) FROM (SELECT id,status,coupon_code,created_at FROM public.coupon_entries WHERE coupon_id=c.id::text ORDER BY created_at DESC LIMIT 100) t),'[]'::jsonb));
 END IF;
 IF action IN ('reserve','redeem') THEN
  key:=(p_command->>'key')::uuid;
  IF key IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Request key required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(key::text,0));
  SELECT * INTO previous FROM owner_portal_uuid_internal.coupon_v2_requests WHERE request_key=key;
  IF FOUND THEN
   IF previous.actor IS DISTINCT FROM p_actor OR previous.command<>p_command THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Request key conflict'; END IF;
   RETURN previous.result;
  END IF;
 END IF;
 IF action='reserve' THEN
  IF p_actor IS NOT NULL OR length(coalesce(p_command->>'email',''))>254 OR coalesce(p_command->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Email required'; END IF;
  reserved:=public.owner_coupon_campaign(jsonb_build_object('action','reserve','coupon_id',c.id,'email',lower(btrim(p_command->>'email'))));
  INSERT INTO owner_portal_uuid_internal.coupon_v2_outbox(event_key,entry_id) VALUES('issued/'||(reserved->>'entry_id'),(reserved->>'entry_id')::uuid) ON CONFLICT(event_key) DO NOTHING;
  -- Codes/addresses remain server-side. A repeated unverified email cannot read them.
  result:=jsonb_build_object('received',true,'mail_state','pending');
 ELSIF action='redeem' THEN
  SELECT * INTO e FROM public.coupon_entries WHERE id=(p_command->>'entry_id')::uuid AND coupon_id=c.id::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Entry business mismatch'; END IF;
  SELECT * INTO u FROM owner_portal_uuid_internal.coupon_v2_uses WHERE entry_id=e.id;
  IF FOUND THEN result:=jsonb_build_object('used',true,'existing',true,'use_id',u.id);
  ELSE
   IF e.status<>'coupon_issued' OR NOT c.is_active OR c.start_at>now() OR c.end_at<=now() THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Inactive, expired or already used'; END IF;
   INSERT INTO public.coupon_redemptions(coupon_id,business_id,coupon_title,used_by,status) VALUES(c.id,c.business_id,c.title,'owner','used') RETURNING id INTO rid;
   INSERT INTO owner_portal_uuid_internal.coupon_v2_uses(entry_id,coupon_id,business_id,redemption_id,actor) VALUES(e.id,c.id,c.business_id,rid,p_actor) RETURNING * INTO u;
   UPDATE public.coupon_entries SET status='redeemed',redeemed_at=now(),updated_at=now() WHERE id=e.id;
   UPDATE public.coupons SET used_count=coalesce(used_count,0)+1 WHERE id=c.id;
   INSERT INTO owner_portal_uuid_internal.coupon_v2_outbox(event_key,entry_id,use_id) VALUES('used/'||u.id,e.id,u.id);
   result:=jsonb_build_object('used',true,'existing',false,'use_id',u.id);
  END IF;
 ELSIF action IN ('notify','claim_notification','finish_notification') THEN
  SELECT * INTO u FROM owner_portal_uuid_internal.coupon_v2_uses WHERE id=(p_command->>'use_id')::uuid AND coupon_id=c.id;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.coupon_redemptions WHERE id=u.redemption_id AND coupon_id=c.id AND status='used') THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Committed use record required'; END IF;
  SELECT * INTO o FROM owner_portal_uuid_internal.coupon_v2_outbox WHERE use_id=u.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Outbox missing'; END IF;
  IF action='finish_notification' THEN
   IF o.state<>'sending' OR o.lease IS DISTINCT FROM (p_command->>'lease')::uuid OR o.locked_until<now() THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Notification lease mismatch'; END IF;
   UPDATE owner_portal_uuid_internal.coupon_v2_outbox SET state=CASE WHEN p_command->>'accepted'='true' THEN 'accepted' WHEN attempts>=5 THEN 'review' ELSE 'retry' END,
    lease=NULL,locked_until=NULL,next_at=now()+interval '1 minute',updated_at=now(),
    last_error_code=CASE WHEN p_command->>'accepted'='true' THEN NULL ELSE 'TRANSPORT_FAILED' END WHERE id=o.id;
   RETURN jsonb_build_object('saved',true);
  END IF;
  IF o.state IN ('mocked','accepted') THEN RETURN jsonb_build_object('mock',o.state='mocked','duplicate',true,'claimed',false); END IF;
  IF o.locked_until>now() THEN RETURN jsonb_build_object('claimed',false,'duplicate',true); END IF;
  IF o.state='review' OR o.attempts>=5 OR o.next_at>now() THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Retry not due'; END IF;
  IF action='claim_notification' THEN
   UPDATE owner_portal_uuid_internal.coupon_v2_outbox SET state='sending',attempts=attempts+1,lease=gen_random_uuid(),locked_until=now()+interval '2 minutes',updated_at=now() WHERE id=o.id RETURNING * INTO o;
   -- A transport must honor this stable key on ambiguous provider acknowledgements.
   RETURN jsonb_build_object('claimed',true,'lease',o.lease,'idempotency_key','owner-v2/'||o.event_key,'payload',jsonb_build_object('coupon_id',c.id,'use_id',u.id,'title',c.title,'notify_emails',c.notify_emails));
  END IF;
  -- No provider invocation: this release deliberately supports mock acknowledgement only.
  UPDATE owner_portal_uuid_internal.coupon_v2_outbox SET state='mocked',attempts=attempts+1,updated_at=now() WHERE id=o.id;
  RETURN jsonb_build_object('mock',true,'duplicate',false);
 END IF;
 INSERT INTO owner_portal_uuid_internal.coupon_v2_requests(request_key,coupon_id,actor,command,result) VALUES(key,c.id,p_actor,p_command,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.owner_coupon_v2_command(uuid,jsonb),owner_portal_uuid_internal.coupon_v2_redemption_guard() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_coupon_v2_command(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

