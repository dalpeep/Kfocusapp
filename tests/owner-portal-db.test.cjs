const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('../.local-owner-tests/node_modules/@electric-sql/pglite');
const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002',admin:'00000000-0000-4000-8000-000000000003',regional:'00000000-0000-4000-8000-000000000004'};
test('Owner 신청·승인·범위 격리·회수·충돌·원자성',{timeout:60000},async t=>{
 const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid primary key,email_confirmed_at timestamptz);CREATE TABLE public.profiles(user_id uuid primary key,role text,area text);
 CREATE TABLE public.businesses(id bigint generated always as identity primary key,name_ko text not null,region text not null,address text,phone text,category_ko text,description text,hours text);
 CREATE TABLE public.owner_test_preview_state(id boolean,project_ref text,phase text,storage_ready boolean);INSERT INTO public.owner_test_preview_state VALUES(true,'aaikttogoejfvxbosktg','fixtures',true);
 CREATE SCHEMA owner_phase1b_internal;CREATE TABLE owner_phase1b_internal.policy_backup(id int);CREATE FUNCTION public.phase1b_is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT false';
 INSERT INTO auth.users VALUES ${Object.values(ids).map(id=>`('${id}',now())`).join(',')};INSERT INTO public.profiles VALUES('${ids.admin}','super_admin',null),('${ids.regional}','regional_editor','colorado');
 INSERT INTO public.businesses(name_ko,region,address,phone,category_ko) VALUES('업소 A','dallas','A','123','식당'),('업소 B','dallas','B','456','식당');`);
 const migration=fs.readFileSync(path.join(__dirname,'../supabase/owner-portal-phase1.apply.test.draft.sql'),'utf8');
 await db.exec(migration.replace("migration_b_approved='false'","migration_b_approved='true'"));
 await t.test('빈 Migration B 적용·rollback·재적용',async()=>{
  const rollback=fs.readFileSync(path.join(__dirname,'../supabase/owner-portal-phase1.rollback.test.draft.sql'),'utf8').replace("migration_b_rollback_approved='false'","migration_b_rollback_approved='true'");
  await db.exec(rollback);assert.equal((await db.query("SELECT to_regnamespace('owner_portal_internal') IS NULL AS absent")).rows[0].absent,true);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM businesses')).rows[0].n,2);
  await db.exec(migration.replace("migration_b_approved='false'","migration_b_approved='true'"));
 });
 let n=1;const key=()=>`10000000-0000-4000-8000-${String(n++).padStart(12,'0')}`;
 const cmd=async(actor,c)=>{const r=await db.query('SELECT public.owner_portal_command($1,$2::jsonb) AS result',[actor,JSON.stringify({key:key(),...c})]);return r.rows[0].result;};
 const reject=async(fn,code)=>assert.rejects(fn,e=>e.code===code);
 let request;
 await t.test('소유권 신청·승인',async()=>{request=await cmd(ids.a,{action:'submit',kind:'claim',business_id:'1'});await cmd(ids.admin,{action:'approve',request_id:request.request_id,reason:'확인'});});
 await t.test('다른 업소 쓰기 거부',()=>reject(()=>cmd(ids.a,{action:'update',business_id:'2',changes:{description:'침범'}}),'OP403'));
 await t.test('일반 회원 승인 거부',()=>reject(()=>cmd(ids.b,{action:'approve',request_id:request.request_id,reason:'위조'}),'OP403'));
 await t.test('지역 관리자 범위 거부',()=>reject(()=>cmd(ids.regional,{action:'revoke',business_id:'1',user_id:ids.a,reason:'범위 외'}),'OP403'));
 await t.test('중복 승인 거부',()=>reject(()=>cmd(ids.admin,{action:'approve',request_id:request.request_id,reason:'중복'}),'OP409'));
 await t.test('일반 정보 수정·이력',async()=>{await cmd(ids.a,{action:'update',business_id:'1',changes:{description:'수정'}});assert.equal((await db.query('SELECT description FROM businesses WHERE id=1')).rows[0].description,'수정');});
 await t.test('특권 필드 거부',()=>reject(()=>cmd(ids.a,{action:'update',business_id:'1',changes:{is_featured:'true'}}),'OP400'));
 await t.test('관리자 핵심 변경 충돌',async()=>{const r=await cmd(ids.a,{action:'submit',kind:'core',business_id:'1',changes:{name_ko:'새 이름'},baseline:{name_ko:'업소 A'}});await db.exec("UPDATE businesses SET name_ko='관리자 변경' WHERE id=1");await reject(()=>cmd(ids.admin,{action:'approve',request_id:r.request_id,reason:'승인'}),'OP409');assert.equal((await db.query('SELECT status FROM owner_portal_internal.requests WHERE id=$1',[r.request_id])).rows[0].status,'pending');});
 await t.test('권한 회수 후 수정 거부',async()=>{await cmd(ids.admin,{action:'revoke',business_id:'1',user_id:ids.a,reason:'회수'});await reject(()=>cmd(ids.a,{action:'update',business_id:'1',changes:{description:'회수 후'}}),'OP403');});
 await t.test('신규 업소와 소유권 원자 승인',async()=>{const r=await cmd(ids.b,{action:'submit',kind:'new',region:'dallas',changes:{name_ko:'신규',address:'주소',phone:'전화',category_ko:'식당'}});const approved=await cmd(ids.admin,{action:'approve',request_id:r.request_id,reason:'신규 확인'});assert.equal((await db.query('SELECT active FROM owner_portal_internal.memberships WHERE business_id=$1 AND user_id=$2',[approved.business_id,ids.b])).rows[0].active,true);});
 await t.test('동일 키 재시도 및 변조 거부',async()=>{const k=key(),c={action:'submit',kind:'claim',business_id:'2',key:k};const r=await cmd(ids.a,c);assert.deepEqual(await cmd(ids.a,c),r);await reject(()=>cmd(ids.a,{...c,business_id:'1'}),'OP409');});
 await t.test('브라우저 RPC 및 내부 테이블 직접 접근 차단',async()=>{for(const role of ['anon','authenticated']){assert.equal((await db.query(`SELECT has_function_privilege('${role}','public.owner_portal_command(uuid,jsonb)','EXECUTE') AS allowed`)).rows[0].allowed,false);assert.equal((await db.query(`SELECT has_table_privilege('${role}','owner_portal_internal.memberships','UPDATE') AS allowed`)).rows[0].allowed,false);}assert.equal((await db.query("SELECT has_function_privilege('service_role','public.owner_portal_command(uuid,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,true);});
 await t.test('승인 도중 이력 실패는 업소·권한·신청 상태를 모두 복구',async()=>{
  const r=await cmd(ids.a,{action:'submit',kind:'new',region:'dallas',changes:{name_ko:'원자성',address:'주소',phone:'전화',category_ko:'식당'}});
  const before=(await db.query('SELECT count(*)::int AS n FROM businesses')).rows[0].n;
  await db.exec("CREATE FUNCTION owner_portal_internal.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure'; END $$;CREATE TRIGGER test_fail BEFORE INSERT ON owner_portal_internal.audit FOR EACH ROW EXECUTE FUNCTION owner_portal_internal.test_fail();");
  await assert.rejects(()=>cmd(ids.admin,{action:'approve',request_id:r.request_id,reason:'실패 유도'}));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM businesses')).rows[0].n,before);
  assert.equal((await db.query('SELECT status FROM owner_portal_internal.requests WHERE id=$1',[r.request_id])).rows[0].status,'pending');
  await db.exec('DROP TRIGGER test_fail ON owner_portal_internal.audit;DROP FUNCTION owner_portal_internal.test_fail();');
 });
 await t.test('회원 조회는 다른 회원 신청·이력을 노출하지 않음',async()=>{
  const state=(await db.query('SELECT owner_portal_read($1) AS state',[ids.a])).rows[0].state;
  assert.ok(state.requests.every(r=>r.user_id===ids.a));assert.equal(state.audit.length,0);assert.equal(state.memberships.length,0);
 });
 await t.test('회수 후 관리 조회·핵심 신청 차단',async()=>{assert.equal((await db.query('SELECT owner_portal_read($1) AS s',[ids.a])).rows[0].s.businesses.length,0);await reject(()=>cmd(ids.a,{action:'submit',kind:'core',business_id:'1',changes:{phone:'999'},baseline:{phone:'123'}}),'OP403');});
 await t.test('업소 B 승인 후 A/B 양방향 쓰기 격리',async()=>{const r=await cmd(ids.regional,{action:'submit',kind:'claim',business_id:'2'});await cmd(ids.admin,{action:'approve',request_id:r.request_id,reason:'B 확인'});const s=(await db.query('SELECT owner_portal_read($1) AS s',[ids.regional])).rows[0].s;assert.deepEqual(s.businesses.map(b=>b.id),['2']);await reject(()=>cmd(ids.regional,{action:'update',business_id:'1',changes:{hours:'침범'}}),'OP403');await reject(()=>cmd(ids.b,{action:'update',business_id:'2',changes:{hours:'침범'}}),'OP403');});
 await t.test('신규 중복 신청 정규화·기존 업소 재등록 거부',async()=>{await reject(()=>cmd(ids.regional,{action:'submit',kind:'new',region:'dallas',changes:{name_ko:'원 자 성',address:'주 소',phone:'1',category_ko:'식당'}}),'23505');await reject(()=>cmd(ids.regional,{action:'submit',kind:'new',region:'dallas',changes:{name_ko:'업소 B',address:'B',phone:'1',category_ko:'식당'}}),'OP409');});
 await t.test('거절·권한 회수 이력 실패 시 상태 원자 복구',async()=>{
  const r=await cmd(ids.regional,{action:'submit',kind:'new',region:'colorado',changes:{name_ko:'거절 검사',address:'주소',phone:'1',category_ko:'식당'}});
  await db.exec("CREATE FUNCTION owner_portal_internal.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure'; END $$;CREATE TRIGGER test_fail BEFORE INSERT ON owner_portal_internal.audit FOR EACH ROW EXECUTE FUNCTION owner_portal_internal.test_fail();");
  await assert.rejects(()=>cmd(ids.admin,{action:'reject',request_id:r.request_id,reason:'거절 검사'}));assert.equal((await db.query('SELECT status FROM owner_portal_internal.requests WHERE id=$1',[r.request_id])).rows[0].status,'pending');
  await assert.rejects(()=>cmd(ids.admin,{action:'revoke',business_id:'2',user_id:ids.regional,reason:'회수 검사'}));assert.equal((await db.query('SELECT active FROM owner_portal_internal.memberships WHERE business_id=2 AND user_id=$1',[ids.regional])).rows[0].active,true);
  await db.exec('DROP TRIGGER test_fail ON owner_portal_internal.audit;DROP FUNCTION owner_portal_internal.test_fail();');
  await cmd(ids.admin,{action:'reject',request_id:r.request_id,reason:'거절 확인'});assert.equal((await db.query('SELECT status FROM owner_portal_internal.requests WHERE id=$1',[r.request_id])).rows[0].status,'rejected');
 });
 await t.test('대기 건수·필터·페이지 및 지역별 이력 범위',async()=>{const s=(await db.query("SELECT owner_portal_read($1,'pending','new',0,0) AS s",[ids.admin])).rows[0].s;assert.ok(s.requests.every(r=>r.status==='pending'&&r.kind==='new'));assert.equal(s.request_total,s.requests.length);assert.ok(s.counts.pending>0);assert.ok(s.audit.some(a=>a.action==='submit'&&a.business_id===null));const regional=(await db.query('SELECT owner_portal_read($1) AS s',[ids.regional])).rows[0].s;assert.ok(regional.requests.every(r=>r.region==='colorado'||r.user_id===ids.regional));const page=(await db.query('SELECT owner_portal_read($1,NULL,NULL,99999,99999) AS s',[ids.admin])).rows[0].s;assert.equal(page.requests.length,0);assert.equal(page.audit.length,0);});
 await t.test('활동 이력이 있는 DB는 자동 rollback 거부',async()=>{
  const rollback=fs.readFileSync(path.join(__dirname,'../supabase/owner-portal-phase1.rollback.test.draft.sql'),'utf8').replace("migration_b_rollback_approved='false'","migration_b_rollback_approved='true'");
  await assert.rejects(()=>db.exec(rollback));await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT to_regnamespace('owner_portal_internal') IS NOT NULL AS present")).rows[0].present,true);
 });
 await db.close();
});
