BEGIN;
SET LOCAL lock_timeout = '2s';

ALTER TABLE owner_portal_pilot.coupon_use_proofs ADD COLUMN short_code text;
ALTER TABLE owner_portal_pilot.coupon_use_proofs
  ADD CONSTRAINT coupon_proof_business_code UNIQUE (business_id, short_code);

CREATE TABLE owner_portal_pilot.coupon_code_attempts (
  business_id uuid PRIMARY KEY,
  window_started timestamptz NOT NULL,
  attempts integer NOT NULL
);
ALTER TABLE owner_portal_pilot.coupon_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.coupon_code_attempts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION owner_portal_pilot.random_coupon_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  byte_value integer;
BEGIN
  WHILE length(result)<6 LOOP
    byte_value := get_byte(uuid_send(gen_random_uuid()),0);
    IF byte_value<248 THEN
      result := result || substr(alphabet,1+byte_value%31,1);
    END IF;
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION owner_portal_pilot.random_coupon_code() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.owner_refresh_coupon_use_proof_v2(p_coupon uuid,p_customer uuid)
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
  FOR retry IN 1..12 LOOP
    BEGIN
      UPDATE owner_portal_pilot.coupon_use_proofs
      SET customer_key=p_customer, short_code=owner_portal_pilot.random_coupon_code()
      WHERE id=proof_id RETURNING * INTO STRICT issued;
      RETURN jsonb_build_object('id',issued.id,'code',issued.short_code,'expires_at',issued.expires_at);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION USING ERRCODE='OP503', MESSAGE='Unable to allocate coupon code';
END $$;

CREATE FUNCTION public.owner_redeem_coupon_code_v3(p_actor uuid,p_business uuid,p_coupon uuid,p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  proof owner_portal_pilot.coupon_use_proofs;
  attempt_count integer;
  stamp timestamptz := clock_timestamp();
BEGIN
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
  INSERT INTO owner_portal_pilot.coupon_code_attempts AS rate(business_id,window_started,attempts)
  VALUES(p_business,stamp,1)
  ON CONFLICT (business_id) DO UPDATE SET
    attempts=CASE WHEN rate.window_started<=stamp-interval '1 minute' THEN 1 ELSE least(rate.attempts+1,21) END,
    window_started=CASE WHEN rate.window_started<=stamp-interval '1 minute' THEN stamp ELSE rate.window_started END
  RETURNING attempts INTO attempt_count;
  IF attempt_count>20 THEN RETURN 'rate_limited'; END IF;

  SELECT * INTO proof FROM owner_portal_pilot.coupon_use_proofs
  WHERE business_id=p_business AND coupon_id=p_coupon
    AND CASE WHEN p_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' THEN short_code=p_code
             WHEN p_code ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN id=p_code::uuid
             ELSE false END
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF proof.redemption_id IS NOT NULL THEN RETURN 'used'; END IF;
  IF proof.revoked_at IS NOT NULL THEN RETURN 'revoked'; END IF;
  IF proof.expires_at<=clock_timestamp() THEN RETURN 'expired'; END IF;
  BEGIN
    PERFORM public.redeem_owner_display_coupon_v1(p_actor,p_business,p_coupon,proof.id);
    RETURN 'redeemed';
  EXCEPTION WHEN SQLSTATE 'OP403' THEN
    RETURN 'invalid';
  END;
END $$;

CREATE FUNCTION public.owner_coupon_history_v3(p_actor uuid,p_business uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
  RETURN jsonb_build_object(
    'totals',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.title,t.id) FROM (
      SELECT c.id,c.title,count(p.id) AS issued,count(p.redemption_id) AS used,
        count(p.id) FILTER (WHERE p.redemption_id IS NULL) AS unused
      FROM public.coupons c LEFT JOIN owner_portal_pilot.coupon_use_proofs p
        ON p.business_id=c.business_id AND p.coupon_id=c.id
      WHERE c.business_id=p_business AND c.owner_verified_use GROUP BY c.id,c.title
    ) t),'[]'::jsonb),
    'recent',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.occurred_at DESC) FROM (
      SELECT coalesce(u.coupon_title,c.title) AS title,
        coalesce(u.created_at,p.revoked_at,p.expires_at-interval '5 minutes') AS occurred_at,
        CASE WHEN p.redemption_id IS NOT NULL THEN 'used' WHEN p.revoked_at IS NOT NULL THEN 'revoked'
             WHEN p.expires_at<=now() THEN 'expired' ELSE 'pending' END AS state
      FROM owner_portal_pilot.coupon_use_proofs p
      JOIN public.coupons c ON c.id=p.coupon_id AND c.business_id=p.business_id AND c.owner_verified_use
      LEFT JOIN public.coupon_redemptions u ON u.id=p.redemption_id
      WHERE p.business_id=p_business ORDER BY occurred_at DESC,p.id LIMIT 100
    ) r),'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.owner_redeem_coupon_code_v3(uuid,uuid,uuid,text),public.owner_coupon_history_v3(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_redeem_coupon_code_v3(uuid,uuid,uuid,text),public.owner_coupon_history_v3(uuid,uuid) TO service_role;
COMMIT;
