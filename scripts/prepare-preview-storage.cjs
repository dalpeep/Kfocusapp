// Prepared helper only. Default = READ ONLY plan. --apply is a separate future action.
// Never SQL-delete Storage metadata. Exact paths come from the guarded reset manifest.
const TEST_REF='aaikttogoejfvxbosktg';
const approvedPaths=[
  'migration-a/after-protected-1791089841006.txt',
  'migration-a/after-protected-1791091355756.txt',
  'migration-a/after-protected-1791091543255.txt'
];
const objectPattern=/^migration-a\/(before|after|rollback)-(anon|admin|service|protected)-[0-9]+\.txt$/;
function assertIdentity(env){
  if(env.OWNER_TEST_URL!==`https://${TEST_REF}.supabase.co`)throw new Error('Wrong owner-test URL');
  let claims;
  try{claims=JSON.parse(Buffer.from(env.OWNER_TEST_SERVICE_KEY.split('.')[1],'base64url').toString())}
  catch{throw new Error('Project-verifiable service JWT required')}
  if(claims.ref!==TEST_REF||claims.role!=='service_role')throw new Error('Wrong Test JWT ref/role');
}
async function main(env=process.env,args=process.argv.slice(2),fetchImpl=global.fetch,log=console.log){
  if(args.some(arg=>!['--apply','--plan'].includes(arg)))throw new Error('Use --plan (default) or --apply');
  const apply=args.includes('--apply');
  log('CHECK: local Test URL/JWT identity');
  assertIdentity(env);
  log('PASS: local Test URL/JWT identity');
  async function request(path,method='GET',body){
    log(`CHECK: ${method} ${path.split('?')[0]}`);
    let response;
    try { response=await fetchImpl(env.OWNER_TEST_URL+path,{method,redirect:'error',
      headers:{apikey:env.OWNER_TEST_SERVICE_KEY,Authorization:`Bearer ${env.OWNER_TEST_SERVICE_KEY}`,
        'Content-Type':'application/json',Prefer:'return=representation'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})}); }
    catch { throw new Error('Test API network/TLS/redirect failure'); }
    if(!response.ok)throw new Error(`Test API HTTP ${response.status}`);
    try { return await response.json(); }
    catch { throw new Error('Test API response is not JSON'); }
  }
  const states=await request('/rest/v1/owner_test_preview_state?select=id,project_ref,phase,storage_ready&id=eq.true');
  if(!Array.isArray(states)||states.length!==1)throw new Error('Unique reset state required');
  const state=states[0];
  if(state.project_ref!==TEST_REF||state.phase!=='reset')throw new Error('08 reset state required');
  if(state.storage_ready!==false)throw new Error('storage_ready=false required');
  const manifest=await request('/rest/v1/owner_test_preview_manifest?select=object_kind,object_id&action=eq.storage_api_remove&limit=1000');
  if(!Array.isArray(manifest)||manifest.length>=1000)throw new Error('Unbounded manifest refused');
  if(manifest.length!==3||new Set(manifest.map(r=>r.object_id)).size!==3||
    manifest.some(r=>r.object_kind!=='storage:public-images'||!approvedPaths.includes(r.object_id)))
    throw new Error('Exact approved three-object manifest required');
  for(const row of manifest){
    if(!['storage:public-images','storage:community-images'].includes(row.object_kind)||!objectPattern.test(row.object_id))
      throw new Error('Unrecognized Storage deletion target');
  }
  log(JSON.stringify({mode:apply?'apply':'READ ONLY plan',project_ref:TEST_REF,
    remove:manifest.map(r=>({bucket:r.object_kind.slice(8),path:r.object_id})),
    bucket_update:{id:'community-images',public:true}}));
  const beforeBuckets=await request('/storage/v1/bucket');
  const bucketIds=['public-images','community-images','media','business-media','coupon-media','banner-media','ktownad'];
  if(!Array.isArray(beforeBuckets)||beforeBuckets.length!==7||new Set(beforeBuckets.map(b=>b.id)).size!==7||beforeBuckets.some(b=>!bucketIds.includes(b.id)))
    throw new Error('Unexpected bucket inventory');
  // Check live contents BEFORE delete/public visibility changes, including files
  // created after reset. Never remove/expose an object outside the exact manifest.
  const allowed=new Set(manifest.map(r=>r.object_kind.slice(8)+'/'+r.object_id));
  const observed=new Set();
  for(const bucket of beforeBuckets){
    const roots=await request(`/storage/v1/object/list/${encodeURIComponent(bucket.id)}`,'POST',{prefix:'',limit:1000,offset:0});
    if(!Array.isArray(roots)||roots.length>=1000)throw new Error('Invalid/unbounded Storage inventory');
    for(const root of roots){
      if(!['public-images','community-images'].includes(bucket.id)||root.name!=='migration-a'||root.id)
        throw new Error('Unexpected live Storage path; no mutation permitted');
      const files=await request(`/storage/v1/object/list/${bucket.id}`,'POST',{prefix:'migration-a',limit:1000,offset:0});
      if(!Array.isArray(files)||files.length>=1000)throw new Error('Invalid/unbounded fixture folder');
      if(files.some(f=>!f.id||!allowed.has(bucket.id+'/migration-a/'+f.name)))
        throw new Error('Live object differs from reset manifest; no mutation permitted');
      for(const file of files)observed.add(bucket.id+'/migration-a/'+file.name);
    }
  }
  log(JSON.stringify({inventory:'PASS',live_objects:observed.size,
    unexpected_objects:0,retained_objects:[],preserved_buckets:bucketIds,
    auth_users:'untouched',community_images_current_public:beforeBuckets.find(b=>b.id==='community-images').public,
    community_images_planned_public:true}));
  if(allowed.size!==observed.size||[...allowed].some(path=>!observed.has(path)))
    throw new Error('Manifest objects missing from live inventory');
  if(!apply){
    log('PASS: READ ONLY plan; Test ref/role and live inventory verified; no changes made.');
    return;
  }
  for(const bucket of ['public-images','community-images']){
    const paths=manifest.filter(r=>r.object_kind===`storage:${bucket}`).map(r=>r.object_id);
    for(let offset=0;offset<paths.length;offset+=1000)
      await request(`/storage/v1/object/${bucket}`,'DELETE',{prefixes:paths.slice(offset,offset+1000)});
  }
  // Confirm all buckets are empty before changing Community visibility.
  for(const bucket of beforeBuckets){
    const objects=await request(`/storage/v1/object/list/${encodeURIComponent(bucket.id)}`,'POST',{prefix:'',limit:1,offset:0});
    if(!Array.isArray(objects)||objects.length)
      throw new Error('Storage changed during apply; readiness remains false');
  }
  await request('/storage/v1/bucket/community-images','PUT',{id:'community-images',name:'community-images',public:true});
  const buckets=await request('/storage/v1/bucket');
  if(!Array.isArray(buckets)||buckets.length!==7||new Set(buckets.map(b=>b.id)).size!==7||buckets.some(b=>!bucketIds.includes(b.id)))
    throw new Error('Unexpected bucket inventory');
  if(beforeBuckets.some(b=>b.id!=='community-images'&&buckets.find(after=>after.id===b.id).public!==b.public))
    throw new Error('Unrelated bucket visibility changed');
  if(!buckets.some(b=>b.id==='community-images'&&b.public===true))throw new Error('Community bucket must be public');
  for(const bucket of buckets){
    const objects=await request(`/storage/v1/object/list/${encodeURIComponent(bucket.id)}`,'POST',{prefix:'',limit:1,offset:0});
    if(!Array.isArray(objects))throw new Error('Invalid Storage list response');
    if(objects.length)throw new Error('Storage not empty; unexpected or concurrent object; 06 remains blocked');
  }
  const updated=await request(`/rest/v1/owner_test_preview_state?id=eq.true&phase=eq.reset&project_ref=eq.${TEST_REF}&storage_ready=eq.false`,'PATCH',{storage_ready:true});
  if(!Array.isArray(updated)||updated.length!==1||updated[0].storage_ready!==true)throw new Error('Storage state transition failed');
  log('PASS: exact fixture objects removed via API; community bucket ready. Run READ ONLY verification before 06.');
}
module.exports={assertIdentity,objectPattern,main};
function safeFailure(error){
  const allowed=['Wrong owner-test URL','Project-verifiable service JWT required','Wrong Test JWT ref/role',
    'Unique reset state required','08 reset state required','Unbounded manifest refused',
    'Unrecognized Storage deletion target','Test API network/TLS/redirect failure','Test API response is not JSON',
    'Unexpected bucket inventory','Unexpected live Storage path; no mutation permitted',
    'storage_ready=false required','Exact approved three-object manifest required',
    'Storage changed during apply; readiness remains false','Unrelated bucket visibility changed',
    'Live object differs from reset manifest; no mutation permitted','Manifest objects missing from live inventory'];
  return allowed.includes(error?.message)||/^Test API HTTP [0-9]{3}$/.test(error?.message||'')
    ?error.message:'Test Storage preparation failed';
}
module.exports.safeFailure=safeFailure;
if(require.main===module)main().catch(error=>{console.error('BLOCKED: '+safeFailure(error)+'; no credentials logged.');process.exitCode=1});
