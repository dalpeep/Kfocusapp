BEGIN;
SET LOCAL lock_timeout='2s';
DO $$
BEGIN
  IF to_regprocedure('extensions.crypt(text,text)') IS NULL OR
     to_regprocedure('extensions.gen_salt(text,integer)') IS NULL THEN
    RAISE EXCEPTION 'pgcrypto in extensions is required';
  END IF;
END $$;

CREATE TABLE owner_portal_pilot.reservation_credentials (
  reservation_id uuid PRIMARY KEY REFERENCES owner_portal_pilot.reservations(id) ON DELETE RESTRICT,
  booking_number text NOT NULL UNIQUE,
  password_hash text NOT NULL
);
CREATE TABLE owner_portal_pilot.reservation_auth_limits (
  bucket integer PRIMARY KEY CHECK (bucket BETWEEN 0 AND 4096),
  failures integer NOT NULL,
  retry_after timestamptz NOT NULL
);
ALTER TABLE owner_portal_pilot.reservation_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_pilot.reservation_auth_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.reservation_credentials,owner_portal_pilot.reservation_auth_limits
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.business_reservation_submit_v2(p_business uuid,p_id uuid,p_secret uuid,p_slot timestamptz,
  p_party smallint,p_name text,p_phone text,p_email text,p_note text,p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; number text;
BEGIN
  IF p_password IS NULL OR length(p_password)<8 OR octet_length(p_password)>72
    OR p_password !~ '[[:alpha:]]' OR p_password !~ '[^[:alpha:][:space:]]'
    OR lower(p_password) ~ '^(password|qwerty|letmein|daltownmap|admin|welcome|abc123|encpro)' THEN
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
    WHERE reservation_id=p_id AND password_hash=extensions.crypt(p_password,password_hash)
  ) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Reservation unavailable'; END IF;
  WHILE number IS NULL LOOP
    INSERT INTO owner_portal_pilot.reservation_credentials(reservation_id,booking_number,password_hash)
    VALUES(p_id,upper(encode(extensions.gen_random_bytes(10),'hex')),extensions.crypt(p_password,extensions.gen_salt('bf',11)))
    ON CONFLICT(booking_number) DO NOTHING RETURNING booking_number INTO number;
  END LOOP;
  RETURN result || jsonb_build_object('number',number);
END $$;

CREATE FUNCTION public.customer_reservation_v2(p_business uuid,p_number text,p_password text,p_cancel boolean DEFAULT false)
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
  IF p_number IS NULL OR p_number !~ '^[A-F0-9]{20}$' OR p_password IS NULL OR octet_length(p_password)>72 THEN
    RETURN jsonb_build_object('error','CREDENTIALS');
  END IF;
  INSERT INTO owner_portal_pilot.reservation_auth_limits AS l VALUES(4096,1,current_time_at_start+interval '1 second')
  ON CONFLICT(bucket) DO UPDATE SET
    failures=CASE WHEN l.retry_after<=current_time_at_start THEN 1 ELSE l.failures+1 END,
    retry_after=CASE WHEN l.retry_after<=current_time_at_start THEN excluded.retry_after ELSE l.retry_after END
  WHERE l.retry_after<=current_time_at_start OR l.failures<8;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','CREDENTIALS'); END IF;
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

REVOKE ALL ON FUNCTION public.business_reservation_submit_v2(uuid,uuid,uuid,timestamptz,smallint,text,text,text,text,text),
  public.customer_reservation_v2(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_reservation_submit_v2(uuid,uuid,uuid,timestamptz,smallint,text,text,text,text,text),
  public.customer_reservation_v2(uuid,text,text,boolean) TO service_role;
COMMIT;
