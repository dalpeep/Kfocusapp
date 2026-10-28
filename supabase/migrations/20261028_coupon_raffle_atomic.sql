-- PREPARE ONLY. Separate production SQL approval required.
-- No legacy rows are deleted, rewritten, or backfilled.
BEGIN;
CREATE SCHEMA coupon_raffle_internal;
REVOKE ALL ON SCHEMA coupon_raffle_internal FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE coupon_raffle_internal.requests (
 coupon_id uuid NOT NULL REFERENCES public.coupons(id), request_key text NOT NULL,
 fingerprint jsonb NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(coupon_id,request_key)
);
CREATE TABLE coupon_raffle_internal.outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coupon_id uuid NOT NULL REFERENCES public.coupons(id),
 entry_id uuid NOT NULL REFERENCES public.coupon_entries(id), request_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('winner','resend')),
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','unknown')),
 claim_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, provider_id text, failure_code text, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(entry_id,kind,request_key)
);
CREATE UNIQUE INDEX raffle_one_initial_notification ON coupon_raffle_internal.outbox(entry_id) WHERE kind='winner';
ALTER TABLE coupon_raffle_internal.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_raffle_internal.outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA coupon_raffle_internal FROM PUBLIC,anon,authenticated,service_role;


CREATE TABLE coupon_raffle_internal.notification_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, notification_id uuid NOT NULL REFERENCES coupon_raffle_internal.outbox(id),
 from_status text,to_status text NOT NULL,code text,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coupon_raffle_internal.notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON coupon_raffle_internal.notification_events FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION coupon_raffle_internal.audit_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO coupon_raffle_internal.notification_events(notification_id,from_status,to_status,code)
 VALUES(NEW.id,CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END,NEW.status,NEW.failure_code);
 RETURN NEW;
END $$;
CREATE TRIGGER raffle_mail_audit AFTER INSERT OR UPDATE OF status ON coupon_raffle_internal.outbox FOR EACH ROW EXECUTE FUNCTION coupon_raffle_internal.audit_notification();

CREATE FUNCTION coupon_raffle_internal.require_read_committed() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Raffle mutations require READ COMMITTED isolation' USING ERRCODE='0A000';
 END IF;
END $$;

CREATE FUNCTION coupon_raffle_internal.awarded_ids(p_coupon uuid) RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN QUERY SELECT e.id FROM public.coupon_entries e
 WHERE e.coupon_id=p_coupon::text AND e.status IN ('winner','redeemed');
 IF to_regclass('public.event_draw_winners') IS NOT NULL THEN
  RETURN QUERY EXECUTE 'SELECT entry_id FROM public.event_draw_winners WHERE event_id=$1 AND status=''winner''' USING p_coupon;
 END IF;
END $$;

CREATE FUNCTION coupon_raffle_internal.event_entry_used(p_coupon uuid,p_entry uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE used boolean:=false;
BEGIN
 IF to_regclass('public.event_draw_winners') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.event_draw_winners WHERE event_id=$1 AND entry_id=$2)' INTO used USING p_coupon,p_entry;
 END IF;
 RETURN used;
END $$;

CREATE FUNCTION coupon_raffle_internal.capacity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.coupons%rowtype; cid uuid; eid uuid; n integer; cap integer; qualifying boolean;
BEGIN
 IF TG_TABLE_NAME='coupon_entries' THEN
  qualifying:=NEW.status IN ('winner','redeemed'); IF NOT qualifying THEN RETURN NEW; END IF; cid:=NEW.coupon_id::uuid; eid:=NEW.id;
  IF TG_OP='UPDATE' AND OLD.status IN ('winner','redeemed') AND NEW.coupon_id=OLD.coupon_id THEN
   IF NEW.status='winner' THEN
    RAISE EXCEPTION 'Existing award cannot be issued twice' USING ERRCODE='23505';
   END IF;
   RETURN NEW;
  END IF;
 ELSE
  qualifying:=NEW.status='winner'; cid:=NEW.event_id; eid:=NEW.entry_id;
  IF TG_OP='UPDATE' AND OLD.status='winner' AND NEW.event_id=OLD.event_id AND NEW.entry_id=OLD.entry_id THEN RETURN NEW; END IF;
 END IF;
 IF NOT qualifying THEN RETURN NEW; END IF;
 PERFORM coupon_raffle_internal.require_read_committed();
 SELECT * INTO c FROM public.coupons WHERE id=cid FOR UPDATE;
 IF c.id IS NULL OR c.delivery_mode<>'raffle' THEN RETURN NEW; END IF;
 cap:=greatest(1,least(500,coalesce(nullif(c.winner_count,0),1)));
 SELECT count(DISTINCT x) INTO n FROM coupon_raffle_internal.awarded_ids(cid) x;
 IF EXISTS(SELECT 1 FROM coupon_raffle_internal.awarded_ids(cid) x WHERE x=eid) THEN
  RAISE EXCEPTION 'Entry already awarded' USING ERRCODE='23505';
 END IF;
 IF n>=cap THEN RAISE EXCEPTION 'Raffle capacity reached' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coupon_raffle_capacity_guard BEFORE INSERT OR UPDATE OF status,coupon_id,coupon_code,won_at
ON public.coupon_entries FOR EACH ROW EXECUTE FUNCTION coupon_raffle_internal.capacity_guard();
DO $$ BEGIN
 IF to_regclass('public.event_draw_winners') IS NOT NULL THEN
  EXECUTE 'CREATE TRIGGER event_raffle_capacity_guard BEFORE INSERT OR UPDATE OF status,event_id,entry_id ON public.event_draw_winners FOR EACH ROW EXECUTE FUNCTION coupon_raffle_internal.capacity_guard()';
 END IF;
END $$;

CREATE FUNCTION public.coupon_raffle_draw_v1(p_coupon_id uuid,p_request_key text,p_kind text DEFAULT 'manual',p_count integer DEFAULT NULL,p_entry_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.coupons%rowtype; prior coupon_raffle_internal.requests%rowtype; fp jsonb; r public.coupon_entries%rowtype;
 cap integer; already integer; wanted integer; winners jsonb:='[]'; v_result jsonb; cc text;
BEGIN
 IF p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 8 AND 160 OR p_kind NOT IN ('auto','manual','designate') OR (p_count IS NOT NULL AND p_count NOT BETWEEN 1 AND 500) THEN
  RAISE EXCEPTION 'Invalid draw request' USING ERRCODE='22023'; END IF;
 PERFORM coupon_raffle_internal.require_read_committed();
 fp:=jsonb_build_object('kind',p_kind,'count',p_count,'ids',coalesce((SELECT jsonb_agg(x ORDER BY x) FROM (SELECT DISTINCT unnest(p_entry_ids) x) q),'[]'));
 SELECT * INTO c FROM public.coupons WHERE id=p_coupon_id FOR UPDATE;
 IF c.id IS NULL OR c.delivery_mode<>'raffle' THEN RAISE EXCEPTION 'Raffle not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM coupon_raffle_internal.requests WHERE coupon_id=p_coupon_id AND request_key=p_request_key;
 IF FOUND THEN
  IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'Request key conflict' USING ERRCODE='22023'; END IF;
  RETURN prior.result;
 END IF;
 IF p_kind='auto' AND (c.is_active IS NOT TRUE OR coalesce(c.raffle_draw_mode,'manual')<>'auto' OR c.raffle_end_at IS NULL OR c.raffle_end_at>now()) THEN
  RAISE EXCEPTION 'Automatic draw is not due' USING ERRCODE='22023'; END IF;
 IF p_kind='designate' AND coalesce(cardinality(p_entry_ids),0)=0 THEN RAISE EXCEPTION 'Entries required' USING ERRCODE='22023'; END IF;
 cap:=greatest(1,least(500,coalesce(nullif(c.winner_count,0),1)));
 SELECT count(DISTINCT x) INTO already FROM coupon_raffle_internal.awarded_ids(p_coupon_id) x;
 wanted:=least(greatest(0,cap-already),coalesce(p_count,cap));
 INSERT INTO coupon_raffle_internal.requests(coupon_id,request_key,fingerprint) VALUES(p_coupon_id,p_request_key,fp);
 FOR r IN SELECT e.* FROM public.coupon_entries e
  WHERE e.coupon_id=p_coupon_id::text AND e.status='entered'
  AND (p_kind<>'designate' OR e.id=ANY(p_entry_ids))
  AND NOT EXISTS(SELECT 1 FROM coupon_raffle_internal.awarded_ids(p_coupon_id) a WHERE a=e.id)
  AND NOT EXISTS(SELECT 1 FROM coupon_raffle_internal.outbox o WHERE o.entry_id=e.id AND o.kind='winner')
  AND NOT coupon_raffle_internal.event_entry_used(p_coupon_id,e.id)
  ORDER BY random() LIMIT wanted FOR UPDATE
 LOOP
  cc:=coalesce(nullif(r.coupon_code,''),'WIN-'||(SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',get_byte(uuid_send(gen_random_uuid()),0)%32+1,1),'') FROM generate_series(1,8)));
  UPDATE public.coupon_entries SET status='winner',coupon_code=cc,won_at=now(),issued_at=now(),updated_at=now() WHERE id=r.id RETURNING * INTO r;
  INSERT INTO coupon_raffle_internal.outbox(coupon_id,entry_id,request_key,kind,payload)
  VALUES(p_coupon_id,r.id,p_request_key,'winner',jsonb_build_object('entry',to_jsonb(r),'coupon',to_jsonb(c)));
  winners:=winners||jsonb_build_array(to_jsonb(r));
 END LOOP;
 v_result:=jsonb_build_object('ok',true,'selected',jsonb_array_length(winners),'winners',winners,'already',already,'target',cap,'remaining_after',greatest(0,cap-already-jsonb_array_length(winners)));
 UPDATE coupon_raffle_internal.requests q SET result=v_result WHERE q.coupon_id=p_coupon_id AND q.request_key=p_request_key;
 RETURN v_result;
END $$;

CREATE FUNCTION public.coupon_raffle_resend_v1(p_entry_id uuid,p_request_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public.coupon_entries%rowtype; c public.coupons%rowtype; oid uuid;
BEGIN
 IF length(coalesce(p_request_key,'')) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'Invalid resend key' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM public.coupon_entries WHERE id=p_entry_id;
 SELECT * INTO c FROM public.coupons WHERE id=e.coupon_id::uuid FOR UPDATE;
 IF c.id IS NULL OR c.delivery_mode<>'raffle' OR e.status NOT IN ('winner','redeemed') THEN RAISE EXCEPTION 'Award required' USING ERRCODE='22023'; END IF;
 SELECT id INTO oid FROM coupon_raffle_internal.outbox WHERE entry_id=e.id AND kind='resend' AND request_key=p_request_key;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'notification_id',oid); END IF;
 IF e.emailed_at IS NULL AND NOT EXISTS(SELECT 1 FROM coupon_raffle_internal.outbox WHERE entry_id=e.id AND kind='winner') THEN
  RAISE EXCEPTION 'Legacy delivery requires provider reconciliation' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM coupon_raffle_internal.outbox WHERE entry_id=e.id AND status IN ('queued','sending','failed','unknown')) THEN
  RAISE EXCEPTION 'Reconcile pending delivery before resend' USING ERRCODE='55000'; END IF;
 INSERT INTO coupon_raffle_internal.outbox(coupon_id,entry_id,request_key,kind,payload)
 VALUES(c.id,e.id,p_request_key,'resend',jsonb_build_object('entry',to_jsonb(e),'coupon',to_jsonb(c))) RETURNING id INTO oid;
 RETURN jsonb_build_object('ok',true,'notification_id',oid);
END $$;

CREATE FUNCTION public.coupon_raffle_mail_claim_v1(p_coupon_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o coupon_raffle_internal.outbox%rowtype; token uuid:=gen_random_uuid();
BEGIN
 UPDATE coupon_raffle_internal.outbox SET status='unknown',failure_code='LEASE_EXPIRED' WHERE status='sending' AND lease_until<now() AND (p_coupon_id IS NULL OR coupon_id=p_coupon_id);
 UPDATE coupon_raffle_internal.outbox SET status='unknown',failure_code='IDEMPOTENCY_WINDOW_EXPIRED' WHERE status IN ('queued','failed') AND created_at<now()-interval '23 hours' AND (p_coupon_id IS NULL OR coupon_id=p_coupon_id);
 SELECT * INTO o FROM coupon_raffle_internal.outbox WHERE status IN ('queued','failed') AND next_attempt_at<=now() AND attempts<5 AND created_at>=now()-interval '23 hours' AND (p_coupon_id IS NULL OR coupon_id=p_coupon_id)
 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE coupon_raffle_internal.outbox SET status='sending',claim_token=token,lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE id=o.id;
 RETURN jsonb_build_object('id',o.id,'token',token,'kind',o.kind,'payload',o.payload,'idempotency_key','daltown-raffle-'||o.id::text);
END $$;
CREATE FUNCTION public.coupon_raffle_mail_finish_v1(p_id uuid,p_token uuid,p_status text,p_provider_id text DEFAULT NULL,p_failure_code text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o coupon_raffle_internal.outbox%rowtype;
BEGIN
 IF p_status NOT IN ('sent','failed','unknown') THEN RAISE EXCEPTION 'Invalid finish status' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM coupon_raffle_internal.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR o.claim_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 IF o.status=p_status THEN RETURN true; END IF;
 IF o.status<>'sending' THEN RETURN false; END IF;
 UPDATE coupon_raffle_internal.outbox SET status=p_status,provider_id=left(p_provider_id,200),failure_code=left(p_failure_code,80),next_attempt_at=now()+make_interval(secs=>least(3600,60*(2^least(o.attempts,5))::integer)),sent_at=CASE WHEN p_status='sent' THEN now() ELSE NULL END WHERE id=p_id;
 IF p_status='sent' THEN UPDATE public.coupon_entries SET emailed_at=coalesce(emailed_at,now()),updated_at=now() WHERE id=o.entry_id; END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.coupon_raffle_event_draw_v1(p_event_id uuid,p_count integer,p_admin_id uuid,p_kind text,p_request_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior coupon_raffle_internal.requests%rowtype; fp jsonb; v_result jsonb;
BEGIN
 IF length(coalesce(p_request_key,'')) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'Request key required' USING ERRCODE='22023'; END IF;
 PERFORM coupon_raffle_internal.require_read_committed();
 PERFORM 1 FROM public.coupons WHERE id=p_event_id FOR UPDATE;
 fp:=jsonb_build_object('kind','event-'||p_kind,'count',p_count,'admin',p_admin_id);
 SELECT * INTO prior FROM coupon_raffle_internal.requests WHERE coupon_id=p_event_id AND request_key=p_request_key;
 IF FOUND THEN
  IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'Request key conflict' USING ERRCODE='22023'; END IF;
  RETURN prior.result;
 END IF;
 -- Existing RPC keeps initial/redraw/cancellation eligibility policies.
 SELECT to_jsonb(d) INTO v_result FROM public.event_draw_run(p_event_id,p_count,p_admin_id,p_kind) d;
 INSERT INTO coupon_raffle_internal.requests(coupon_id,request_key,fingerprint,result) VALUES(p_event_id,p_request_key,fp,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.coupon_raffle_event_draw_v1(uuid,integer,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_raffle_event_draw_v1(uuid,integer,uuid,text,text) TO service_role;


CREATE FUNCTION public.coupon_raffle_mail_reconcile_v1(p_id uuid,p_confirmed_status text,p_provider_id text,p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o coupon_raffle_internal.outbox%rowtype;
BEGIN
 SELECT * INTO o FROM coupon_raffle_internal.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR o.status<>'unknown' THEN RETURN false; END IF;
 IF p_confirmed_status='sent' AND nullif(p_provider_id,'') IS NOT NULL AND p_reason='provider_confirmed_accepted' THEN
  UPDATE coupon_raffle_internal.outbox SET status='sent',provider_id=left(p_provider_id,200),sent_at=now(),failure_code='RECONCILED_ACCEPTED' WHERE id=p_id;
  UPDATE public.coupon_entries SET emailed_at=coalesce(emailed_at,now()),updated_at=now() WHERE id=o.entry_id;
 ELSIF p_confirmed_status='failed' AND p_reason='provider_confirmed_not_accepted' THEN
  UPDATE coupon_raffle_internal.outbox SET status='failed',next_attempt_at=now(),failure_code='RECONCILED_NOT_ACCEPTED' WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Provider confirmation required' USING ERRCODE='22023'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.coupon_raffle_mail_reconcile_v1(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_raffle_mail_reconcile_v1(uuid,text,text,text) TO service_role;


CREATE FUNCTION public.coupon_raffle_event_mail_begin_v1(p_winner_id uuid,p_admin_id uuid,p_kind text,p_request_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w public.event_draw_winners%rowtype; prior coupon_raffle_internal.requests%rowtype; fp jsonb; aid uuid; state text; v_result jsonb;
BEGIN
 IF length(coalesce(p_request_key,'')) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'Request key required' USING ERRCODE='22023'; END IF;
 SELECT * INTO w FROM public.event_draw_winners WHERE id=p_winner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Winner not found' USING ERRCODE='22023'; END IF;
 fp:=jsonb_build_object('winner',p_winner_id,'kind','event-mail-'||p_kind,'admin',p_admin_id);
 SELECT * INTO prior FROM coupon_raffle_internal.requests WHERE coupon_id=w.event_id AND request_key=p_request_key;
 IF FOUND THEN
  IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'Request key conflict' USING ERRCODE='22023'; END IF;
  aid:=(prior.result->>'attempt_id')::uuid;
  SELECT status INTO state FROM public.event_winner_email_attempts WHERE id=aid;
  RETURN jsonb_build_object('attempt_id',aid,'status',state);
 END IF;
 aid:=public.event_winner_email_begin(p_winner_id,p_admin_id,p_kind);
 v_result:=jsonb_build_object('attempt_id',aid,'status','new');
 INSERT INTO coupon_raffle_internal.requests(coupon_id,request_key,fingerprint,result) VALUES(w.event_id,p_request_key,fp,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.coupon_raffle_event_mail_begin_v1(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_raffle_event_mail_begin_v1(uuid,uuid,text,text) TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA coupon_raffle_internal FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.coupon_raffle_draw_v1(uuid,text,text,integer,uuid[]),public.coupon_raffle_resend_v1(uuid,text),public.coupon_raffle_mail_claim_v1(uuid),public.coupon_raffle_mail_finish_v1(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_raffle_draw_v1(uuid,text,text,integer,uuid[]),public.coupon_raffle_resend_v1(uuid,text),public.coupon_raffle_mail_claim_v1(uuid),public.coupon_raffle_mail_finish_v1(uuid,uuid,text,text,text) TO service_role;
COMMIT;
