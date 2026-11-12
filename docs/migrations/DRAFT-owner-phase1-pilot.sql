-- Isolated first-stage pilot. Review and test before use. A duplicate install fails closed.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.businesses')
      AND attname='id' AND NOT attisdropped AND atttypid='uuid'::regtype
  ) OR (
    SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.profiles') AND NOT attisdropped
      AND ((attname='user_id' AND atttypid='uuid'::regtype)
        OR (attname IN ('role','area') AND atttypid='text'::regtype))
  ) <> 3 THEN
    RAISE EXCEPTION 'UUID businesses and the existing profile role contract are required';
  END IF;
END $$;

CREATE SCHEMA owner_portal_pilot;
REVOKE ALL ON SCHEMA owner_portal_pilot FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE owner_portal_pilot.settings (
  singleton boolean PRIMARY KEY CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO owner_portal_pilot.settings(singleton) VALUES (true);

CREATE TABLE owner_portal_pilot.actors (
  actor uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  administrator boolean NOT NULL DEFAULT false
);
CREATE TABLE owner_portal_pilot.business_scope (
  business_id uuid PRIMARY KEY
);

-- A claim copies a small snapshot. A new approval creates a private ID. Neither
-- flow changes public.businesses or grants a production owner membership.
CREATE TABLE owner_portal_pilot.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid UNIQUE REFERENCES owner_portal_pilot.business_scope(business_id),
  region text NOT NULL CHECK (region IN ('dallas','colorado')),
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  user_id uuid REFERENCES owner_portal_pilot.actors(actor),
  CHECK (public_id IS NULL OR public_id = id)
);
CREATE TABLE owner_portal_pilot.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES owner_portal_pilot.actors(actor),
  kind text NOT NULL CHECK (kind IN ('new','claim','core')),
  business_id uuid,
  region text NOT NULL CHECK (region IN ('dallas','colorado')),
  changes jsonb NOT NULL DEFAULT '{}',
  baseline jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  submission_reason text,
  reason text,
  reviewed_by uuid REFERENCES owner_portal_pilot.actors(actor),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_portal_pilot.commands (
  actor uuid NOT NULL REFERENCES owner_portal_pilot.actors(actor),
  key uuid NOT NULL,
  command jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor,key)
);
ALTER TABLE owner_portal_pilot.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_pilot.actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_pilot.business_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_pilot.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_pilot.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_pilot.commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA owner_portal_pilot FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.owner_pilot_status_v1(p_actor uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE active boolean;
BEGIN
  -- Hold until this RPC transaction ends. Turning OFF waits for in-flight calls.
  SELECT enabled INTO active FROM owner_portal_pilot.settings WHERE singleton FOR SHARE;
  IF active IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='OP503', MESSAGE='Owner pilot disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM owner_portal_pilot.actors a JOIN auth.users u ON u.id=a.actor
    WHERE a.actor=p_actor AND a.enabled AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
  ) THEN
    RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Owner pilot actor denied';
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION owner_portal_pilot.is_admin(p_actor uuid,p_region text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM owner_portal_pilot.actors WHERE actor=p_actor AND enabled AND administrator)
    AND EXISTS(
      SELECT 1 FROM public.profiles p WHERE p.user_id=p_actor
        AND (p.role='super_admin' OR (
          p.role='regional_editor' AND p_region IN ('dallas','colorado')
          AND CASE p.area WHEN 'denver' THEN 'colorado' ELSE p.area END=p_region
        ))
    )
$$;
REVOKE ALL ON FUNCTION owner_portal_pilot.is_admin(uuid,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.owner_pilot_read_v1(
  p_actor uuid,p_status text DEFAULT NULL,p_kind text DEFAULT NULL,
  p_offset integer DEFAULT 0,p_audit_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE response jsonb;
BEGIN
  PERFORM public.owner_pilot_status_v1(p_actor);
  WITH scoped AS (
    SELECT r.* FROM owner_portal_pilot.requests r
    WHERE r.user_id=p_actor OR owner_portal_pilot.is_admin(p_actor,r.region)
  ), filtered AS (
    SELECT * FROM scoped WHERE (p_status IS NULL OR status=p_status) AND (p_kind IS NULL OR kind=p_kind)
  ), history AS (
    SELECT c.created_at,c.actor,c.result->>'request_id' AS request_id,c.result->>'business_id' AS business_id,
      c.command->>'action' AS action,c.command->>'reason' AS reason
    FROM owner_portal_pilot.commands c
    LEFT JOIN owner_portal_pilot.requests r ON r.id=(c.result->>'request_id')::uuid
    LEFT JOIN owner_portal_pilot.businesses b ON b.id=(c.result->>'business_id')::uuid
    WHERE owner_portal_pilot.is_admin(p_actor,coalesce(r.region,b.region))
  )
  SELECT jsonb_build_object(
    'pilot',true,
    'is_admin',owner_portal_pilot.is_admin(p_actor,'dallas') OR owner_portal_pilot.is_admin(p_actor,'colorado'),
    'claim_candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name_ko',b.name_ko,'name_en',b.name_en) ORDER BY b.id)
      FROM owner_portal_pilot.business_scope s JOIN public.businesses b ON b.id=s.business_id
      WHERE NOT EXISTS (SELECT 1 FROM owner_portal_pilot.businesses owned WHERE owned.public_id=b.id AND owned.user_id IS NOT NULL)),'[]'),
    'businesses',coalesce((SELECT jsonb_agg(b.details||jsonb_build_object('id',b.id,'region',b.region)
      ORDER BY b.id) FROM owner_portal_pilot.businesses b WHERE b.user_id=p_actor),'[]'),
    'requests',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC)
      FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 20
        OFFSET greatest(0,least(p_offset,999999))) r),'[]'),
    'request_total',(SELECT count(*) FROM filtered),
    'counts',(SELECT jsonb_build_object(
      'pending',count(*) FILTER (WHERE status='pending'),
      'approved',count(*) FILTER (WHERE status='approved'),
      'rejected',count(*) FILTER (WHERE status='rejected'),
      'new',count(*) FILTER (WHERE status='pending' AND kind='new'),
      'claim',count(*) FILTER (WHERE status='pending' AND kind='claim'),
      'core',count(*) FILTER (WHERE status='pending' AND kind='core')) FROM scoped),
    'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('business_id',b.id,'user_id',b.user_id,'active',true))
      FROM owner_portal_pilot.businesses b WHERE b.user_id IS NOT NULL
        AND owner_portal_pilot.is_admin(p_actor,b.region)),'[]'),
    'audit_total',(SELECT count(*) FROM history),
    'audit',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC)
      FROM (SELECT * FROM history ORDER BY created_at DESC LIMIT 20
        OFFSET greatest(0,least(p_audit_offset,999999))) h),'[]')
  ) INTO response;
  RETURN response;
END $$;

CREATE FUNCTION public.owner_pilot_command_v1(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  action_name text:=p_command->>'action'; request_kind text:=p_command->>'kind';
  command_key uuid; bid uuid; rid uuid; reg text; reason_text text;
  patch jsonb:=coalesce(p_command->'changes','{}');
  baseline_data jsonb:=coalesce(p_command->'baseline','{}');
  req owner_portal_pilot.requests; business owner_portal_pilot.businesses;
  existing public.businesses; previous owner_portal_pilot.commands; response jsonb;
  core_fields text[]:=ARRAY['name_ko','name_en','address','phone','category_ko'];
BEGIN
  PERFORM public.owner_pilot_status_v1(p_actor);
  IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR action_name IS NULL
     OR action_name NOT IN ('submit','update','approve','reject','cancel','revoke')
     OR length(p_command::text)>20000 THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid pilot command';
  END IF;
  command_key:=(p_command->>'key')::uuid;
  IF command_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Pilot request key required';
  END IF;
  -- Serialize commands for the small pilot cohort, including competing claims.
  PERFORM pg_advisory_xact_lock(hashtextextended('daltownmap:owner-phase1',0));
  SELECT * INTO previous FROM owner_portal_pilot.commands WHERE actor=p_actor AND key=command_key;
  IF FOUND THEN
    IF previous.command<>p_command THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Pilot request key conflict';
    END IF;
    RETURN previous.result;
  END IF;
  bid:=(p_command->>'business_id')::uuid;
  reason_text:=nullif(btrim(p_command->>'reason'),'');
  IF coalesce(length(reason_text),0)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid pilot reason';
  END IF;

  IF action_name IN ('approve','reject','cancel') THEN
    SELECT * INTO req FROM owner_portal_pilot.requests WHERE id=(p_command->>'request_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot request denied'; END IF;
    rid:=req.id; bid:=req.business_id; reg:=req.region;
    IF action_name='cancel' THEN
      IF req.user_id<>p_actor THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot request denied'; END IF;
    ELSIF req.user_id=p_actor OR NOT owner_portal_pilot.is_admin(p_actor,reg) THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot reviewer denied';
    END IF;
    IF req.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Pilot request already reviewed'; END IF;
  END IF;
  IF bid IS NOT NULL THEN
    SELECT * INTO business FROM owner_portal_pilot.businesses WHERE id=bid FOR UPDATE;
    IF business.id IS NULL OR business.public_id IS NOT NULL THEN
      SELECT b.* INTO existing FROM public.businesses b JOIN owner_portal_pilot.business_scope s ON s.business_id=b.id
      WHERE b.id=bid;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot business denied'; END IF;
    END IF;
    reg:=coalesce(reg,business.region,existing.region);
  END IF;

  IF action_name='submit' THEN
    IF request_kind IS NULL OR request_kind NOT IN ('new','claim','core')
       OR (request_kind='new' AND bid IS NOT NULL) OR (request_kind<>'new' AND bid IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid pilot request';
    END IF;
    IF request_kind='new' THEN
      reg:=p_command->>'region';
      IF reg IS DISTINCT FROM 'dallas' THEN
        RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid pilot region';
      END IF;
    END IF;
    IF (SELECT count(*) FROM owner_portal_pilot.requests WHERE user_id=p_actor
        AND created_at>now()-interval '1 hour')>=5 THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Pilot request limit';
    END IF;
    IF request_kind='claim' THEN
      IF existing.id IS NULL OR business.user_id IS NOT NULL OR patch<>'{}' THEN
        RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot claim denied';
      END IF;
    ELSE
      IF jsonb_typeof(patch)<>'object' OR patch='{}' THEN
        RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid pilot core fields';
      END IF;
      IF EXISTS(SELECT 1 FROM jsonb_each(patch) e WHERE NOT(e.key=ANY(core_fields))
         OR jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>500
         OR (e.key NOT IN ('name_ko','name_en') AND btrim(e.value#>>'{}')='')) THEN
        RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid pilot core fields';
      END IF;
      IF request_kind='new' THEN
        IF NOT patch ?& ARRAY['address','phone','category_ko'] OR
           coalesce(nullif(btrim(patch->>'name_ko'),''),nullif(btrim(patch->>'name_en'),'')) IS NULL THEN
          RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Pilot business details required';
        END IF;
      ELSE
        IF business.user_id IS DISTINCT FROM p_actor THEN
          RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot ownership required';
        END IF;
        IF coalesce(nullif(btrim(coalesce(patch->>'name_ko',business.details->>'name_ko')),''),
                    nullif(btrim(coalesce(patch->>'name_en',business.details->>'name_en')),'')) IS NULL THEN
          RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Pilot business name required';
        END IF;
        IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT(baseline_data ? k)
           OR coalesce(business.details->k,'null'::jsonb) IS DISTINCT FROM baseline_data->k) THEN
          RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Pilot baseline changed';
        END IF;
      END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM owner_portal_pilot.requests r WHERE r.status='pending'
       AND r.user_id=p_actor AND r.kind=request_kind AND r.business_id IS NOT DISTINCT FROM bid) THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Pilot request already pending';
    END IF;
    INSERT INTO owner_portal_pilot.requests(user_id,kind,business_id,region,changes,baseline,submission_reason)
      VALUES(p_actor,request_kind,bid,reg,patch,baseline_data,reason_text) RETURNING id INTO rid;

  ELSIF action_name IN ('approve','reject','cancel') THEN
    IF action_name='approve' THEN
      PERFORM public.owner_pilot_status_v1(req.user_id);
      IF req.kind='new' THEN
        IF coalesce(length(btrim(p_command->>'area')),0) NOT BETWEEN 1 AND 100 THEN
          RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Pilot business area required';
        END IF;
        INSERT INTO owner_portal_pilot.businesses(region,details,user_id)
          VALUES(reg,req.changes||jsonb_build_object('area',btrim(p_command->>'area')),req.user_id) RETURNING id INTO bid;
      ELSIF req.kind='claim' THEN
        IF existing.id IS NULL OR existing.region<>reg OR business.user_id IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Pilot claim conflict';
        END IF;
        INSERT INTO owner_portal_pilot.businesses(id,public_id,region,details,user_id)
          VALUES(bid,bid,reg,jsonb_build_object('name_ko',existing.name_ko,'name_en',existing.name_en,
            'address',existing.address,'phone',existing.phone,'category_ko',existing.category_ko,
            'description',existing.description,'hours',existing.hours),req.user_id)
          ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, region=excluded.region, details=excluded.details;
      ELSE
        IF business.user_id IS DISTINCT FROM req.user_id OR EXISTS(
          SELECT 1 FROM jsonb_object_keys(req.changes) k
          WHERE coalesce(business.details->k,'null'::jsonb) IS DISTINCT FROM req.baseline->k
        ) THEN
          RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Pilot baseline or ownership changed';
        END IF;
        UPDATE owner_portal_pilot.businesses SET details=details||req.changes WHERE id=bid;
      END IF;
      reason_text:=coalesce(reason_text,'관리자 승인');
    ELSIF action_name='cancel' THEN
      reason_text:='신청자 취소';
    ELSIF reason_text IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Pilot rejection reason required';
    END IF;
    UPDATE owner_portal_pilot.requests SET business_id=bid,reviewed_by=p_actor,reviewed_at=now(),
      reason=reason_text,status=CASE action_name WHEN 'approve' THEN 'approved'
        WHEN 'reject' THEN 'rejected' ELSE 'cancelled' END WHERE id=rid;

  ELSIF action_name='update' THEN
    IF business.user_id IS DISTINCT FROM p_actor THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot ownership required';
    END IF;
    IF jsonb_typeof(patch)<>'object' OR patch='{}' THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid pilot general fields';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(patch) e WHERE e.key NOT IN ('description','hours')
       OR jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>5000) THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid pilot general fields';
    END IF;
    UPDATE owner_portal_pilot.businesses SET details=details||patch WHERE id=bid;
  ELSE
    IF business.user_id IS NULL OR business.user_id IS DISTINCT FROM (p_command->>'user_id')::uuid
       OR NOT owner_portal_pilot.is_admin(p_actor,business.region) OR reason_text IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot revocation denied';
    END IF;
    UPDATE owner_portal_pilot.businesses SET user_id=NULL WHERE id=bid;
  END IF;
  response:=jsonb_build_object('request_id',rid,'business_id',bid,'action',action_name,'pilot',true);
  INSERT INTO owner_portal_pilot.commands(actor,key,command,result) VALUES(p_actor,command_key,p_command,response);
  RETURN response;
END $$;

REVOKE ALL ON FUNCTION public.owner_pilot_status_v1(uuid),public.owner_pilot_read_v1(uuid,text,text,integer,integer),
  public.owner_pilot_command_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_pilot_status_v1(uuid),public.owner_pilot_read_v1(uuid,text,text,integer,integer),
  public.owner_pilot_command_v1(uuid,jsonb) TO service_role;

COMMIT;
