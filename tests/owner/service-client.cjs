'use strict';
// Invoked only inside the fresh network-none test namespace. No secrets output.
const {createClient}=require('@supabase/supabase-js'),crypto=require('crypto'),fs=require('fs');
const transport=async(url,options)=>{const u=new URL(url);if(u.hostname!=='127.0.0.1')throw Error('OUTBOUND_DENIED');let port,path;if(u.pathname.startsWith('/auth/v1/')){port=9999;path=u.pathname.slice(8);}else if(u.pathname.startsWith('/rest/v1/')){port=3000;path=u.pathname.slice(8);}else if(u.pathname.startsWith('/storage/v1/')){port=5000;path=u.pathname.slice(11);}else throw Error('PATH_DENIED');return fetch('http://127.0.0.1:'+port+path+u.search,options);};
const db=createClient('http://127.0.0.1:9999',process.env.TEST_SERVICE_KEY,{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}});
const report=[],check=(name,ok)=>{if(!ok)throw Error('CHECK_'+name);report.push({case:name,pass:true});};
const a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
async function main(){
 if(process.argv[2]==='users'){
  const ids={};for(const who of ['free','paid','other','pending','regional','admin']){const user=await db.auth.admin.createUser({email:who+'@owner.synthetic.invalid',password:crypto.randomBytes(36).toString('base64url'),email_confirm:true});if(user.error){const detail=String(user.error.message).replace(/[A-Za-z0-9_-]{24,}/g,'REDACTED');console.log(JSON.stringify({authSafeDetail:/^[A-Za-z .,():_-]{1,180}$/.test(detail)?detail:'REDACTED_ERROR'}));throw Error('AUTH_CREATE_'+user.error.status+'_'+String(user.error.code||'UNKNOWN').toUpperCase());}ids[who]=user.data.user.id;}console.log(JSON.stringify(ids));return;
 }
 const ids=JSON.parse(process.env.TEST_USERS);const image=require('../../netlify/legacy-functions/owner-image-uuid.js');const sharp=require('sharp');
 const sessions={};
 for(const who of Object.keys(ids)){
  // Real Auth magic-link verification, no SMTP/provider call.
  const link=await db.auth.admin.generateLink({type:'magiclink',email:who+'@owner.synthetic.invalid'});if(link.error)throw Error('AUTH_LINK_FAILED');
  const authClient=createClient('http://127.0.0.1:9999',process.env.TEST_ANON_KEY,{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}});const verified=await authClient.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});if(verified.error)throw Error('AUTH_VERIFY_FAILED');sessions[who]=verified.data.session.access_token;
  const user=await db.auth.getUser(sessions[who]);check(who+' real Auth verification',user.data.user?.id===ids[who]);
 }
 const handler=image.makeHandler({getClient:()=>db,checkEnvironment:()=>{}});
 async function call(who,body){return handler({httpMethod:'POST',headers:{authorization:'Bearer '+sessions[who]},body:JSON.stringify(body)});}
 const make=(who,bid=a,extra={})=>({action:'prepare',purpose:'coupon',business_id:bid,path:`owner-v1/owner/${bid}/${ids[who]}/${crypto.randomUUID()}.png`,mime:'image/png',size:100,...extra});
 for(const who of ['free','pending','other']){const r=await call(who,make(who,who==='free'?b:a));check(who+' custom coupon denied',r.statusCode===403);}
 check('Paid foreign business denied',(await call('paid',make('paid',b))).statusCode===403);
 check('Paid oversize denied',(await call('paid',make('paid',a,{size:5242881}))).statusCode===413);
 check('Paid unsupported MIME denied',(await call('paid',make('paid',a,{mime:'image/svg+xml'}))).statusCode===413);
 for(const [format,mime,ext] of [['png','image/png','png'],['jpeg','image/jpeg','jpg'],['webp','image/webp','webp']]){
  const bytes=await sharp({create:{width:32,height:32,channels:4,background:'#146b55'}}).toFormat(format).toBuffer();
  const command=make('paid',a,{path:`owner-v1/owner/${a}/${ids.paid}/${crypto.randomUUID()}.${ext}`,size:bytes.length,mime});
  const prepared=await call('paid',command);check(format+' gateway prepare',prepared.statusCode===200);const p=JSON.parse(prepared.body);
  const uploaded=await db.storage.from('owner-portal-quarantine').uploadToSignedUrl(p.staging_path,p.upload_token,bytes,{contentType:mime});check(format+' actual signed Storage upload',!uploaded.error);
  const result=await call('paid',{...command,action:'publish',staging_path:p.staging_path});check(format+' server decode/publish',result.statusCode===200);const out=JSON.parse(result.body);
  const downloaded=await db.storage.from('public-images').download(out.path);check(format+' actual stored bytes',!downloaded.error&&(await downloaded.data.arrayBuffer()).byteLength>0);
  const removed=await db.storage.from('public-images').remove([out.path]);check(format+' synthetic image cleanup',!removed.error);
 }
 for(const who of ['free','paid','other','pending','regional']){
  const caller=createClient('http://127.0.0.1:9999',process.env.TEST_ANON_KEY,{global:{fetch:transport,headers:{Authorization:'Bearer '+sessions[who]}},auth:{persistSession:false,autoRefreshToken:false}});
  const r=await caller.storage.from('public-images').upload('owner-v1/owner/'+a+'/'+ids[who]+'/'+crypto.randomUUID()+'.png',Buffer.from('not an image'),{contentType:'image/png'});check(who+' direct Storage write denied',!!r.error);
 }
 const admin=createClient('http://127.0.0.1:9999',process.env.TEST_ANON_KEY,{global:{fetch:transport,headers:{Authorization:'Bearer '+sessions.admin}},auth:{persistSession:false,autoRefreshToken:false}});
 const png=await sharp({create:{width:8,height:8,channels:4,background:'white'}}).png().toBuffer();const adminPath='legacy-admin-'+crypto.randomUUID()+'.png';
 const existing=await admin.storage.from('public-images').upload(adminPath,png,{contentType:'image/png'});check('legacy administrator Storage upload preserved',!existing.error);check('legacy administrator Storage delete preserved',!(await admin.storage.from('public-images').remove([adminPath])).error);
 // Real Auth user_metadata spoof, with unchanged authoritative profiles.
 const anon=createClient('http://127.0.0.1:9999',process.env.TEST_ANON_KEY,{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}});
 await anon.auth.setSession({access_token:sessions.free,refresh_token:'synthetic-unused'});const spoof=await anon.auth.updateUser({data:{role:'super_admin'}});check('self-editable metadata accepted by Auth',!spoof.error);
 const access=await db.rpc('owner_uuid_image_access',{p_actor:ids.free,p_business:a});check('metadata spoof cannot grant Paid image access',access.data===false&&!access.error);
 const revoked=await call('other',make('other'));check('unowned business denied after Auth',revoked.statusCode===403);
 const portal=require('../../netlify/legacy-functions/lib/owner-portal-uuid.js').makeHandler({getClient:()=>db});
 const c='20000000-0000-4000-8000-000000000003',d='20000000-0000-4000-8000-000000000004';
 async function command(who,body){return portal({httpMethod:'POST',headers:{authorization:'Bearer '+sessions[who]},body:JSON.stringify({key:crypto.randomUUID(),...body})});}
 check('Free existing introduction preserved',(await command('free',{action:'update',business_id:b,changes:{description:'Synthetic existing description'}})).statusCode===200);
 check('Free arbitrary introduction denied',(await command('free',{action:'update',business_id:b,changes:{description:'Unapproved arbitrary prose'}})).statusCode===403);
 check('Free approved selection accepted',(await command('free',{action:'update',business_id:b,changes:{description:'Synthetic approved choice'}})).statusCode===200);
 check('Paid free-form introduction accepted',(await command('paid',{action:'update',business_id:a,changes:{description:'Synthetic custom introduction'}})).statusCode===200);
 check('Free business image denied',(await call('free',{...make('free',b),purpose:'business'})).statusCode===403);
 const pending=await command('pending',{action:'submit',kind:'claim',business_id:c});check('real Auth ownership application',pending.statusCode===200);const request=JSON.parse(pending.body).result.request_id;
 check('pending owner cannot edit',(await command('pending',{action:'update',business_id:c,changes:{hours:'synthetic'}})).statusCode===403);
 check('ordinary owner cannot approve',(await command('free',{action:'approve',request_id:request})).statusCode===403);
 check('regional allowed region approval',(await command('regional',{action:'approve',request_id:request})).statusCode===200);
 check('approved owner can edit',(await command('pending',{action:'update',business_id:c,changes:{hours:'synthetic'}})).statusCode===200);
 check('other owner cannot edit',(await command('other',{action:'update',business_id:c,changes:{hours:'forbidden'}})).statusCode===403);
 const foreign=await command('other',{action:'submit',kind:'claim',business_id:d});check('foreign region application',foreign.statusCode===200);const request2=JSON.parse(foreign.body).result.request_id;
 check('regional foreign approval denied',(await command('regional',{action:'approve',request_id:request2})).statusCode===403);
 check('super admin approval preserved',(await command('admin',{action:'approve',request_id:request2})).statusCode===200);
 check('super admin revocation',(await command('admin',{action:'revoke',business_id:d,user_id:ids.other,reason:'synthetic test complete'})).statusCode===200);
 check('revoked owner edit denied',(await command('other',{action:'update',business_id:d,changes:{hours:'forbidden'}})).statusCode===403);
 const reject=await command('other',{action:'submit',kind:'new',region:'texas',changes:{name_ko:'synthetic rejected',address:'synthetic rejection address',phone:'000',category_ko:'service'}});check('new application pending',reject.statusCode===200);
 check('administrator rejection',(await command('admin',{action:'reject',request_id:JSON.parse(reject.body).result.request_id,reason:'synthetic rejection'})).statusCode===200);
 console.log(JSON.stringify({result:'PASS',pass:report.length,fail:0,realServices:['Auth','PostgREST','Storage','PostgreSQL'],externalDelivery:0,productionWrites:0,checks:report}));
}
main().catch(e=>{console.log(JSON.stringify({result:'FAIL',stage:/^[A-Z0-9_ ]+$/.test(e.message)?e.message:'SERVICE_TEST_FAILED',completed:report.length}));process.exitCode=1;});
