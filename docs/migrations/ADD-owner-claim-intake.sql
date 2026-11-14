BEGIN;
SET LOCAL lock_timeout='2s';
-- Stop if either live function differs from the reviewed production baseline.
DO $$
BEGIN
  IF (SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc
      WHERE oid='public.owner_pilot_read_v1(uuid,text,text,integer,integer)'::regprocedure)
      IS DISTINCT FROM '51a2bc466d30041bacb087aa37a345bb'
    OR (SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc
      WHERE oid='public.owner_pilot_command_v1(uuid,jsonb)'::regprocedure)
      IS DISTINCT FROM 'a433a3c4a20648c719a13129cfe74034' THEN
    RAISE EXCEPTION 'Owner claim baseline mismatch';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS owner_portal_pilot.claim_intake_actors (
  actor uuid PRIMARY KEY REFERENCES owner_portal_pilot.actors(actor)
);
ALTER TABLE owner_portal_pilot.claim_intake_actors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_pilot.claim_intake_actors FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.owner_pilot_read_v1(
  p_actor uuid,p_status text DEFAULT NULL,p_kind text DEFAULT NULL,
  p_offset integer DEFAULT 0,p_audit_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE response jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Verified active account required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM owner_portal_pilot.settings WHERE singleton AND enabled FOR SHARE) THEN
    RAISE EXCEPTION USING ERRCODE='OP503', MESSAGE='Owner pilot disabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM owner_portal_pilot.actors WHERE actor=p_actor AND enabled) THEN
    RETURN jsonb_build_object('pilot',true,'claim_intake',
      NOT EXISTS (SELECT 1 FROM owner_portal_pilot.actors WHERE actor=p_actor)
      OR EXISTS (SELECT 1 FROM owner_portal_pilot.claim_intake_actors WHERE actor=p_actor),'is_admin',false,'businesses','[]'::jsonb,
      'claim_candidates','[]'::jsonb,'requests',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC)
      FROM (SELECT id,business_id,status,reason,created_at,kind FROM owner_portal_pilot.requests
        WHERE user_id=p_actor AND kind='claim' ORDER BY created_at DESC,id DESC LIMIT 20) r),'[]'::jsonb));
  END IF;
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
    'claim_intake',NOT (owner_portal_pilot.is_admin(p_actor,'dallas') OR owner_portal_pilot.is_admin(p_actor,'colorado'))
      AND NOT EXISTS (SELECT 1 FROM owner_portal_pilot.businesses WHERE user_id=p_actor),
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

CREATE OR REPLACE FUNCTION public.owner_pilot_command_v1(p_actor uuid,p_command jsonb) RETURNS jsonb
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
  IF action_name='submit' AND request_kind='claim' THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Verified active account required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM owner_portal_pilot.settings WHERE singleton AND enabled FOR SHARE) THEN
      RAISE EXCEPTION USING ERRCODE='OP503', MESSAGE='Owner pilot disabled';
    END IF;
  ELSE
    PERFORM public.owner_pilot_status_v1(p_actor);
  END IF;
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
  IF action_name='submit' AND request_kind='claim' THEN
    INSERT INTO owner_portal_pilot.actors(actor,enabled,administrator) VALUES(p_actor,false,false)
      ON CONFLICT(actor) DO NOTHING;
    IF FOUND THEN
      INSERT INTO owner_portal_pilot.claim_intake_actors(actor) VALUES(p_actor);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM owner_portal_pilot.actors WHERE actor=p_actor AND enabled)
       AND NOT EXISTS (SELECT 1 FROM owner_portal_pilot.claim_intake_actors WHERE actor=p_actor) THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot actor denied';
    END IF;
  END IF;
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
      IF NOT FOUND AND ((action_name='submit' AND request_kind='claim')
        OR (action_name IN ('approve','reject','cancel') AND req.kind='claim')) THEN
        SELECT b.* INTO existing FROM public.businesses b WHERE b.id=bid
          AND (action_name IN ('reject','cancel') OR (b.is_active IS TRUE AND b.list_visible IS TRUE))
          AND b.region IN ('dallas','colorado');
      END IF;
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
      IF existing.id IS NULL OR existing.is_active IS NOT TRUE OR existing.list_visible IS NOT TRUE
         OR business.user_id IS NOT NULL OR patch<>'{}' THEN
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
      IF req.kind='claim' THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=req.user_id AND u.email_confirmed_at IS NOT NULL
          AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
          RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Verified active account required';
        END IF;
      ELSE
        PERFORM public.owner_pilot_status_v1(req.user_id);
      END IF;
      IF req.kind='new' THEN
        IF coalesce(length(btrim(p_command->>'area')),0) NOT BETWEEN 1 AND 100 THEN
          RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Pilot business area required';
        END IF;
        INSERT INTO owner_portal_pilot.businesses(region,details,user_id)
          VALUES(reg,req.changes||jsonb_build_object('area',btrim(p_command->>'area')),req.user_id) RETURNING id INTO bid;
      ELSIF req.kind='claim' THEN
        IF existing.id IS NULL OR existing.is_active IS NOT TRUE OR existing.list_visible IS NOT TRUE
           OR existing.region<>reg OR business.user_id IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Pilot claim conflict';
        END IF;
        INSERT INTO owner_portal_pilot.business_scope(business_id) VALUES(bid) ON CONFLICT DO NOTHING;
        IF NOT EXISTS (SELECT 1 FROM owner_portal_pilot.actors WHERE actor=req.user_id AND enabled)
           AND NOT EXISTS (SELECT 1 FROM owner_portal_pilot.claim_intake_actors WHERE actor=req.user_id) THEN
          RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot actor denied';
        END IF;
        UPDATE owner_portal_pilot.actors SET enabled=true WHERE actor=req.user_id AND NOT administrator;
        DELETE FROM owner_portal_pilot.claim_intake_actors WHERE actor=req.user_id;
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

REVOKE ALL ON FUNCTION public.owner_pilot_read_v1(uuid,text,text,integer,integer),
  public.owner_pilot_command_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_pilot_read_v1(uuid,text,text,integer,integer),
  public.owner_pilot_command_v1(uuid,jsonb) TO service_role;
COMMIT;
