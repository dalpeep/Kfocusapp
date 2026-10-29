import pathlib,subprocess,re,json,concurrent.futures,os
root=pathlib.Path(__file__).resolve().parents[2]; C=os.environ.get('OWNER_TEST_CONTAINER','dtm-owner-policy-20261029');D=os.environ.get('OWNER_TEST_DB','postgres')
def run(sql,ok=True):
 p=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d',D,'-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],input=sql.encode(),capture_output=True)
 if ok and p.returncode: raise RuntimeError(p.stderr.decode())
 return p.stdout.decode().strip(),p.stderr.decode(),p.returncode

def fn(file,name):
 s=(root/'supabase/owner-open'/file).read_text(encoding='utf-8-sig');m=list(re.finditer(r'CREATE (?:OR REPLACE )?FUNCTION '+re.escape(name)+r'\(.*?\$\$;',s,re.S));assert m,name;return m[-1].group()
ids={k:f'10000000-0000-4000-8000-{i:012}' for i,k in enumerate(['admin','regional','owner','pending','other','banned','unconfirmed'],1)}
a,b='20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'
boot='''DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;END $$;
CREATE SCHEMA auth;CREATE SCHEMA owner_portal_uuid_internal;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE profiles(user_id uuid PRIMARY KEY,role text,area text);
CREATE TABLE businesses(id uuid PRIMARY KEY,region text,image_url text);
CREATE TABLE coupons(id uuid PRIMARY KEY,business_id uuid,delivery_mode text);
CREATE TABLE owner_portal_uuid_internal.memberships(user_id uuid,business_id uuid,active boolean,revoked_at timestamptz);
CREATE TABLE owner_portal_uuid_internal.commands(actor uuid,key uuid,command jsonb,result jsonb,PRIMARY KEY(actor,key));
CREATE TABLE owner_portal_uuid_internal.audit(id bigint GENERATED ALWAYS AS IDENTITY,actor uuid,business_id uuid,action text,before_value jsonb,after_value jsonb,reason text);
CREATE TABLE owner_portal_uuid_internal.coupon_plans(business_id uuid PRIMARY KEY,tier text,paid_enabled boolean,updated_at timestamptz DEFAULT now());
CREATE TABLE owner_portal_uuid_internal.description_options(id text,phrase text,active boolean,sort_order integer);
CREATE TABLE owner_portal_uuid_internal.coupon_templates(url text,design text,business_id uuid);
'''
for k,v in ids.items():boot+=f"INSERT INTO auth.users VALUES('{v}',{'NULL' if k=='unconfirmed' else 'now()'},NULL,{'now()+interval \'1 day\'' if k=='banned' else 'NULL'});"
for k,role,area in [('admin','super_admin',None),('regional','regional_editor','dallas'),('banned','super_admin',None),('unconfirmed','super_admin',None),('owner','owner',None)]:boot+=f"INSERT INTO profiles VALUES('{ids[k]}','{role}',"+("NULL" if area is None else "'"+area+"'")+");"
boot+=f"INSERT INTO businesses VALUES('{a}','dallas',''),('{b}','colorado','');INSERT INTO owner_portal_uuid_internal.memberships VALUES('{ids['owner']}','{a}',true,NULL),('{ids['pending']}','{a}',false,NULL);INSERT INTO coupons VALUES('30000000-0000-4000-8000-000000000001','{a}','raffle');"
boot+=fn('01-security.sql','public.owner_uuid_admin_region')+';'+fn('06-owner-extensions.sql','owner_portal_uuid_internal.account_enabled')+';'+fn('06-owner-extensions.sql','owner_portal_uuid_internal.content_access')+';'+fn('07-owner-coupon-plans.sql','public.owner_feature_policy')+';'+fn('07-owner-coupon-plans.sql','public.owner_plan_change')+';'
boot+='''CREATE FUNCTION public.owner_content_command(p_actor uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN IF NOT owner_portal_uuid_internal.content_access(p_actor,(p_command->>'business_id')::uuid) THEN RAISE EXCEPTION USING ERRCODE='OP403',MESSAGE='scope';END IF;RETURN jsonb_build_object('base_preserved',true); END $$;
CREATE FUNCTION public.owner_account_command(uuid,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('original_account',true)$$;
SET owner_preview.owner_open_approved='true';'''
run(boot+(root/'supabase/owner-open/09-owner-open-hardening.sql').read_text(encoding='utf-8-sig'))
results=[]
def check(name,sql,want=None,code=None):
 out,err,rc=run(sql,ok=code is None);passed=(rc!=0 and code in err) if code else (out==want);results.append({'case':name,'pass':passed});assert passed,(name,out,err)
count=0
def plan(actor,bid,tier='paid',enabled=True,key=None):
 global count
 count+=1;c={'action':'plan','key':key or f'40000000-0000-4000-8000-{count:012}','business_id':bid,'tier':tier,'enabled':enabled,'reason':'synthetic-test'};return f"SELECT public.owner_account_command('{ids[actor]}','{json.dumps(c)}'::jsonb)"
for who,bid,expected in [('admin',a,'free'),('regional',a,'free'),('regional',b,None),('owner',a,None)]:
 c={'action':'plan_read','business_id':bid};check(who+' scoped plan read '+bid[-1],f"SELECT public.owner_account_command('{ids[who]}','{json.dumps(c)}')->>'tier';",expected,code=None if expected else 'OP403')
check('super-admin plan',plan('admin',a)+"->>'tier';",'paid')
check('regional local plan',plan('regional',a,'free',False)+"->>'tier';",'free')
check('regional foreign denied',plan('regional',b)+';',code='OP403')
for k in ['owner','pending','banned','unconfirmed']:check(k+' cannot manage plans',plan(k,a)+';',code='OP403')
key='50000000-0000-4000-8000-000000000001';q=plan('admin',a,key=key);one=run(q)[0];check('idempotent result',q+';',one);check('idempotent ledger single',f"SELECT count(*) FROM owner_portal_uuid_internal.commands WHERE key='{key}';",'1')
check('conflicting reuse',plan('admin',a,'free',False,key)+';',code='OP409')
check('free cannot enable paid',plan('admin',a,'free',True)+';',code='OP400')
for role in ['anon','authenticated']:check(role+' direct RPC denied',f'SET ROLE {role};'+q+';',code='42501')
check('Paid raffle flag remains false',f"SELECT public.owner_feature_policy('{ids['owner']}','{a}')->>'raffle';",'false')
for change in [{'delivery_mode':'raffle'},{'winner_count':1},{'raffle_end_at':'2030-01-01'}]:
 c={'kind':'coupon','action':'save','business_id':a,'changes':change};check('raffle input denied '+next(iter(change)),f"SELECT public.owner_content_command('{ids['owner']}','{json.dumps(c)}');",code='OP403')
for who in ['owner','pending','other']:
 c={'kind':'coupon','action':'save','business_id':a,'changes':{'title':'synthetic'}};check(who+' membership scope',f"SELECT public.owner_content_command('{ids[who]}','{json.dumps(c)}')->>'base_preserved';",'true' if who=='owner' else None,code=None if who=='owner' else 'OP403')
c={'kind':'coupon','action':'end','business_id':a,'record_id':'30000000-0000-4000-8000-000000000001'};check('existing raffle unchanged',f"SELECT public.owner_content_command('{ids['owner']}','{json.dumps(c)}');",code='OP403')
check('historical raffle row preserved','SELECT count(*) FROM coupons;','1')
queries=[plan('admin',a,key='60000000-0000-4000-8000-000000000001') for _ in range(10)]
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool: outcomes=list(pool.map(lambda q:run(q)[0],queries))
assert len(set(outcomes))==1;results.append({'case':'ten concurrent identical plan requests','pass':True})
check('concurrent ledger exactly one',"SELECT count(*) FROM owner_portal_uuid_internal.commands WHERE key='60000000-0000-4000-8000-000000000001';",'1')
report={'result':'PASS','checks':len(results),'pass':len(results),'fail':0,'postgres':'17','network':'none','fixture':'synthetic only; original content/account commands are stubs, actual existing access/feature/plan helpers and new09 executed','productionWrites':0,'results':results}
(root/'.release-artifacts/owner-postgres-qa.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='results'}))

