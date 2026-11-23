const S=require('./lib/community-security'),L=require('./lib/community-lifecycle');
const statuses=['pending','approved','hidden','rejected','expired','sold'];
const fail=(status,message)=>Object.assign(new Error(message),{status});

async function listPosts(db,region,b){
  const status=b.status||'all';
  if(status!=='all'&&!statuses.includes(status))throw fail(400,'Invalid status.');
  const from=Number(b.from??0),to=Number(b.to??99);
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to-from>=200)
    throw fail(400,'Invalid page.');
  let query=db.from('community_posts').select('id,region,area,category,title,body,author_name,contact_type,contact_value,video_url,video_provider,status,expires_at,extension_count,cleanup_after,moderation_reason,moderation_note,sold_at,view_count,comment_count,approved_at,created_at,updated_at,community_post_images(id,image_url,sort_order)',{count:'exact'})
    .eq('region',region).order('created_at',{ascending:false}).order('id',{ascending:false}).range(from,to);
  if(status!=='all')query=query.eq('status',status);
  const [page,...totals]=await Promise.all([query,...statuses.map(key=>
    db.from('community_posts').select('id',{head:true,count:'exact'}).eq('region',region).eq('status',key))]);
  if(page.error)throw page.error;
  const counts=Object.fromEntries(statuses.map((key,index)=>{
    const total=totals[index];
    return [key,total.error||!Number.isInteger(total.count)?null:total.count];
  }));
  return S.response(200,{ok:true,rows:page.data||[],count:page.count,counts});
}

async function editPromotion(db, auth, region, post, input){
  if(post.region!==region)throw fail(404,'게시글을 찾을 수 없습니다.');
  if(post.category!=='business_promotion'||post.status==='deleted')throw fail(409,'수정할 수 없는 게시글입니다.');
  if(!post.updated_at||input.updated_at!==post.updated_at)throw fail(409,'게시글이 변경되었습니다. 다시 열어 주세요.');
  for(const [field,max] of Object.entries({title:120,body:5000,author_name:40,area:40,contact_type:20,contact_value:200})){
    if(typeof input[field]!=='string'||input[field].trim().length>max)throw fail(400,'입력 항목과 길이를 확인해 주세요.');
  }
  const {title,body,author_name,area,contact_type,contact_value}=S.validatePost({...input,category:post.category,region,video_url:post.video_url});
  const changes={title,body,author_name,area,contact_type,contact_value,updated_at:new Date().toISOString()};
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
  if(action==='edit_promotion')return editPromotion(db,auth,region,post.data,b);
  if(action==='status'){const status=S.text(b.status,20);if(!['approved','rejected','deleted','expired','hidden'].includes(status))throw Object.assign(new Error('Invalid status.'),{status:400});if(status==='approved'&&!['pending','hidden'].includes(post.data.status))throw Object.assign(new Error('Invalid approval transition.'),{status:400});const changes=L.adminStatusChanges(post.data,status);if(status==='hidden'){const reason=S.text(b.reason,40),note=S.text(b.note,501);if(!['abuse','personal_info','off_topic','promotion','duplicate','other'].includes(reason)||note.length>500)throw Object.assign(new Error('숨김 사유를 선택해 주세요.'),{status:400});changes.moderation_reason=reason;changes.moderation_note=note||null}else if(status==='approved'){changes.moderation_reason=null;changes.moderation_note=null}const r=await db.from('community_posts').update(changes).eq('id',b.id).eq('status',post.data.status).select('id');if(r.error)throw r.error;if(r.data?.length!==1)throw Object.assign(new Error('게시글 상태가 변경되었습니다. 다시 확인해 주세요.'),{status:409});return S.response(200,{ok:true})}
  if(action==='category'){if(post.data.status==='hidden')throw Object.assign(new Error('숨김 글의 카테고리는 작성자 재검토 과정에서만 변경할 수 있습니다.'),{status:400});if(!S.CATEGORIES.has(b.category))throw Object.assign(new Error('Invalid category.'),{status:400});const video=['marketplace','housing','business_promotion'].includes(b.category)?{}:{video_url:null,video_provider:null};const r=await db.from('community_posts').update({category:b.category,...video}).eq('id',b.id);if(r.error)throw r.error;return S.response(200,{ok:true})}
  if(action==='comment_status'){const r=await db.from('community_comments').update({status:['active','hidden','deleted'].includes(b.status)?b.status:'hidden'}).eq('id',b.comment_id).eq('post_id',b.id);if(r.error)throw r.error;return S.response(200,{ok:true})}
  throw Object.assign(new Error('Invalid action.'),{status:400});
});
