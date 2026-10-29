-- Additive Owner-only coupon policy. Never changes Legacy handlers or existing rows.
-- Run after 06. Explicit operational approval required; isolated tests set the flag.
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.coupon_policy_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate coupon policy approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Production project mismatch'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.businesses'::regclass AND attname='id') IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'UUID base required'; END IF;
 IF to_regprocedure('public.owner_content_command(uuid,jsonb)') IS NULL OR to_regprocedure('owner_portal_uuid_internal.content_command_v14(uuid,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Base missing or policy already installed'; END IF;
END $$;
CREATE TABLE owner_portal_uuid_internal.coupon_plans(
 business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
 tier text NOT NULL DEFAULT 'free' CHECK(tier IN ('free','paid')),
 paid_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_portal_uuid_internal.coupon_templates(
 url text PRIMARY KEY,path text NOT NULL UNIQUE,actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,design text NOT NULL CHECK(design IN ('percent','gift','amount','special')),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE owner_portal_uuid_internal.coupon_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_uuid_internal.coupon_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_uuid_internal.coupon_plans,owner_portal_uuid_internal.coupon_templates FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE owner_portal_uuid_internal.description_options(id text PRIMARY KEY,phrase text NOT NULL CHECK(length(phrase) BETWEEN 1 AND 500),active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 0);
ALTER TABLE owner_portal_uuid_internal.description_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_portal_uuid_internal.description_options FROM PUBLIC,anon,authenticated,service_role;
-- No marketing phrases are silently enabled in production; administrators curate them.
CREATE FUNCTION public.owner_feature_policy(p_actor uuid,p_business uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE premium boolean;
BEGIN
 IF NOT owner_portal_uuid_internal.content_access(p_actor,p_business) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='업소 관리 권한 필요'; END IF;
 SELECT public.owner_uuid_admin_region(p_actor,b.region) OR EXISTS(SELECT 1 FROM owner_portal_uuid_internal.coupon_plans p WHERE p.business_id=b.id AND p.tier='paid' AND p.paid_enabled) INTO premium FROM public.businesses b WHERE b.id=p_business;
 RETURN jsonb_build_object('tier',CASE WHEN premium THEN 'paid_or_admin' ELSE 'free' END,'business_image_url',(SELECT image_url FROM public.businesses WHERE id=p_business),'images',premium,'free_description',NOT premium,'description_options',coalesce((SELECT jsonb_agg(phrase ORDER BY sort_order,id) FROM owner_portal_uuid_internal.description_options WHERE active),'[]'::jsonb),'coupon_designs',coalesce((SELECT jsonb_object_agg(url,design) FROM owner_portal_uuid_internal.coupon_templates WHERE business_id=p_business),'{}'::jsonb),'custom_image',premium,'raffle',premium,'templates',jsonb_build_array('percent','gift','amount','special'));
END $$;
CREATE FUNCTION public.owner_coupon_policy(p_actor uuid,p_business uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.owner_feature_policy(p_actor,p_business); $$;
CREATE FUNCTION public.owner_plan_change(p_actor uuid,p_business uuid,p_tier text,p_enabled boolean,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous jsonb;
BEGIN
 PERFORM 1 FROM public.businesses WHERE id=p_business AND public.owner_uuid_admin_region(p_actor,region) FOR UPDATE;
 IF NOT FOUND OR p_tier NOT IN ('free','paid') OR p_enabled IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='관리자 승인과 사유 필요'; END IF;
 SELECT to_jsonb(p) INTO previous FROM owner_portal_uuid_internal.coupon_plans p WHERE business_id=p_business;
 INSERT INTO owner_portal_uuid_internal.coupon_plans(business_id,tier,paid_enabled) VALUES(p_business,p_tier,p_enabled AND p_tier='paid') ON CONFLICT(business_id) DO UPDATE SET tier=excluded.tier,paid_enabled=excluded.paid_enabled,updated_at=clock_timestamp();
 INSERT INTO owner_portal_uuid_internal.audit(actor,business_id,action,before_value,after_value,reason) VALUES(p_actor,p_business,'owner_plan_approved',previous,jsonb_build_object('tier',p_tier,'paid_enabled',p_enabled AND p_tier='paid'),p_reason);
 RETURN true;
END $$;
CREATE FUNCTION public.owner_coupon_template_lookup(p_actor uuid,p_business uuid,p_path text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT owner_portal_uuid_internal.content_access(p_actor,p_business) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='업소 관리 권한 필요'; END IF;
 RETURN (SELECT jsonb_build_object('url',url,'sha256',sha256) FROM owner_portal_uuid_internal.coupon_templates WHERE actor=p_actor AND business_id=p_business AND path=p_path);
END $$;
REVOKE ALL ON FUNCTION public.owner_coupon_template_lookup(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_coupon_template_lookup(uuid,uuid,text) TO service_role;
CREATE FUNCTION public.owner_coupon_template_register(p_actor uuid,p_business uuid,p_path text,p_url text,p_design text,p_sha256 text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT owner_portal_uuid_internal.content_access(p_actor,p_business)
 OR p_path !~ ('^coupon-templates/'||p_business::text||'/'||p_actor::text||'/[a-f0-9-]{36}\.png$')
 OR p_url !~ '^https://(ydrxuqmjzayejlnjzzew|hseaeafmmjnbynfyynao)\.supabase\.co/storage/v1/object/public/public-images/'
 OR right(p_url,length(p_path)+1)<>'/'||p_path
 OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='public-images' AND name=p_path)
 THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='서버 템플릿 등록 거부'; END IF;
 INSERT INTO owner_portal_uuid_internal.coupon_templates(url,path,actor,business_id,design,sha256) VALUES(p_url,p_path,p_actor,p_business,p_design,p_sha256);
 RETURN true;
END $$;
ALTER FUNCTION public.owner_content_command(uuid,jsonb) RENAME TO content_command_v14;
ALTER FUNCTION public.content_command_v14(uuid,jsonb) SET SCHEMA owner_portal_uuid_internal;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.content_command_v14(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_content_command(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bid uuid:=(p_command->>'business_id')::uuid;policy jsonb;patch jsonb:=p_command->'changes';prev public.coupons;v_design text:=patch->>'template_design';
BEGIN
 policy:=public.owner_feature_policy(p_actor,bid);
 IF NOT (policy->>'images')::boolean AND p_command->>'kind'<>'coupon' AND p_command->>'action'='save' THEN
  IF p_command->>'kind'='profile' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE k<>ALL(ARRAY['description','hours','website','website_url','business_hours','monday','tuesday','wednesday','thursday','friday','saturday','sunday'])) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='무료 업소 기본 항목만 변경 가능'; END IF;
   IF patch ? 'description' AND patch->>'description' IS DISTINCT FROM (SELECT description FROM public.businesses WHERE id=bid) AND coalesce(patch->>'description','')<>'' AND NOT EXISTS(SELECT 1 FROM owner_portal_uuid_internal.description_options WHERE active AND phrase=patch->>'description') THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='관리자 선택 문구 필요'; END IF;
  ELSIF patch ? 'image_url' THEN
   IF p_command->>'kind'='event' THEN
    IF patch->>'image_url' IS DISTINCT FROM coalesce((SELECT image_url FROM public.posts WHERE id::text=p_command->>'record_id' AND business_id=bid),'') THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='홍보 이미지 유료 전용'; END IF;
   ELSE
    IF patch->>'image_url' IS DISTINCT FROM coalesce((SELECT image_url FROM public.business_specials WHERE id::text=p_command->>'record_id' AND business_id=bid),'') THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='홍보 이미지 유료 전용'; END IF;
   END IF;
  END IF;
 END IF;
 IF p_command->>'kind'='coupon' THEN
  policy:=public.owner_coupon_policy(p_actor,bid);
  IF p_command ? 'record_id' THEN
   SELECT * INTO prev FROM public.coupons WHERE id::text=p_command->>'record_id' AND business_id=bid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='타 업소 쿠폰 접근 거부'; END IF;
  END IF;
  IF NOT (policy->>'custom_image')::boolean THEN
   IF prev.delivery_mode='raffle' THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='기존 추첨 캠페인은 관리자 처리'; END IF;
   IF p_command->>'action'='save' THEN
    IF coalesce(patch->>'delivery_mode',prev.delivery_mode,'instant_email') NOT IN ('display','instant_email')
     OR coalesce((patch->>'one_per_email')::boolean,prev.one_per_email,true)=false
     OR coalesce((patch->>'marketing_opt_in_enabled')::boolean,false)
     OR patch ?| ARRAY['raffle_end_at','raffle_draw_mode','winner_count']
     OR NOT EXISTS(SELECT 1 FROM owner_portal_uuid_internal.coupon_templates t WHERE t.url=patch->>'image_url' AND t.actor=p_actor AND t.business_id=bid AND t.design=v_design)
    THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='무료 쿠폰은 서버 기본 디자인과 이메일 중복 방지만 허용'; END IF;
    patch:=patch||jsonb_build_object('delivery_mode','instant_email','one_per_email',true,'marketing_opt_in_enabled',false);
   END IF;
  END IF;
  -- Existing image validator accepts only authenticated upload paths. Verify the
  -- immutable server template registry here, then keep that one URL as a prior
  -- value for the base validator through its dedicated template allowance.
  IF p_command->>'action'='save' THEN p_command:=jsonb_set(p_command,'{changes}',patch-'template_design'); END IF;
 END IF;
 RETURN owner_portal_uuid_internal.content_command_v14(p_actor,p_command);
END $$;
-- Extend the existing image validator only for immutable server-created templates.
ALTER FUNCTION owner_portal_uuid_internal.image_url_allowed(uuid,uuid,text,jsonb) RENAME TO image_url_allowed_v14;
CREATE FUNCTION owner_portal_uuid_internal.image_url_allowed(actor uuid,bid uuid,url text,previous jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT owner_portal_uuid_internal.image_url_allowed_v14(actor,bid,url,previous)
 OR EXISTS(SELECT 1 FROM owner_portal_uuid_internal.coupon_templates t WHERE t.url=$3 AND t.actor=$1 AND t.business_id=$2);
$$;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.image_url_allowed(uuid,uuid,text,jsonb),owner_portal_uuid_internal.image_url_allowed_v14(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.owner_coupon_policy(uuid,uuid),public.owner_coupon_template_register(uuid,uuid,text,text,text,text),public.owner_content_command(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_coupon_policy(uuid,uuid),public.owner_coupon_template_register(uuid,uuid,text,text,text,text),public.owner_content_command(uuid,jsonb) TO service_role;
-- General business/gallery/event uploads retain their existing policies. Clients
-- cannot write, replace, or delete the server template namespace directly.
CREATE POLICY owner_coupon_template_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (bucket_id<>'public-images' OR name NOT LIKE 'coupon-templates/%');
CREATE POLICY owner_coupon_template_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING (bucket_id<>'public-images' OR name NOT LIKE 'coupon-templates/%') WITH CHECK (bucket_id<>'public-images' OR name NOT LIKE 'coupon-templates/%');
CREATE POLICY owner_coupon_template_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (bucket_id<>'public-images' OR name NOT LIKE 'coupon-templates/%');

ALTER FUNCTION public.owner_uuid_image_access(uuid,uuid) RENAME TO image_access_v14;
ALTER FUNCTION public.image_access_v14(uuid,uuid) SET SCHEMA owner_portal_uuid_internal;
CREATE FUNCTION public.owner_uuid_image_access(p_actor uuid,p_business uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT owner_portal_uuid_internal.image_access_v14(p_actor,p_business) AND (public.owner_feature_policy(p_actor,p_business)->>'images')::boolean; $$;
ALTER FUNCTION public.owner_uuid_image_link(uuid,uuid,text,text) RENAME TO image_link_v14;
ALTER FUNCTION public.image_link_v14(uuid,uuid,text,text) SET SCHEMA owner_portal_uuid_internal;
CREATE FUNCTION public.owner_uuid_image_link(p_actor uuid,p_business uuid,p_path text,p_url text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT public.owner_uuid_image_access(p_actor,p_business) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='대표 이미지 유료 전용'; END IF;
 RETURN owner_portal_uuid_internal.image_link_v14(p_actor,p_business,p_path,p_url);
END $$;
ALTER FUNCTION public.owner_uuid_image_delete_access(uuid,text) RENAME TO image_delete_v14;
ALTER FUNCTION public.image_delete_v14(uuid,text) SET SCHEMA owner_portal_uuid_internal;
CREATE FUNCTION public.owner_uuid_image_delete_access(p_actor uuid,p_url text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b record;parts text[];
BEGIN
 IF NOT owner_portal_uuid_internal.image_delete_v14(p_actor,p_url) THEN RETURN false; END IF;
 FOR b IN SELECT id,region FROM public.businesses WHERE jsonb_path_exists(to_jsonb(businesses),'$.** ? (@ == $url)',jsonb_build_object('url',p_url)) LOOP
  IF NOT public.owner_uuid_admin_region(p_actor,b.region) AND NOT coalesce((SELECT tier='paid' AND paid_enabled FROM owner_portal_uuid_internal.coupon_plans WHERE business_id=b.id),false) THEN RETURN false; END IF;
 END LOOP;
 parts:=regexp_match(p_url,'/owner-v1/owner/([a-f0-9-]{36})/');
 IF parts IS NOT NULL THEN RETURN (public.owner_feature_policy(p_actor,parts[1]::uuid)->>'images')::boolean; END IF;
 RETURN EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor AND role IN ('super_admin','regional_editor'));
END $$;
ALTER FUNCTION public.owner_portal_uuid_command(uuid,jsonb) RENAME TO portal_command_v14;
ALTER FUNCTION public.portal_command_v14(uuid,jsonb) SET SCHEMA owner_portal_uuid_internal;
CREATE FUNCTION public.owner_portal_uuid_command(p_actor uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE policy jsonb;bid uuid:=(p_command->>'business_id')::uuid;value text:=p_command->'changes'->>'description';
BEGIN
 IF p_command->>'action'='update' THEN
  policy:=public.owner_feature_policy(p_actor,bid);
  IF (policy->>'free_description')::boolean AND p_command->'changes' ? 'description' AND value IS DISTINCT FROM (SELECT description FROM public.businesses WHERE id=bid) AND coalesce(value,'')<>'' AND NOT EXISTS(SELECT 1 FROM owner_portal_uuid_internal.description_options WHERE active AND phrase=value) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='관리자 선택 문구 필요'; END IF;
 END IF;
 RETURN owner_portal_uuid_internal.portal_command_v14(p_actor,p_command);
END $$;
CREATE FUNCTION public.owner_plan_storage_allowed(p_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE parts text[];
BEGIN
 parts:=regexp_match(p_name,'^owner-v1/owner/([a-f0-9-]{36})/');
 IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND role IN ('super_admin','regional_editor')) THEN RETURN true; END IF;
 IF parts IS NULL THEN
  -- Existing anonymous/non-Owner Legacy uploads remain outside Owner policy.
  -- An authenticated Owner cannot evade the paid path check using an unscoped key.
  RETURN NOT EXISTS(SELECT 1 FROM owner_portal_uuid_internal.memberships WHERE user_id=auth.uid() AND active AND revoked_at IS NULL);
 END IF;
 RETURN (public.owner_feature_policy(auth.uid(),parts[1]::uuid)->>'images')::boolean;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE POLICY owner_plan_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id NOT IN ('public-images','business-media','coupon-media','media') OR public.owner_plan_storage_allowed(name));
CREATE POLICY owner_plan_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id NOT IN ('public-images','business-media','coupon-media','media') OR public.owner_plan_storage_allowed(name)) WITH CHECK(bucket_id NOT IN ('public-images','business-media','coupon-media','media') OR public.owner_plan_storage_allowed(name));
CREATE POLICY owner_plan_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id NOT IN ('public-images','business-media','coupon-media','media') OR public.owner_plan_storage_allowed(name));
REVOKE ALL ON FUNCTION public.owner_plan_storage_allowed(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_plan_storage_allowed(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.owner_feature_policy(uuid,uuid),public.owner_plan_change(uuid,uuid,text,boolean,text),public.owner_uuid_image_access(uuid,uuid),public.owner_uuid_image_link(uuid,uuid,text,text),public.owner_uuid_image_delete_access(uuid,text),public.owner_portal_uuid_command(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_feature_policy(uuid,uuid),public.owner_plan_change(uuid,uuid,text,boolean,text),public.owner_uuid_image_access(uuid,uuid),public.owner_uuid_image_link(uuid,uuid,text,text),public.owner_uuid_image_delete_access(uuid,text),public.owner_portal_uuid_command(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.image_access_v14(uuid,uuid),owner_portal_uuid_internal.image_link_v14(uuid,uuid,text,text),owner_portal_uuid_internal.image_delete_v14(uuid,text),owner_portal_uuid_internal.portal_command_v14(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
