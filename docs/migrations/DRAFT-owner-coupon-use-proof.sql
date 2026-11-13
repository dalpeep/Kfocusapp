BEGIN;
SET LOCAL lock_timeout='2s';

CREATE TABLE owner_portal_pilot.coupon_use_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '5 minutes'),
  redemption_id uuid
);
ALTER TABLE owner_portal_pilot.coupon_use_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.coupon_use_proofs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.owner_issue_coupon_use_proof_v1(p_actor uuid,p_business uuid,p_coupon uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof uuid;
BEGIN
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
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
REVOKE ALL ON FUNCTION public.owner_issue_coupon_use_proof_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_issue_coupon_use_proof_v1(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.redeem_owner_display_coupon_v1(p_coupon uuid,p_proof uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  proof owner_portal_pilot.coupon_use_proofs;
  coupon public.coupons;
  redemption uuid;
BEGIN
  SELECT * INTO proof FROM owner_portal_pilot.coupon_use_proofs
  WHERE id=p_proof AND coupon_id=p_coupon FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Invalid coupon proof'; END IF;
  IF proof.redemption_id IS NOT NULL THEN RETURN proof.redemption_id; END IF;
  IF proof.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Coupon proof expired'; END IF;

  SELECT * INTO coupon FROM public.coupons WHERE id=p_coupon AND business_id=proof.business_id FOR UPDATE;
  IF NOT FOUND OR NOT coupon.is_active OR coupon.delivery_mode<>'display'
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
REVOKE ALL ON FUNCTION public.redeem_owner_display_coupon_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.redeem_owner_display_coupon_v1(uuid,uuid) TO anon,authenticated;
COMMIT;
