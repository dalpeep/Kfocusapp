const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const lifecycle=require('../netlify/functions/lib/community-lifecycle');

test('author and admin terminal transitions set a seven-day cleanup time',()=>{
  const now=new Date('2026-09-23T12:00:00.000Z');
  const due='2026-09-30T12:00:00.000Z';
  assert.equal(lifecycle.cleanupAfter(now),due);
  const post={category:'qna',status:'approved',created_at:'2026-09-20T00:00:00.000Z',cleanup_after:null};
  for(const status of ['deleted','rejected','expired']){
    assert.deepEqual(lifecycle.adminStatusChanges(post,status,now),{status,approved_at:null,cleanup_after:due});
  }
  assert.equal(lifecycle.adminStatusChanges({...post,status:'deleted',cleanup_after:due},'deleted',new Date('2026-09-24T12:00:00Z')).cleanup_after,due);
});

test('reapproval restores the correct nonterminal cleanup contract',()=>{
  const now=new Date('2026-09-23T12:00:00.000Z');
  const base={status:'rejected',created_at:'2026-09-01T00:00:00.000Z',cleanup_after:'2026-09-30T12:00:00.000Z'};
  assert.equal(lifecycle.adminStatusChanges({...base,category:'qna'},'approved',now).cleanup_after,null);
  assert.equal(lifecycle.adminStatusChanges({...base,category:'marketplace'},'approved',now).cleanup_after,'2026-10-08T00:00:00.000Z');
});

test('migration permits terminal non-marketplace cleanup without changing existing rows',()=>{
  const sql=read('supabase/community-cleanup-contract-phase1.sql');
  assert.match(sql,/status in \('deleted','rejected','expired'\)/);
  assert.match(sql,/category <> 'marketplace' and expires_at is null/);
  assert.doesNotMatch(sql,/\b(?:update|delete|insert|truncate)\s+public\./i);
  assert.doesNotMatch(sql,/public\.(?:posts|businesses|coupons|business_specials)\b/i);
});

test('author and admin endpoints use the same cleanup authority',()=>{
  assert.match(read('netlify/functions/lib/community-mutate.js'),/cleanup_after:L\.cleanupAfter\(\)/);
  assert.match(read('netlify/functions/community-admin.js'),/L\.adminStatusChanges\(post\.data,status\)/);
});

function mockDb(state,objects,{storageError=false}={}){
  class Query{
    constructor(table){this.table=table;this.filters=[];this.action='select';this.max=Infinity}
    select(){this.action='select';return this}
    delete(){this.action='delete';return this}
    update(patch){this.action='update';this.patch=patch;return this}
    eq(key,value){this.filters.push(row=>row[key]===value);return this}
    in(key,values){this.filters.push(row=>values.includes(row[key]));return this}
    lte(key,value){this.filters.push(row=>row[key]<=value);return this}
    lt(key,value){this.filters.push(row=>row[key]<value);return this}
    limit(value){this.max=value;return this}
    then(resolve,reject){
      const rows=state[this.table].filter(row=>this.filters.every(fn=>fn(row))).slice(0,this.max);
      if(this.action==='update')for(const row of rows)Object.assign(row,this.patch);
      if(this.action==='delete'){
        const removed=new Set(rows);
        state[this.table]=state[this.table].filter(row=>!removed.has(row));
        if(this.table==='community_posts')for(const table of ['community_comments','community_post_images'])state[table]=state[table].filter(row=>!rows.some(post=>post.id===row.post_id));
      }
      return Promise.resolve({data:rows,error:null}).then(resolve,reject);
    }
  }
  return{
    from:table=>new Query(table),
    storage:{from:bucket=>{
      assert.equal(bucket,'community-images');
      return{remove:async paths=>{
        if(storageError)return{error:new Error('Storage failed')};
        for(const item of paths)objects.delete(item);
        return{error:null};
      }};
    }}
  };
}

test('scheduled cleanup handles deleted/rejected/expired/sold, cascades comments and preserves unrelated rows',async()=>{
  const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const image=n=>`community-posts/${uuid(n)}/${uuid(n+10)}.webp`;
  const past='2026-09-22T00:00:00.000Z',future='2026-10-01T00:00:00.000Z';
  const state={
    community_posts:[
      ...['deleted','rejected','expired','sold'].map((status,n)=>({id:uuid(n+1),status,cleanup_after:past})),
      {id:uuid(5),status:'approved',cleanup_after:null},
      {id:uuid(6),status:'deleted',cleanup_after:future}
    ],
    community_comments:[{id:uuid(20),post_id:uuid(1)},{id:uuid(21),post_id:uuid(5)}],
    community_post_images:[{post_id:uuid(1),storage_path:image(1)},{post_id:uuid(5),storage_path:image(5)}],
    community_upload_drafts:[{post_id:uuid(1),storage_path:image(2),status:'linked',expires_at:future}],
    community_image_edit_requests:[{post_id:uuid(1),request_id:uuid(30)}],
    community_image_cleanup_queue:[{post_id:uuid(1),storage_path:image(3)}],
    community_rate_limits:[]
  };
  const objects=new Set([image(1),image(2),image(3),image(5)]);
  const S=require('../netlify/functions/lib/community-security');
  const originalClient=S.client,originalEnv=S.env;
  S.client=()=>mockDb(state,objects);S.env=()=>({bucket:'community-images'});
  try{
    const {cleanup}=require('../netlify/functions/lib/community-cleanup');
    const result=await cleanup(new Date('2026-09-23T00:00:00.000Z'));
    assert.equal(result.deleted,4);
    assert.equal(result.failures,0);
    assert.equal(result.objects,3);
    assert.deepEqual(state.community_posts.map(x=>x.id),[uuid(5),uuid(6)]);
    assert.deepEqual(state.community_comments.map(x=>x.post_id),[uuid(5)]);
    assert.deepEqual(state.community_post_images.map(x=>x.post_id),[uuid(5)]);
    assert.equal(state.community_upload_drafts.length,0);
    assert.equal(state.community_image_edit_requests.length,0);
    assert.equal(state.community_image_cleanup_queue.length,0);
    assert.deepEqual([...objects],[image(5)]);
  }finally{S.client=originalClient;S.env=originalEnv}
});

test('Storage cleanup failure leaves the post and every dependent row available for retry',async()=>{
  const id='00000000-0000-4000-8000-000000000001';
  const storage_path=`community-posts/${id}/${id}.webp`;
  const state={community_posts:[{id,status:'deleted',cleanup_after:'2026-09-22T00:00:00.000Z'}],community_comments:[{post_id:id}],community_post_images:[{post_id:id,storage_path}],community_upload_drafts:[],community_image_edit_requests:[],community_image_cleanup_queue:[],community_rate_limits:[]};
  const objects=new Set([storage_path]);
  const S=require('../netlify/functions/lib/community-security');
  const originalClient=S.client,originalEnv=S.env;
  S.client=()=>mockDb(state,objects,{storageError:true});S.env=()=>({bucket:'community-images'});
  try{
    const {cleanup}=require('../netlify/functions/lib/community-cleanup');
    const result=await cleanup(new Date('2026-09-23T00:00:00.000Z'));
    assert.equal(result.deleted,0);
    assert.equal(result.failures,1);
    assert.equal(state.community_posts.length,1);
    assert.equal(state.community_comments.length,1);
    assert.equal(state.community_post_images.length,1);
    assert.equal(objects.size,1);
  }finally{S.client=originalClient;S.env=originalEnv}
});
