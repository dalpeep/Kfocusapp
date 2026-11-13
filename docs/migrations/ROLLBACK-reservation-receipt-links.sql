BEGIN;
SET LOCAL lock_timeout='2s';
CREATE OR REPLACE FUNCTION owner_portal_pilot.queue_reservation_mail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  INSERT INTO owner_portal_pilot.reservation_mail(reservation_id,event,audience)
  SELECT NEW.id,NEW.status,audience
  FROM unnest(CASE NEW.status
    WHEN 'pending' THEN ARRAY['owner']
    WHEN 'confirmed' THEN ARRAY['customer']
    ELSE ARRAY['owner','customer'] END) audience
  WHERE audience='owner' OR nullif(btrim(NEW.email),'') IS NOT NULL
  ON CONFLICT (reservation_id,event,audience) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- The reservation must succeed even when its notification cannot be queued.
  RAISE WARNING 'Reservation notification queue failed (%).', SQLSTATE;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.claim_reservation_mail_v1(p_reservation uuid,p_number text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH claimed AS (
    UPDATE owner_portal_pilot.reservation_mail m SET delivery='sending',updated_at=clock_timestamp()
    WHERE m.reservation_id=coalesce(p_reservation,(
      SELECT reservation_id FROM owner_portal_pilot.reservation_credentials WHERE booking_number=p_number
    )) AND m.delivery='queued'
    RETURNING m.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'event',m.event,'audience',m.audience,'business',r.business_id,
    'starts_at',r.starts_at,'zone',s.zone,
    'recipient',CASE WHEN m.audience='customer' THEN r.email ELSE (
      SELECT CASE WHEN count(*)=1 THEN min(u.email) END
      FROM owner_portal_pilot.businesses approved
      JOIN owner_portal_pilot.business_scope scope ON scope.business_id=approved.public_id
      JOIN owner_portal_pilot.actors actor ON actor.actor=approved.user_id
      JOIN auth.users u ON u.id=approved.user_id
      WHERE approved.public_id=r.business_id AND actor.enabled
        AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until<=now())
        AND nullif(btrim(u.email),'') IS NOT NULL
    ) END)), '[]'::jsonb)
  FROM claimed m
  JOIN owner_portal_pilot.reservations r ON r.id=m.reservation_id
  JOIN owner_portal_pilot.reservation_settings s ON s.business_id=r.business_id;
$$;

COMMIT;
