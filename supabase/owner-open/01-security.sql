-- DRAFT. 지역 의미·Storage 검사 미완료: 실제 운영 실행 금지.
-- 기존 정책 삭제 대신 RESTRICTIVE fence를 추가하여 정확한 rollback 가능.
BEGIN;
DO $$ BEGIN 
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Postgres operator required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Production project mismatch'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NULL
 AND obj_description(to_regnamespace('owner_portal_uuid_internal'),'pg_namespace') IS DISTINCT FROM 'daltownmap-owner-production:ydrxuqmjzayejlnjzzew:idset-sha256:27bcd9d953d2106aa9e00e42cda48b8502e04a9a9ae3323d4c5bcdb281c0b28d' THEN
  IF current_setting('owner_preview.production_fingerprint_approved',true) IS DISTINCT FROM 'true'
  OR (SELECT count(*) FROM public.businesses)<>238
  OR (SELECT encode(sha256(convert_to(coalesce(string_agg(id::text,',' ORDER BY id),''),'UTF8')),'hex') FROM public.businesses)<>'27bcd9d953d2106aa9e00e42cda48b8502e04a9a9ae3323d4c5bcdb281c0b28d'
  OR (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.businesses'::regclass AND attname='id') IS DISTINCT FROM 'uuid'
  OR (SELECT count(*) FROM pg_constraint WHERE confrelid='public.businesses'::regclass AND connamespace='public'::regnamespace AND contype='f')<>8
  THEN RAISE EXCEPTION 'Production identity unavailable or fingerprint changed'; END IF;
 END IF;
 END $$;
SET LOCAL owner_preview.uuid_security_approved='false';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.uuid_security_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '별도 승인 필요'; END IF;
 IF to_regnamespace('owner_uuid_security_backup') IS NOT NULL THEN RAISE EXCEPTION '중복 적용 금지'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.businesses'::regclass AND attname='id') IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'UUID 필요'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.businesses'::regclass) THEN RAISE EXCEPTION 'RLS 필요'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.businesses'::regclass AND attacl IS NOT NULL) THEN RAISE EXCEPTION '컬럼 ACL 별도 검토 필요'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.businesses'::regclass AND a.grantor<>(SELECT oid FROM pg_roles WHERE rolname='postgres')) THEN RAISE EXCEPTION '별도 grantor 복원 설계 필요'; END IF;
END $$;
LOCK TABLE public.businesses IN SHARE ROW EXCLUSIVE MODE;
CREATE SCHEMA owner_uuid_security_backup;
REVOKE ALL ON SCHEMA owner_uuid_security_backup FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE owner_uuid_security_backup.acl AS SELECT relacl,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.businesses'::regclass;
CREATE TABLE owner_uuid_security_backup.policies AS SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='businesses';
REVOKE ALL ON ALL TABLES IN SCHEMA owner_uuid_security_backup FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_uuid_admin_region(actor uuid,target_region text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=actor AND
 (p.role='super_admin' OR (p.role='regional_editor' AND target_region IN ('dallas','colorado')
 AND CASE p.area WHEN 'denver' THEN 'colorado' ELSE p.area END=target_region)))
$$;
ALTER FUNCTION public.owner_uuid_admin_region(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_uuid_admin_region(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_uuid_current_admin(target_region text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.owner_uuid_admin_region(auth.uid(),target_region)
$$;
ALTER FUNCTION public.owner_uuid_current_admin(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_uuid_current_admin(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.owner_uuid_current_admin(text) TO authenticated;
CREATE POLICY owner_uuid_insert_fence ON public.businesses AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.owner_uuid_current_admin(region));
CREATE POLICY owner_uuid_update_fence ON public.businesses AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.owner_uuid_current_admin(region)) WITH CHECK(public.owner_uuid_current_admin(region));
CREATE POLICY owner_uuid_delete_fence ON public.businesses AS RESTRICTIVE FOR DELETE TO authenticated USING(public.owner_uuid_current_admin(region));
-- anon fences also cover future accidental DML grants.
CREATE POLICY owner_uuid_anon_insert_fence ON public.businesses AS RESTRICTIVE FOR INSERT TO anon WITH CHECK(false);
CREATE POLICY owner_uuid_anon_update_fence ON public.businesses AS RESTRICTIVE FOR UPDATE TO anon USING(false) WITH CHECK(false);
CREATE POLICY owner_uuid_anon_delete_fence ON public.businesses AS RESTRICTIVE FOR DELETE TO anon USING(false);
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.businesses FROM PUBLIC,anon;
REVOKE TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.businesses FROM authenticated;
-- authenticated SELECT/INSERT/UPDATE/DELETE are kept; service_role unchanged.
COMMIT;
