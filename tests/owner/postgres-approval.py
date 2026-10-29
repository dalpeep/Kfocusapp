import pathlib,subprocess,json,re,os
root=pathlib.Path(__file__).resolve().parents[2];container=os.environ.get('OWNER_TEST_CONTAINER','dtm-owner-policy-20261029');db='owner_approval03'
def run(sql,expected=None):
 p=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d',db,'-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],input=sql.encode(),capture_output=True)
 if expected:assert p.returncode and expected in p.stderr.decode(),p.stderr.decode()
 else:assert p.returncode==0,p.stderr.decode()
 return p.stdout.decode().strip()
source=(root/'supabase/owner-open/02-apply.sql').read_text(encoding='utf-8-sig');ddl=source[source.index('CREATE SCHEMA owner_portal_uuid_internal;'):]
security=(root/'supabase/owner-open/01-security.sql').read_text(encoding='utf-8-sig');helper=re.search(r'CREATE FUNCTION public.owner_uuid_admin_region\(.*?\$\$;',security,re.S).group()
u={k:f'10000000-0000-4000-8000-{i:012}' for i,k in enumerate(['admin','owner','other','regional'],1)}
a='20000000-0000-4000-8000-000000000001'
boot="""CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz);CREATE TABLE profiles(user_id uuid PRIMARY KEY,role text,area text);
CREATE TABLE businesses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name_ko text,name_en text,region text,area text,category_ko text,address text,phone text,description text,hours text);
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;GRANT SELECT ON businesses TO anon,authenticated;CREATE POLICY public_listing ON businesses FOR SELECT TO anon USING(true);
"""
for who in u:boot+=f"INSERT INTO auth.users VALUES('{u[who]}',now());"
boot+=f"INSERT INTO profiles VALUES('{u['admin']}','super_admin',NULL),('{u['regional']}','regional_editor','colorado');INSERT INTO businesses(id,name_ko,region,address) VALUES('{a}','existing','dallas','synthetic');"
run(boot+helper+ddl)
results=[];i=0
def check(label,sql,want=None,err=None):
 out=run(sql,err);assert err or out==want,(label,out,want);results.append({'case':label,'pass':True});return out

def command(who,c):
 global i;i+=1;c={'key':f'40000000-0000-4000-8000-{i:012}',**c};return f"SELECT public.owner_portal_uuid_command('{u[who]}','{json.dumps(c)}'::jsonb)",c
q,_=command('owner',{'action':'submit','kind':'new','region':'dallas','changes':{'name_ko':'synthetic pending','address':'new synthetic','phone':'fiction','category_ko':'service'}});new=json.loads(run(q));request=new['request_id']
check('pending new request does not create public business','SELECT count(*) FROM businesses;','1')
check('anonymous cannot find pending business',"SET ROLE anon;SELECT count(*) FROM public.businesses WHERE name_ko='synthetic pending';",'0')
check('anonymous cannot read private requests','SET ROLE anon;SELECT count(*) FROM owner_portal_uuid_internal.requests;',err='42501')
q,_=command('regional',{'action':'approve','request_id':request,'area':'synthetic'});check('foreign regional approval denied',q,err='OP403')
q,c=command('admin',{'action':'approve','request_id':request,'area':'synthetic'});approved=run(q);newid=json.loads(approved)['business_id']
check('approved business is public exactly once',"SET ROLE anon;SELECT count(*) FROM public.businesses WHERE name_ko='synthetic pending';",'1')
check('approval retry returns same result',q,approved)
q,_=command('other',{'action':'update','business_id':newid,'changes':{'description':'forbidden'}});check('other owner cannot update approved business',q,err='OP403')
q,_=command('owner',{'action':'update','business_id':newid,'changes':{'description':'synthetic own edit'}});run(q);check('approved owner update succeeds',f"SELECT description FROM businesses WHERE id='{newid}';",'synthetic own edit')
q,_=command('owner',{'action':'submit','kind':'claim','business_id':a});claim=json.loads(run(q))['request_id']
q,_=command('owner',{'action':'update','business_id':a,'changes':{'description':'not yet'}});check('claim pending cannot edit',q,err='OP403')
q,_=command('admin',{'action':'approve','request_id':claim});run(q);check('claim approval grants only target membership',f"SELECT count(*) FROM owner_portal_uuid_internal.memberships WHERE user_id='{u['owner']}' AND active;",'2')
q,_=command('admin',{'action':'revoke','business_id':a,'user_id':u['owner'],'reason':'synthetic revocation'});run(q)
q,_=command('owner',{'action':'update','business_id':a,'changes':{'description':'after revoked'}});check('revoked owner cannot edit',q,err='OP403')
q,_=command('other',{'action':'submit','kind':'new','region':'dallas','changes':{'name_ko':'rejected synthetic','address':'other synthetic','phone':'fiction','category_ko':'service'}});rejected=json.loads(run(q))['request_id']
q,_=command('admin',{'action':'reject','request_id':rejected,'reason':'synthetic rejection'});run(q);check('rejected business never public',"SELECT count(*) FROM businesses WHERE name_ko='rejected synthetic';",'0')
q,_=command('admin',{'action':'submit','kind':'new','region':'dallas','changes':{'name_ko':'self synthetic','address':'self synthetic','phone':'fiction','category_ko':'service'}});selfreq=json.loads(run(q))['request_id']
q,_=command('admin',{'action':'approve','request_id':selfreq,'area':'synthetic'});check('self review denied',q,err='OP403')
check('original business name preserved',f"SELECT name_ko FROM businesses WHERE id='{a}';",'existing')
check('requests preserved after decisions','SELECT count(*) FROM owner_portal_uuid_internal.requests;','4')
report={'result':'PASS','checks':len(results),'pass':len(results),'fail':0,'network':'none','productionWrites':0,'scope':'actual02 DDL and approval RPC on synthetic base tables; production approval guards are not disabled or executed','results':results}
(root/'.release-artifacts/owner-approval-postgres.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='results'}))
