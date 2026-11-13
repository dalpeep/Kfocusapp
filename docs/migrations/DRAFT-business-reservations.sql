BEGIN;
SET LOCAL lock_timeout='2s';
CREATE TABLE owner_portal_pilot.reservation_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  weekdays smallint[] NOT NULL CHECK (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[] AND array_position(weekdays,NULL) IS NULL),
  opens time NOT NULL,
  closes time NOT NULL CHECK (closes>opens),
  slot_minutes smallint NOT NULL CHECK(slot_minutes IN (15,30,60)),
  capacity smallint NOT NULL CHECK(capacity BETWEEN 1 AND 100),
  capacity_mode text NOT NULL CHECK(capacity_mode IN ('people','bookings')),
  zone text NOT NULL CHECK(zone IN ('America/Chicago','America/Denver')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_portal_pilot.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES owner_portal_pilot.reservation_settings(business_id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
  party smallint NOT NULL CHECK(party BETWEEN 1 AND 100),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  phone text NOT NULL CHECK(phone ~ '^[0-9]{10,15}$'),
  email text CHECK(length(email)<=254),
  note text CHECK(length(note)<=300),
  secret_hash bytea NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','cancelled')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservations_active_slots ON owner_portal_pilot.reservations(business_id,starts_at,ends_at)
  WHERE status IN ('pending','confirmed');
CREATE UNIQUE INDEX reservation_contact_slot ON owner_portal_pilot.reservations(business_id,starts_at,phone)
  WHERE status IN ('pending','confirmed');
ALTER TABLE owner_portal_pilot.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_pilot.reservation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.reservations,owner_portal_pilot.reservation_settings FROM PUBLIC,anon,authenticated,service_role;

-- Launch scope is independent of booking settings so all businesses default OFF.
CREATE TABLE owner_portal_pilot.reservation_launch_scope (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT
);
ALTER TABLE owner_portal_pilot.reservation_launch_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.reservation_launch_scope FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.business_reservation_enabled_v1(p_business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM owner_portal_pilot.reservation_settings s
    JOIN owner_portal_pilot.reservation_launch_scope launch USING(business_id)
    JOIN public.businesses b ON b.id=s.business_id
    WHERE s.business_id=p_business AND s.enabled AND b.is_active AND b.list_visible);
$$;
REVOKE ALL ON FUNCTION public.business_reservation_enabled_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_reservation_enabled_v1(uuid) TO anon,authenticated,service_role;

CREATE FUNCTION owner_portal_pilot.reservation_has_capacity(
  p_business uuid,p_start timestamptz,p_end timestamptz,p_party smallint,p_capacity smallint,p_mode text)
RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
  SELECT coalesce(sum(CASE WHEN p_mode='people' THEN r.party ELSE 1 END),0)
    + CASE WHEN p_mode='people' THEN p_party ELSE 1 END <= p_capacity
  FROM owner_portal_pilot.reservations r
  WHERE r.business_id=p_business AND r.starts_at<p_end AND r.ends_at>p_start
    AND r.status IN ('pending','confirmed');
$$;
REVOKE ALL ON FUNCTION owner_portal_pilot.reservation_has_capacity(uuid,timestamptz,timestamptz,smallint,smallint,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.business_reservation_slots_v1(p_business uuid,p_date date,p_party smallint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s owner_portal_pilot.reservation_settings; today date;
BEGIN
  IF NOT public.business_reservation_enabled_v1(p_business) OR p_party IS NULL OR p_party NOT BETWEEN 1 AND 100 THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT * INTO STRICT s FROM owner_portal_pilot.reservation_settings WHERE business_id=p_business;
  today := (clock_timestamp() AT TIME ZONE s.zone)::date;
  IF p_date IS NULL OR p_date<today OR p_date>today+60 OR NOT extract(dow FROM p_date)::smallint=ANY(s.weekdays) THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('starts_at',instant,'local_time',to_char(local_slot,'HH24:MI')) ORDER BY instant)
    FROM generate_series(p_date+s.opens,p_date+s.closes-make_interval(mins=>s.slot_minutes),make_interval(mins=>s.slot_minutes)) local_slot
    CROSS JOIN LATERAL (SELECT local_slot AT TIME ZONE s.zone AS instant) slot
    WHERE (instant AT TIME ZONE s.zone)=local_slot AND instant>clock_timestamp()
      AND ((instant+make_interval(mins=>s.slot_minutes)) AT TIME ZONE s.zone)=local_slot+make_interval(mins=>s.slot_minutes)
      AND owner_portal_pilot.reservation_has_capacity(p_business,instant,instant+make_interval(mins=>s.slot_minutes),p_party,s.capacity,s.capacity_mode)),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.business_reservation_slots_v1(uuid,date,smallint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_reservation_slots_v1(uuid,date,smallint) TO anon,authenticated,service_role;

-- The HTTP server must verify anti-bot proof and rate limits before invoking this RPC.
CREATE FUNCTION public.business_reservation_submit_v1(p_business uuid,p_id uuid,p_secret uuid,p_slot timestamptz,
  p_party smallint,p_name text,p_phone text,p_email text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s owner_portal_pilot.reservation_settings; prior owner_portal_pilot.reservations;
BEGIN
  IF p_id IS NULL OR p_secret IS NULL OR p_slot IS NULL OR p_party IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid reservation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business::text,1942));
  SELECT * INTO prior FROM owner_portal_pilot.reservations WHERE id=p_id AND business_id=p_business AND secret_hash=sha256(uuid_send(p_secret));
  IF FOUND THEN RETURN jsonb_build_object('id',prior.id,'status',prior.status); END IF;
  SELECT * INTO s FROM owner_portal_pilot.reservation_settings WHERE business_id=p_business;
  IF (SELECT count(*) FROM owner_portal_pilot.reservations WHERE business_id=p_business AND created_at>now()-interval '1 minute')>=15 THEN
    RAISE EXCEPTION USING ERRCODE='OP429',MESSAGE='Reservation intake limit';
  END IF;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.business_reservation_slots_v1(p_business,(p_slot AT TIME ZONE s.zone)::date,p_party)) slot
    WHERE (slot->>'starts_at')::timestamptz=p_slot
  ) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Slot unavailable'; END IF;
  INSERT INTO owner_portal_pilot.reservations(id,business_id,starts_at,ends_at,party,name,phone,email,note,secret_hash)
  VALUES(p_id,p_business,p_slot,p_slot+make_interval(mins=>s.slot_minutes),p_party,btrim(p_name),
    regexp_replace(p_phone,'[^0-9]','','g'),nullif(btrim(p_email),''),nullif(btrim(p_note),''),sha256(uuid_send(p_secret)));
  RETURN jsonb_build_object('id',p_id,'status','pending');
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Reservation conflict';
WHEN check_violation OR not_null_violation THEN
  RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid reservation details';
END $$;
REVOKE ALL ON FUNCTION public.business_reservation_submit_v1(uuid,uuid,uuid,timestamptz,smallint,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_reservation_submit_v1(uuid,uuid,uuid,timestamptz,smallint,text,text,text,text) TO service_role;
CREATE FUNCTION public.owner_reservations_v1(p_actor uuid,p_business uuid,p_command jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE config owner_portal_pilot.reservation_settings; changed uuid; action text:=p_command->>'action';
BEGIN
  PERFORM public.owner_pilot_gallery_v1(p_actor,p_business);
  IF p_command IS NULL THEN
    RETURN jsonb_build_object('settings',(SELECT to_jsonb(s) FROM owner_portal_pilot.reservation_settings s WHERE s.business_id=p_business),
      'counts',(SELECT coalesce(jsonb_object_agg(status,total),'{}'::jsonb)
        FROM (SELECT status,count(*) AS total FROM owner_portal_pilot.reservations WHERE business_id=p_business GROUP BY status) grouped),
      'reservations',(SELECT coalesce(jsonb_agg(to_jsonb(r)-'secret_hash' ORDER BY starts_at,id),'[]'::jsonb)
        FROM (SELECT * FROM owner_portal_pilot.reservations WHERE business_id=p_business ORDER BY starts_at DESC,id LIMIT 250) r));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business::text,1942));
  IF action='settings' THEN
    config:=jsonb_populate_record(NULL::owner_portal_pilot.reservation_settings,p_command->'settings');
    IF config.enabled AND NOT EXISTS (SELECT 1 FROM owner_portal_pilot.reservation_launch_scope WHERE business_id=p_business) THEN
      RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Reservation pilot scope';
    END IF;
    INSERT INTO owner_portal_pilot.reservation_settings AS s(business_id,enabled,weekdays,opens,closes,slot_minutes,capacity,capacity_mode,zone)
    VALUES(p_business,config.enabled,config.weekdays,config.opens,config.closes,config.slot_minutes,config.capacity,config.capacity_mode,config.zone)
    ON CONFLICT(business_id) DO UPDATE SET enabled=excluded.enabled,weekdays=excluded.weekdays,opens=excluded.opens,
      closes=excluded.closes,slot_minutes=excluded.slot_minutes,capacity=excluded.capacity,
      capacity_mode=excluded.capacity_mode,zone=excluded.zone,updated_at=clock_timestamp();
    RETURN jsonb_build_object('enabled',config.enabled);
  END IF;
  IF action IS NULL OR action NOT IN ('confirmed','rejected','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Invalid reservation status';
  END IF;
  UPDATE owner_portal_pilot.reservations SET status=action,updated_at=clock_timestamp()
    WHERE business_id=p_business AND id=(p_command->>'id')::uuid
    AND ((status='pending' AND (action<>'confirmed' OR starts_at>now())) OR (status='confirmed' AND action='cancelled'))
    RETURNING id INTO changed;
  IF changed IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Reservation unavailable or changed'; END IF;
  RETURN jsonb_build_object('id',changed,'status',action);
EXCEPTION WHEN data_exception OR check_violation OR not_null_violation THEN
  RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Invalid reservation settings';
END $$;
REVOKE ALL ON FUNCTION public.owner_reservations_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_reservations_v1(uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.customer_reservation_v1(p_id uuid,p_secret uuid,p_cancel boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE found_row owner_portal_pilot.reservations; target_business uuid;
BEGIN
  IF p_cancel THEN
    SELECT business_id INTO target_business FROM owner_portal_pilot.reservations
      WHERE id=p_id AND secret_hash=sha256(uuid_send(p_secret));
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Reservation unavailable'; END IF;
    -- Use the same business lock as submission and owner updates.
    PERFORM pg_advisory_xact_lock(hashtextextended(target_business::text,1942));
  END IF;
  SELECT * INTO found_row FROM owner_portal_pilot.reservations
    WHERE id=p_id AND secret_hash=sha256(uuid_send(p_secret));
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Reservation unavailable'; END IF;
  IF p_cancel AND found_row.status IN ('pending','confirmed') AND found_row.starts_at>now() THEN
    UPDATE owner_portal_pilot.reservations SET status='cancelled',updated_at=clock_timestamp() WHERE id=found_row.id
      RETURNING * INTO found_row;
  END IF;
  RETURN jsonb_build_object('id',found_row.id,'status',found_row.status,'starts_at',found_row.starts_at,'party',found_row.party);
END $$;
REVOKE ALL ON FUNCTION public.customer_reservation_v1(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.customer_reservation_v1(uuid,uuid,boolean) TO service_role;

COMMIT;
