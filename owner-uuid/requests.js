(()=>{'use strict';
// Keep an uncertain mutation's exact payload and key until the same request is
// acknowledged. The existing server command ledger performs the deduplication.
function mutationSender(send,uuid=()=>crypto.randomUUID()){
 let pending=null,flight=null;
 return function submit(value){
  const snapshot=JSON.stringify(value);
  if(pending&&pending.snapshot!==snapshot)return Promise.reject(Error('이전 저장 결과가 아직 확인되지 않았습니다. 같은 내용으로 재시도해 결과를 확인한 뒤 수정해 주세요.'));
  if(flight)return flight;
  if(!pending)pending={snapshot,body:{...JSON.parse(snapshot),key:uuid()}};
  flight=Promise.resolve().then(()=>send(JSON.parse(JSON.stringify(pending.body)))).then(result=>{pending=null;return result;},error=>{if(error.definitive===true)pending=null;throw error;}).finally(()=>{flight=null;});
  return flight;
 };
}
async function readResponse(response,{pilotRead=false,pilotClaim=false}={}){
 const fail=(message,definitive=false)=>{throw Object.assign(Error(message),{definitive,status:response.status});};
 if(response.redirected||!(response.headers.get('content-type')||'').toLowerCase().match(/^application\/(?:[\w.+-]+\+)?json(?:;|$)/))return fail('응답을 확인하지 못했습니다. 작성 내용은 유지됩니다. 같은 요청으로 재시도해 저장 결과를 확인해 주세요.');
 let out;try{out=await response.json();}catch{return fail('응답을 확인하지 못했습니다. 작성 내용을 유지하고 저장 결과를 확인해 주세요.');}
 if(!response.ok){
  if(out?.code==='OWNER_QA_PILOT_OFF')return fail('업주 관리 시험 운영이 중지됐습니다. 신청·수정·승인 기능은 중지 상태입니다.',true);
  if(pilotRead&&response.status===403)return fail('이 로그인 계정은 시험 운영에 접근할 수 없습니다. 지정 시험 계정인지 확인해 주세요.',true);
  if(pilotClaim&&response.status===403)return fail('이 업소의 소유권 신청이 허용되지 않습니다. QA에서 지정된 신청 대상 업소를 확인해 주세요.',true);
  const codes={OWNER_PILOT_REVIEW_FORBIDDEN:'지정 관리자 계정과 담당 지역을 확인해 주세요. 본인 신청은 다른 관리자가 처리해야 합니다.',OWNER_PILOT_REQUEST_FORBIDDEN:'이 신청에 접근할 권한이 없습니다.',OWNER_APPROVAL_AREA_REQUIRED:'신규 업소의 승인 지역을 입력해 주세요.',OWNER_REJECTION_REASON_REQUIRED:'거절 사유를 입력해 주세요.',OWNER_PILOT_REVIEW_CONFLICT:'시험 업소 정보 또는 소유권이 변경됐습니다. 목록을 새로고침해 주세요.',OWNER_ADMIN_REQUIRED:'해당 지역의 관리자 권한이 필요합니다. 로그인 계정과 담당 지역을 확인해 주세요.',OWNER_SELF_REVIEW_BLOCKED:'본인 신청은 처리할 수 없습니다. 다른 관리자가 처리해야 합니다.',OWNER_MEMBERSHIP_REQUIRED:'이 업소의 활성 소유권이 없습니다. 승인·권한 회수 상태를 확인해 주세요.',OWNER_ACCOUNT_UNAVAILABLE:'이메일 인증과 계정 활성 상태를 확인해 주세요.',OWNER_BASELINE_CONFLICT:'공개 정보가 변경되어 처리하지 않았습니다. 작성 내용을 보관하고 최신 정보를 확인한 뒤 다시 신청해 주세요.',OWNER_REQUEST_ALREADY_REVIEWED:'이미 처리된 신청입니다. 목록을 새로고침해 승인·거절 결과를 확인해 주세요.',OWNER_MEMBERSHIP_REVOKED:'신청 후 관리 권한이 회수되어 승인할 수 없습니다.',OWNER_DESCRIPTION_CHOICE_REQUIRED:'현재 업종의 승인된 소개 문구를 선택해 주세요. 기존 소개는 유지할 수 있습니다.',OWNER_REQUEST_RATE_LIMIT:'1시간에 최대 5건까지 신청할 수 있습니다. 잠시 후 다시 신청해 주세요.'};
  return fail(codes[out?.code]||(response.status===401?'로그인이 만료되었습니다. 작성 내용을 유지하고 다시 로그인해 주세요.':response.status===403?'이 업소를 수정할 권한이 없습니다. 승인 상태를 확인해 주세요.':response.status===400?'입력 내용과 기간을 확인해 주세요.':response.status===409?'정보가 변경되었거나 요청이 충돌했습니다. 목록을 새로고침해 주세요.':'저장 결과를 확인하지 못했습니다. 같은 요청으로 재시도해 주세요.'),[400,401,403,409,429].includes(response.status));
 }
 if(!out||out.ok!==true||!out.result||typeof out.result!=='object'||Array.isArray(out.result))return fail('저장 결과가 올바르지 않습니다. 작성 내용을 유지하고 저장 여부를 확인해 주세요.');
 return out;
}
window.OwnerRequests=Object.freeze({mutationSender,readResponse});
})();
