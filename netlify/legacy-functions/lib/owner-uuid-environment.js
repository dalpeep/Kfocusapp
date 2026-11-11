'use strict';
// Production-only guard. The existing QA implementation is kept separately.
const TARGET=Object.freeze({ref:'ydrxuqmjzayejlnjzzew',site:'e2667e40-0999-42a3-892b-2b2edff61434',origin:'https://daltownmap.com'});
// Public access is an explicit rollout setting, never the default.
// Existing Canary deployments keep their reviewed allowlists when mode is omitted.
function accessMode(env){
 const mode=env.OWNER_UUID_ACCESS_MODE;
 if(mode==='phase1'&&env.OWNER_UUID_CANARY_MODE==='true')return 'phase1';
 if(mode==='public'&&env.OWNER_UUID_CANARY_MODE==='false')return 'public';
 if((mode===undefined||mode==='canary')&&env.OWNER_UUID_CANARY_MODE==='true'
 &&[env.OWNER_NOTIFICATION_ACTORS,env.OWNER_NOTIFICATION_BUSINESSES].every(v=>typeof v==='string'&&v.split(',').every(x=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x.trim()))))return 'canary';
 throw Error('Owner access mode mismatch');
}
function requireOwnerUuidEnvironment(env=process.env,{allowPhase1=false}={}){
 const mode=accessMode(env);
 if(mode==='phase1'&&!allowPhase1)throw Error('Owner feature outside phase 1');
 if(env.OWNER_COUPON_PROTOCOL!=='v2'||env.OWNER_UUID_ENABLED!=='true'||env.OWNER_UUID_ENV!=='production'
 ||env.OWNER_UUID_PROJECT_REF!==TARGET.ref||env.SUPABASE_URL!==`https://${TARGET.ref}.supabase.co`
 ||env.SITE_ID!==TARGET.site||env.URL!==TARGET.origin||env.OWNER_UUID_ORIGIN!==TARGET.origin
 ||(env.CONTEXT&&env.CONTEXT!=='production'))throw Error('Owner environment mismatch');
 const key=env.SUPABASE_SERVICE_ROLE_KEY||'';let claim;
 try{claim=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));}catch{throw Error('Owner credential mismatch');}
 // Routing validation only: Supabase validates the credential signature on API use.
 if(claim.role!=='service_role'||claim.ref!==TARGET.ref||key===env.SUPABASE_ANON_KEY)throw Error('Owner credential mismatch');
 return mode;
}
module.exports={requireOwnerUuidEnvironment,TARGET};
