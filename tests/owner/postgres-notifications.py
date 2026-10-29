"""Actual queue/RPC/trigger bodies; synthetic records only; network-none DB."""
import pathlib,subprocess,json,re,uuid,ast,concurrent.futures
root=pathlib.Path(__file__).resolve().parents[2];C='dtm-owner-policy-20261029';D='owner_notify_'+uuid.uuid4().hex[:10]
def run(q,code=None):
 p=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d',D,'-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],input=q.encode(),capture_output=True)
 if code:assert p.returncode and code in p.stderr.decode(),p.stderr.decode()
 else:assert p.returncode==0,p.stderr.decode()
 return p.stdout.decode().strip()
def fn(file,name):return re.findall(r'CREATE (?:OR REPLACE )?FUNCTION '+re.escape(name)+r'\(.*?\$\$;',(root/'supabase/owner-open'/file).read_text(encoding='utf-8-sig'),re.S)[-1]
subprocess.run(['docker','exec',C,'createdb','-U','postgres',D],capture_output=True,check=True)
boot="""DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;END IF;END$$;
CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE profiles(user_id uuid PRIMARY KEY,role text,area text);
CREATE TABLE businesses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name_ko text,name_en text,name text,region text,area text,category_ko text,address text,phone text,description text,hours text);
"""
source=(root/'supabase/owner-open/02-apply.sql').read_text(encoding='utf-8-sig');boot+=fn('01-security.sql','public.owner_uuid_admin_region')+source[source.index('CREATE SCHEMA owner_portal_uuid_internal;'):]
tree=ast.parse((root/'tests/owner/postgres-v2.py').read_text(encoding='utf-8-sig'));fixture=next(n.value.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='boot' for t in n.targets) and isinstance(n.value,ast.Constant))
for table in ['coupons','coupon_entries','coupon_redemptions']:boot+=re.search('CREATE TABLE '+table+r'\(.*?;',fixture,re.S).group()
boot+="""ALTER TABLE coupons ALTER COLUMN id SET DEFAULT gen_random_uuid();ALTER TABLE coupons ADD COLUMN region text,ADD COLUMN area text,ADD COLUMN business_ids uuid[],ADD COLUMN one_per_email boolean,ADD COLUMN marketing_opt_in_enabled boolean,ADD COLUMN is_today_coupon boolean,ADD COLUMN winner_count integer,ADD COLUMN coupon_code text,ADD COLUMN updated_at timestamptz DEFAULT now();
CREATE TABLE posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid,region text,area text,type text,user_id uuid,title text,content text,image_url text,start_at timestamptz,end_at timestamptz,venue_name text,address text,external_url text,is_active boolean,updated_at timestamptz DEFAULT now());
"""
boot+='CREATE SCHEMA storage;CREATE TABLE storage.objects(bucket_id text,name text);'+fn('06-owner-extensions.sql','owner_portal_uuid_internal.image_url_allowed')+fn('06-owner-extensions.sql','owner_portal_uuid_internal.account_enabled')+fn('06-owner-extensions.sql','owner_portal_uuid_internal.content_access')+fn('06-owner-extensions.sql','public.owner_content_command')+fn('06-owner-extensions.sql','public.owner_coupon_campaign')
u={k:f'10000000-0000-4000-8000-{i:012}' for i,k in enumerate(['admin','owner','applicant','regional','other'],1)};b='20000000-0000-4000-8000-000000000001';foreign='20000000-0000-4000-8000-000000000002'
for k,v in u.items():boot+=f"INSERT INTO auth.users VALUES('{v}','{k}@synthetic.invalid',now(),NULL,NULL);"
boot+=f"INSERT INTO profiles VALUES('{u['admin']}','super_admin',NULL),('{u['regional']}','regional_editor','colorado');INSERT INTO businesses(id,name_ko,region,address) VALUES('{b}','synthetic business','dallas','synthetic address');"
def command(who,c):return f"SELECT public.owner_portal_uuid_command('{u[who]}','{json.dumps(c)}')"
def cmd(who,**c):return command(who,{'key':str(uuid.uuid4()),**c})
run(boot+"SET owner_preview.coupon_v2_approved='true';"+(root/'supabase/owner-open/10-coupon-v2-usage.sql').read_text(encoding='utf-8-sig'))
request=json.loads(run(cmd('owner',action='submit',kind='claim',business_id=b)))['request_id'];run(cmd('admin',action='approve',request_id=request))
run("SET owner_preview.notifications_approved='true';"+(root/'supabase/owner-open/13-owner-notifications.sql').read_text(encoding='utf-8-sig'))
results=[]
def check(name,q,want=None,code=None):
 out=run(q,code);assert code or want is None or out==want,(name,out,want);results.append({'case':name,'pass':True});return out
count='SELECT count(*) FROM owner_portal_uuid_internal.notification_outbox;'
check('no historical backfill',count,'0')
apply={'key':str(uuid.uuid4()),'action':'submit','kind':'new','region':'dallas','changes':{'name_ko':'synthetic new','address':'new synthetic','phone':'000','category_ko':'service'}}
request=json.loads(run(command('applicant',apply)))['request_id'];check('application acknowledgement and correct regional review only',count,'2')
run(command('applicant',apply));check('request retry no duplicate notices',count,'2')
approved=json.loads(run(cmd('admin',action='approve',request_id=request,area='synthetic')))['business_id'];check('approval notification',count,'3')
q=cmd('other',action='submit',kind='new',region='dallas',changes={'name_ko':'synthetic rejected','address':'rejected synthetic','phone':'000','category_ko':'service'});reject=json.loads(run(q))['request_id'];run(cmd('admin',action='reject',request_id=reject,reason='synthetic reason'));check('rejection notification',count,'6')
def content(kind,key=None,**changes):return f"SELECT public.owner_content_command('{u['owner']}','{json.dumps({'key':key or str(uuid.uuid4()),'kind':kind,'action':'save','business_id':b,'changes':changes})}')"
key=str(uuid.uuid4());q=content('coupon',key,title='synthetic coupon',delivery_mode='instant_email',is_active=True);coupon=json.loads(run(q))['record_id'];check('actual Owner coupon command queues notification',count,'8');run(q);check('content retry no duplicate',count,'8')
event=json.loads(run(content('event',title='synthetic event',is_active=True)))['record_id'];check('actual Owner event command queues notification',count,'10')
check('other business content rejected',f"SELECT public.owner_content_command('{u['other']}','{json.dumps({'key':str(uuid.uuid4()),'kind':'event','action':'save','business_id':b,'changes':{'title':'forbidden'}})}')",code='OP403');check('denied command queues nothing',count,'10')
run(f"INSERT INTO coupons(id,business_id,title,owner_coupon_protocol) VALUES(gen_random_uuid(),'{b}','legacy record','legacy');");check('Legacy direct content insert unaffected',count,'10')
run("BEGIN;INSERT INTO owner_portal_uuid_internal.requests(user_id,kind,region,changes) VALUES('"+u['owner']+"','new','dallas','{}');ROLLBACK;");check('rolled back request has no notification',count,'10')
for role in ['anon','authenticated']:
 check(role+' queue private','SET ROLE '+role+';'+count,code='42501')
 check(role+' claim denied',"SET ROLE "+role+";SELECT public.owner_notification_claim('{}','{}','{}');",code='42501')
def claim(bid=b,actor=u['owner'],email='owner@synthetic.invalid'):return f"SELECT public.owner_notification_claim(ARRAY['{bid}']::uuid[],ARRAY['{actor}']::uuid[],ARRAY['{email}']);"
check('empty allowlist denied',"SELECT public.owner_notification_claim('{}','{}','{}');",code='OP403')
check('foreign business cannot claim',claim(bid=foreign)+'' if False else claim(bid=foreign).replace(';',"->>'claimed';"),'false')
check('unapproved recipient cannot claim',claim(email='other@synthetic.invalid').replace(';',"->>'claimed';"),'false')
run("UPDATE owner_portal_uuid_internal.notification_outbox SET state='mocked' WHERE kind<>'coupon_saved';")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:rows=list(pool.map(lambda _:json.loads(run(claim())),range(10)))
assert sum(bool(x['claimed']) for x in rows)==1;results.append({'case':'ten simultaneous workers only one lease','pass':True});item=next(x for x in rows if x['claimed'])
def finish(lease,result='retry',error='private provider text'):return f"SELECT public.owner_notification_finish('{item['id']}','{lease}','{result}','{error}');"
check('wrong lease denied',finish(str(uuid.uuid4())),code='OP409');check('transport retry recorded',finish(item['lease']),'t');check('error text sanitized',"SELECT last_error FROM owner_portal_uuid_internal.notification_outbox WHERE id='"+item['id']+"';",'TRANSPORT_FAILED')
check('retry delay respected',claim().replace(';',"->>'claimed';"),'false');run("UPDATE owner_portal_uuid_internal.notification_outbox SET next_at=now()-interval '1 second' WHERE id='"+item['id']+"';")
again=json.loads(run(claim()));assert again['message']==item['message'] and again['idempotency_key']==item['idempotency_key'];results.append({'case':'frozen message and provider key preserved on retry','pass':True})
check('mock ack is durable',finish(again['lease'],'mocked'),'t');check('mock ack never resent',claim().replace(';',"->>'claimed';"),'false')
run("UPDATE owner_portal_uuid_internal.notification_outbox SET state='retry',first_attempt_at=now()-interval '24 hours',next_at=now() WHERE id='"+item['id']+"';");check('provider retention expiry prevents replay',claim().replace(';',"->>'claimed';"),'false');check('uncertain old message retained for review',"SELECT state FROM owner_portal_uuid_internal.notification_outbox WHERE id='"+item['id']+"';",'review')
check('old V2 mail sender fenced',"SELECT public.owner_coupon_campaign('{\"action\":\"claim_mail\"}');",code='OP403')
run(f"UPDATE coupons SET owner_coupon_protocol='v2',start_at=now()-interval '1 day',end_at=now()+interval '1 day',is_active=true WHERE id='{coupon}';")
reserve={'action':'reserve','coupon_id':coupon,'email':'issued@synthetic.invalid','key':str(uuid.uuid4())};run("SELECT public.owner_coupon_v2_command(NULL,'"+json.dumps(reserve)+"');")
check('actual V2 issuance creates unified notice',"SELECT count(*) FROM owner_portal_uuid_internal.notification_outbox WHERE kind='coupon_issued';",'1')
issued=json.loads(run(claim(email='issued@synthetic.invalid')));assert issued['claimed'];results.append({'case':'issuance worker resolves actual customer recipient','pass':True})
check('issued email recipient exact',"SELECT message->>'to' FROM owner_portal_uuid_internal.notification_outbox WHERE kind='coupon_issued';",'issued@synthetic.invalid')
run(f"SELECT public.owner_notification_finish('{issued['id']}','{issued['lease']}','accepted',NULL);")
check('provider acceptance updates issuance acknowledgement',"SELECT mail_state FROM coupon_entries;",'accepted')
check('old V2 issuance state synchronized',"SELECT state FROM owner_portal_uuid_internal.coupon_v2_outbox WHERE use_id IS NULL;",'accepted')
eid=run('SELECT id FROM coupon_entries;');redeem={'action':'redeem','coupon_id':coupon,'entry_id':eid,'key':str(uuid.uuid4())};use=json.loads(run(f"SELECT public.owner_coupon_v2_command('{u['owner']}','{json.dumps(redeem)}');"))['use_id']
check('actual committed use creates one notice',"SELECT count(*) FROM owner_portal_uuid_internal.notification_outbox WHERE kind='coupon_used';",'1')
check('use status rejects foreign actor',f"SELECT public.owner_notification_use_status('{u['other']}','{coupon}','{use}');",code='OP403')
check('use status rejects invented record',f"SELECT public.owner_notification_use_status('{u['owner']}','{coupon}','{uuid.uuid4()}');",code='OP403')
check('use status exposes queue state only',f"SELECT public.owner_notification_use_status('{u['owner']}','{coupon}','{use}')->>'state';",'pending')
used=json.loads(run(claim()));run("UPDATE owner_portal_uuid_internal.notification_outbox SET locked_until=now()-interval '1 second' WHERE id='"+used['id']+"';");recovered=json.loads(run(claim()));assert recovered['idempotency_key']==used['idempotency_key'] and recovered['lease']!=used['lease'];results.append({'case':'crashed worker lease safely reclaimed with same key','pass':True})
check('old crashed lease cannot ack',f"SELECT public.owner_notification_finish('{used['id']}','{used['lease']}','accepted',NULL);",code='OP409')
run(f"SELECT public.owner_notification_finish('{recovered['id']}','{recovered['lease']}','mocked',NULL);")
check('mock never marks issuance actually emailed',"SELECT count(*) FROM owner_portal_uuid_internal.notification_outbox WHERE kind='coupon_used' AND state='mocked';",'1')
run("UPDATE owner_portal_uuid_internal.notification_outbox SET state='sending',attempts=5,locked_until=now()-interval '1 second' WHERE id='"+used['id']+"';")
check('exhausted crashed job not resent',claim().replace(';',"->>'claimed';"),'false')
check('exhausted job retained for review',"SELECT state FROM owner_portal_uuid_internal.notification_outbox WHERE id='"+used['id']+"';",'review')
report={'result':'PASS','database':D,'pass':len(results),'fail':0,'productionWrites':0,'externalDelivery':0,'fixture':'synthetic; actual approval/content command, triggers and queue SQL','checks':results};(root/'.release-artifacts/owner-notification-postgres.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='checks'}))
