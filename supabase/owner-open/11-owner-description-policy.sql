-- REVIEW ONLY: category-scoped introduction catalog. No existing descriptions updated.
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.descriptions_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate introduction approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Project mismatch'; END IF;
 IF to_regprocedure('public.owner_feature_policy(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'Owner base required'; END IF;
END $$;
CREATE TABLE owner_portal_uuid_internal.description_categories(key text PRIMARY KEY,label_ko text NOT NULL,label_en text NOT NULL,terms text[] NOT NULL DEFAULT '{}',sort_order integer NOT NULL DEFAULT 0);
ALTER TABLE owner_portal_uuid_internal.description_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_uuid_internal.description_categories FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO owner_portal_uuid_internal.description_categories VALUES('general','일반 업소','General','{}',0);
ALTER TABLE owner_portal_uuid_internal.description_options ADD COLUMN category_key text NOT NULL DEFAULT 'general' REFERENCES owner_portal_uuid_internal.description_categories(key),ADD COLUMN locale text NOT NULL DEFAULT 'ko' CHECK(locale IN ('ko','en'));
ALTER TABLE owner_portal_uuid_internal.requests ADD COLUMN description_choice_id text REFERENCES owner_portal_uuid_internal.description_options(id),ADD COLUMN description_choice_text text;
CREATE FUNCTION owner_portal_uuid_internal.description_group(category text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT key FROM owner_portal_uuid_internal.description_categories c WHERE c.key<>'general' AND EXISTS(SELECT 1 FROM unnest(c.terms) term WHERE term<>'' AND position(lower(term) in lower(coalesce(category,'')))>0) ORDER BY c.sort_order,c.key LIMIT 1),'general')
$$;
CREATE FUNCTION public.owner_description_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('groups',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY sort_order,key) FROM owner_portal_uuid_internal.description_categories c),'[]'::jsonb),'options',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'phrase',phrase,'locale',locale,'category_key',category_key) ORDER BY sort_order,id) FROM owner_portal_uuid_internal.description_options WHERE active),'[]'::jsonb))
$$;
ALTER FUNCTION public.owner_feature_policy(uuid,uuid) RENAME TO feature_policy_pre_descriptions;
ALTER FUNCTION public.feature_policy_pre_descriptions(uuid,uuid) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.feature_policy_pre_descriptions(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_feature_policy(p_actor uuid,p_business uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE policy jsonb;group_key text;choices jsonb;
BEGIN
 policy:=owner_portal_uuid_internal.feature_policy_pre_descriptions(p_actor,p_business);
 group_key:=owner_portal_uuid_internal.description_group((SELECT category_ko FROM public.businesses WHERE id=p_business));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'phrase',phrase,'locale',locale,'category_key',category_key) ORDER BY sort_order,id),'[]'::jsonb) INTO choices FROM owner_portal_uuid_internal.description_options WHERE active AND category_key IN ('general',group_key);
 RETURN policy||jsonb_build_object('description_choices',choices,'description_options',(SELECT coalesce(jsonb_agg(value->>'phrase'),'[]'::jsonb) FROM jsonb_array_elements(choices)));
END $$;
ALTER FUNCTION public.owner_portal_uuid_command(uuid,jsonb) RENAME TO portal_command_pre_descriptions;
ALTER FUNCTION public.portal_command_pre_descriptions(uuid,jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.portal_command_pre_descriptions(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_portal_uuid_command(p_actor uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE value text:=p_command->'changes'->>'description';bid uuid:=(p_command->>'business_id')::uuid;policy jsonb;result jsonb;choice text;phrase text;old_command owner_portal_uuid_internal.commands;request owner_portal_uuid_internal.requests;
BEGIN
 IF p_actor IS NULL OR NOT owner_portal_uuid_internal.account_enabled(p_actor) OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND coalesce(to_jsonb(u)->>'deleted_at','')='' AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Verified active account required'; END IF;
 -- Serialize only identical command keys; retain the base business/actor locks.
 PERFORM pg_advisory_xact_lock(hashtextextended('description:'||p_actor::text||':'||(p_command->>'key'),11));
 SELECT * INTO old_command FROM owner_portal_uuid_internal.commands WHERE actor=p_actor AND key=(p_command->>'key')::uuid;
 IF FOUND THEN IF old_command.command<>p_command THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Request key conflict'; END IF;RETURN old_command.result;END IF;
 IF p_command ? 'description_choice' AND NOT (p_command->>'action'='submit' AND p_command->>'kind'='new') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='Introduction choice is for new applications'; END IF;
 IF p_command->>'action'='update' AND p_command->'changes' ? 'description' THEN
  policy:=public.owner_feature_policy(p_actor,bid);
  IF (policy->>'free_description')::boolean AND value IS DISTINCT FROM (SELECT description FROM public.businesses WHERE id=bid) AND coalesce(value,'')<>'' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'description_choices') AS item(phrase_data) WHERE item.phrase_data->>'phrase'=value) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Category introduction selection required'; END IF;
 END IF;
 IF p_command->>'action'='submit' AND p_command->>'kind'='new' AND p_command ? 'description_choice' THEN
  choice:=p_command->>'description_choice';
  SELECT d.phrase INTO phrase FROM owner_portal_uuid_internal.description_options d WHERE id=choice AND active AND category_key IN ('general',owner_portal_uuid_internal.description_group(p_command->'changes'->>'category_ko'));
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Approved category choice required'; END IF;
 END IF;
 IF p_command->>'action'='approve' THEN
  SELECT * INTO request FROM owner_portal_uuid_internal.requests WHERE id=(p_command->>'request_id')::uuid;
  IF NOT FOUND OR NOT public.owner_uuid_admin_region(p_actor,request.region) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Scoped administrator required'; END IF;
  IF request.kind='new' AND request.description_choice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM owner_portal_uuid_internal.description_options d WHERE d.id=request.description_choice_id AND d.active AND d.phrase=request.description_choice_text AND d.category_key IN ('general',owner_portal_uuid_internal.description_group(request.changes->>'category_ko'))) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='Introduction catalog changed; review application again'; END IF;
 END IF;
 result:=owner_portal_uuid_internal.portal_command_pre_descriptions(p_actor,p_command-'description_choice');
 IF choice IS NOT NULL THEN
  UPDATE owner_portal_uuid_internal.requests SET description_choice_id=choice,description_choice_text=phrase WHERE id=(result->>'request_id')::uuid AND user_id=p_actor;
  UPDATE owner_portal_uuid_internal.commands SET command=p_command WHERE actor=p_actor AND key=(p_command->>'key')::uuid;
 END IF;
 IF p_command->>'action'='approve' AND request.kind='new' AND request.description_choice_id IS NOT NULL THEN
  UPDATE public.businesses SET description=request.description_choice_text WHERE id=(result->>'business_id')::uuid AND coalesce(description,'')='';
  INSERT INTO owner_portal_uuid_internal.audit(actor,business_id,request_id,action,after_value,reason) VALUES(p_actor,(result->>'business_id')::uuid,request.id,'description_initial',jsonb_build_object('description_choice_id',request.description_choice_id,'description',request.description_choice_text),'Approved new business introduction');
 END IF;
 RETURN result;
END $$;
ALTER FUNCTION public.owner_content_command(uuid,jsonb) RENAME TO content_command_pre_descriptions;
ALTER FUNCTION public.content_command_pre_descriptions(uuid,jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.content_command_pre_descriptions(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_content_command(p_actor uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE policy jsonb;bid uuid:=(p_command->>'business_id')::uuid;value text:=p_command->'changes'->>'description';
BEGIN
 IF p_command->>'kind'='profile' AND p_command->>'action'='save' AND p_command->'changes' ? 'description' THEN
  policy:=public.owner_feature_policy(p_actor,bid);
  IF (policy->>'free_description')::boolean AND value IS DISTINCT FROM (SELECT description FROM public.businesses WHERE id=bid) AND coalesce(value,'')<>'' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'description_choices') AS item(phrase_data) WHERE item.phrase_data->>'phrase'=value) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='Category introduction selection required'; END IF;
 END IF;
 RETURN owner_portal_uuid_internal.content_command_pre_descriptions(p_actor,p_command);
END $$;
REVOKE ALL ON FUNCTION public.owner_description_catalog(),public.owner_feature_policy(uuid,uuid),public.owner_portal_uuid_command(uuid,jsonb),public.owner_content_command(uuid,jsonb),owner_portal_uuid_internal.description_group(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_description_catalog(),public.owner_feature_policy(uuid,uuid),public.owner_portal_uuid_command(uuid,jsonb),public.owner_content_command(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

