BEGIN;
SET LOCAL lock_timeout='2s';
CREATE FUNCTION public.business_reservation_submit_pin_v1(p_business uuid,p_id uuid,p_secret uuid,p_slot timestamptz,
  p_party smallint,p_name text,p_phone text,p_email text,p_note text,p_peppered_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; number text;
BEGIN
  IF p_peppered_pin IS NULL OR p_peppered_pin !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Invalid reservation input';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business::text,1942));
  IF EXISTS (SELECT 1 FROM owner_portal_pilot.reservations WHERE id=p_id)
    AND NOT EXISTS (SELECT 1 FROM owner_portal_pilot.reservation_credentials WHERE reservation_id=p_id) THEN
    RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Reservation unavailable';
  END IF;
  result := public.business_reservation_submit_v1(p_business,p_id,p_secret,p_slot,p_party,p_name,p_phone,p_email,p_note);
  SELECT booking_number INTO number FROM owner_portal_pilot.reservation_credentials WHERE reservation_id=p_id;
  IF FOUND AND NOT EXISTS (
    SELECT 1 FROM owner_portal_pilot.reservation_credentials
    WHERE reservation_id=p_id AND password_hash=extensions.crypt(p_peppered_pin,password_hash)
  ) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Reservation unavailable'; END IF;
  WHILE number IS NULL LOOP
    INSERT INTO owner_portal_pilot.reservation_credentials(reservation_id,booking_number,password_hash)
    VALUES(p_id,upper(encode(extensions.gen_random_bytes(10),'hex')),extensions.crypt(p_peppered_pin,extensions.gen_salt('bf',11)))
    ON CONFLICT(booking_number) DO NOTHING RETURNING booking_number INTO number;
  END LOOP;
  RETURN result || jsonb_build_object('number',number);
END $$;

CREATE TABLE owner_portal_pilot.reservation_pin_attempts (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL,
  retry_after timestamptz NOT NULL
);
ALTER TABLE owner_portal_pilot.reservation_pin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.reservation_pin_attempts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reserve_pin_attempt_v1(p_number text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text; limit_count integer; ts timestamptz:=clock_timestamp();
BEGIN
  IF p_number IS NULL OR p_number !~ '^[A-F0-9]{20}$' THEN RETURN false; END IF;
  -- Bounded buckets prevent arbitrary identifiers from growing the table.
  FOREACH k IN ARRAY ARRAY['global','number:'||(hashtextextended(p_number,0)&65535)::text] LOOP
    limit_count:=CASE WHEN k='global' THEN 8 ELSE 5 END;
    INSERT INTO owner_portal_pilot.reservation_pin_attempts AS a VALUES(k,1,ts+CASE WHEN k='global' THEN interval '1 second' ELSE interval '7 days' END)
    ON CONFLICT(bucket) DO UPDATE SET
      attempts=CASE WHEN a.retry_after<=ts THEN 1 ELSE a.attempts+1 END,
      retry_after=CASE WHEN a.retry_after<=ts THEN excluded.retry_after ELSE a.retry_after END
    WHERE a.retry_after<=ts OR a.attempts<limit_count;
    IF NOT FOUND THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE FUNCTION public.customer_reservation_pin_v1(p_business uuid,p_number text,p_password text,p_cancel boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  bucket_id integer := (hashtextextended(coalesce(p_number,''),0)&4095)::integer;
  attempts owner_portal_pilot.reservation_auth_limits;
  credential owner_portal_pilot.reservation_credentials;
  booking owner_portal_pilot.reservations;
  local_zone text;
  current_time_at_start timestamptz := clock_timestamp();
  dummy_hash constant text := '$2a$11$abcdefghijklmnopqrstuuYBOHH5Y2G8oW55mB1s6sK.5c4Dw4AHi';
BEGIN
  IF p_number IS NULL OR p_number !~ '^[A-F0-9]{20}$' OR p_password IS NULL OR p_password !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error','CREDENTIALS');
  END IF;
  PERFORM pg_advisory_xact_lock(921034,bucket_id);
  SELECT * INTO attempts FROM owner_portal_pilot.reservation_auth_limits WHERE bucket=bucket_id;
  IF attempts.retry_after>current_time_at_start AND attempts.failures>=8 THEN
    RETURN jsonb_build_object('error','CREDENTIALS');
  END IF;
  SELECT c.* INTO credential FROM owner_portal_pilot.reservation_credentials c
    JOIN owner_portal_pilot.reservations r ON r.id=c.reservation_id
    WHERE c.booking_number=p_number AND r.business_id=p_business;
  IF extensions.crypt(p_password,coalesce(credential.password_hash,dummy_hash))
      IS DISTINCT FROM coalesce(credential.password_hash,dummy_hash) OR credential.reservation_id IS NULL THEN
    INSERT INTO owner_portal_pilot.reservation_auth_limits AS l VALUES(bucket_id,1,current_time_at_start+interval '5 minutes')
    ON CONFLICT(bucket) DO UPDATE SET
      failures=CASE WHEN l.retry_after<=current_time_at_start THEN 1 ELSE l.failures+1 END,
      retry_after=CASE WHEN l.retry_after<=current_time_at_start THEN excluded.retry_after ELSE l.retry_after END;
    RETURN jsonb_build_object('error','CREDENTIALS');
  END IF;
  IF p_cancel THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_business::text,1942));
    UPDATE owner_portal_pilot.reservations SET status='cancelled',updated_at=clock_timestamp()
      WHERE id=credential.reservation_id AND status IN ('pending','confirmed') AND starts_at>now();
  END IF;
  SELECT * INTO STRICT booking FROM owner_portal_pilot.reservations WHERE id=credential.reservation_id;
  SELECT zone INTO STRICT local_zone FROM owner_portal_pilot.reservation_settings WHERE business_id=p_business;
  RETURN jsonb_build_object('number',p_number,'status',booking.status,'starts_at',booking.starts_at,
    'party',booking.party,'zone',local_zone,'can_cancel',booking.status IN ('pending','confirmed') AND booking.starts_at>now());
END $$;

REVOKE ALL ON FUNCTION public.customer_reservation_pin_v1(uuid,text,text,boolean), public.business_reservation_submit_pin_v1(uuid,uuid,uuid,timestamptz,smallint,text,text,text,text,text), public.reserve_pin_attempt_v1(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.customer_reservation_pin_v1(uuid,text,text,boolean), public.business_reservation_submit_pin_v1(uuid,uuid,uuid,timestamptz,smallint,text,text,text,text,text), public.reserve_pin_attempt_v1(text) TO service_role;
COMMIT;
