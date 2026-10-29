// Build-only one-off: never deploy this as a Function or a public asset.
import {pathToFileURL} from 'node:url';
const QA='hseaeafmmjnbynfyynao',PROD='ydrxuqmjzayejlnjzzew';
const SITE='ec0bc146-8184-4627-90e0-df82ec2b06f9';
function stop(code){throw Object.assign(new Error(code),{safeCode:code});}
export async function verify(env,fetcher=fetch,now=()=>Date.now()){
 if(env.CONTEXT!=='deploy-preview'||env.SITE_ID!==SITE||env.REVIEW_ID!==env.QA_KEY_CHECK_REVIEW_ID||!/^\d+$/.test(env.QA_KEY_CHECK_REVIEW_ID||'')||env.BRANCH!=='dev/qa-service-role-once-20261029'||env.QA_KEY_CHECK_ONCE!=='true')stop('CONTEXT_BLOCKED');
 // Pin the separately approved verifier commit, not an arbitrary branch tip.
 if(!/^[a-f0-9]{40}$/.test(env.QA_KEY_CHECK_COMMIT||'')||env.COMMIT_REF!==env.QA_KEY_CHECK_COMMIT)stop('COMMIT_BLOCKED');
 if(env.OWNER_UUID_ENABLED!=='false'||env.OWNER_NOTIFICATION_WORKER_ENABLED!=='false'||env.OWNER_NOTIFICATION_MODE!=='mock')stop('MODE_BLOCKED');
 for(const [name,value]of Object.entries(env))if(value&&/(?:RESEND.*(?:KEY|TOKEN)|ONESIGNAL.*(?:KEY|TOKEN)|SENDGRID.*KEY|SMTP.*(?:PASS|TOKEN)|MAILGUN.*KEY)/i.test(name))stop('DELIVERY_CREDENTIAL_BLOCKED');
 if(QA===PROD||env.SUPABASE_URL!==`https://${QA}.supabase.co`)stop('TARGET_BLOCKED');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;let claim;
 try{const parts=key.split('.');if(parts.length!==3)stop('CREDENTIAL_FORMAT_BLOCKED');claim=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{stop('CREDENTIAL_FORMAT_BLOCKED');}
 // Claims are only an early routing guard. Remote Supabase authenticates JWT.
 if(claim.role!=='service_role'||claim.ref!==QA||!Number.isFinite(claim.exp)||claim.exp*1000<=now()||key===env.SUPABASE_ANON_KEY)stop('CREDENTIAL_PROJECT_BLOCKED');
 let response;
 try{response=await fetcher(`https://${QA}.supabase.co/rest/v1/businesses?select=id&limit=0`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'}});}catch{stop('QA_READ_UNAVAILABLE');}
 if(response.status!==200||!/^application\/json\b/i.test(response.headers.get('content-type')||''))stop('QA_AUTH_OR_READ_BLOCKED');
 // Do not read, log or forward raw error bodies or any business records.
 if(Number(response.headers.get('content-length')||0)>1024)stop('QA_RESPONSE_BLOCKED');
 let body;try{body=await response.text();}catch{stop('QA_RESPONSE_BLOCKED');}
 if(body.length>1024||body.trim()!=='[]')stop('QA_RESPONSE_BLOCKED');
 return {result:'PASS',qaProjectAuthenticated:true,productionRequests:0,readOnly:true,returnedRows:0,ownerOff:true,workerOff:true,mock:true,emails:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await verify(process.env)));}catch(e){console.error(JSON.stringify({result:'BLOCKED',code:e.safeCode||'CHECK_BLOCKED'}));}
 // Intentionally fail the one-off build, even after PASS. No Ready deploy,
 // Functions upload, public endpoint, or publishable diagnostic is produced.
 process.exitCode=78;
}
