// Offline-reviewed, build-only verifier. Never publish as a Function or webpage.
import {pathToFileURL} from 'node:url';
const QA='hseaeafmmjnbynfyynao',PROD='ydrxuqmjzayejlnjzzew';
const SITE='ec0bc146-8184-4627-90e0-df82ec2b06f9';
const CODES=new Set(['NETLIFY_BLOCKED','CONTEXT_BLOCKED','SITE_BLOCKED','PR_BUILD_BLOCKED','REVIEW_BLOCKED','HEAD_BLOCKED','CHECKOUT_REF_BLOCKED','COMMIT_BLOCKED','APPROVAL_BLOCKED','OWNER_MODE_BLOCKED','WORKER_MODE_BLOCKED','MOCK_MODE_BLOCKED','PROVIDER_CREDENTIAL_BLOCKED','QA_TARGET_BLOCKED','KEY_FORMAT_BLOCKED','KEY_PROJECT_BLOCKED','QA_AUTH_UNAVAILABLE','QA_AUTH_BLOCKED','QA_RESPONSE_BLOCKED']);
export function diagnostic(error){
 const checks={};
 for(const [k,v]of Object.entries(error?.checks||{}))if(typeof v==='boolean'&&CHECK_NAMES.has(k))checks[k]=v;
 return {result:'BLOCKED',code:CODES.has(error?.safeCode)?error.safeCode:'CHECK_BLOCKED',checks};
}
const CHECK_NAMES=new Set(['netlify','context','site','pullRequest','review','head','checkoutRef','commit','approved','ownerOff','workerOff','mock','providerCredentialsAbsent','qaTarget','keyFormat','keyProject','qaAuthenticated','emptyResponse']);
export async function verify(env,{fetcher=fetch,now=()=>Date.now()}={}){
 const checks={};
 function check(name,ok,code){checks[name]=!!ok;if(!ok)throw Object.assign(new Error(code),{safeCode:code,checks:{...checks}});}
 check('netlify',env.NETLIFY==='true','NETLIFY_BLOCKED');
 check('context',env.CONTEXT==='deploy-preview','CONTEXT_BLOCKED');
 check('site',env.SITE_ID===SITE,'SITE_BLOCKED');
 check('pullRequest',env.PULL_REQUEST==='true','PR_BUILD_BLOCKED');
 const review=env.REVIEW_ID;
 check('review',/^[1-9]\d*$/.test(env.QA_KEY_CHECK_REVIEW_ID||'')&&review===env.QA_KEY_CHECK_REVIEW_ID,'REVIEW_BLOCKED');
 // HEAD is the source branch. BRANCH is the checkout reference, not HEAD.
 check('head',/^dev\/qa-key-verifier-[a-z0-9-]+$/.test(env.QA_KEY_CHECK_HEAD||'')&&env.HEAD===env.QA_KEY_CHECK_HEAD,'HEAD_BLOCKED');
 check('checkoutRef',env.BRANCH===`pull/${review}/head`||env.BRANCH===`refs/pull/${review}/head`,'CHECKOUT_REF_BLOCKED');
 check('commit',/^[a-f0-9]{40}$/.test(env.QA_KEY_CHECK_COMMIT||'')&&env.COMMIT_REF===env.QA_KEY_CHECK_COMMIT,'COMMIT_BLOCKED');
 check('approved',env.QA_KEY_CHECK_ONCE==='true','APPROVAL_BLOCKED');
 check('ownerOff',env.OWNER_UUID_ENABLED==='false','OWNER_MODE_BLOCKED');
 check('workerOff',env.OWNER_NOTIFICATION_WORKER_ENABLED==='false','WORKER_MODE_BLOCKED');
 check('mock',env.OWNER_NOTIFICATION_MODE==='mock','MOCK_MODE_BLOCKED');
 check('providerCredentialsAbsent',!Object.entries(env).some(([k,v])=>v&&/(?:RESEND.*(?:KEY|TOKEN)|ONESIGNAL.*(?:KEY|TOKEN)|SENDGRID.*KEY|SMTP.*(?:PASS|TOKEN)|MAILGUN.*KEY)/i.test(k)),'PROVIDER_CREDENTIAL_BLOCKED');
 check('qaTarget',QA!==PROD&&env.SUPABASE_URL===`https://${QA}.supabase.co`,'QA_TARGET_BLOCKED');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;let claim;
 try{const parts=key.split('.');if(parts.length!==3)throw Error();claim=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{check('keyFormat',false,'KEY_FORMAT_BLOCKED');}
 check('keyFormat',!!claim&&typeof claim==='object','KEY_FORMAT_BLOCKED');
 // Local claims only guard routing. Supabase authenticates the signature.
 check('keyProject',claim.ref===QA&&claim.role==='service_role'&&Number.isFinite(claim.exp)&&claim.exp*1000>now()&&key!==env.SUPABASE_ANON_KEY,'KEY_PROJECT_BLOCKED');
 let response;
 try{response=await fetcher(`https://${QA}.supabase.co/rest/v1/businesses?select=id&limit=0`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'}});}catch{check('qaAuthenticated',false,'QA_AUTH_UNAVAILABLE');}
 check('qaAuthenticated',response.status===200&&/^application\/json\b/i.test(response.headers.get('content-type')||''),'QA_AUTH_BLOCKED');
 check('emptyResponse',Number(response.headers.get('content-length')||0)<=1024,'QA_RESPONSE_BLOCKED');
 let body;try{body=await response.text();}catch{check('emptyResponse',false,'QA_RESPONSE_BLOCKED');}
 check('emptyResponse',body.length<=1024&&body.trim()==='[]','QA_RESPONSE_BLOCKED');
 return {result:'PASS',checks,readOnly:true,authenticationRequests:1,returnedRows:0,productionRequests:0,storageRequests:0,emails:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await verify(process.env)));}catch(error){console.error(JSON.stringify(diagnostic(error)));}
 // Always stop before artifact deployment, even after successful authentication.
 process.exitCode=78;
}
