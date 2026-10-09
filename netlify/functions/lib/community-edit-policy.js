const S=require('./community-security');
const {validateDetails}=require('./community-details');
const {reviewPost}=require('./community-review');

// Publication and lifecycle fields never come from the author payload.
function prepareEdit(post,body){
  if(!['approved','pending','hidden'].includes(post.status))
    throw Object.assign(new Error('이 게시글은 수정할 수 없습니다.'),{status:409});
  if(!post.updated_at)throw Object.assign(new Error('게시글을 다시 불러와 주세요.'),{status:409});
  const next=S.validatePost({...post,...body},{partial:false});
  next.details=validateDetails(next.category,body.details??post.details,
    {legacy:!post.details&&next.category===post.category});
  if(reviewPost(next,next.details).status!=='approved')
    throw Object.assign(new Error('수정 내용이 게시판 안전 기준을 통과하지 못했습니다. 기존 글은 유지됩니다.'),{status:400});
  return {...next,_expected_updated_at:post.updated_at,_expected_status:post.status};
}

function editError(error){
  const status=error?.code==='40001'?409:error?.code==='P0002'?404:
    ['22023','23514'].includes(error?.code)?400:500;
  return Object.assign(new Error(status===409?'게시글 상태가 변경되었습니다. 다시 열어 수정해 주세요.':'게시글 수정에 실패했습니다.'),{status});
}
module.exports={prepareEdit,editError};
