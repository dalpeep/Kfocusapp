BEGIN;
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.owner_coupon_history_v3(p_actor uuid,p_business uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM owner_portal_pilot.settings WHERE singleton AND enabled) THEN
    RAISE EXCEPTION USING ERRCODE='OP503', MESSAGE='Owner pilot disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM owner_portal_pilot.actors a
    JOIN auth.users u ON u.id=a.actor
    JOIN owner_portal_pilot.businesses approved ON approved.user_id=a.actor
    JOIN owner_portal_pilot.business_scope scope ON scope.business_id=approved.public_id
    JOIN public.businesses b ON b.id=approved.public_id
    WHERE a.actor=p_actor AND a.enabled AND b.id=p_business
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until<=now())
  ) THEN
    RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Approved ownership required';
  END IF;
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

COMMIT;
