-- DRAFT. Requires separate production approval and isolated QA before apply.
-- Rollback: reapply DRAFT-PROD-owner-review-existing-content.sql (verified operating v27 body).
-- Rolling back the function does not republish cancelled events or erase their audit entries.
-- Existing ACLs, RLS, table schemas and review records are preserved by installation.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.owner_content_review_v1(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  action_name text := p_command->>'action';
  business uuid := (p_command->>'business_id')::uuid;
  kind_name text := p_command->>'kind';
  command_key uuid := (p_command->>'key')::uuid;
  target uuid := (p_command->>'target_id')::uuid;
  review owner_portal_pilot.content_reviews;
  source public.businesses;
  fields jsonb := p_command->'fields';
  start_time timestamptz;
  end_time timestamptz;
  live_version timestamptz;
  output_id uuid;
  cancellation jsonb;
  review_note text := nullif(btrim(p_command->>'reason'),'');
BEGIN
  PERFORM 1 FROM owner_portal_pilot.actors WHERE actor = p_actor FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Pilot actor denied'; END IF;
  PERFORM public.owner_pilot_status_v1(p_actor);
  IF action_name='admin_list' THEN
    IF NOT (owner_portal_pilot.is_admin(p_actor,'dallas') OR owner_portal_pilot.is_admin(p_actor,'colorado')) THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Administrator required';
    END IF;
    RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]')
      FROM (SELECT r.*,coalesce(b.name_ko,b.name_en) AS business_name
        FROM owner_portal_pilot.content_reviews r JOIN public.businesses b ON b.id=r.business_id
        WHERE r.status='pending' AND owner_portal_pilot.is_admin(p_actor,b.region)
        ORDER BY r.created_at,r.id LIMIT 50) q);
  END IF;
  IF action_name='event_cancellation_status' THEN
    PERFORM owner_portal_pilot.content_reviewer_owner(p_actor,business);
    RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,
        'can_cancel',e.is_active AND cancelled.result IS NULL,
        'cancelled_at',cancelled.result->>'cancelled_at') ORDER BY e.id),'[]'::jsonb)
      FROM public.events e
      LEFT JOIN LATERAL (
        SELECT c.result FROM owner_portal_pilot.commands c
        WHERE c.command @> jsonb_build_object('action','cancel_reviewed_event','business_id',business,'event_id',e.id)
        ORDER BY c.created_at DESC LIMIT 1
      ) cancelled ON true
      WHERE e.business_id=business AND EXISTS (SELECT 1 FROM owner_portal_pilot.content_reviews r
        WHERE r.kind='event' AND r.business_id=business AND r.published_id=e.id AND r.status='approved'));
  END IF;
  IF action_name='cancel_event' THEN
    PERFORM owner_portal_pilot.content_reviewer_owner(p_actor,business);
    IF target IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Event required'; END IF;
    PERFORM 1 FROM public.events e WHERE e.id=target AND e.business_id=business FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Event outside business scope'; END IF;
    SELECT c.result INTO cancellation FROM owner_portal_pilot.commands c
      WHERE c.command @> jsonb_build_object('action','cancel_reviewed_event','business_id',business,'event_id',target)
      ORDER BY c.created_at DESC LIMIT 1;
    IF FOUND THEN RETURN cancellation; END IF;
    IF NOT EXISTS (SELECT 1 FROM owner_portal_pilot.content_reviews r
      WHERE r.kind='event' AND r.business_id=business AND r.published_id=target AND r.status='approved') THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Approved event required';
    END IF;
    UPDATE public.events SET is_active=false,updated_at=clock_timestamp()
      WHERE id=target AND business_id=business AND is_active IS TRUE
      RETURNING jsonb_build_object('id',id,'status','cancelled','cancelled_at',updated_at,'cancelled_by',p_actor)
      INTO cancellation;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Event is no longer active'; END IF;
    INSERT INTO owner_portal_pilot.commands(actor,key,command,result) VALUES(p_actor,gen_random_uuid(),
      jsonb_build_object('action','cancel_reviewed_event','business_id',business,'event_id',target),cancellation);
    RETURN cancellation;
  END IF;
  IF action_name='admin_history' THEN
    IF NOT (owner_portal_pilot.is_admin(p_actor,'dallas') OR owner_portal_pilot.is_admin(p_actor,'colorado')) THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Administrator required';
    END IF;
    RETURN (
      WITH scoped AS MATERIALIZED (
        SELECT r.id, r.actor, r.business_id, r.kind,
               CASE WHEN cancelled.result IS NOT NULL THEN 'cancelled' ELSE r.status END AS status,
               r.status AS review_status, r.payload, r.review_reason, r.created_at, r.reviewed_at,
               r.reviewed_by, r.published_id, cancelled.result->>'cancelled_at' AS cancelled_at,
               cancelled.result->>'cancelled_by' AS cancelled_by,
               coalesce(b.name_ko,b.name_en) AS business_name, b.region
        FROM owner_portal_pilot.content_reviews r
        JOIN public.businesses b ON b.id=r.business_id
        LEFT JOIN LATERAL (
          SELECT c.result FROM owner_portal_pilot.commands c
          WHERE r.kind='event' AND r.status='approved' AND r.published_id IS NOT NULL
            AND c.command @> jsonb_build_object('action','cancel_reviewed_event','business_id',r.business_id,'event_id',r.published_id)
          ORDER BY c.created_at DESC LIMIT 1
        ) cancelled ON true
        WHERE owner_portal_pilot.is_admin(p_actor,b.region)
      ), page AS (
        SELECT * FROM scoped ORDER BY created_at DESC,id DESC
        LIMIT 50 OFFSET greatest(0,least(coalesce((p_command->>'offset')::integer,0),999999))
      )
      SELECT jsonb_build_object(
        'rows',(SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC),'[]'::jsonb) FROM page),
        'total',(SELECT count(*) FROM scoped),
        'pending',(SELECT jsonb_build_object(
          'coupon',count(*) FILTER (WHERE kind='coupon' AND status='pending'),
          'event',count(*) FILTER (WHERE kind='event' AND status='pending')) FROM scoped)
      )
    );
  END IF;
  IF action_name IN ('approve','reject') THEN
    SELECT * INTO review FROM owner_portal_pilot.content_reviews WHERE id=(p_command->>'request_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Review not available'; END IF;
    business:=review.business_id;
    kind_name:=review.kind;
    fields:=review.payload;
    target:=review.target_id;
    SELECT * INTO STRICT source FROM public.businesses WHERE id=business FOR SHARE;
    PERFORM 1 FROM public.profiles WHERE user_id = p_actor FOR SHARE;
    IF review.actor=p_actor OR NOT owner_portal_pilot.is_admin(p_actor,source.region) THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Scoped administrator required';
    END IF;
    IF review.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Already reviewed'; END IF;
    IF length(review_note)>1000 OR (action_name='reject' AND review_note IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Review reason required';
    END IF;
    IF action_name='reject' THEN
      UPDATE owner_portal_pilot.content_reviews SET status='rejected',reviewed_by=p_actor,
        reviewed_at=now(),review_reason=review_note WHERE id=review.id;
      RETURN jsonb_build_object('id',review.id,'status','rejected');
    END IF;
    PERFORM owner_portal_pilot.content_reviewer_owner(review.actor,business);
  ELSIF action_name IN ('list','submit') THEN
    PERFORM owner_portal_pilot.content_reviewer_owner(p_actor,business);
    IF action_name='list' THEN
      RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]')
        FROM (SELECT id,kind,payload,status,published_id,review_reason,created_at
          FROM owner_portal_pilot.content_reviews
          WHERE actor=p_actor AND business_id=business ORDER BY created_at DESC,id DESC LIMIT 50) q);
    END IF;
    IF command_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Request key required'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||command_key::text,0));
    SELECT * INTO review FROM owner_portal_pilot.content_reviews WHERE actor=p_actor AND content_reviews.request_key=command_key;
    IF FOUND THEN
      IF (review.business_id,review.kind,review.target_id,review.payload) IS DISTINCT FROM (business,kind_name,target,fields) THEN
        RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Request key already used';
      END IF;
      RETURN jsonb_build_object('id',review.id,'status',review.status);
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Unknown action';
  END IF;

  IF kind_name IS NULL OR kind_name NOT IN ('coupon','event') OR jsonb_typeof(fields) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_each(fields) f WHERE f.key NOT IN ('title','description','start_at','end_at','detail')
      OR jsonb_typeof(f.value)<>'string')
    OR length(btrim(coalesce(fields->>'title',''))) NOT BETWEEN 1 AND 160
    OR length(coalesce(fields->>'description',''))>3000
    OR length(btrim(coalesce(fields->>'detail',''))) NOT BETWEEN 1 AND 160
    OR coalesce(fields->>'start_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$'
    OR coalesce(fields->>'end_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid content';
  END IF;
  start_time:=(fields->>'start_at')::timestamptz;
  end_time:=(fields->>'end_at')::timestamptz;
  IF start_time>=end_time OR end_time<=now() THEN RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid period'; END IF;

  IF target IS NOT NULL THEN
    -- Legacy records use the same ownership gate and optimistic locking.
    -- Multi-business and non-display coupons stay in administrator workflows.
    IF kind_name='coupon' THEN
      SELECT updated_at INTO live_version FROM public.coupons
      WHERE id=target AND business_id=business
        AND coalesce(delivery_mode,'display')='display'
        AND coalesce(business_ids,ARRAY[]::text[]) <@ ARRAY[business::text]
      FOR UPDATE;
    ELSE
      SELECT updated_at INTO live_version FROM public.events
      WHERE id=target AND business_id=business FOR UPDATE;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='OP403', MESSAGE='Content outside review scope';
    END IF;
    IF kind_name='event' AND EXISTS (SELECT 1 FROM owner_portal_pilot.commands c
      WHERE c.command @> jsonb_build_object('action','cancel_reviewed_event','business_id',business,'event_id',target)) THEN
      RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Cancelled event requires a new request';
    END IF;
  END IF;

  IF action_name='submit' THEN
    INSERT INTO owner_portal_pilot.content_reviews(actor,business_id,kind,request_key,target_id,expected_version,payload)
      VALUES(p_actor,business,kind_name,command_key,target,live_version,fields) RETURNING * INTO review;
    RETURN jsonb_build_object('id',review.id,'status','pending');
  END IF;

  IF live_version IS DISTINCT FROM review.expected_version THEN
    RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Published content changed';
  END IF;
  IF kind_name='coupon' THEN
    IF target IS NULL THEN
      INSERT INTO public.coupons(business_id,business_ids,area,region,title,description,discount_label,
        start_at,end_at,is_active,delivery_mode,marketing_opt_in_enabled)
      VALUES(business,ARRAY[business::text],source.area,source.region,fields->>'title',fields->>'description',
        fields->>'detail',start_time,end_time,true,'display',false) RETURNING id INTO output_id;
    ELSE
      UPDATE public.coupons SET title=fields->>'title',description=fields->>'description',
        discount_label=fields->>'detail',start_at=start_time,end_at=end_time,updated_at=clock_timestamp()
      WHERE id=target AND business_id=business RETURNING id INTO output_id;
    END IF;
  ELSE
    IF target IS NULL THEN
      INSERT INTO public.events(business_id,region,title,description,address,start_at,end_at,is_active,updated_at)
      VALUES(business,source.region,fields->>'title',fields->>'description',fields->>'detail',
        start_time,end_time,true,clock_timestamp()) RETURNING id INTO output_id;
    ELSE
      UPDATE public.events SET title=fields->>'title',description=fields->>'description',address=fields->>'detail',
        start_at=start_time,end_at=end_time,updated_at=clock_timestamp() WHERE id=target AND business_id=business RETURNING id INTO output_id;
    END IF;
  END IF;
  UPDATE owner_portal_pilot.content_reviews SET status='approved',published_id=output_id,
    reviewed_at=now(),reviewed_by=p_actor,review_reason=review_note WHERE id=review.id;
  RETURN jsonb_build_object('id',review.id,'status','approved','published_id',output_id);
EXCEPTION
  WHEN unique_violation OR no_data_found THEN RAISE EXCEPTION USING ERRCODE='OP409', MESSAGE='Content unavailable or already pending';
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE='OP400', MESSAGE='Invalid content request';
END $$;

COMMIT;
