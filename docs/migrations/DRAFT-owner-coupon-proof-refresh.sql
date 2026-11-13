BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE owner_portal_pilot.coupon_use_proofs
  ADD COLUMN customer_key uuid,
  ADD COLUMN revoked_at timestamptz;
CREATE INDEX coupon_use_proofs_customer_idx ON owner_portal_pilot.coupon_use_proofs(coupon_id, customer_key)
  WHERE revoked_at IS NULL AND redemption_id IS NULL;

CREATE OR REPLACE FUNCTION public.owner_issue_coupon_use_proof_v1(p_coupon uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof uuid;
  p_business uuid;
BEGIN
  SELECT c.business_id INTO p_business FROM public.coupons c
  JOIN public.businesses b ON b.id=c.business_id
  JOIN owner_portal_pilot.businesses owned ON owned.public_id=b.id
  JOIN owner_portal_pilot.business_scope scope ON scope.business_id=b.id
  JOIN owner_portal_pilot.actors actor ON actor.actor=owned.user_id AND actor.enabled
  JOIN auth.users u ON u.id=actor.actor
  WHERE c.id=p_coupon AND c.owner_verified_use AND b.is_active IS TRUE AND b.list_visible IS TRUE
    AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until<=now())
    AND EXISTS (SELECT 1 FROM owner_portal_pilot.settings WHERE singleton AND enabled);
  IF p_business IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Coupon not eligible'; END IF;
  -- The public request grants no redemption authority.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_coupon::text,0));
  IF (SELECT count(*) FROM owner_portal_pilot.coupon_use_proofs
      WHERE coupon_id=p_coupon AND expires_at>clock_timestamp() AND redemption_id IS NULL AND revoked_at IS NULL)>=200 THEN
    RAISE EXCEPTION USING ERRCODE='OP429', MESSAGE='Too many pending proofs';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coupons c WHERE c.id=p_coupon AND c.business_id=p_business
    AND c.business_ids <@ ARRAY[p_business::text] AND c.delivery_mode='display' AND c.is_active
    AND (c.start_at IS NULL OR c.start_at<=clock_timestamp())
    AND (c.end_at IS NULL OR c.end_at>clock_timestamp())
  ) THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Coupon not eligible'; END IF;
  INSERT INTO owner_portal_pilot.coupon_use_proofs(coupon_id,business_id)
  VALUES (p_coupon,p_business) RETURNING id INTO proof;
  RETURN proof;
END $$;

CREATE FUNCTION public.owner_refresh_coupon_use_proof_v2(p_coupon uuid,p_customer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE issued owner_portal_pilot.coupon_use_proofs;
  proof_id uuid;
BEGIN
  IF p_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='22004', MESSAGE='Missing customer key'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_coupon::text,0));
  UPDATE owner_portal_pilot.coupon_use_proofs SET revoked_at=clock_timestamp()
  WHERE coupon_id=p_coupon AND customer_key=p_customer AND revoked_at IS NULL
    AND redemption_id IS NULL AND expires_at>clock_timestamp();
  proof_id := public.owner_issue_coupon_use_proof_v1(p_coupon);
  SELECT * INTO STRICT issued FROM owner_portal_pilot.coupon_use_proofs WHERE id=proof_id;
  UPDATE owner_portal_pilot.coupon_use_proofs SET customer_key=p_customer WHERE id=issued.id;
  RETURN jsonb_build_object('id',issued.id,'expires_at',issued.expires_at);
END $$;

CREATE FUNCTION public.owner_coupon_use_status_v2(p_proof uuid,p_customer uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN redemption_id IS NOT NULL THEN 'used'
              WHEN revoked_at IS NOT NULL THEN 'revoked'
              WHEN expires_at<=now() THEN 'expired' ELSE 'pending' END
  FROM owner_portal_pilot.coupon_use_proofs WHERE id=p_proof AND customer_key=p_customer;
$$;

REVOKE ALL ON FUNCTION public.owner_refresh_coupon_use_proof_v2(uuid,uuid),
  public.owner_coupon_use_status_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_refresh_coupon_use_proof_v2(uuid,uuid),
  public.owner_coupon_use_status_v2(uuid,uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.redeem_owner_display_coupon_v1(p_actor uuid,p_business uuid,p_coupon uuid,p_proof uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  proof owner_portal_pilot.coupon_use_proofs;
  coupon public.coupons;
  redemption uuid;
BEGIN
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
  SELECT * INTO proof FROM owner_portal_pilot.coupon_use_proofs
  WHERE id=p_proof AND coupon_id=p_coupon AND business_id=p_business FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Invalid coupon proof'; END IF;
  IF proof.redemption_id IS NOT NULL THEN RETURN proof.redemption_id; END IF;
  IF proof.revoked_at IS NOT NULL OR proof.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Coupon proof expired'; END IF;

  SELECT * INTO coupon FROM public.coupons WHERE id=p_coupon AND business_id=proof.business_id FOR UPDATE;
  IF NOT FOUND OR NOT coupon.is_active OR NOT coupon.owner_verified_use OR coupon.delivery_mode<>'display'
     OR NOT coupon.business_ids <@ ARRAY[proof.business_id::text]
     OR coupon.start_at>clock_timestamp() OR coupon.end_at<=clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Coupon not eligible';
  END IF;

  INSERT INTO public.coupon_redemptions(coupon_id,business_id,coupon_title,business_name,used_by)
  SELECT coupon.id,b.id,coupon.title,coalesce(b.name_ko,b.name_en),'customer'
  FROM public.businesses b WHERE b.id=proof.business_id
  RETURNING id INTO STRICT redemption;

  UPDATE public.coupons SET used_count=coalesce(used_count,0)+1 WHERE id=coupon.id;
  UPDATE owner_portal_pilot.coupon_use_proofs SET redemption_id=redemption WHERE id=proof.id;
  RETURN redemption;
END $$;
COMMIT;
