"""Isolated synthetic PostgreSQL concurrency/RLS tests. No remote DB endpoints."""
import os,subprocess,pathlib,json,uuid,concurrent.futures
root=pathlib.Path(__file__).resolve().parents[2]
container=os.environ.get('OWNER_TEST_CONTAINER','dtm-owner-policy-20261029')
database='security_coupon_'+uuid.uuid4().hex[:10]
def run(sql,code=None):
 p=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d',database,'-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],input=sql.encode(),capture_output=True)
 if code: assert p.returncode and code in p.stderr.decode(),p.stderr.decode()
 else: assert p.returncode==0,p.stderr.decode()
 return p.stdout.decode().strip()
subprocess.run(['docker','exec',container,'createdb','-U','postgres',database],check=True,capture_output=True)
ids={k:str(uuid.UUID(int=i)) for i,k in enumerate(['admin','regional','other','ordinary'],1)}
b1=str(uuid.UUID(int=101));b2=str(uuid.UUID(int=102));c1=str(uuid.UUID(int=201));c2=str(uuid.UUID(int=202))
run('''DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;END $$;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
CREATE TABLE profiles(user_id uuid PRIMARY KEY,role text,area text);
CREATE TABLE businesses(id uuid PRIMARY KEY,name_ko text,name_en text,region text);
CREATE TABLE coupons(id uuid PRIMARY KEY,business_id uuid REFERENCES businesses(id),business_ids uuid[],title text,delivery_mode text,is_active boolean,start_at timestamptz,end_at timestamptz,used_count integer DEFAULT 0,owner_coupon_protocol text DEFAULT 'legacy',issue_limit integer);
CREATE TABLE coupon_redemptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),coupon_id uuid,business_id uuid,coupon_title text,business_name text,notify_emails text,notify_phones text,used_by text);
CREATE TABLE coupon_entries(id uuid PRIMARY KEY,coupon_id uuid);
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_business ON businesses TO anon,authenticated USING(true) WITH CHECK(true);
CREATE POLICY open_coupon ON coupons TO anon,authenticated USING(true) WITH CHECK(true);
CREATE POLICY open_redemption ON coupon_redemptions TO anon,authenticated USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON businesses,coupons,coupon_redemptions TO anon,authenticated;''')
run(f"INSERT INTO profiles VALUES('{ids['admin']}','super_admin',NULL),('{ids['regional']}','regional_editor','dallas'),('{ids['other']}','regional_editor','denver'),('{ids['ordinary']}','user',NULL); INSERT INTO businesses VALUES('{b1}','Synthetic',NULL,'dallas'),('{b2}','Other',NULL,'colorado'); INSERT INTO coupons(id,business_id,title,delivery_mode,is_active,start_at,end_at) VALUES('{c1}','{b1}','Synthetic','display',true,now()-interval '1 day',now()+interval '1 day'),('{c2}','{b2}','Other','display',true,now()-interval '1 day',now()+interval '1 day');")
run((root/'supabase/operational-security/01-display-redemption-DRAFT.sql').read_text(encoding='utf-8-sig'))
run(f"INSERT INTO coupon_security_internal.display_rules VALUES('{c1}',NULL);")
run((root/'supabase/operational-security/02-admin-fences-DRAFT.sql').read_text(encoding='utf-8-sig'))
run((root/'supabase/operational-security/03-anon-fences-DRAFT.sql').read_text(encoding='utf-8-sig'))
run("INSERT INTO coupon_entries VALUES('00000000-0000-0000-0000-000000000999',NULL);INSERT INTO coupon_redemptions(id,used_by) VALUES('00000000-0000-0000-0000-000000000998','historical');")
checks=[]
def check(name,sql,want=None,code=None):
 out=run(sql,code);assert code or want is None or out==want,(name,out,want);checks.append(name);return out
def cmd(cid=c1,identity='a'*64,key=None):
 return f"SELECT public.security_legacy_display_redeem('{cid}','{key or uuid.uuid4()}','{identity}');"
def role(who,sql):return f"SET ROLE authenticated;SET request.jwt.claim.sub='{ids[who]}';"+sql
missing=str(uuid.UUID(int=203))
run(f"INSERT INTO coupons(id,business_id,title,delivery_mode,is_active) VALUES('{missing}','{b1}','Unreviewed','display',true);")
check('unreviewed usage policy fails closed',cmd(missing,identity='d'*64),code='SC503')
run(f"DELETE FROM coupons WHERE id='{missing}';")
key=str(uuid.uuid4())
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool: rows=list(pool.map(lambda _:json.loads(run('SET ROLE service_role;'+cmd(key=key))),range(10)))
assert len(set(r['redemption_id'] for r in rows))==1 and sum(not r['already_used'] for r in rows)==1;checks.append('ten duplicate requests one record and increment')
check('counter exactly one',f"SELECT used_count FROM coupons WHERE id='{c1}';",'1')
check('redemption exactly one',f"SELECT count(*) FROM coupon_redemptions WHERE coupon_id='{c1}';",'1')
check('same browser new key is replay',cmd()+"",None)
check('new key did not increment',f"SELECT used_count FROM coupons WHERE id='{c1}';",'1')
check('same request key cannot target another coupon',cmd(c2,key=key),code='SC409')
for r in ['anon','authenticated']:check(r+' cannot invoke service RPC','SET ROLE '+r+';'+cmd(),code='42501')
for table in ['businesses','coupons']:
 check('anon '+table+' insert denied',f"SET ROLE anon;INSERT INTO {table}(id) VALUES('{uuid.uuid4()}');",code='42501')
 for operation in [f"UPDATE {table} SET id=id",f'DELETE FROM {table}']:
  check('anon '+operation+' returns no changed rows','SET ROLE anon;WITH changed AS ('+operation+' RETURNING 1) SELECT count(*) FROM changed;','0')
for who in ['ordinary','regional']:
 check(who+' cannot update foreign business',role(who,f"WITH changed AS (UPDATE businesses SET name_ko='Denied' WHERE id='{b2}' RETURNING 1) SELECT count(*) FROM changed;"),'0')
check('regional may update local business',role('regional',f"WITH changed AS (UPDATE businesses SET name_ko='Allowed' WHERE id='{b1}' RETURNING 1) SELECT count(*) FROM changed;"),'1')
check('regional cannot move business to another region',role('regional',f"UPDATE businesses SET region='colorado' WHERE id='{b1}';"),code='42501')
check('super admin updates foreign business',role('admin',f"WITH changed AS (UPDATE businesses SET name_ko='Allowed' WHERE id='{b2}' RETURNING 1) SELECT count(*) FROM changed;"),'1')
check('regional updates local coupon',role('regional',f"WITH changed AS (UPDATE coupons SET title='Allowed' WHERE id='{c1}' RETURNING 1) SELECT count(*) FROM changed;"),'1')
check('regional cannot add foreign linked business',role('regional',f"UPDATE coupons SET business_ids=ARRAY['{b2}'::uuid] WHERE id='{c1}';"),code='42501')
check('ordinary cannot update own or foreign coupon',role('ordinary',"WITH changed AS (UPDATE coupons SET title='Denied' RETURNING 1) SELECT count(*) FROM changed;"),'0')
check('ordinary cannot grant own admin role',role('ordinary',f"UPDATE profiles SET role='super_admin' WHERE user_id='{ids['ordinary']}';"),code='42501')
check('direct forged redemption denied',"SET ROLE anon;INSERT INTO coupon_redemptions(used_by) VALUES('forged');",code='42501')
check('public coupon reads retained','SET ROLE anon;SELECT count(*) FROM coupons;','2')
run(f"INSERT INTO coupon_security_internal.display_rules VALUES('{c2}',5);")
def attempt(i):
 try:return json.loads(run(cmd(c2,identity=f'{i+1:064x}')))
 except AssertionError as e:assert 'SC409' in str(e);return None
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: rows=list(pool.map(attempt,range(20)))
assert sum(r is not None for r in rows)==5;checks.append('twenty concurrent identities honor exact quota five')
check('quota counter exactly five',f"SELECT used_count FROM coupons WHERE id='{c2}';",'5')
check('quota records exactly five',f"SELECT count(*) FROM coupon_redemptions WHERE coupon_id='{c2}';",'5')
for patch,code in [("is_active=false",'SC403'),("owner_coupon_protocol='v2'",'SC403'),("delivery_mode='instant_email'",'SC403'),("delivery_mode='raffle'",'SC403'),("end_at=now()-interval '1 second'",'SC410'),("start_at=now()+interval '1 day'",'SC410')]:
 run(f"UPDATE coupons SET is_active=true,owner_coupon_protocol='legacy',delivery_mode='display',start_at=now()-interval '1 day',end_at=now()+interval '1 day' WHERE id='{c1}';UPDATE coupons SET {patch} WHERE id='{c1}';")
 check('server validates '+patch,cmd(identity='e'*64),code=code)
run(f"UPDATE coupons SET is_active=true,owner_coupon_protocol='legacy',delivery_mode='display',start_at=NULL,end_at=NULL,issue_limit=1 WHERE id='{c1}';")
check('issuance limit is not reinterpreted as redemption quota',cmd(identity='e'*64),None)
check('existing coupon_entries unaffected','SELECT count(*) FROM coupon_entries;','1')
check('historical redemption retained',"SELECT used_by FROM coupon_redemptions WHERE id='00000000-0000-0000-0000-000000000998';",'historical')
run("CREATE FUNCTION fail_redemption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$;CREATE TRIGGER fail_redemption BEFORE INSERT ON coupon_redemptions FOR EACH ROW EXECUTE FUNCTION fail_redemption();")
before=run(f"SELECT used_count FROM coupons WHERE id='{c1}';")
check('record failure rolls back transaction',cmd(identity='f'*64),code='P0001')
check('counter unchanged after failure',f"SELECT used_count FROM coupons WHERE id='{c1}';",before)
check('ledger unchanged after failure',"SELECT count(*) FROM coupon_security_internal.display_uses WHERE identity_hash=repeat('f',64);",'0')
print(json.dumps({'result':'PASS','pass':len(checks),'fail':0,'checks':checks,'environment':'isolated synthetic PostgreSQL','sharedWrites':0,'externalDelivery':0}))
