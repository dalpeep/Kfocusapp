'use strict';
const {assessBuild}=require('./runtime.cjs');
const {SITE,QA,PR,HEAD}=require('./build-only.cjs');
const CANARY_KEY='OWNER_QA_CANARY_APPROVAL',OFF_KEY='OWNER_QA_BUILD_ONLY_APPROVAL';
const FIELDS=['buildApproved','runtimeApproved','serviceAuthenticationApproved','execution','site','project','pr','head','commit','actors','businesses'];
const configured=value=>value!==undefined&&value!=='';
function canaryApproval(env){try{return JSON.parse(env[CANARY_KEY]||'');}catch{return null;}}
function runtimeApproval(seal){return Object.fromEntries(['buildApproved','runtimeApproved','site','project','pr','head','commit','actors','businesses'].map(k=>[k,seal?.[k]]));}
function assessCanary(env,seal=canaryApproval(env)){
 const schema=!!seal&&typeof seal==='object'&&!Array.isArray(seal)&&Object.keys(seal).length===FIELDS.length&&FIELDS.every(k=>Object.hasOwn(seal,k));
 const prior=assessBuild(env,runtimeApproval(seal));
 const checks={...prior.checks,schema,exactPr:seal?.pr===PR,exactHead:seal?.head===HEAD,
  exactSite:seal?.site===SITE,exactProject:seal?.project===QA,
  runtimeSiteUrl:env.URL==='https://daltownmap-owner-uuid-qa.netlify.app',
  privateAuthenticationApproved:seal?.serviceAuthenticationApproved===true,
  execution:seal?.execution==='owner-canary',
  noCompetingApproval:!configured(env[OFF_KEY])&&!configured(env.OWNER_QA_PREVIEW_APPROVAL)};
 const failed=Object.keys(checks).filter(k=>checks[k]!==true);
 return {allowed:failed.length===0,code:failed.length?'QA_CANARY_APPROVAL_BLOCKED':'QA_CANARY_METADATA_MATCH',checks,failed,authentication:'NOT TESTED'};
}
function select(env){
 try{
  if(configured(env[CANARY_KEY]))return assessCanary(env).allowed?'canary':null;
  if(configured(env.OWNER_QA_PREVIEW_APPROVAL))return null;
  return require('./build-only-ignore.cjs').shouldBuild(env)?'build-only':null;
 }catch{return null;}
}
async function run(env=process.env,builders,diagnostic=()=>{}){
 const mode=select(env);if(!mode){diagnostic('PREFLIGHT',{allowed:false});throw Error('QA_PREVIEW_APPROVAL_BLOCKED');}
 if(mode==='build-only')return (builders?.off||require('./build-only.cjs').main)(env,diagnostic);
 diagnostic('PREFLIGHT',{allowed:true});
 const scoped={...env,OWNER_QA_PREVIEW_APPROVAL:JSON.stringify(runtimeApproval(canaryApproval(env)))};
 return (builders?.canary||require('./canary-build.cjs').main)(scoped);
}
module.exports={CANARY_KEY,OFF_KEY,canaryApproval,runtimeApproval,assessCanary,select,run};
