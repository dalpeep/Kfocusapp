BEGIN;
SET LOCAL lock_timeout='2s';

-- Apply together with the customer and merchant screens after store coverage is verified.
CREATE POLICY owner_coupon_no_browser_redemption_insert ON public.coupon_redemptions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY owner_coupon_no_browser_redemption_update ON public.coupon_redemptions
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY owner_coupon_no_browser_redemption_delete ON public.coupon_redemptions
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

CREATE FUNCTION owner_portal_pilot.guard_coupon_counter_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF TG_OP='INSERT' THEN
      IF coalesce(NEW.used_count,0)<>0 THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Coupon count is server managed';
      END IF;
    ELSIF NEW.used_count IS DISTINCT FROM OLD.used_count THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Coupon count is server managed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION owner_portal_pilot.guard_coupon_counter_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER owner_phase2_guard_coupon_counter
BEFORE INSERT OR UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.guard_coupon_counter_v1();
COMMIT;
