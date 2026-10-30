'use strict';
const {QA,SITE}=require('./runtime.cjs');
const actor='10000000-0000-4000-8000-000000000001',business='20000000-0000-4000-8000-000000000001';
// Deliberately unsigned routing fixtures, never accepted as authentication evidence.
const key=role=>'fixture.'+Buffer.from(JSON.stringify({ref:QA,role})).toString('base64url')+'.unsigned';
function fixture(){const seal={buildApproved:true,runtimeApproved:true,site:SITE,project:QA,pr:999,head:'dev/owner-qa-synthetic',commit:'a'.repeat(40),actors:[actor],businesses:[business]};const env={URL:'https://daltownmap-owner-uuid-qa.netlify.app',SITE_ID:SITE,SUPABASE_URL:`https://${QA}.supabase.co`,OWNER_UUID_PROJECT_REF:QA,CONTEXT:'deploy-preview',NETLIFY:'true',PULL_REQUEST:'true',REVIEW_ID:'999',HEAD:seal.head,BRANCH:'pull/999/head',COMMIT_REF:seal.commit,DEPLOY_PRIME_URL:'https://deploy-preview-999--daltownmap-owner-uuid-qa.netlify.app',OWNER_UUID_ORIGIN:'https://deploy-preview-999--daltownmap-owner-uuid-qa.netlify.app',OWNER_UUID_ENABLED:'true',OWNER_UUID_ENV:'qa',OWNER_COUPON_PROTOCOL:'v2',OWNER_UUID_CANARY_MODE:'true',OWNER_NOTIFICATION_ACTORS:actor,OWNER_NOTIFICATION_BUSINESSES:business,OWNER_NOTIFICATION_WORKER_ENABLED:'false',OWNER_NOTIFICATION_MODE:'mock',SUPABASE_ANON_KEY:key('anon'),SUPABASE_SERVICE_ROLE_KEY:key('service_role')};return {env,seal};}
module.exports={fixture,key,actor,business};
