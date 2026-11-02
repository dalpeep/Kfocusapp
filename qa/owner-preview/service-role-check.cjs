'use strict';
const QA='hseaeafmmjnbynfyynao';
// Result-only diagnostics: no original body, headers or error ever reach emit.
async function authenticate(env,transport=fetch,emit=()=>{}){
 const report=(result,code,httpStatus,attempts)=>emit({stage:'QA_SERVICE_ROLE_AUTH_RESULT',result,code,httpStatus,attempts,qaProject:env.SUPABASE_URL===`https://${QA}.supabase.co`});
 if(env.SUPABASE_URL!==`https://${QA}.supabase.co`||typeof env.SUPABASE_SERVICE_ROLE_KEY!=='string'||!env.SUPABASE_SERVICE_ROLE_KEY.trim()){
  report('NOT TESTED','QA_AUTH_TARGET_BLOCKED',null,0);throw Error('QA_SERVICE_ROLE_AUTH_FAILED');
 }
 let response;
 try{
  response=await transport(`https://${QA}.supabase.co/auth/v1/admin/users?page=1&per_page=1`,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}
  });
 }catch{report('FAIL','QA_AUTH_NETWORK_FAILED',null,1);throw Error('QA_SERVICE_ROLE_AUTH_FAILED');}
 try{await response.arrayBuffer();}catch{report('FAIL','QA_AUTH_RESPONSE_FAILED',null,1);throw Error('QA_SERVICE_ROLE_AUTH_FAILED');}
 if(response.status!==200){
  report('FAIL','QA_AUTH_HTTP_REJECTED',Number.isInteger(response.status)?response.status:null,1);
  throw Error('QA_SERVICE_ROLE_AUTH_FAILED');
 }
 report('PASS','QA_READ_AUTH_OK',200,1);
 return {authenticated:true,qaProject:true};
}
module.exports={authenticate};
