-- DRAFT: isolated tests only. Production/QA execution needs separate approval.
-- Does not install Owner Portal, change current RLS or send notifications.
-- Approved policy 2026-11-03: preserve every existing used_count and history.
-- Unconfirmed existing display coupons: NO display_rules row (SC503 hold).
-- Never seed NULL as a default or backfill counters from redemption/entry counts.
-- New display coupons require an explicit positive total max_uses from the owner,
-- checked by a trusted, ownership-authorized creation route, in the creation transaction.
-- issue_limit remains an issuance limit and must not populate max_uses.
-- Public SELECT/download paths are outside this use-only RPC.
BEGIN;
CREATE SCHEMA coupon_security_internal;
REVOKE ALL ON SCHEMA coupon_security_internal FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE coupon_security_internal.display_rules(
 coupon_id uuid PRIMARY KEY REFERENCES public.coupons(id) ON DELETE CASCADE,
 max_uses bigint CHECK(max_uses>0)
);
COMMENT ON TABLE coupon_security_internal.display_rules IS
 'Server-managed total display usage quota, inclusive of existing used_count. Missing rule holds usage. New coupons require an explicit positive limit; NULL is reserved for separately verified legacy no-cap policies, never unknown limits. issue_limit is NOT a redemption limit.';
CREATE TABLE coupon_security_internal.display_uses(
 coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
 identity_hash text NOT NULL CHECK(identity_hash ~ '^[0-9a-f]{64}$'),
 request_key uuid NOT NULL,redemption_id uuid NOT NULL,used_count bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(coupon_id,identity_hash),UNIQUE(identity_hash,request_key)
);
ALTER TABLE coupon_security_internal.display_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_security_internal.display_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA coupon_security_internal FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.security_legacy_display_redeem(p_coupon uuid,p_key uuid,p_identity text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c jsonb;previous coupon_security_internal.display_uses;
 used bigint;cap bigint;rid uuid;business_name text;bid uuid;used_at timestamptz;
BEGIN
 IF p_coupon IS NULL OR p_key IS NULL OR p_identity IS NULL OR p_identity !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION USING ERRCODE='SC400',MESSAGE='Invalid request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_identity||':'||p_key::text,19));
 SELECT * INTO previous FROM coupon_security_internal.display_uses
 WHERE identity_hash=p_identity AND request_key=p_key;
 IF FOUND THEN
  IF previous.coupon_id<>p_coupon THEN RAISE EXCEPTION USING ERRCODE='SC409',MESSAGE='Request key mismatch';END IF;
  RETURN jsonb_build_object('redemption_id',previous.redemption_id,'used_count',previous.used_count,'already_used',true,'used_at',previous.created_at);
 END IF;
 SELECT to_jsonb(x) INTO c FROM public.coupons x WHERE id=p_coupon FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='SC404',MESSAGE='Coupon unavailable';END IF;
 SELECT * INTO previous FROM coupon_security_internal.display_uses
 WHERE coupon_id=p_coupon AND identity_hash=p_identity;
 IF FOUND THEN RETURN jsonb_build_object('redemption_id',previous.redemption_id,'used_count',previous.used_count,'already_used',true,'used_at',previous.created_at);END IF;
 IF coalesce(c->>'owner_coupon_protocol','legacy')<>'legacy'
 OR coalesce(c->>'delivery_mode','display')<>'display'
 OR coalesce((c->>'is_active')::boolean,true)=false
 THEN RAISE EXCEPTION USING ERRCODE='SC403',MESSAGE='Coupon unavailable';END IF;
 IF nullif(c->>'start_at','')::timestamptz>clock_timestamp()
 OR nullif(c->>'end_at','')::timestamptz<=clock_timestamp()
 THEN RAISE EXCEPTION USING ERRCODE='SC410',MESSAGE='Coupon unavailable';END IF;
 bid:=nullif(c->>'business_id','')::uuid;
 SELECT coalesce(b.name_ko,b.name_en,'') INTO business_name FROM public.businesses b WHERE id=bid;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='SC403',MESSAGE='Business unavailable';END IF;
 used:=coalesce((c->>'used_count')::bigint,0);
 IF used<0 OR used>=2147483647 THEN RAISE EXCEPTION USING ERRCODE='SC409',MESSAGE='Counter invalid';END IF;
 SELECT max_uses INTO cap FROM coupon_security_internal.display_rules WHERE coupon_id=p_coupon FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='SC503',MESSAGE='Usage policy review required';END IF;
 IF cap IS NOT NULL AND used>=cap THEN RAISE EXCEPTION USING ERRCODE='SC409',MESSAGE='Usage limit reached';END IF;
 used_at:=clock_timestamp();
 INSERT INTO public.coupon_redemptions(coupon_id,business_id,coupon_title,business_name,notify_emails,notify_phones,used_by)
 VALUES(p_coupon,bid,coalesce(c->>'title',''),business_name,nullif(c->>'notify_emails',''),NULL,'customer') RETURNING id INTO rid;
 UPDATE public.coupons SET used_count=used+1 WHERE id=p_coupon;
 INSERT INTO coupon_security_internal.display_uses(coupon_id,identity_hash,request_key,redemption_id,used_count,created_at)
 VALUES(p_coupon,p_identity,p_key,rid,used+1,used_at);
 RETURN jsonb_build_object('redemption_id',rid,'used_count',used+1,'already_used',false,'used_at',used_at);
END $$;
ALTER FUNCTION public.security_legacy_display_redeem(uuid,uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.security_legacy_display_redeem(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.security_legacy_display_redeem(uuid,uuid,text) TO service_role;
COMMIT;
