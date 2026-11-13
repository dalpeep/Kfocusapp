BEGIN;
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION owner_portal_pilot.guard_business_gallery_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  target_region text;
BEGIN
  -- Trusted backend functions and SQL maintenance use their existing privileges.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.gallery_urls IS NOT DISTINCT FROM OLD.gallery_urls
       AND NEW.region IS NOT DISTINCT FROM OLD.region
       AND NEW.id IS NOT DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
    target_region := OLD.region;
  ELSIF TG_OP = 'INSERT' THEN
    IF coalesce(to_jsonb(NEW.gallery_urls), '[]'::jsonb) = '[]'::jsonb THEN RETURN NEW; END IF;
    target_region := NEW.region;
  ELSE
    IF coalesce(to_jsonb(OLD.gallery_urls), '[]'::jsonb) = '[]'::jsonb THEN RETURN OLD; END IF;
    target_region := OLD.region;
  END IF;

  IF current_user = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.role = 'super_admin' OR (
        p.role = 'regional_editor' AND
        CASE p.area WHEN 'denver' THEN 'colorado' ELSE p.area END =
        CASE target_region WHEN 'denver' THEN 'colorado' ELSE target_region END
        AND (TG_OP <> 'UPDATE' OR (NEW.region IS NOT DISTINCT FROM OLD.region
          AND NEW.id IS NOT DISTINCT FROM OLD.id))
      ))
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Business gallery requires verified administrator or owner service';
END $$;

REVOKE ALL ON FUNCTION owner_portal_pilot.guard_business_gallery_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER owner_phase2_guard_business_gallery
BEFORE INSERT OR UPDATE OR DELETE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.guard_business_gallery_v1();
COMMIT;
