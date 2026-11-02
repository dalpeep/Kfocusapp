'use strict';
const {writeSync}=require('node:fs');
const phases=new Set(['ENTRY','PREFLIGHT','SOURCE_CHECK','REQUEST_START','RESULT','STOP']);
const codes=new Set(['QA_PREVIEW_ARGUMENT_BLOCKED','QA_MODULE_LOAD_FAILED','QA_PREVIEW_APPROVAL_BLOCKED','QA_BUILD_ONLY_CONTEXT_BLOCKED','QA_SOURCE_COMMIT_BLOCKED','QA_OWNER_SOURCE_BASE_BLOCKED','QA_SOURCE_CHECK_FAILED','QA_PRIVATE_AUTH_APPROVAL_REQUIRED','QA_SERVICE_ROLE_AUTH_FAILED','QA_AUTH_COMPLETE_NO_DEPLOY','QA_PREVIEW_STOPPED','QA_BUILD_COMPLETE','QA_AUTH_TARGET_BLOCKED','QA_AUTH_NETWORK_FAILED','QA_AUTH_RESPONSE_FAILED','QA_AUTH_HTTP_REJECTED','QA_READ_AUTH_OK']);
function reason(error){return codes.has(error?.message)?error.message:'QA_PREVIEW_STOPPED';}
function record(phase,input={}){
 if(!phases.has(phase))throw Error('QA_DIAGNOSTIC_PHASE_BLOCKED');
 const out={stage:'QA_AUTH_DIAGNOSTIC',phase};
 if(codes.has(input.code))out.code=input.code;
 for(const key of ['allowed','qaProject'])if(typeof input[key]==='boolean')out[key]=input[key];
 if(['PASS','FAIL','NOT TESTED'].includes(input.result))out.result=input.result;
 if(input.attempts===0||input.attempts===1)out.attempts=input.attempts;
 if(input.httpStatus===null||(Number.isInteger(input.httpStatus)&&input.httpStatus>=100&&input.httpStatus<=599))out.httpStatus=input.httpStatus;
 if(input.exitCode===0||input.exitCode===78)out.exitCode=input.exitCode;
 return out;
}
function emit(phase,input){writeSync(1,JSON.stringify(record(phase,input))+'\n');}
module.exports={emit,record,reason};
