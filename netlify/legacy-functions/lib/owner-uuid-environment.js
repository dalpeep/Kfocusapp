'use strict';
// Production-only guard. The existing QA implementation is kept separately.
const TARGET=Object.freeze({ref:'ydrxuqmjzayejlnjzzew',site:'e2667e40-0999-42a3-892b-2b2edff61434',origin:'https://daltownmap.com'});
function requireOwnerUuidEnvironment(env=process.env){
 if(env.OWNER_COUPON_PROTOCOL!=='v2'||env.OWNER_UUID_ENABLED!=='true'||env.OWNER_UUID_ENV!=='production'
 ||env.OWNER_UUID_PROJECT_REF!==TARGET.ref||env.SUPABASE_URL!==`https://${TARGET.ref}.supabase.co`
 ||env.SITE_ID!==TARGET.site||env.URL!==TARGET.origin||env.OWNER_UUID_ORIGIN!==TARGET.origin
 ||(env.CONTEXT&&env.CONTEXT!=='production'))throw Error('Owner environment mismatch');
 const key=env.SUPABASE_SERVICE_ROLE_KEY||'';let claim;
 try{claim=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));}catch{throw Error('Owner credential mismatch');}
 // Routing validation only: Supabase validates the credential signature on API use.
 if(claim.role!=='service_role'||claim.ref!==TARGET.ref||key===env.SUPABASE_ANON_KEY)throw Error('Owner credential mismatch');
}
module.exports={requireOwnerUuidEnvironment,TARGET};
