BEGIN;
SET LOCAL lock_timeout='2s';

CREATE FUNCTION public.can_manage_paid_promotion_v1() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.role='super_admin');
$$;
REVOKE ALL ON FUNCTION public.can_manage_paid_promotion_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_paid_promotion_v1() TO authenticated;

CREATE FUNCTION owner_portal_pilot.guard_paid_promotion_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF (TG_OP<>'INSERT' AND OLD.delivery_mode='raffle')
     OR (TG_OP<>'DELETE' AND NEW.delivery_mode='raffle') THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='End the promotion to preserve its history';
    END IF;
    IF current_user='anon' OR (current_user='authenticated' AND NOT public.can_manage_paid_promotion_v1()) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Only super_admin can manage paid promotions';
    END IF;
    -- Preserve the existing campaign redemption counter path.
    IF current_user='service_role' AND (TG_OP<>'UPDATE'
      OR (to_jsonb(OLD)-'used_count'-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'used_count'-'updated_at')) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Server campaign writes are limited to usage accounting';
    END IF;
    IF TG_OP='UPDATE' AND OLD.delivery_mode IS DISTINCT FROM NEW.delivery_mode THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Promotion and coupon types cannot be converted';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION owner_portal_pilot.guard_paid_promotion_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_paid_promotion BEFORE INSERT OR UPDATE OR DELETE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.guard_paid_promotion_v1();
COMMIT;

