BEGIN;

CREATE TABLE owner_portal_pilot.admin_application_mail (
  kind text NOT NULL CHECK (kind IN ('business','ad','claim','core','coupon','event')),
  application_id text NOT NULL,
  received_at timestamptz NOT NULL,
  business_name text,
  applicant text,
  contact text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempt_started_at timestamptz,
  finished_at timestamptz,
  provider_id text,
  failure_code text,
  PRIMARY KEY (kind, application_id)
);

ALTER TABLE owner_portal_pilot.admin_application_mail ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.admin_application_mail FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE owner_portal_pilot.admin_mail_recipients (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND length(email) <= 254 AND email ~ '^[^[:space:]@,;]+@[^[:space:]@,;]+[.][^[:space:]@,;]+$'),
  kinds text[] NOT NULL DEFAULT ARRAY['business','ad','claim','core','coupon','event']
    CHECK (cardinality(kinds) BETWEEN 1 AND 6 AND array_position(kinds,NULL) IS NULL
      AND kinds <@ ARRAY['business','ad','claim','core','coupon','event']),
  enabled boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  removed_at timestamptz,
  confirmation_hash text,
  confirmation_expires_at timestamptz
);
CREATE TABLE owner_portal_pilot.admin_mail_deliveries (
  kind text NOT NULL,
  application_id text NOT NULL,
  email text NOT NULL REFERENCES owner_portal_pilot.admin_mail_recipients(email),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','uncertain','cancelled')),
  claim_token uuid,
  started_at timestamptz,
  finished_at timestamptz,
  provider_id text,
  failure_code text,
  PRIMARY KEY (kind,application_id,email),
  FOREIGN KEY (kind,application_id) REFERENCES owner_portal_pilot.admin_application_mail(kind,application_id)
);
ALTER TABLE owner_portal_pilot.admin_mail_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_pilot.admin_mail_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.admin_mail_recipients, owner_portal_pilot.admin_mail_deliveries FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_mail_settings_v1(actor uuid, command text, args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  address text := lower(btrim(args->>'email'));
  selection text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=actor AND p.role='super_admin') THEN
    RAISE insufficient_privilege;
  END IF;
  IF command='list' THEN
    RETURN jsonb_build_object(
      'recipients',coalesce((SELECT jsonb_agg(jsonb_build_object('email',r.email,'kinds',r.kinds,
        'enabled',r.enabled,'verified',r.verified_at IS NOT NULL) ORDER BY r.email)
        FROM owner_portal_pilot.admin_mail_recipients r WHERE r.removed_at IS NULL),'[]'::jsonb),
      'deliveries',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.started_at DESC)
        FROM (SELECT email,kind,application_id,status,started_at,finished_at,failure_code
          FROM owner_portal_pilot.admin_mail_deliveries WHERE started_at IS NOT NULL
          ORDER BY started_at DESC LIMIT 50) d),'[]'::jsonb));
  END IF;
  IF command='add' THEN
    IF coalesce(args->>'hash','') !~ '^[a-f0-9]{64}$' THEN RAISE invalid_parameter_value; END IF;
    INSERT INTO owner_portal_pilot.admin_mail_recipients(email,confirmation_hash,confirmation_expires_at)
    VALUES(address,args->>'hash',clock_timestamp()+interval '1 hour')
    ON CONFLICT(email) DO UPDATE SET enabled=true, removed_at=NULL, verified_at=NULL,
      confirmation_hash=excluded.confirmation_hash,confirmation_expires_at=excluded.confirmation_expires_at
    WHERE admin_mail_recipients.removed_at IS NOT NULL OR admin_mail_recipients.verified_at IS NULL;
    RETURN to_jsonb(FOUND);
  END IF;
  IF command='update' THEN
    SELECT array_agg(DISTINCT value) INTO selection FROM jsonb_array_elements_text(args->'kinds');
    IF selection IS NULL OR jsonb_typeof(args->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE invalid_parameter_value; END IF;
    UPDATE owner_portal_pilot.admin_mail_recipients SET kinds=selection, enabled=(args->>'enabled')::boolean
    WHERE email=address AND removed_at IS NULL;
  ELSIF command='remove' THEN
    UPDATE owner_portal_pilot.admin_mail_recipients SET enabled=false,removed_at=clock_timestamp(),
      confirmation_hash=NULL,confirmation_expires_at=NULL WHERE email=address AND removed_at IS NULL;
  ELSE
    RAISE invalid_parameter_value;
  END IF;
  UPDATE owner_portal_pilot.admin_mail_deliveries d SET status='cancelled',finished_at=clock_timestamp()
  WHERE d.email=address AND d.status='pending' AND NOT EXISTS (
    SELECT 1 FROM owner_portal_pilot.admin_mail_recipients r WHERE r.email=d.email AND r.enabled
    AND r.verified_at IS NOT NULL AND r.removed_at IS NULL AND d.kind=ANY(r.kinds));
  RETURN 'true'::jsonb;
END;
$$;

CREATE FUNCTION public.admin_mail_confirm_v1(token_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  UPDATE owner_portal_pilot.admin_mail_recipients
  SET verified_at=clock_timestamp(),confirmation_hash=NULL,confirmation_expires_at=NULL
  WHERE confirmation_hash=token_hash AND confirmation_expires_at>clock_timestamp() AND removed_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.admin_mail_work_v1(command text, args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE job record;
BEGIN
  IF command='claim' THEN
    UPDATE owner_portal_pilot.admin_mail_deliveries
    SET status='uncertain',failure_code='worker_timeout',finished_at=clock_timestamp()
    WHERE status='sending' AND started_at<clock_timestamp()-interval '15 minutes';

    WITH candidate AS (
      SELECT d.kind,d.application_id,d.email
      FROM owner_portal_pilot.admin_mail_deliveries d
      JOIN owner_portal_pilot.admin_mail_recipients r USING(email)
      WHERE d.status='pending' AND r.enabled AND r.verified_at IS NOT NULL
        AND r.removed_at IS NULL AND d.kind=ANY(r.kinds)
      ORDER BY d.application_id,d.kind,d.email
      LIMIT 1 FOR UPDATE OF d,r SKIP LOCKED
    ), claimed AS (
      UPDATE owner_portal_pilot.admin_mail_deliveries d
      SET status='sending',claim_token=gen_random_uuid(),started_at=clock_timestamp()
      FROM candidate c WHERE (d.kind,d.application_id,d.email)=(c.kind,c.application_id,c.email)
      RETURNING d.kind,d.application_id,d.email,d.claim_token
    )
    SELECT c.*,q.received_at,q.business_name,q.applicant,q.contact INTO job
    FROM claimed c JOIN owner_portal_pilot.admin_application_mail q USING(kind,application_id);
    RETURN CASE WHEN FOUND THEN to_jsonb(job) ELSE NULL END;
  ELSIF command='finish' AND args->>'status' IN ('sent','failed','uncertain') THEN
    UPDATE owner_portal_pilot.admin_mail_deliveries
    SET status=args->>'status',finished_at=clock_timestamp(),
      provider_id=left(args->>'provider_id',100),failure_code=left(args->>'failure_code',100)
    WHERE claim_token=(args->>'claim_token')::uuid AND status='sending';
    RETURN to_jsonb(FOUND);
  END IF;
  RAISE invalid_parameter_value;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mail_settings_v1(uuid,text,jsonb),public.admin_mail_confirm_v1(text),
  public.admin_mail_work_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_mail_settings_v1(uuid,text,jsonb),public.admin_mail_confirm_v1(text),
  public.admin_mail_work_v1(text,jsonb) TO service_role;

CREATE FUNCTION owner_portal_pilot.enqueue_admin_application_mail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  row_data jsonb := to_jsonb(NEW);
  application_kind text := coalesce(nullif(TG_ARGV[0], ''), row_data->>'kind');
  business_label text := coalesce(row_data->>'business_name', row_data->>'company_name');
  applicant_label text := coalesce(row_data->>'owner_name', row_data->>'contact_name');
  contact_label text := nullif(concat_ws(' / ', nullif(row_data->>'phone',''), nullif(row_data->>'email','')), '');
BEGIN
  IF application_kind NOT IN ('business','ad','claim','core','coupon','event') THEN
    RETURN NEW;
  END IF;

  IF row_data ? 'business_id' AND row_data->>'business_id' IS NOT NULL THEN
    SELECT coalesce(nullif(b.name_ko,''), nullif(b.name_en,''))
    INTO business_label
    FROM public.businesses b WHERE b.id = (row_data->>'business_id')::uuid;

    IF business_label IS NULL THEN
      SELECT coalesce(nullif(b.details->>'name_ko',''), nullif(b.details->>'name_en',''))
      INTO business_label FROM owner_portal_pilot.businesses b
      WHERE b.id = (row_data->>'business_id')::uuid;
    END IF;
  END IF;

  IF row_data ? 'actor' OR row_data ? 'user_id' THEN
    SELECT nullif(u.raw_user_meta_data->>'full_name',''),
           CASE WHEN u.email_confirmed_at IS NOT NULL THEN u.email END
    INTO applicant_label, contact_label
    FROM auth.users u WHERE u.id = coalesce(row_data->>'actor', row_data->>'user_id')::uuid;
  END IF;

  INSERT INTO owner_portal_pilot.admin_application_mail
    (kind, application_id, received_at, business_name, applicant, contact)
  VALUES (application_kind, row_data->>'id', coalesce((row_data->>'created_at')::timestamptz, now()),
          left(business_label,300), left(applicant_label,300), left(contact_label,500))
  ON CONFLICT (kind, application_id) DO NOTHING;

  IF FOUND THEN
    INSERT INTO owner_portal_pilot.admin_mail_deliveries(kind,application_id,email)
    SELECT application_kind,row_data->>'id',r.email
    FROM owner_portal_pilot.admin_mail_recipients r
    WHERE r.enabled AND r.verified_at IS NOT NULL AND r.removed_at IS NULL
      AND application_kind=ANY(r.kinds);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION owner_portal_pilot.enqueue_admin_application_mail() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enqueue_admin_application_mail AFTER INSERT ON public.business_requests
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.enqueue_admin_application_mail('business');
CREATE TRIGGER enqueue_admin_application_mail AFTER INSERT ON public.advertising_requests
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.enqueue_admin_application_mail('ad');
CREATE TRIGGER enqueue_admin_application_mail AFTER INSERT ON owner_portal_pilot.requests
FOR EACH ROW WHEN (NEW.kind IN ('claim','core'))
EXECUTE FUNCTION owner_portal_pilot.enqueue_admin_application_mail('');
CREATE TRIGGER enqueue_admin_application_mail AFTER INSERT ON owner_portal_pilot.content_reviews
FOR EACH ROW EXECUTE FUNCTION owner_portal_pilot.enqueue_admin_application_mail('');

COMMIT;
