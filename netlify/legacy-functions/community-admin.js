const S=require('./lib/community-security'),L=require('./lib/community-lifecycle');
const {createHash,randomUUID}=require('node:crypto');
const statuses=['pending','approved','hidden','rejected','expired','sold'];
const fail=(status,message)=>Object.assign(new Error(message),{status});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const binding=(event,actor)=>createHash('sha256').update(`promotion-admin:${actor}:${S.fingerprint(event)}`).digest('hex');

function webpDimensions(head,size){
  if(head.length<25||head.toString('ascii',0,4)!=='RIFF'||head.toString('ascii',8,12)!=='WEBP'||
    head.readUInt32LE(4)+8!==size)return null;
  const chunk=head.toString('ascii',12,16);
  if(chunk==='VP8L'&&head[20]===0x2f){
    const packed=head.readUInt32LE(21);
    return [1+(packed&0x3fff),1+((packed>>>14)&0x3fff)];
  }
  if(head.length<30)return null;
  if(chunk==='VP8X'&&!(head[20]&0x02))return [1+head.readUIntLE(24,3),1+head.readUIntLE(27,3)];
  if(chunk==='VP8 '&&head[23]===0x9d&&head[24]===1&&head[25]===0x2a)
    return [head.readUInt16LE(26)&0x3fff,head.readUInt16LE(28)&0x3fff];
  return null;
}

async function listPosts(db,region,b){
  const status=b.status||'all';
  if(status!=='all'&&!statuses.includes(status))throw fail(400,'Invalid status.');
  const from=Number(b.from??0),to=Number(b.to??99);
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to-from>=200)
    throw fail(400,'Invalid page.');
  const now=new Date().toISOString();
  const byStatus=(query,key)=>{
    if(key==='approved')return query.eq('status',key).or(
      `and(publish_ends_at.is.null,or(category.neq.business_promotion,publish_starts_at.is.null,and(publish_starts_at.lte.${now},expires_at.gt.${now}))),and(publish_ends_at.not.is.null,publish_starts_at.lte.${now},publish_ends_at.gt.${now})`);
    if(key==='expired')return query.or(
      `status.eq.expired,and(status.eq.approved,or(publish_ends_at.lte.${now},and(category.eq.business_promotion,publish_ends_at.is.null,publish_starts_at.not.is.null,expires_at.lte.${now})))`);
    return query.eq('status',key);
  };
  let query=db.from('community_posts').select('id,region,area,category,title,body,author_name,contact_type,contact_value,video_url,video_provider,status,expires_at,publish_starts_at,publish_ends_at,extension_count,cleanup_after,moderation_reason,moderation_note,sold_at,view_count,comment_count,approved_at,created_at,updated_at,community_post_images(id,image_url,sort_order)',{count:'exact'})
    .eq('region',region).order('created_at',{ascending:false}).order('id',{ascending:false}).range(from,to);
  if(status!=='all')query=byStatus(query,status);
  const [page,...totals]=await Promise.all([query,...statuses.map(key=>
    byStatus(db.from('community_posts').select('id',{head:true,count:'exact'}).eq('region',region),key))]);
  if(page.error)throw page.error;
  const counts=Object.fromEntries(statuses.map((key,index)=>{
    const total=totals[index];
    return [key,total.error||!Number.isInteger(total.count)?null:total.count];
  }));
  const rows=(page.data||[]).map(row=>{
    const end=row.publish_ends_at||(row.category==='business_promotion'&&row.publish_starts_at?row.expires_at:null);
    if(row.status!=='approved'||!end)return row;
    const display_status=Date.parse(end)<=Date.parse(now)?'expired':
      Date.parse(row.publish_starts_at)>Date.parse(now)?'scheduled':'approved';
    return {...row,display_status};
  });
  return S.response(200,{ok:true,rows,count:page.count,counts});
}

async function authorizePromotionUpload(event,auth,region,post,input){
  if(post.region!==region)throw fail(404,'게시글을 찾을 수 없습니다.');
  if(post.category!=='business_promotion'||post.status==='deleted'||input.updated_at!==post.updated_at)
    throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
  const files=input.files;
  if(!uuid(input.draft_id)||!Array.isArray(files)||files.length<1||files.length>S.IMAGE_LIMITS.business_promotion)
    throw fail(400,'이미지 개수 제한을 확인해 주세요.');
  for(const f of files){
    if(!f||f.mime_type!=='image/webp'||!Number.isInteger(f.byte_size)||f.byte_size<1||f.byte_size>1048576
      ||![f.width,f.height].every(n=>Number.isInteger(n)&&n>=1&&n<=1600))
      throw fail(400,'압축 이미지 형식 또는 크기가 올바르지 않습니다.');
  }
  await S.rateLimit(auth.db,event,'admin_promotion_upload',30,3600,auth.user.id);
  const fp=binding(event,auth.user.id);
  const storage=auth.db.storage.from(S.env().bucket);
  const uploads=[];
  for(const file of files){
    const id=randomUUID(),path=`community-posts/${input.draft_id}/${id}.webp`;
    const saved=await auth.db.from('community_upload_drafts').insert({
      id,draft_id:input.draft_id,post_id:post.id,region,ip_fingerprint:fp,storage_path:path,
      mime_type:'image/webp',byte_size:file.byte_size,width:file.width,height:file.height
    });
    if(saved.error)throw saved.error;
    const {data,error}=await storage.createSignedUploadUrl(path);
    if(error||!data?.token)throw error||Error('Signed upload unavailable');
    uploads.push({id,path,token:data.token});
  }
  return S.response(200,{ok:true,uploads});
}

async function saveImages(event,auth,region,post,input,fields){
  const plan=input.image_plan;
  if(!uuid(input.request_id)||!uuid(input.draft_id)||!Array.isArray(plan)||plan.length>S.IMAGE_LIMITS.business_promotion||
      plan.some(item=>!item||!['existing','upload'].includes(item.kind)||!uuid(item.id))||
      new Set(plan.map(item=>item.id)).size!==plan.length)throw fail(400,'이미지 변경 요청을 확인해 주세요.');
  const {db,user}=auth;
  const prior=await db.from('community_image_edit_requests').select('post_id,result').eq('request_id',input.request_id).maybeSingle();
  if(prior.error)throw prior.error;
  if(prior.data){
    if(prior.data.post_id!==post.id||prior.data.result?.actor!==user.id)throw fail(409,'다른 수정 요청입니다.');
    return S.response(200,{ok:true});
  }
  if(input.updated_at!==post.updated_at)throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
  const fp=binding(event,user.id);
  const requested=plan.filter(item=>item.kind==='upload').map(item=>item.id);
  const urls=new Map();
  if(requested.length){
    const env=S.env(),storage=db.storage.from(env.bucket);
    const drafts=await db.from('community_upload_drafts').select('id,storage_path,byte_size,width,height,expires_at')
      .in('id',requested).eq('post_id',post.id).eq('region',region).eq('draft_id',input.draft_id)
      .eq('ip_fingerprint',fp).eq('status','reserved');
    if(drafts.error)throw drafts.error;
    if(drafts.data?.length!==requested.length)throw fail(400,'이미지 업로드를 확인할 수 없습니다.');
    for(const draft of drafts.data){
      const path=`community-posts/${input.draft_id}/${draft.id}.webp`;
      if(draft.storage_path!==path||Date.parse(draft.expires_at)<=Date.now())throw fail(400,'이미지 업로드가 만료됐습니다.');
      const {data,error}=await storage.download(path);
      if(error||!data||data.type!=='image/webp'||data.size!==draft.byte_size||data.size>1048576)
        throw fail(400,'업로드된 이미지의 형식 또는 크기가 일치하지 않습니다.');
      const dimensions=webpDimensions(Buffer.from(await data.slice(0,30).arrayBuffer()),data.size);
      if(!dimensions||dimensions[0]!==draft.width||dimensions[1]!==draft.height)
        throw fail(400,'올바른 WebP 이미지가 아닙니다.');
      urls.set(draft.id,`${env.url}/storage/v1/object/public/${env.bucket}/${path}`);
    }
  }
  const result=await db.rpc('community_admin_save_promotion_images',{
    p_post:post.id,p_region:region,p_version:input.updated_at,p_fields:fields,p_draft:input.draft_id,
    p_request:input.request_id,p_actor:user.id,p_fingerprint:fp,
    p_plan:plan.map(({kind,id})=>kind==='existing'?{kind,id}:{kind,id,image_url:urls.get(id)})
  });
  if(result.error){
    if(result.error.code==='40001')throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
    if(['22023','22P02','23514'].includes(result.error.code))throw fail(400,'이미지를 저장할 수 없습니다.');
    throw result.error;
  }
  return S.response(200,{ok:true});
}

async function editPromotion(event, db, auth, region, post, input){
  if(post.region!==region)throw fail(404,'게시글을 찾을 수 없습니다.');
  if(post.category!=='business_promotion'||post.status==='deleted')throw fail(409,'수정할 수 없는 게시글입니다.');
  if(!post.updated_at)throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
  for(const [field,max] of Object.entries({title:120,body:5000,author_name:40,area:40,contact_type:20,contact_value:200})){
    if(typeof input[field]!=='string'||input[field].trim().length>max)throw fail(400,'입력 항목과 길이를 확인해 주세요.');
  }
  const {title,body,author_name,area,contact_type,contact_value}=S.validatePost({...input,category:post.category,region,video_url:post.video_url});
  const fields={title,body,author_name,area,contact_type,contact_value};
  if(Object.hasOwn(input,'image_plan'))return saveImages(event,auth,region,post,input,fields);
  if(input.updated_at!==post.updated_at)throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
  const changes={...fields,updated_at:new Date().toISOString()};
  const result=await db.from('community_posts').update(changes).eq('id',post.id).eq('region',region)
    .eq('category',post.category).eq('status',post.status).eq('updated_at',post.updated_at).select('id');
  if(result.error)throw result.error;
  if(result.data?.length!==1)throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
  console.info('[community-admin] promotion_edit',JSON.stringify({actor:auth.user.id,post:post.id,region}));
  return S.response(200,{ok:true});
}

exports.handler=S.handler(async event=>{
  if(event.httpMethod!=='POST')return S.response(405,{ok:false});const b=S.parse(event),region=S.text(b.region||'dallas',40),auth=await S.verifyAdmin(event,region),db=auth.db,action=S.text(b.action,40);
  if(action==='list')return listPosts(db,region,b);
  if(action==='comments'){const parent=await db.from('community_posts').select('id,region').eq('id',b.post_id).single();if(parent.error||!parent.data)throw Object.assign(new Error('Not found.'),{status:404});if(auth.role==='regional_editor'&&parent.data.region!==auth.area)throw Object.assign(new Error('Forbidden region.'),{status:403});const r=await db.from('community_comments').select('id,post_id,author_name,body,status,created_at').eq('post_id',parent.data.id).order('created_at');if(r.error)throw r.error;return S.response(200,{ok:true,rows:r.data||[]})}
  const post=await db.from('community_posts').select('id,region,category,status,created_at,expires_at,cleanup_after,updated_at,video_url').eq('id',b.id).single();if(post.error)throw Object.assign(new Error('Not found.'),{status:404});if(auth.role==='regional_editor'&&post.data.region!==auth.area)throw Object.assign(new Error('Forbidden region.'),{status:403});
  if(action==='promotion_upload')return authorizePromotionUpload(event,auth,region,post.data,b);
  if(action==='edit_promotion')return editPromotion(event,db,auth,region,post.data,b);
  if(action==='edit_promotion_period'){
    if(post.data.region!==region||!['approved','expired'].includes(post.data.status))
      throw fail(409,'게시중 또는 만료된 게시글만 기간을 변경할 수 있습니다.');
    if(b.updated_at!==post.data.updated_at)throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
    if(![b.publish_start_date,b.publish_end_date].every(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)))
      throw fail(400,'게시 시작일과 종료일을 확인해 주세요.');
    const result=await db.rpc('community_admin_set_publication_period_v1',{p_id:b.id,p_region:region,
      p_expected_updated_at:b.updated_at,p_start:b.publish_start_date,p_end:b.publish_end_date});
    if(result.error?.code==='40001')throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
    if(['22007','22008','22023'].includes(result.error?.code))throw fail(400,'게시 시작일과 종료일을 확인해 주세요.');
    if(result.error)throw result.error;
    return S.response(200,{ok:true});
  }
  if(action==='status'){const status=S.text(b.status,20);if(!['approved','rejected','deleted','expired','hidden'].includes(status))throw Object.assign(new Error('Invalid status.'),{status:400});if(status==='approved'&&!['pending','hidden'].includes(post.data.status))throw Object.assign(new Error('Invalid approval transition.'),{status:400});const changes=L.adminStatusChanges(post.data,status);if(status==='hidden'){const reason=S.text(b.reason,40),note=S.text(b.note,501);if(!['abuse','personal_info','off_topic','promotion','duplicate','other'].includes(reason)||note.length>500)throw Object.assign(new Error('숨김 사유를 선택해 주세요.'),{status:400});changes.moderation_reason=reason;changes.moderation_note=note||null}else if(status==='approved'){changes.moderation_reason=null;changes.moderation_note=null}const r=await db.from('community_posts').update(changes).eq('id',b.id).eq('status',post.data.status).select('id');if(r.error)throw r.error;if(r.data?.length!==1)throw Object.assign(new Error('게시글 상태가 변경되었습니다. 다시 확인해 주세요.'),{status:409});return S.response(200,{ok:true})}
  if(action==='category'){if(post.data.status==='hidden')throw Object.assign(new Error('숨김 글의 카테고리는 작성자 재검토 과정에서만 변경할 수 있습니다.'),{status:400});if(!S.CATEGORIES.has(b.category))throw Object.assign(new Error('Invalid category.'),{status:400});const video=['marketplace','housing','business_promotion'].includes(b.category)?{}:{video_url:null,video_provider:null};const r=await db.from('community_posts').update({category:b.category,...video}).eq('id',b.id);if(r.error)throw r.error;return S.response(200,{ok:true})}
  if(action==='comment_status'){const r=await db.from('community_comments').update({status:['active','hidden','deleted'].includes(b.status)?b.status:'hidden'}).eq('id',b.comment_id).eq('post_id',b.id);if(r.error)throw r.error;return S.response(200,{ok:true})}
  throw Object.assign(new Error('Invalid action.'),{status:400});
});
