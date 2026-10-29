-- REVIEW ONLY. No historical backfill or public table trigger. Apply after 12.
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.notifications_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate notification approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Project mismatch'; END IF;
 IF to_regclass('owner_portal_uuid_internal.coupon_v2_outbox') IS NULL THEN RAISE EXCEPTION 'V2 migration required'; END IF;
END $$;
CREATE TABLE owner_portal_uuid_internal.notification_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_key text NOT NULL UNIQUE,
 source_actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,business_id uuid,recipient uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('application_submitted','application_review','application_approved','application_rejected','coupon_saved','event_saved','special_saved','content_review','coupon_issued','coupon_used')),
 source_id text NOT NULL,subject text NOT NULL,body text NOT NULL,message jsonb,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','retry','accepted','mocked','review')),
 attempts integer NOT NULL DEFAULT 0,first_attempt_at timestamptz,next_at timestamptz NOT NULL DEFAULT now(),lease uuid,locked_until timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
ALTER TABLE owner_portal_uuid_internal.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_uuid_internal.notification_outbox FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX owner_notifications_due ON owner_portal_uuid_internal.notification_outbox(next_at,id) WHERE state IN ('pending','retry','sending');
CREATE FUNCTION owner_portal_uuid_internal.notification_enqueue(p_key text,p_actor uuid,p_business uuid,p_recipient uuid,p_kind text,p_source text,p_subject text,p_body text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO owner_portal_uuid_internal.notification_outbox(event_key,source_actor,business_id,recipient,kind,source_id,subject,body)
 SELECT p_key||'/'||p_recipient::text,p_actor,p_business,p_recipient,p_kind,p_source,p_subject,p_body WHERE p_recipient IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users WHERE id=p_recipient AND email_confirmed_at IS NOT NULL) ON CONFLICT(event_key) DO NOTHING
$$;
CREATE FUNCTION owner_portal_uuid_internal.notification_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE person uuid;kind text;
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM owner_portal_uuid_internal.notification_enqueue('request/'||NEW.id||'/submitted',NEW.user_id,NEW.business_id,NEW.user_id,'application_submitted',NEW.id::text,'[달타운맵] 업주 신청 접수','신청을 접수했습니다. 업주센터에서 진행 상태를 확인해 주세요.');
  FOR person IN SELECT p.user_id FROM public.profiles p JOIN auth.users a ON a.id=p.user_id WHERE a.email_confirmed_at IS NOT NULL AND coalesce(to_jsonb(a)->>'deleted_at','')='' AND coalesce((to_jsonb(a)->>'banned_until')::timestamptz,'-infinity')<=now() AND public.owner_uuid_admin_region(p.user_id,NEW.region) LOOP
   PERFORM owner_portal_uuid_internal.notification_enqueue('request/'||NEW.id||'/review',NEW.user_id,NEW.business_id,person,'application_review',NEW.id::text,'[달타운맵] 업주 신청 검토 대기','관리자 화면에 새 업주 신청이 접수되었습니다. 로그인 후 확인해 주세요.');
  END LOOP;
 ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
  kind:='application_'||NEW.status;
  PERFORM owner_portal_uuid_internal.notification_enqueue('request/'||NEW.id||'/'||NEW.status,NEW.user_id,NEW.business_id,NEW.user_id,kind,NEW.id::text,'[달타운맵] 업주 신청 처리 결과',CASE NEW.status WHEN 'approved' THEN '업주 신청이 승인되었습니다. 업주센터에서 관리할 업소를 확인해 주세요.' ELSE '업주 신청이 승인되지 않았습니다. 업주센터에서 사유를 확인해 주세요.' END);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_notification_request AFTER INSERT OR UPDATE OF status ON owner_portal_uuid_internal.requests FOR EACH ROW EXECUTE FUNCTION owner_portal_uuid_internal.notification_request();
CREATE FUNCTION owner_portal_uuid_internal.notification_content() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE kind text;person uuid;target_region text;
BEGIN
 kind:=CASE NEW.action WHEN 'content_coupon_save' THEN 'coupon_saved' WHEN 'content_event_save' THEN 'event_saved' WHEN 'content_special_save' THEN 'special_saved' END;
 IF kind IS NOT NULL THEN
  PERFORM owner_portal_uuid_internal.notification_enqueue('audit/'||NEW.id,NEW.actor,NEW.business_id,NEW.actor,kind,NEW.id::text,'[달타운맵] 업소 콘텐츠 저장 완료','쿠폰·이벤트·스페셜 콘텐츠를 저장했습니다. 공개 여부와 기간을 업주센터에서 확인해 주세요.');
  SELECT b.region INTO target_region FROM public.businesses b WHERE b.id=NEW.business_id;
  FOR person IN SELECT p.user_id FROM public.profiles p JOIN auth.users a ON a.id=p.user_id WHERE a.email_confirmed_at IS NOT NULL AND coalesce(to_jsonb(a)->>'deleted_at','')='' AND coalesce((to_jsonb(a)->>'banned_until')::timestamptz,'-infinity')<=now() AND public.owner_uuid_admin_region(p.user_id,target_region) LOOP
   PERFORM owner_portal_uuid_internal.notification_enqueue('audit/'||NEW.id||'/review',NEW.actor,NEW.business_id,person,'content_review',NEW.id::text,'[달타운맵] 업소 콘텐츠 등록·수정 안내','업주가 콘텐츠를 저장했습니다. 이는 별도 승인 요청이 아닙니다. 관리자 화면에서 공개 상태와 내용을 확인해 주세요.');
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_notification_content AFTER INSERT ON owner_portal_uuid_internal.audit FOR EACH ROW EXECUTE FUNCTION owner_portal_uuid_internal.notification_content();
CREATE FUNCTION owner_portal_uuid_internal.notification_coupon() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e public.coupon_entries;u owner_portal_uuid_internal.coupon_v2_uses;person uuid;
BEGIN
 SELECT * INTO e FROM public.coupon_entries WHERE id=NEW.entry_id;
 IF NEW.use_id IS NULL THEN
  -- The verified business owner is the source actor for the Canary scope;
  -- delivery is addressed only to the actual normalized issuance email.
  SELECT user_id INTO person FROM owner_portal_uuid_internal.memberships WHERE business_id=e.business_id::uuid AND active AND revoked_at IS NULL;
  IF person IS NULL THEN SELECT actor INTO person FROM owner_portal_uuid_internal.audit WHERE business_id=e.business_id::uuid AND action='content_coupon_save' AND after_value->>'id'=e.coupon_id ORDER BY id LIMIT 1;END IF;
  IF person IS NOT NULL THEN
   PERFORM owner_portal_uuid_internal.notification_enqueue('v2/'||NEW.id,person,e.business_id::uuid,person,'coupon_issued',e.id::text,'[달타운맵] 쿠폰 발급','발급받은 쿠폰을 매장에 제시해 주세요.');
  END IF;
 ELSE
  SELECT * INTO u FROM owner_portal_uuid_internal.coupon_v2_uses WHERE id=NEW.use_id;
  SELECT user_id INTO person FROM owner_portal_uuid_internal.memberships WHERE business_id=u.business_id AND active AND revoked_at IS NULL;
  person:=coalesce(person,u.actor);
  PERFORM owner_portal_uuid_internal.notification_enqueue('v2/'||NEW.id,u.actor,u.business_id,person,'coupon_used',u.id::text,'[달타운맵] 쿠폰 사용 완료','매장에서 쿠폰 사용이 확인되었습니다. 업주센터에서 기록을 확인해 주세요.');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_notification_coupon AFTER INSERT ON owner_portal_uuid_internal.coupon_v2_outbox FOR EACH ROW EXECUTE FUNCTION owner_portal_uuid_internal.notification_coupon();
CREATE FUNCTION public.owner_notification_claim(p_businesses uuid[],p_actors uuid[],p_recipients text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item owner_portal_uuid_internal.notification_outbox;address text;code text;
BEGIN
 IF coalesce(cardinality(p_businesses),0)=0 OR coalesce(cardinality(p_actors),0)=0 OR coalesce(cardinality(p_recipients),0)=0 THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Canary allowlist required'; END IF;
 -- Never replay uncertain delivery after Resend's idempotency retention window.
 UPDATE owner_portal_uuid_internal.notification_outbox SET state='review',lease=NULL,locked_until=NULL,last_error=CASE WHEN attempts>=5 THEN 'ATTEMPTS_EXHAUSTED' ELSE 'DELIVERY_WINDOW_EXPIRED' END WHERE state IN ('sending','retry') AND (first_attempt_at<now()-interval '23 hours' OR (attempts>=5 AND coalesce(locked_until,'-infinity')<=now())) AND source_actor=ANY(p_actors) AND (business_id=ANY(p_businesses) OR (business_id IS NULL AND kind IN ('application_submitted','application_review')));
 SELECT n.* INTO item FROM owner_portal_uuid_internal.notification_outbox n JOIN auth.users u ON u.id=n.recipient
 WHERE n.state IN ('pending','retry','sending') AND n.next_at<=now() AND coalesce(n.locked_until,'-infinity')<=now() AND n.attempts<5
 AND n.source_actor=ANY(p_actors) AND (n.business_id=ANY(p_businesses) OR (n.business_id IS NULL AND n.kind IN ('application_submitted','application_review')))
 AND u.email_confirmed_at IS NOT NULL AND coalesce(to_jsonb(u)->>'deleted_at','')='' AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()
 AND lower(coalesce(n.message->>'to',CASE WHEN n.kind='coupon_issued' THEN (SELECT email_normalized FROM public.coupon_entries WHERE id::text=n.source_id) ELSE u.email END))=ANY(p_recipients)
 ORDER BY n.next_at,n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false); END IF;
 -- Freeze the same message for every retry with this event idempotency key.
 IF item.message IS NULL THEN
  SELECT lower(email) INTO address FROM auth.users WHERE id=item.recipient;
  IF item.kind='coupon_issued' THEN
   SELECT e.email_normalized,e.coupon_code INTO address,code FROM public.coupon_entries e JOIN public.coupons c ON c.id::text=e.coupon_id WHERE e.id::text=item.source_id AND e.status IN ('coupon_issued','redeemed') AND c.is_active AND coalesce(c.end_at,'infinity')>now();
   IF NOT FOUND OR code IS NULL THEN UPDATE owner_portal_uuid_internal.notification_outbox SET state='review',last_error='ISSUANCE_UNAVAILABLE' WHERE id=item.id;RETURN jsonb_build_object('claimed',false);END IF;
  END IF;
  item.message:=jsonb_build_object('to',address,'subject',item.subject,'text',item.body||CASE WHEN code IS NOT NULL THEN E'\n쿠폰 코드: '||code ELSE '' END||E'\nhttps://daltownmap.com/owner-uuid/');
 END IF;
 -- A previously frozen recipient can never bypass the current allowlist.
 IF NOT lower(item.message->>'to')=ANY(p_recipients) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Frozen recipient not approved'; END IF;
 UPDATE owner_portal_uuid_internal.notification_outbox SET state='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease=gen_random_uuid(),locked_until=now()+interval '2 minutes',message=item.message WHERE id=item.id RETURNING * INTO item;
 RETURN jsonb_build_object('claimed',true,'id',item.id,'lease',item.lease,'message',item.message,'idempotency_key','owner-notify/'||item.id);
END $$;
CREATE FUNCTION public.owner_notification_finish(p_id uuid,p_lease uuid,p_result text,p_error text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item owner_portal_uuid_internal.notification_outbox;
BEGIN
 SELECT * INTO item FROM owner_portal_uuid_internal.notification_outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR item.state<>'sending' OR item.lease IS DISTINCT FROM p_lease OR item.locked_until<now() OR p_result NOT IN ('accepted','mocked','retry','review') THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Notification lease mismatch'; END IF;
 UPDATE owner_portal_uuid_internal.notification_outbox SET state=CASE WHEN p_result='retry' AND attempts>=5 THEN 'review' ELSE p_result END,
 lease=NULL,locked_until=NULL,next_at=now()+make_interval(secs=>least(3600,60*power(2,attempts-1)::integer)),finished_at=CASE WHEN p_result IN ('accepted','mocked','review') THEN now() END,
 last_error=CASE WHEN p_result IN ('accepted','mocked') THEN NULL WHEN p_error IN ('PROVIDER_REJECTED','RECIPIENT_DENIED') THEN p_error ELSE 'TRANSPORT_FAILED' END WHERE id=p_id;
 -- Only real Provider acceptance acknowledges the old issuance mail lease.
 IF p_result='accepted' AND item.kind='coupon_issued' THEN UPDATE public.coupon_entries SET emailed_at=coalesce(emailed_at,now()),mail_state='accepted',updated_at=now() WHERE id::text=item.source_id;END IF;
 IF p_result IN ('accepted','mocked') AND item.kind IN ('coupon_issued','coupon_used') THEN UPDATE owner_portal_uuid_internal.coupon_v2_outbox SET state=p_result,lease=NULL,locked_until=NULL,updated_at=now() WHERE (item.kind='coupon_issued' AND entry_id::text=item.source_id AND use_id IS NULL) OR (item.kind='coupon_used' AND use_id::text=item.source_id);END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.notification_enqueue(text,uuid,uuid,uuid,text,text,text,text),owner_portal_uuid_internal.notification_request(),owner_portal_uuid_internal.notification_content(),owner_portal_uuid_internal.notification_coupon(),public.owner_notification_claim(uuid[],uuid[],text[]),public.owner_notification_finish(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_notification_claim(uuid[],uuid[],text[]),public.owner_notification_finish(uuid,uuid,text,text) TO service_role;
-- Retire the former V2 mail sender so two independent provider keys cannot
-- deliver the same issuance. Legacy REST handlers remain unchanged.
ALTER FUNCTION public.owner_coupon_campaign(jsonb) RENAME TO campaign_pre_notifications;
ALTER FUNCTION public.campaign_pre_notifications(jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.campaign_pre_notifications(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_coupon_campaign(p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_command->>'action'<>'reserve' THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Unified notification worker required';END IF;
 RETURN owner_portal_uuid_internal.campaign_pre_notifications(p_command);
END $$;
CREATE FUNCTION public.owner_notification_use_status(p_actor uuid,p_coupon uuid,p_use uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item owner_portal_uuid_internal.coupon_v2_uses;state text;
BEGIN
 SELECT * INTO item FROM owner_portal_uuid_internal.coupon_v2_uses WHERE id=p_use AND coupon_id=p_coupon;
 IF NOT FOUND OR NOT owner_portal_uuid_internal.content_access(p_actor,item.business_id) OR NOT EXISTS(SELECT 1 FROM public.coupon_redemptions WHERE id=item.redemption_id AND status='used') THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Committed authorized use required';END IF;
 SELECT n.state INTO state FROM owner_portal_uuid_internal.notification_outbox n WHERE n.kind='coupon_used' AND n.source_id=p_use::text;
 RETURN jsonb_build_object('queued',state IS NOT NULL,'state',coalesce(state,'recipient_unavailable'));
END $$;
REVOKE ALL ON FUNCTION public.owner_coupon_campaign(jsonb),public.owner_notification_use_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_coupon_campaign(jsonb),public.owner_notification_use_status(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
