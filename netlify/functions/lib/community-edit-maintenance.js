const {assertTestPreview}=require('./test-preview-guard');
const MESSAGE='게시글 수정 기능을 잠시 점검 중입니다. 잠시 후 다시 시도해 주세요.';
function blocked(env=process.env){
  if(env.TEST_PREVIEW_MODE!=='true')return false;
  assertTestPreview(env);
  return env.TEST_COMMUNITY_EDIT_PAUSED==='true';
}
function response(){return {statusCode:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Retry-After':'60'},body:JSON.stringify({ok:false,code:'COMMUNITY_EDIT_PAUSED',error:MESSAGE,retry_after:60})};}
function wrap(handler,{upload=false}={}){return async event=>{
  if(event.httpMethod==='POST'){
    let edit=true;
    if(upload){try{edit=Boolean(JSON.parse(event.body||'{}').post_id)}catch{edit=false}}
    if(edit&&blocked())return response();
  }
  return handler(event);
};}
module.exports={blocked,response,wrap,MESSAGE};
