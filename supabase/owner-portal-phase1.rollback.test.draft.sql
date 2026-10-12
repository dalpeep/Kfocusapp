-- 초기 적용 실패/아무 명령도 실행하지 않은 경우만 허용. 실제 데이터가 있으면 별도 복구 계획 필요.
BEGIN;
SET LOCAL owner_preview.migration_b_rollback_approved='false';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.migration_b_rollback_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '복구 별도 승인 필요'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.owner_test_preview_state WHERE id=true AND project_ref='aaikttogoejfvxbosktg') THEN RAISE EXCEPTION 'owner-test 전용'; END IF;
 LOCK TABLE owner_portal_internal.requests,owner_portal_internal.memberships,owner_portal_internal.audit,owner_portal_internal.commands IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM owner_portal_internal.requests) OR EXISTS(SELECT 1 FROM owner_portal_internal.audit) OR EXISTS(SELECT 1 FROM owner_portal_internal.commands) OR EXISTS(SELECT 1 FROM owner_portal_internal.memberships) THEN RAISE EXCEPTION '이력/업소 데이터 보존을 위한 별도 복구 필요'; END IF;
END $$;
DROP FUNCTION public.owner_portal_command(uuid,jsonb),public.owner_portal_read(uuid,text,text,integer,integer);
DROP FUNCTION owner_portal_internal.is_admin(uuid,text);
DROP TABLE owner_portal_internal.memberships,owner_portal_internal.audit,owner_portal_internal.commands,owner_portal_internal.requests;
DROP SCHEMA owner_portal_internal;
COMMIT;
