"""Synthetic, network-none PostgreSQL test. Never connects to Supabase."""
import os,pathlib,json,re,subprocess,concurrent.futures,uuid
root=pathlib.Path(__file__).resolve().parents[2]
C=os.environ.get('OWNER_TEST_CONTAINER','dtm-owner-policy-20261029');D='owner_v2_qa_'+uuid.uuid4().hex[:10]
def run(q,code=None):
 p=subprocess.run(['docker','exec','-i',C,'psql','-U','postgres','-d',D,'-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],input=q.encode(),capture_output=True)
 if code:assert p.returncode and code in p.stderr.decode(),p.stderr.decode()
 else:assert p.returncode==0,p.stderr.decode()
 return p.stdout.decode().strip()
def fn(file,name):
 s=(root/'supabase/owner-open'/file).read_text(encoding='utf-8-sig');return re.findall(r'CREATE (?:OR REPLACE )?FUNCTION '+re.escape(name)+r'\(.*?\$\$;',s,re.S)[-1]
subprocess.run(['docker','exec',C,'createdb','-U','postgres',D],check=True,capture_output=True)
catalog=json.loads((root/'.release-artifacts/production-owner-catalog.json').read_text()) if (root/'.release-artifacts/production-owner-catalog.json').exists() else None
# Explicit synthetic schema mirrors production types, not production rows.
boot='''DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;END $$;CREATE SCHEMA auth;CREATE SCHEMA owner_portal_uuid_internal;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE profiles(user_id uuid,role text,area text);
CREATE TABLE businesses(id uuid PRIMARY KEY,region text,name_ko text,name_en text,name text);
CREATE TABLE owner_portal_uuid_internal.memberships(user_id uuid,business_id uuid,active boolean,revoked_at timestamptz);
CREATE TABLE owner_portal_uuid_internal.audit(id bigint GENERATED ALWAYS AS IDENTITY,action text,after_value jsonb);
CREATE TABLE coupons(id uuid PRIMARY KEY,business_id uuid REFERENCES businesses(id),title text,description text,discount_label text,image_url text,email_image_url text,delivery_mode text,is_active boolean,start_at timestamptz,end_at timestamptz,raffle_end_at timestamptz,issue_limit integer,used_count integer DEFAULT 0,notify_emails text,owner_coupon_protocol text DEFAULT 'legacy');
CREATE TABLE coupon_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),coupon_id text,business_id text,email text,email_normalized text,entry_code text,coupon_code text,status text,marketing_opt_in boolean,source text,issued_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),redeemed_at timestamptz,emailed_at timestamptz,mail_state text DEFAULT 'pending',mail_attempts integer DEFAULT 0,mail_first_attempt_at timestamptz,mail_lease uuid,mail_locked_until timestamptz,mail_payload jsonb,mail_last_error_code text,mail_last_error_at timestamptz,UNIQUE(coupon_id,email_normalized));
CREATE TABLE coupon_redemptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),coupon_id uuid,business_id uuid,coupon_title text,used_by text,status text);
'''
ids={k:str(uuid.UUID(int=0x10000000000040008000000000000000+i)) for i,k in enumerate(['owner','other','regional','admin'],1)}
b='20000000-0000-4000-8000-000000000001';other='20000000-0000-4000-8000-000000000002';cid='30000000-0000-4000-8000-000000000001'
for who,v in ids.items():boot+=f"INSERT INTO auth.users VALUES('{v}',now(),NULL,NULL);"
boot+=f"INSERT INTO profiles VALUES('{ids['admin']}','super_admin',NULL),('{ids['regional']}','regional_editor','colorado');INSERT INTO businesses VALUES('{b}','dallas','synthetic',NULL,NULL),('{other}','colorado','synthetic other',NULL,NULL);INSERT INTO owner_portal_uuid_internal.memberships VALUES('{ids['owner']}','{b}',true,NULL),('{ids['other']}','{other}',true,NULL);INSERT INTO coupons VALUES('{cid}','{b}','synthetic coupon','','benefit',NULL,NULL,'instant_email',true,now()-interval '1 day',now()+interval '1 day',NULL,1,0,'test@example.invalid','v2');"
boot+=fn('01-security.sql','public.owner_uuid_admin_region')+fn('06-owner-extensions.sql','owner_portal_uuid_internal.account_enabled')+fn('06-owner-extensions.sql','owner_portal_uuid_internal.content_access')+fn('06-owner-extensions.sql','public.owner_coupon_campaign')
run(boot+"SET owner_preview.coupon_v2_approved='true';"+(root/'supabase/owner-open/10-coupon-v2-usage.sql').read_text(encoding='utf-8-sig'))
run('CREATE TRIGGER owner_coupon_entry_protocol_guard BEFORE INSERT OR UPDATE OR DELETE ON coupon_entries FOR EACH ROW EXECUTE FUNCTION owner_portal_uuid_internal.coupon_entry_protocol_guard();')
results=[]
def check(name,q,want=None,code=None):
 out=run(q,code);assert code or want is None or out==want,(name,out,want);results.append({'case':name,'pass':True});return out
def cmd(action,actor=None,**args):
 c={'action':action,'coupon_id':cid,**args};return "SELECT public.owner_coupon_v2_command("+("NULL" if actor is None else "'"+ids[actor]+"'")+",'"+json.dumps(c)+"'::jsonb)"
key=str(uuid.uuid4());q=cmd('reserve',email='synthetic@example.invalid',key=key)
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:out=list(pool.map(lambda _:run(q),range(10)))
assert len(set(out))==1;results.append({'case':'ten concurrent issuance retries same result','pass':True})
check('one issuance only','SELECT count(*) FROM coupon_entries;','1')
check('one issuance outbox','SELECT count(*) FROM owner_portal_uuid_internal.coupon_v2_outbox;','1')
check('no codes or email in public result',q+" ?| ARRAY['coupon_code','entry_code','email'];",'f')
check('same key changed request denied',cmd('reserve',email='other@example.invalid',key=key),code='OP409')
check('inventory limit',cmd('reserve',email='other@example.invalid',key=str(uuid.uuid4())),code='OP409')
eid=run('SELECT id FROM coupon_entries;')
for who in ['other','regional']:check(who+' cannot list',cmd('list',who),code='OP403')
check('anonymous cannot list',cmd('list'),code='OP403')
check('owner can list',cmd('list','owner')+"->'entries'->0->>'id';",eid)
check('super admin can list',cmd('list','admin')+"->'entries'->0->>'id';",eid)
check('fake use notify denied',cmd('notify','owner',use_id=str(uuid.uuid4())),code='OP403')
for who in ['other','regional']:check(who+' cannot redeem',cmd('redeem',who,entry_id=eid,key=str(uuid.uuid4())),code='OP403')
usekey=str(uuid.uuid4());q=cmd('redeem','owner',entry_id=eid,key=usekey)
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:out=list(pool.map(lambda _:run(q),range(10)))
assert len(set(out))==1;results.append({'case':'ten concurrent redemption retries same result','pass':True})
uid=json.loads(out[0])['use_id']
for label,query in [('one use','SELECT count(*) FROM owner_portal_uuid_internal.coupon_v2_uses'),('one redemption','SELECT count(*) FROM coupon_redemptions'),('count once','SELECT used_count FROM coupons')]:check(label,query,'1')
check('second key still cannot use twice',cmd('redeem','owner',entry_id=eid,key=str(uuid.uuid4()))+"->>'existing';",'true')
check('notify committed use',cmd('notify','owner',use_id=uid)+"->>'duplicate';",'false')
check('notify duplicate blocked',cmd('notify','owner',use_id=uid)+"->>'duplicate';",'true')
check('one mock acknowledgement','SELECT attempts FROM owner_portal_uuid_internal.coupon_v2_outbox WHERE use_id IS NOT NULL;','1')
run("UPDATE owner_portal_uuid_internal.coupon_v2_outbox SET state='pending',attempts=0 WHERE use_id IS NOT NULL;")
claim=cmd('claim_notification','owner',use_id=uid)
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:claimed=list(pool.map(lambda _:json.loads(run(claim)),range(10)))
assert sum(x.get('claimed',False) for x in claimed)==1;results.append({'case':'notification ten concurrent claims only one lease','pass':True})
lease=next(x for x in claimed if x.get('claimed'))
check('wrong notification lease denied',cmd('finish_notification','owner',use_id=uid,lease=str(uuid.uuid4()),accepted=True),code='OP409')
check('notification failure recorded',cmd('finish_notification','owner',use_id=uid,lease=lease['lease'],accepted=False)+"->>'saved';",'true')
check('notification retry waits',claim,code='OP409')
check('notification error sanitized',"SELECT last_error_code FROM owner_portal_uuid_internal.coupon_v2_outbox WHERE use_id IS NOT NULL;",'TRANSPORT_FAILED')
run("UPDATE owner_portal_uuid_internal.coupon_v2_outbox SET next_at=now()-interval '1 second' WHERE use_id IS NOT NULL;")
again=json.loads(run(claim));assert again['idempotency_key']==lease['idempotency_key'];results.append({'case':'retry provider idempotency key stable','pass':True})
check('notification acknowledgement',cmd('finish_notification','owner',use_id=uid,lease=again['lease'],accepted=True)+"->>'saved';",'true')
check('accepted notification not claimed again',claim+"->>'claimed';",'false')
for role in ['anon','authenticated']:
 check(role+' RPC denied','SET ROLE '+role+';'+cmd('list','owner'),code='42501')
 check(role+' private ledger denied','SET ROLE '+role+';SELECT * FROM owner_portal_uuid_internal.coupon_v2_uses;',code='42501')
run('GRANT SELECT,INSERT,UPDATE,DELETE ON coupons,coupon_entries,coupon_redemptions TO authenticated;')
check('direct entry update denied',"SET ROLE authenticated;UPDATE coupon_entries SET status='cancelled';",code='42501')
check('direct redemption insert denied',f"SET ROLE authenticated;INSERT INTO coupon_redemptions(coupon_id) VALUES('{cid}');",code='42501')
run("UPDATE coupons SET is_active=false;UPDATE coupon_entries SET status='coupon_issued';DELETE FROM owner_portal_uuid_internal.coupon_v2_outbox WHERE use_id IS NOT NULL;DELETE FROM owner_portal_uuid_internal.coupon_v2_uses;DELETE FROM coupon_redemptions;")
check('closed coupon cannot redeem',cmd('redeem','owner',entry_id=eid,key=str(uuid.uuid4())),code='OP409')
run("UPDATE coupons SET is_active=true,end_at=now()-interval '1 hour';")
check('expired coupon cannot redeem',cmd('redeem','owner',entry_id=eid,key=str(uuid.uuid4())),code='OP409')
check('failed transaction leaves no use','SELECT count(*) FROM owner_portal_uuid_internal.coupon_v2_uses;','0')
run("UPDATE coupons SET delivery_mode='raffle';")
check('raffle denied',cmd('reserve',email='none@example.invalid',key=str(uuid.uuid4())),code='OP403')
report={'result':'PASS','pass':len(results),'fail':0,'fixture':'synthetic only; actual reserve and V2 SQL; existing trusted access helper','productionWrites':0,'externalDelivery':0,'checks':results}
(root/'.release-artifacts/owner-v2-postgres.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='checks'}))
