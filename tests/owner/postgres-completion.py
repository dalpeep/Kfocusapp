"""Synthetic-only extension of the existing V2 PostgreSQL integration fixture."""
import runpy,pathlib,json,re,uuid,concurrent.futures
v=runpy.run_path(str(pathlib.Path(__file__).with_name('postgres-v2.py')))
globals().update({k:v[k] for k in ['run','check','cmd','fn','root','cid','eid','b','ids','results']})
start=len(results)
s=(root/'supabase/owner-open/13-owner-notifications.sql').read_text(encoding='utf-8-sig')
run(re.search(r'CREATE TABLE owner_portal_uuid_internal.notification_outbox\(.*?\n\);',s,re.S)[0])
run("SET owner_preview.coupon_lifecycle_approved='true';"+(root/'supabase/owner-open/14-coupon-v2-lifecycle.sql').read_text(encoding='utf-8'))
run("UPDATE coupons SET delivery_mode='instant_email',end_at=now()+interval '1 day';UPDATE coupon_entries SET mail_state='pending';")
def life(action='cancel',who='owner',**kw):
 c={'action':action,'coupon_id':cid,**kw}
 return "SELECT public.owner_coupon_v2_lifecycle('"+ids[who]+"','"+json.dumps(c)+"'::jsonb)"
def cancel(**kw):return life(entry_id=eid,key=str(uuid.uuid4()),reason='Synthetic cancellation',**kw)
for role in ['anon','authenticated']:
 check(role+' lifecycle denied','SET ROLE '+role+';'+life('list'),code='42501')
 check(role+' cancellation ledger denied','SET ROLE '+role+';SELECT * FROM owner_portal_uuid_internal.coupon_v2_cancellations;',code='42501')
for who in ['other','regional']:check(who+' cancel business denied',life(who=who,entry_id=eid,key=str(uuid.uuid4()),reason='Synthetic'),code='OP403')
check('admin lifecycle view',life('list','admin')+"->'entries'->0->>'id';",eid)
check('invalid limit denied',life('list',limit=101),code='OP400')
run(f"INSERT INTO owner_portal_uuid_internal.notification_outbox(event_key,kind,source_id,subject,body,state) VALUES('synthetic','coupon_issued','{eid}','Synthetic','Synthetic','sending');")
check('inflight notification cancellation blocked',cancel(),code='OP409')
check('inflight failure preserves issuance','SELECT status FROM coupon_entries;','coupon_issued')
run("UPDATE owner_portal_uuid_internal.notification_outbox SET state='pending';")
key=str(uuid.uuid4());q=life(entry_id=eid,key=key,reason='Synthetic cancellation')
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:out=list(pool.map(lambda _:run(q),range(10)))
assert len(set(out))==1;results.append({'case':'ten concurrent cancellations same result','pass':True})
check('one cancellation record','SELECT count(*) FROM owner_portal_uuid_internal.coupon_v2_cancellations;','1')
check('entry retained as cancelled','SELECT status FROM coupon_entries;','cancelled')
check('queued notification quarantined','SELECT state FROM owner_portal_uuid_internal.notification_outbox;','review')
check('issuance outbox quarantined',"SELECT state FROM owner_portal_uuid_internal.coupon_v2_outbox WHERE entry_id='"+eid+"' AND use_id IS NULL;",'review')
check('same key different reason denied',life(entry_id=eid,key=key,reason='Changed'),code='OP409')
check('different key same cancel stable',cancel()+"->>'existing';",'true')
check('cancelled entry cannot redeem',cmd('redeem','owner',entry_id=eid,key=str(uuid.uuid4())),code='OP409')
check('list shows history',life('list')+"->'entries'->0->>'cancel_reason';",'Synthetic cancellation')
check('list excludes customer email',life('list')+"->'entries'->0 ? 'email';",'f')
check('same email cannot reissue cancelled',cmd('reserve',email='synthetic@example.invalid',key=str(uuid.uuid4())),code='OP409')
# Cancelling releases the existing reserve policy's inventory, but never erases the ledger.
check('new customer can use released inventory',cmd('reserve',email='new@example.invalid',key=str(uuid.uuid4()))+"->>'received';",'true')
eid2=run("SELECT id FROM coupon_entries WHERE status='coupon_issued';")
# Cancellation and redemption serialize on the same coupon lock.
use=cmd('redeem','owner',entry_id=eid2,key=str(uuid.uuid4()))
stop=life(entry_id=eid2,key=str(uuid.uuid4()),reason='Race test')
def attempt(q):
 try:return json.loads(run(q))
 except AssertionError as e:
  assert 'OP409' in str(e);return {'conflict':True}
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:out=list(pool.map(attempt,[use,stop]*5))
check('race never both used and cancelled',f"SELECT NOT(EXISTS(SELECT 1 FROM owner_portal_uuid_internal.coupon_v2_uses WHERE entry_id='{eid2}') AND EXISTS(SELECT 1 FROM owner_portal_uuid_internal.coupon_v2_cancellations WHERE entry_id='{eid2}'));",'t')
check('race preserves entries','SELECT count(*) FROM coupon_entries;','2')
# Failure injection proves statement transaction rollback, not only duplicate checks.
run(f"INSERT INTO coupon_entries(coupon_id,business_id,email_normalized,status) VALUES('{cid}','{b}','failure@example.invalid','coupon_issued');CREATE FUNCTION public.synthetic_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='OP499';END $$;CREATE TRIGGER synthetic_fail BEFORE INSERT ON owner_portal_uuid_internal.coupon_v2_cancellations FOR EACH ROW EXECUTE FUNCTION public.synthetic_fail();")
eid3=run("SELECT id FROM coupon_entries WHERE email_normalized='failure@example.invalid';")
check('injected failure rollback',life(entry_id=eid3,key=str(uuid.uuid4()),reason='Failure'),code='OP499')
check('failed transaction unchanged',f"SELECT status FROM coupon_entries WHERE id='{eid3}';",'coupon_issued')
run('DROP TRIGGER synthetic_fail ON owner_portal_uuid_internal.coupon_v2_cancellations;')
# Test the actual special wrapper with a delegated synthetic recorder, not shared DB data.
run("CREATE TABLE business_specials(id uuid PRIMARY KEY,business_id uuid,start_date date,end_date date,start_time time,end_time time,days_of_week jsonb);CREATE FUNCTION public.owner_content_command(p_actor uuid,p_command jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_command $$;")
run("SET owner_preview.special_validation_approved='true';"+(root/'supabase/owner-open/15-owner-special-validation.sql').read_text(encoding='utf-8'))
def special(patch,who='owner',record=None):
 c={'kind':'special','action':'save','business_id':b,'changes':patch}
 if record:c['record_id']=record
 return "SELECT public.owner_content_command('"+ids[who]+"','"+json.dumps(c)+"'::jsonb)"
check('special invalid dates blocked',special({'start_date':'2026-12-31','end_date':'2026-01-01'}),code='OP400')
check('special incomplete window blocked',special({'start_time':'12:00'}),code='OP400')
check('special overnight preserved',special({'start_time':'22:00','end_time':'02:00'})+"->'changes'->>'end_time';",'02:00')
check('special all-day equal times preserved',special({'start_time':'12:00','end_time':'12:00'})+"->'changes'->>'end_time';",'12:00')
check('special invalid weekday blocked',special({'days_of_week':[7]}),code='OP400')
check('special cross business blocked',special({},who='other'),code='OP403')
sid=str(uuid.uuid4());run(f"INSERT INTO business_specials VALUES('{sid}','{b}','2026-01-01','2026-12-31','12:00','13:00','[1,2]');")
check('special partial patch checked against existing',special({'end_date':'2025-01-01'},record=sid),code='OP400')
check('special partial time clear blocked',special({'start_time':None},record=sid),code='OP400')
check('special both times can clear',special({'start_time':None,'end_time':None},record=sid)+"->'changes'->>'start_time' IS NULL;",'t')
report={'result':'PASS','pass':len(results)-start,'baselineV2Pass':start,'fail':0,'sharedWrites':0,'externalDelivery':0,'checks':results[start:]}
(root/'.release-artifacts/owner-completion-postgres.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='checks'}))
