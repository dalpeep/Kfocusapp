'use strict';
const MESSAGE='게시글 수정 기능을 잠시 점검 중입니다. 잠시 후 다시 시도해 주세요.';
function pausedResponse(){return {statusCode:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Retry-After':'60'},body:JSON.stringify({ok:false,code:'COMMUNITY_EDIT_PAUSED',error:MESSAGE,retry_after:60})};}
function editGate(event,{upload=false}={}){
 if(process.env.COMMUNITY_EDIT_PAUSED!=='true'||event.httpMethod!=='POST')return null;
 if(upload){let b;try{b=JSON.parse(event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):event.body||'{}');}catch{return null;}if(!b||!b.post_id)return null;}
 return pausedResponse();
}
module.exports={editGate};
