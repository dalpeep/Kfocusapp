-- Production migration; separate final approval is required. No operational execution by this generator.
BEGIN;
SET LOCAL owner_preview.production_extension_approved='false';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('owner_preview.production_extension_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate production approval required'; END IF;
 IF nullif(current_setting('supabase.project_ref',true),'') IS NOT NULL AND current_setting('supabase.project_ref',true)<>'ydrxuqmjzayejlnjzzew' THEN RAISE EXCEPTION 'Production ref mismatch'; END IF;
 IF obj_description(to_regnamespace('owner_portal_uuid_internal'),'pg_namespace') IS DISTINCT FROM 'daltownmap-owner-production:ydrxuqmjzayejlnjzzew:idset-sha256:27bcd9d953d2106aa9e00e42cda48b8502e04a9a9ae3323d4c5bcdb281c0b28d' THEN RAISE EXCEPTION 'Verified base migration required'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.businesses'::regclass AND attname='id') IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'UUID required'; END IF;
 IF to_regprocedure('public.owner_content_command(uuid,jsonb)') IS NOT NULL OR to_regclass('owner_uuid_security_backup.extension_manifest') IS NOT NULL THEN RAISE EXCEPTION 'Already installed or drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.coupon_entries_coupon_email_uq') AND indisunique AND indisvalid AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX coupon_entries_coupon_email_uq ON public.coupon_entries USING btree (coupon_id, email_normalized)') THEN RAISE EXCEPTION 'Existing coupon uniqueness required'; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.business_specials'::regclass AND conname='business_specials_type_check') IS DISTINCT FROM 'CHECK ((type = ANY (ARRAY[''lunch_special''::text, ''happy_hour''::text])))' THEN RAISE EXCEPTION 'Special constraint drift'; END IF;
 IF EXISTS(SELECT 1 FROM public.coupon_entries WHERE email_normalized IS DISTINCT FROM lower(btrim(email))) THEN RAISE EXCEPTION 'Historical email normalization drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN ('public.business_specials'::regclass,'public.business_special_items'::regclass) AND attname='id' AND attidentity<>'d') THEN RAISE EXCEPTION 'Captured Identity dependency drift'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND ((table_name='coupons' AND column_name='issue_limit') OR (table_name='coupon_entries' AND column_name LIKE 'mail_%'))) THEN RAISE EXCEPTION 'Campaign columns need explicit drift review'; END IF;
END $$;
CREATE TABLE owner_uuid_security_backup.extension_manifest(id boolean PRIMARY KEY CHECK(id),installed_at timestamptz NOT NULL DEFAULT now(),definitions jsonb NOT NULL);
ALTER TABLE owner_uuid_security_backup.extension_manifest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_uuid_security_backup.extension_manifest FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO owner_uuid_security_backup.extension_manifest(id,definitions) SELECT true,jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text)) FROM pg_proc p WHERE p.oid IN ('public.owner_portal_uuid_command(uuid,jsonb)'::regprocedure,'public.owner_portal_uuid_read(uuid,text,text,integer,integer)'::regprocedure);
ALTER TABLE public.business_specials DROP CONSTRAINT business_specials_type_check;
ALTER TABLE public.business_specials ADD CONSTRAINT business_specials_type_check CHECK(type IN ('lunch_special','happy_hour','discount'));
CREATE FUNCTION owner_portal_uuid_internal.content_access(actor uuid,bid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u JOIN public.businesses b ON b.id=bid
 WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL
 AND coalesce((to_jsonb(u)->>'deleted_at'),'')=''
 AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()
 AND (public.owner_uuid_admin_region(actor,b.region) OR EXISTS(
 SELECT 1 FROM owner_portal_uuid_internal.memberships m WHERE m.business_id=bid AND m.user_id=actor AND m.active)))
$$;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.content_access(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION owner_portal_uuid_internal.image_url_allowed(actor uuid,bid uuid,url text,previous jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM jsonb_each(coalesce(previous,'{}')) f CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(f.value)='array' THEN f.value WHEN jsonb_typeof(f.value)='string' THEN jsonb_build_array(f.value) ELSE '[]'::jsonb END) v WHERE f.key IN ('image_url','gallery_urls','description_images') AND v=url)
 OR EXISTS(SELECT 1 FROM public.businesses b JOIN storage.objects o ON o.bucket_id='public-images' WHERE b.id=bid AND 'https://ydrxuqmjzayejlnjzzew.supabase.co/storage/v1/object/public/public-images/'||o.name=url AND (
 (o.name LIKE 'owner-v1/owner/'||bid::text||'/'||actor::text||'/%' AND o.name ~ '^owner-v1/owner/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$')
 OR (public.owner_uuid_admin_region(actor,b.region) AND o.name ~ ('^owner-v1/'||b.region||'/(uploads|business-gallery|business-description)/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'))));
$$;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.image_url_allowed(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.owner_content_read(p_actor uuid,p_business uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT owner_portal_uuid_internal.content_access(p_actor,p_business) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='활성 소유권 필요'; END IF;
 RETURN jsonb_build_object(
 'business',(SELECT to_jsonb(b) FROM public.businesses b WHERE id=p_business),
 'coupons',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY created_at DESC) FROM public.coupons c WHERE business_id=p_business),'[]'),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at DESC) FROM public.posts e WHERE business_id=p_business AND type='notice'),'[]'),
 'specials',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('id',s.id::text,'items',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('id',i.id::text) ORDER BY sort_order,id) FROM public.business_special_items i WHERE special_id=s.id),'[]'))) FROM public.business_specials s WHERE business_id=p_business),'[]'));
END $$;

CREATE FUNCTION public.owner_content_command(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 bid uuid:=(p_command->>'business_id')::uuid; v_key uuid:=(p_command->>'key')::uuid;
 kind text:=p_command->>'kind'; action text:=p_command->>'action'; rid text:=p_command->>'record_id';
 patch jsonb:=p_command->'changes'; allowed text[]; table_name text; b public.businesses;
 before_data jsonb; after_data jsonb; previous owner_portal_uuid_internal.commands; result jsonb;
 cols text; vals text; sets text; item jsonb; idx integer:=0; items jsonb:=p_command->'items';
BEGIN
 IF p_actor IS NULL OR v_key IS NULL OR bid IS NULL OR kind IS NULL OR action IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k<>ALL(ARRAY['key','kind','action','business_id','record_id','changes','items']))
 OR action NOT IN ('save','end') OR kind NOT IN ('profile','coupon','event','special') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='요청 형식 오류'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 SELECT * INTO b FROM public.businesses WHERE id=bid FOR UPDATE;
 IF NOT FOUND OR NOT owner_portal_uuid_internal.content_access(p_actor,bid) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='활성 소유권 필요'; END IF;
 SELECT * INTO previous FROM owner_portal_uuid_internal.commands WHERE actor=p_actor AND key=v_key;
 IF FOUND THEN
 IF previous.command<>p_command THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='동일 키 다른 요청'; END IF;
 RETURN previous.result; END IF;
 IF kind='profile' THEN
 table_name:='businesses';rid:=bid::text;
 allowed:=ARRAY['description','hours','website','website_url','youtube_url','order_url','delivery_url','reservation_url','image_url','gallery_urls','description_images','business_hours','monday','tuesday','wednesday','thursday','friday','saturday','sunday','tagline'];
 IF action='end' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='업소 종료는 관리자 처리'; END IF;
 ELSIF kind='coupon' THEN
 table_name:='coupons';allowed:=ARRAY['title','description','image_url','coupon_code','discount_label','start_at','end_at','delivery_mode','raffle_end_at','winner_count','one_per_email','marketing_opt_in_enabled','is_active','is_today_coupon','issue_limit'];
 ELSIF kind='event' THEN
 table_name:='posts';allowed:=ARRAY['title','content','image_url','start_at','end_at','venue_name','address','external_url','is_active'];
 ELSE
 table_name:='business_specials';allowed:=ARRAY['type','title','description','price_text','days_of_week','start_time','end_time','start_date','end_date','image_url','is_active'];
 END IF;
 IF items IS NOT NULL AND (kind<>'special' OR jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>20) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='메뉴 형식 오류'; END IF;
 IF rid IS NOT NULL THEN
 IF kind='special' AND rid !~ '^[1-9][0-9]{0,18}$' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='특선 ID 오류'; END IF;
 IF kind IN ('coupon','event') AND rid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='ID 오류'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text=$1 %s FOR UPDATE',table_name,CASE WHEN kind='profile' THEN '' WHEN kind='event' THEN 'AND business_id=$2 AND type=''notice''' ELSE 'AND business_id=$2' END) INTO before_data USING rid,bid;
 IF before_data IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='콘텐츠 접근 거부'; END IF;
 ELSE
 IF action='end' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='종료 ID 필요'; END IF;
 END IF;
 IF action='end' THEN patch:=jsonb_build_object('is_active',false); END IF;
 IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch='{}' OR pg_column_size(patch)>25000
 OR EXISTS(SELECT 1 FROM jsonb_each(patch) e WHERE e.key<>ALL(allowed) OR (jsonb_typeof(e.value)='string' AND length(e.value#>>'{}')>5000)) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='허용 필드 오류'; END IF;
 IF kind<>'profile' AND (rid IS NULL OR patch ? 'title') AND length(btrim(coalesce(patch->>'title',''))) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='제목 필요'; END IF;
 IF patch ? 'is_active' AND jsonb_typeof(patch->'is_active')<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='활성 값 오류'; END IF;
 IF patch ? 'image_url' AND coalesce(patch->>'image_url','')<>'' AND NOT owner_portal_uuid_internal.image_url_allowed(p_actor,bid,patch->>'image_url',before_data) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='QA 업소 이미지 경로 필요'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(patch) e WHERE e.key IN ('website','website_url','youtube_url','order_url','delivery_url','reservation_url','external_url') AND e.value<>'' AND e.value !~ '^https://[^[:space:]]+$') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='HTTPS 링크 필요'; END IF;
 IF kind='profile' AND (patch ? 'gallery_urls' OR patch ? 'description_images') THEN
 FOR item IN SELECT value FROM jsonb_each(patch) WHERE key IN ('gallery_urls','description_images') LOOP
 IF jsonb_typeof(item)<>'array' OR jsonb_array_length(item)>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item) e WHERE jsonb_typeof(e)<>'string' OR NOT owner_portal_uuid_internal.image_url_allowed(p_actor,bid,e#>>'{}',before_data)) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='갤러리 경로 오류'; END IF;
 END LOOP; END IF;
 IF kind='coupon' THEN
 IF coalesce(patch->>'delivery_mode',before_data->>'delivery_mode','display') NOT IN ('display','instant_email','raffle') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='쿠폰 유형 오류'; END IF;
 IF patch ? 'winner_count' AND ((patch->>'winner_count')::integer NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='당첨 수 오류'; END IF;
 END IF;
 IF kind IN ('coupon','event') AND coalesce(patch->>'start_at',before_data->>'start_at')::timestamptz > coalesce(patch->>'end_at',before_data->>'end_at')::timestamptz THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='기간 오류'; END IF;
 IF kind='special' THEN
 IF coalesce(patch->>'type',before_data->>'type') NOT IN ('lunch_special','happy_hour','discount') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='특선 유형 오류'; END IF;
 IF before_data IS NOT NULL THEN before_data:=before_data||jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.business_special_items i WHERE special_id=rid::bigint),'[]')); END IF;
 END IF;
 IF rid IS NULL THEN
 patch:=patch||jsonb_build_object('business_id',bid);
 IF kind IN ('coupon','event') THEN patch:=patch||jsonb_build_object('region',b.region,'area',b.area); END IF;
 IF kind='coupon' THEN patch:=patch||jsonb_build_object('business_ids',jsonb_build_array(bid::text)); END IF;
 IF kind='event' THEN patch:=patch||jsonb_build_object('type','notice','user_id',p_actor); END IF;
 SELECT string_agg(format('%I',k),','),string_agg(format('x.%I',k),',') INTO cols,vals FROM jsonb_object_keys(patch) k;
 EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x RETURNING to_jsonb(%I)',table_name,cols,vals,table_name,table_name) INTO after_data USING patch;
 rid:=after_data->>'id';
 ELSE
 patch:=patch||jsonb_build_object('updated_at',clock_timestamp());
 SELECT string_agg(format('%I=x.%I',k,k),',') INTO sets FROM jsonb_object_keys(patch) k;
 EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) x WHERE t.id::text=$2 RETURNING to_jsonb(t)',table_name,sets,table_name) INTO after_data USING patch,rid;
 END IF;
 IF kind='special' AND items IS NOT NULL THEN
 -- Menus replaced atomically; exact previous items retained in the immutable audit snapshot.
 DELETE FROM public.business_special_items WHERE special_id=rid::bigint;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
 IF jsonb_typeof(item)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k<>ALL(ARRAY['item_name','description','price_text'])) OR length(btrim(coalesce(item->>'item_name',''))) NOT BETWEEN 1 AND 160 OR length(coalesce(item->>'description',''))>5000 OR length(coalesce(item->>'price_text',''))>100 THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='메뉴 입력 오류'; END IF;
 INSERT INTO public.business_special_items(special_id,item_name,description,price_text,sort_order) VALUES(rid::bigint,item->>'item_name',item->>'description',item->>'price_text',idx);idx:=idx+1;
 END LOOP;
 after_data:=after_data||jsonb_build_object('items',(SELECT jsonb_agg(to_jsonb(i)) FROM public.business_special_items i WHERE special_id=rid::bigint));
 END IF;
 result:=jsonb_build_object('business_id',bid::text,'record_id',rid,'kind',kind,'action',action);
 INSERT INTO owner_portal_uuid_internal.audit(actor,business_id,action,before_value,after_value,reason) VALUES(p_actor,bid,'content_'||kind||'_'||action,before_data,after_data,'업주 콘텐츠 관리');
 INSERT INTO owner_portal_uuid_internal.commands(actor,key,command,result) VALUES(p_actor,v_key,p_command,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.owner_content_command(uuid,jsonb),public.owner_content_read(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_content_command(uuid,jsonb),public.owner_content_read(uuid,uuid) TO service_role;
-- Preserve existing admin browser DML; owners must use verified server RPCs.
DO $$ DECLARE t text; cmd text; cond text; BEGIN
 FOR t IN SELECT unnest(ARRAY['coupons','posts','business_specials']) LOOP
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) THEN RAISE EXCEPTION 'RLS required: %',t; END IF;
 cond:='EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=business_id AND public.owner_uuid_current_admin(b.region))';
 IF t='posts' THEN cond:='(business_id IS NULL OR ('||cond||'))'; END IF;
 FOR cmd IN SELECT unnest(ARRAY['INSERT','UPDATE','DELETE']) LOOP
 EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO anon,authenticated %s %s',
 'owner_content_'||lower(cmd)||'_fence',t,cmd,
 CASE WHEN cmd<>'INSERT' THEN 'USING ('||cond||')' ELSE '' END,
 CASE WHEN cmd<>'DELETE' THEN 'WITH CHECK ('||cond||')' ELSE '' END);
 END LOOP;END LOOP;
END $$;

ALTER TABLE public.coupons ADD COLUMN issue_limit integer CHECK(issue_limit BETWEEN 1 AND 1000000);
ALTER TABLE public.coupon_entries
 ADD COLUMN mail_state text NOT NULL DEFAULT 'pending' CHECK(mail_state IN ('pending','sending','accepted','retry','review')),
 ADD COLUMN mail_attempts integer NOT NULL DEFAULT 0 CHECK(mail_attempts>=0),
 ADD COLUMN mail_first_attempt_at timestamptz,
 ADD COLUMN mail_lease uuid,
 ADD COLUMN mail_locked_until timestamptz,
 ADD COLUMN mail_payload jsonb, ADD COLUMN mail_last_error_code text, ADD COLUMN mail_last_error_at timestamptz;

CREATE FUNCTION public.owner_coupon_campaign(p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE action text:=p_command->>'action';c public.coupons;e public.coupon_entries;
 bid uuid;em text:=lower(btrim(p_command->>'email'));existing boolean:=false;
 code text;lease uuid;payload jsonb;business_name text;
BEGIN
 IF action='reserve' THEN
 IF em IS NULL OR length(em)>254 OR em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='이메일 오류'; END IF;
 -- Serialize a coupon's inventory and normalized-email retries across server instances.
 PERFORM pg_advisory_xact_lock(hashtextextended('coupon-email:'||em,0));
 SELECT * INTO c FROM public.coupons WHERE id=(p_command->>'coupon_id')::uuid FOR UPDATE;
 IF NOT FOUND OR c.delivery_mode NOT IN ('instant_email','raffle') THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='발급 쿠폰 아님'; END IF;
 SELECT * INTO e FROM public.coupon_entries WHERE coupon_id=c.id::text AND email_normalized=em FOR UPDATE;
 IF FOUND THEN
 existing:=true;
 IF e.status='cancelled' THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='취소된 신청'; END IF;
 ELSE
 IF NOT c.is_active OR c.start_at>now() OR c.end_at<now() OR (c.delivery_mode='raffle' AND c.raffle_end_at<now()) THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='기간 종료 또는 비활성'; END IF;
 IF c.issue_limit IS NOT NULL AND (SELECT count(*) FROM public.coupon_entries WHERE coupon_id=c.id::text AND status<>'cancelled')>=c.issue_limit THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='발급 수량 소진'; END IF;
 IF (SELECT count(*) FROM public.coupon_entries WHERE email_normalized=em AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION USING ERRCODE='OP429',MESSAGE='신청 제한'; END IF;
 code:=CASE c.delivery_mode WHEN 'raffle' THEN 'ENTRY-' ELSE 'DAL-' END||upper(replace(gen_random_uuid()::text,'-',''));
 INSERT INTO public.coupon_entries(coupon_id,business_id,email,email_normalized,entry_code,coupon_code,status,marketing_opt_in,source,issued_at)
 VALUES(c.id::text,c.business_id::text,em,em,CASE WHEN c.delivery_mode='raffle' THEN code END,CASE WHEN c.delivery_mode='instant_email' THEN code END,CASE c.delivery_mode WHEN 'raffle' THEN 'entered' ELSE 'coupon_issued' END,coalesce((p_command->>'marketing_opt_in')::boolean,false),'owner_uuid',CASE WHEN c.delivery_mode='instant_email' THEN now() END) RETURNING * INTO e;
 END IF;
 IF e.mail_payload IS NULL AND e.emailed_at IS NULL THEN
 SELECT coalesce(name_ko,name_en,name,'참여 업소') INTO business_name FROM public.businesses WHERE id=c.business_id;
 payload:=jsonb_build_object('to',em,'title',c.title,'benefit',coalesce(c.discount_label,c.description,''),'business_name',business_name,'mode',c.delivery_mode,'code',coalesce(e.entry_code,e.coupon_code,''),'image_url',coalesce(nullif(c.email_image_url,''),c.image_url),'start_at',c.start_at,'end_at',c.end_at,'conditions',c.description);
 UPDATE public.coupon_entries SET mail_payload=payload WHERE id=e.id;
 END IF;
 RETURN jsonb_build_object('entry_id',e.id::text,'existing',existing,'mode',c.delivery_mode,'status',e.status,'email_sent',e.emailed_at IS NOT NULL,'entry_code',e.entry_code,'coupon_code',e.coupon_code);
 ELSIF action='claim_mail' THEN
 SELECT * INTO e FROM public.coupon_entries WHERE id=(p_command->>'entry_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='신청 없음'; END IF;
 IF e.emailed_at IS NOT NULL OR e.mail_state='accepted' OR e.status='cancelled' THEN RETURN jsonb_build_object('claimed',false,'state',CASE WHEN e.emailed_at IS NOT NULL THEN 'accepted' ELSE e.mail_state END); END IF;
 IF e.mail_state='review' OR e.mail_attempts>=5 OR e.mail_first_attempt_at<now()-interval '23 hours' THEN
 UPDATE public.coupon_entries SET mail_state='review',mail_lease=NULL,mail_locked_until=NULL WHERE id=e.id;
 RETURN jsonb_build_object('claimed',false,'state','review');END IF;
 IF e.mail_locked_until>now() THEN RETURN jsonb_build_object('claimed',false,'state','sending'); END IF;
 IF e.mail_payload IS NULL THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='메일 예약 필요'; END IF;
 lease:=gen_random_uuid();
 UPDATE public.coupon_entries SET mail_state='sending',mail_attempts=mail_attempts+1,mail_first_attempt_at=coalesce(mail_first_attempt_at,now()),mail_locked_until=now()+interval '2 minutes',mail_lease=lease WHERE id=e.id;
 RETURN jsonb_build_object('claimed',true,'lease',lease::text,'payload',e.mail_payload,'idempotency_key','owner-coupon/'||e.id::text);
 ELSIF action='finish_mail' THEN
 SELECT * INTO e FROM public.coupon_entries WHERE id=(p_command->>'entry_id')::uuid FOR UPDATE;
 IF NOT FOUND OR e.mail_state<>'sending' OR e.mail_lease IS DISTINCT FROM (p_command->>'lease')::uuid THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='메일 lease 불일치'; END IF;
 UPDATE public.coupon_entries SET mail_state=CASE WHEN p_command->>'accepted'='true' THEN 'accepted' ELSE 'retry' END,
 emailed_at=CASE WHEN p_command->>'accepted'='true' THEN now() ELSE emailed_at END,mail_lease=NULL,mail_last_error_code=CASE WHEN p_command->>'accepted'='false' THEN CASE WHEN p_command->>'error_code' IN ('MAIL_PROVIDER_REJECTED','MAIL_TIMEOUT','MAIL_ACK_ERROR') THEN p_command->>'error_code' ELSE 'MAIL_TRANSPORT_ERROR' END ELSE mail_last_error_code END,mail_last_error_at=CASE WHEN p_command->>'accepted'='false' THEN now() ELSE mail_last_error_at END,
 mail_locked_until=CASE WHEN p_command->>'accepted'='true' THEN NULL ELSE now()+interval '1 minute' END,updated_at=now() WHERE id=e.id;
 RETURN jsonb_build_object('saved',true);
 END IF;
 RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='명령 오류';
END $$;
REVOKE ALL ON FUNCTION public.owner_coupon_campaign(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_coupon_campaign(jsonb) TO service_role;
-- Protect customer addresses/codes regardless of legacy table grants.
ALTER TABLE public.coupon_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_campaign_private_fence ON public.coupon_entries AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);

CREATE FUNCTION owner_portal_uuid_internal.account_enabled(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT NOT coalesce((SELECT action='account_disable' FROM owner_portal_uuid_internal.audit
 WHERE action IN ('account_disable','account_enable') AND after_value->>'user_id'=p_user::text ORDER BY id DESC LIMIT 1),false)
$$;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.account_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_account_command(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid:=(p_command->>'user_id')::uuid;v_key uuid:=(p_command->>'key')::uuid;action text:=p_command->>'action';why text:=btrim(p_command->>'reason');previous owner_portal_uuid_internal.commands;before_data jsonb;result jsonb;bid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND p.role='super_admin') THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='최고 관리자 필요'; END IF;
 IF target IS NULL OR v_key IS NULL OR target=p_actor OR action IS NULL OR action NOT IN ('disable','enable') OR why IS NULL OR length(why) NOT BETWEEN 1 AND 1000
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k<>ALL(ARRAY['action','key','user_id','reason'])) THEN RAISE EXCEPTION USING ERRCODE='OP400',MESSAGE='계정 처리 입력 오류'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target) OR EXISTS(SELECT 1 FROM public.profiles WHERE user_id=target AND role IN ('super_admin','regional_editor')) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='대상 업주 필요'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,0));
 SELECT * INTO previous FROM owner_portal_uuid_internal.commands WHERE actor=p_actor AND key=v_key;
 IF FOUND THEN IF previous.command<>p_command THEN RAISE EXCEPTION USING ERRCODE='OP409',MESSAGE='동일 키 다른 요청'; END IF;RETURN previous.result; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]') INTO before_data FROM owner_portal_uuid_internal.memberships m WHERE user_id=target;
 IF action='disable' THEN
 FOR bid IN SELECT b.id FROM public.businesses b JOIN owner_portal_uuid_internal.memberships m ON m.business_id=b.id WHERE m.user_id=target AND m.active ORDER BY b.id FOR UPDATE OF b LOOP
 UPDATE owner_portal_uuid_internal.memberships SET active=false,revoked_at=now() WHERE business_id=bid AND user_id=target AND active;
 INSERT INTO owner_portal_uuid_internal.audit(actor,business_id,action,after_value,reason) VALUES(p_actor,bid,'revoke',jsonb_build_object('user_id',target,'active',false),why);
 END LOOP;
 END IF;
 result:=jsonb_build_object('user_id',target::text,'enabled',action='enable');
 INSERT INTO owner_portal_uuid_internal.audit(actor,action,before_value,after_value,reason) VALUES(p_actor,'account_'||action,before_data,result,why);
 INSERT INTO owner_portal_uuid_internal.commands(actor,key,command,result) VALUES(p_actor,v_key,p_command,result);
 RETURN result;
END $$;

ALTER FUNCTION public.owner_portal_uuid_command(uuid,jsonb) RENAME TO owner_portal_uuid_command_base;
REVOKE ALL ON FUNCTION public.owner_portal_uuid_command_base(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_portal_uuid_command(p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;
BEGIN
 IF NOT owner_portal_uuid_internal.account_enabled(p_actor) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='업주 관리 계정 비활성'; END IF;
 IF p_command->>'action'='approve' THEN
 SELECT user_id INTO target FROM owner_portal_uuid_internal.requests WHERE id=(p_command->>'request_id')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,0));
 IF NOT owner_portal_uuid_internal.account_enabled(target) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='비활성 업주 승인 금지'; END IF;
 END IF;
 RETURN public.owner_portal_uuid_command_base(p_actor,p_command);
END $$;
ALTER FUNCTION public.owner_portal_uuid_read(uuid,text,text,integer,integer) RENAME TO owner_portal_uuid_read_base;
REVOKE ALL ON FUNCTION public.owner_portal_uuid_read_base(uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.owner_portal_uuid_read(p_actor uuid,p_status text DEFAULT NULL,p_kind text DEFAULT NULL,p_offset integer DEFAULT 0,p_audit_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT owner_portal_uuid_internal.account_enabled(p_actor) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='업주 관리 계정 비활성'; END IF;
 RETURN public.owner_portal_uuid_read_base(p_actor,p_status,p_kind,p_offset,p_audit_offset);
END $$;
CREATE OR REPLACE FUNCTION owner_portal_uuid_internal.content_access(actor uuid,bid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT owner_portal_uuid_internal.account_enabled(actor) AND EXISTS(
 SELECT 1 FROM auth.users u JOIN public.businesses b ON b.id=bid
 WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL
 AND coalesce(to_jsonb(u)->>'deleted_at','')=''
 AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity')<=now()
 AND (public.owner_uuid_admin_region(actor,b.region) OR EXISTS(
 SELECT 1 FROM owner_portal_uuid_internal.memberships m WHERE m.business_id=bid AND m.user_id=actor AND m.active)))
$$;
REVOKE ALL ON FUNCTION owner_portal_uuid_internal.content_access(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.owner_account_command(uuid,jsonb),public.owner_portal_uuid_command(uuid,jsonb),public.owner_portal_uuid_read(uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_account_command(uuid,jsonb),public.owner_portal_uuid_command(uuid,jsonb),public.owner_portal_uuid_read(uuid,text,text,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';

NOTIFY pgrst,'reload schema';
COMMIT;
