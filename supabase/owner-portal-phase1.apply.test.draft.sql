-- owner-test 전용 초안. 로컬 검증 전 실행 금지. 승인 후 BEGIN~COMMIT 전체 실행.
BEGIN;
SET LOCAL owner_preview.migration_b_approved='false';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.migration_b_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Migration B 별도 승인 필요'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.owner_test_preview_state WHERE id=true AND project_ref='aaikttogoejfvxbosktg' AND phase='fixtures' AND storage_ready) THEN RAISE EXCEPTION 'owner-test 마커 불일치'; END IF;
 IF to_regprocedure('public.phase1b_is_admin()') IS NULL OR to_regclass('owner_phase1b_internal.policy_backup') IS NULL THEN RAISE EXCEPTION 'Migration A 필요'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.businesses'::regclass AND attname='id' AND NOT attisdropped) IS DISTINCT FROM 'bigint' THEN RAISE EXCEPTION 'businesses.id bigint 필요'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.businesses'::regclass AND a.attname='id' AND NOT a.attisdropped AND (a.attidentity IN ('a','d') OR pg_get_expr(d.adbin,d.adrelid) LIKE 'nextval(%')) THEN RAISE EXCEPTION 'businesses.id 자동 생성 설정 필요'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='businesses' AND column_name IN ('name_ko','region','category_ko','address','phone','description','hours') AND data_type='text')<>7 THEN RAISE EXCEPTION '기존 업소 필드 형식 불일치'; END IF;
 IF to_regnamespace('owner_portal_internal') IS NOT NULL THEN RAISE EXCEPTION '이미 적용됐거나 이름 충돌'; END IF;
 IF to_regclass('public.business_owners') IS NOT NULL OR to_regclass('public.business_owner_requests') IS NOT NULL THEN RAISE EXCEPTION '이전 Migration B 존재: 중복 소유권 모델 적용 금지'; END IF;
END $$;
CREATE SCHEMA owner_portal_internal;
REVOKE ALL ON SCHEMA owner_portal_internal FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE owner_portal_internal.requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 kind text NOT NULL CHECK(kind IN ('new','claim','core')), business_id bigint REFERENCES public.businesses(id),
 region text NOT NULL CHECK(region IN ('dallas','colorado')), changes jsonb NOT NULL DEFAULT '{}', baseline jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid REFERENCES auth.users(id),reason text,
 CHECK(kind='new' OR business_id IS NOT NULL), CHECK(status='pending' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND length(reason)>0))
);
CREATE UNIQUE INDEX owner_pending_claim ON owner_portal_internal.requests(user_id,business_id,kind) WHERE status='pending' AND kind IN ('claim','core');
-- 다른 요청 키/회원의 동일 신규 업소 신청도 승인 전 중복을 막는다.
CREATE UNIQUE INDEX owner_pending_new ON owner_portal_internal.requests(region,lower(regexp_replace(changes->>'name_ko','\s+','','g')),lower(regexp_replace(changes->>'address','\s+','','g'))) WHERE kind='new' AND status='pending';
CREATE TABLE owner_portal_internal.memberships(
 business_id bigint NOT NULL REFERENCES public.businesses(id),user_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL REFERENCES owner_portal_internal.requests(id),active boolean NOT NULL DEFAULT true,
 granted_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 PRIMARY KEY(business_id,user_id),CHECK(active=(revoked_at IS NULL))
);
CREATE TABLE owner_portal_internal.audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor uuid NOT NULL REFERENCES auth.users(id),
 business_id bigint REFERENCES public.businesses(id), request_id uuid,action text NOT NULL,
 before_value jsonb,after_value jsonb,reason text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_portal_internal.commands(
 actor uuid NOT NULL,key uuid NOT NULL,command jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,key)
);
ALTER TABLE owner_portal_internal.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_internal.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_internal.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_portal_internal.commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA owner_portal_internal FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA owner_portal_internal FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION owner_portal_internal.is_admin(actor uuid,region text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=actor AND (p.role='super_admin' OR (p.role='regional_editor' AND p.area=region)))
$$;
CREATE FUNCTION public.owner_portal_command(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE action text:=p_command->>'action';v_key uuid:=(p_command->>'key')::uuid;
 bid bigint:=(p_command->>'business_id')::bigint;target uuid:=(p_command->>'user_id')::uuid;
 req owner_portal_internal.requests;previous owner_portal_internal.commands;business public.businesses;
 rid uuid;reg text;patch jsonb:=coalesce(p_command->'changes','{}');before_data jsonb;result jsonb;kind text:=p_command->>'kind';
BEGIN
 IF p_actor IS NULL OR v_key IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='인증 필요'; END IF;
 -- 동일 회원의 동시 명령과 재시도를 직렬화한다.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 SELECT * INTO previous FROM owner_portal_internal.commands WHERE actor=p_actor AND commands.key=v_key;
 IF FOUND THEN
  IF previous.command<>p_command THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='동일 키 다른 요청'; END IF;
  RETURN previous.result;
 END IF;
 IF action IN ('approve','reject') THEN
  SELECT * INTO req FROM owner_portal_internal.requests WHERE id=(p_command->>'request_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='신청 접근 거부'; END IF;
  reg:=req.region;bid:=req.business_id;rid:=req.id;kind:=req.kind;patch:=req.changes;
 ELSE
  IF bid IS NOT NULL THEN SELECT * INTO business FROM public.businesses WHERE id=bid;reg:=business.region;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='업소 접근 거부'; END IF;
  ELSE reg:=p_command->>'region'; END IF;
 END IF;
 IF bid IS NOT NULL THEN
  -- 모든 소유권 명령/수정/회수는 같은 업소 잠금을 사용한다.
  PERFORM pg_advisory_xact_lock(bid);
  SELECT * INTO business FROM public.businesses WHERE id=bid FOR UPDATE;
  IF NOT FOUND OR business.region<>reg THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='업소 변경'; END IF;
 END IF;
 IF action IN ('approve','reject','revoke') THEN
  PERFORM 1 FROM public.profiles WHERE user_id=p_actor FOR SHARE;
  IF NOT owner_portal_internal.is_admin(p_actor,reg) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='관리자 권한 필요'; END IF;
  IF coalesce(length(trim(p_command->>'reason')),0) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='사유 필요'; END IF;
 END IF;
 IF action='update' OR (action='submit' AND kind='core') THEN
  IF NOT EXISTS(SELECT 1 FROM owner_portal_internal.memberships WHERE business_id=bid AND user_id=p_actor AND active) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='활성 소유권 필요'; END IF;
 END IF;
 IF action='submit' THEN
  IF kind NOT IN ('new','claim','core') OR reg NOT IN ('dallas','colorado') OR reg IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='신청 유형/지역 오류'; END IF;
  IF kind='new' AND bid IS NOT NULL OR kind IN ('claim','core') AND bid IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='신청 업소 오류'; END IF;
  IF (SELECT count(*) FROM owner_portal_internal.requests WHERE user_id=p_actor AND created_at>now()-interval '1 hour')>=5 THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='신청 제한'; END IF;
  IF kind='claim' AND patch<>'{}' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='소유권 신청 정보 변경 금지'; END IF;
  IF kind IN ('new','core') THEN
   IF jsonb_typeof(patch)<>'object' OR patch='{}' OR EXISTS(SELECT 1 FROM jsonb_each(patch) e WHERE e.key<>ALL(ARRAY['name_ko','address','phone','category_ko']) OR jsonb_typeof(e.value)<>'string' OR length(trim(e.value#>>'{}')) NOT BETWEEN 1 AND 500) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='핵심 필드 오류'; END IF;
   IF kind='new' AND NOT patch ?& ARRAY['name_ko','address','phone','category_ko'] THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='신규 필수 정보'; END IF;
   IF kind='new' AND EXISTS(SELECT 1 FROM public.businesses b WHERE b.region=reg AND lower(regexp_replace(b.name_ko,'\s+','','g'))=lower(regexp_replace(patch->>'name_ko','\s+','','g')) AND lower(regexp_replace(b.address,'\s+','','g'))=lower(regexp_replace(patch->>'address','\s+','','g'))) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='기존 업소 소유권 신청 필요'; END IF;
   IF kind='core' AND EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT (p_command->'baseline' ? k) OR to_jsonb(business)->k IS DISTINCT FROM p_command->'baseline'->k) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='변경 전 정보 불일치'; END IF;
  END IF;
  INSERT INTO owner_portal_internal.requests(user_id,kind,business_id,region,changes,baseline)
   VALUES(p_actor,kind,bid,reg,patch,coalesce(p_command->'baseline','{}')) RETURNING id INTO rid;
 ELSIF action IN ('approve','reject') THEN
  IF req.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='이미 처리'; END IF;
  IF req.user_id=p_actor THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='본인 신청 승인 금지'; END IF;
  IF action='approve' THEN
   IF kind='new' THEN
    -- 서로 다른 관리자가 같은 업소를 승인하는 경우도 직렬화한다.
    PERFORM pg_advisory_xact_lock(hashtextextended(reg||'|'||lower(regexp_replace(patch->>'name_ko','\s+','','g'))||'|'||lower(regexp_replace(patch->>'address','\s+','','g')),1));
    IF EXISTS(SELECT 1 FROM public.businesses b WHERE b.region=reg AND lower(regexp_replace(b.name_ko,'\s+','','g'))=lower(regexp_replace(patch->>'name_ko','\s+','','g')) AND lower(regexp_replace(b.address,'\s+','','g'))=lower(regexp_replace(patch->>'address','\s+','','g'))) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='이미 등록된 업소'; END IF;
    INSERT INTO public.businesses(name_ko,region,category_ko,address,phone)
      VALUES(patch->>'name_ko',reg,patch->>'category_ko',patch->>'address',patch->>'phone') RETURNING id INTO bid;
   ELSIF kind='core' THEN
    IF NOT EXISTS(SELECT 1 FROM owner_portal_internal.memberships WHERE business_id=bid AND user_id=req.user_id AND active) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='소유권 회수됨'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE to_jsonb(business)->k IS DISTINCT FROM req.baseline->k) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='관리자 변경 충돌'; END IF;
    before_data:=jsonb_build_object('name_ko',business.name_ko,'address',business.address,'phone',business.phone,'category_ko',business.category_ko);
    UPDATE public.businesses SET name_ko=coalesce(patch->>'name_ko',name_ko),address=coalesce(patch->>'address',address),phone=coalesce(patch->>'phone',phone),category_ko=coalesce(patch->>'category_ko',category_ko) WHERE id=bid;
   END IF;
   IF kind IN ('new','claim') THEN
    IF EXISTS(SELECT 1 FROM owner_portal_internal.memberships WHERE business_id=bid AND active) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='이미 승인된 소유자 존재'; END IF;
    INSERT INTO owner_portal_internal.memberships(business_id,user_id,request_id) VALUES(bid,req.user_id,rid)
     ON CONFLICT(business_id,user_id) DO UPDATE SET active=true,revoked_at=null,granted_at=now(),request_id=excluded.request_id;
   END IF;
  END IF;
  UPDATE owner_portal_internal.requests SET business_id=bid,status=CASE WHEN action='approve' THEN 'approved' ELSE 'rejected' END,reviewed_by=p_actor,reviewed_at=now(),reason=p_command->>'reason' WHERE id=rid;
 ELSIF action='revoke' THEN
  UPDATE owner_portal_internal.memberships SET active=false,revoked_at=now() WHERE business_id=bid AND user_id=target AND active;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='활성 소유권 없음'; END IF;
 ELSIF action='update' THEN
  IF jsonb_typeof(patch)<>'object' OR patch='{}' OR EXISTS(SELECT 1 FROM jsonb_each(patch) e WHERE e.key<>ALL(ARRAY['description','hours']) OR jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>5000) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='일반 필드 오류'; END IF;
  before_data:=jsonb_build_object('description',business.description,'hours',business.hours);
  UPDATE public.businesses SET description=coalesce(patch->>'description',description),hours=coalesce(patch->>'hours',hours) WHERE id=bid;
 ELSE RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='지원하지 않는 명령'; END IF;
 result:=jsonb_build_object('request_id',rid,'business_id',bid::text,'action',action);
 INSERT INTO owner_portal_internal.audit(actor,business_id,request_id,action,before_value,after_value,reason)
 VALUES(p_actor,bid,rid,action,before_data,CASE WHEN action='revoke' THEN jsonb_build_object('user_id',target,'active',false) ELSE patch END,p_command->>'reason');
 INSERT INTO owner_portal_internal.commands(actor,key,command,result) VALUES(p_actor,v_key,p_command,result);
 RETURN result;
END $$;
CREATE FUNCTION public.owner_portal_read(p_actor uuid,p_status text DEFAULT NULL,p_kind text DEFAULT NULL,p_offset integer DEFAULT 0,p_audit_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
 'is_admin',EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor AND role IN ('super_admin','regional_editor')),
 'businesses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id::text,'name_ko',b.name_ko,'region',b.region,'address',b.address,'phone',b.phone,'category_ko',b.category_ko,'description',b.description,'hours',b.hours)) FROM public.businesses b JOIN owner_portal_internal.memberships m ON m.business_id=b.id WHERE m.user_id=p_actor AND m.active),'[]'),
 'counts',(SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status='pending'),'approved',count(*) FILTER(WHERE status='approved'),'rejected',count(*) FILTER(WHERE status='rejected'),'new',count(*) FILTER(WHERE status='pending' AND kind='new'),'claim',count(*) FILTER(WHERE status='pending' AND kind='claim'),'core',count(*) FILTER(WHERE status='pending' AND kind='core')) FROM owner_portal_internal.requests r WHERE r.user_id=p_actor OR owner_portal_internal.is_admin(p_actor,r.region)),
 'request_total',(SELECT count(*) FROM owner_portal_internal.requests r WHERE (r.user_id=p_actor OR owner_portal_internal.is_admin(p_actor,r.region)) AND (p_status IS NULL OR r.status=p_status) AND (p_kind IS NULL OR r.kind=p_kind)),
 'requests',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('business_id',r.business_id::text)) FROM (SELECT * FROM owner_portal_internal.requests r WHERE (r.user_id=p_actor OR owner_portal_internal.is_admin(p_actor,r.region)) AND (p_status IS NULL OR r.status=p_status) AND (p_kind IS NULL OR r.kind=p_kind) ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET greatest(0,least(p_offset,999999))) r),'[]'),
 'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('business_id',m.business_id::text,'user_id',m.user_id,'active',m.active)) FROM owner_portal_internal.memberships m JOIN public.businesses b ON b.id=m.business_id WHERE owner_portal_internal.is_admin(p_actor,b.region)),'[]'),
 'audit_total',(SELECT count(*) FROM owner_portal_internal.audit a LEFT JOIN public.businesses b ON b.id=a.business_id LEFT JOIN owner_portal_internal.requests r ON r.id=a.request_id WHERE owner_portal_internal.is_admin(p_actor,coalesce(b.region,r.region))),
 'audit',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('id',a.id::text,'business_id',a.business_id::text)) FROM (SELECT a.* FROM owner_portal_internal.audit a LEFT JOIN public.businesses b ON b.id=a.business_id LEFT JOIN owner_portal_internal.requests r ON r.id=a.request_id WHERE owner_portal_internal.is_admin(p_actor,coalesce(b.region,r.region)) ORDER BY a.id DESC LIMIT 20 OFFSET greatest(0,least(p_audit_offset,999999))) a),'[]'))
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA owner_portal_internal FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.owner_portal_command(uuid,jsonb),public.owner_portal_read(uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_portal_command(uuid,jsonb),public.owner_portal_read(uuid,text,text,integer,integer) TO service_role;
COMMIT;
