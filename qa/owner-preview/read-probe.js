(function(root){'use strict';
const QA='hseaeafmmjnbynfyynao',SITE='ec0bc146-8184-4627-90e0-df82ec2b06f9';
const mapping=Object.freeze({owner:'f0d9e283-63d1-4504-86a4-3a42c11cd789',admin:'c4362c18-61ca-4799-9315-56f216b60d02',own:'067b41b5-74fc-4fe8-89a5-481a22a00d2b',foreign:'0cd6b01e-a59b-4e1f-a546-a4ac38413ff5'});
// Mapping is a prior QA snapshot, not proof of current ownership or privilege.
async function run({client,config,origin,request,report}){
 const stop=()=>{throw Error('QA_READ_PROBE_STOP');};
 if(config.site!==SITE||config.project!==QA||config.context!=='deploy-preview'||config.pr!==55||!/^[a-f0-9]{40}$/.test(config.commit||'')||origin!=='https://deploy-preview-55--daltownmap-owner-uuid-qa.netlify.app'||config.origin!==origin||client.supabaseUrl?.replace(/\/$/,'')!==`https://${QA}.supabase.co`||![mapping.owner,mapping.admin].every(x=>config.actors?.includes(x))||![mapping.own,mapping.foreign].every(x=>config.businesses?.includes(x)))stop();
 const {data,error}=await client.auth.getSession(),session=data?.session;
 if(error||!session||![mapping.owner,mapping.admin].includes(session.user?.id)||typeof session.access_token!=='string'||!session.access_token)stop();
 const role=session.user.id===mapping.owner?'owner':'admin';
 // Token stays in this closure. No logging, storage export, retries or arbitrary URLs.
 async function call(label,path,body,expected,accept){
  let response;
  try{response=await request(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{report({case:label,http:null,result:'FAIL',code:'TRANSPORT_BLOCKED'});stop();}
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  let json;try{if(response.redirected||type!=='application/json')throw Error();json=await response.json();}catch{report({case:label,http:response.status,result:'FAIL',code:'NOT_JSON_API'});stop();}
  const pass=response.status===expected&&accept(json);
  report({case:label,http:response.status,result:pass?'PASS':'FAIL',code:pass?'EXPECTED_PERMISSION_RESULT':'UNEXPECTED_PERMISSION_RESULT'});
  if(!pass)stop();return json;
 }
 const listing=await call('mapping_'+role,'/.netlify/functions/owner-portal-uuid',null,200,j=>j.ok===true&&Array.isArray(j.result?.businesses)&&j.result.is_admin===(role==='admin'));
 if(role==='owner'){
  const ids=listing.result.businesses.map(x=>x.id);
  if(!ids.includes(mapping.own)||ids.includes(mapping.foreign)){report({case:'ownership_snapshot',http:200,result:'FAIL',code:'MAPPING_DRIFT'});stop();}
  await call('own_detail','/.netlify/functions/owner-content-uuid?business_id='+mapping.own,null,200,j=>j.ok===true&&j.result?.business?.id===mapping.own);
  await call('foreign_detail','/.netlify/functions/owner-content-uuid?business_id='+mapping.foreign,null,403,j=>j.code==='OWNER_CONTENT_FORBIDDEN'&&!j.result&&!j.business&&!j.coupons&&!j.events);
  await call('owner_admin_read','/.netlify/functions/owner-account-uuid',{action:'plan_read',business_id:mapping.own},403,j=>j.code==='OWNER_ACCOUNT_FORBIDDEN'&&!j.result);
 }else{
  await call('admin_plan_read','/.netlify/functions/owner-account-uuid',{action:'plan_read',business_id:mapping.own},200,j=>j.ok===true&&j.result?.business_id===mapping.own);
 }
 return {result:'PASS',role};
}
function mount({client,config,parent}){
 const section=document.createElement('section'),heading=document.createElement('h2'),button=document.createElement('button'),output=document.createElement('pre');
 heading.textContent='QA 읽기 전용 권한 검사';button.type='button';button.textContent='현재 QA 계정으로 읽기 검사 1회';
 section.append(heading,button,output);parent.append(section);
 button.onclick=async()=>{button.disabled=true;const report=row=>{output.textContent+=JSON.stringify(row)+'\n';};try{await run({client,config,origin:location.origin,request:window.fetch.bind(window),report});}catch{output.textContent+='QA_READ_PROBE_STOP\n';}};
}
const api={run,mount,mapping};if(typeof module==='object'&&module.exports)module.exports=api;else root.QaOwnerReadProbe=Object.freeze({mount});
})(typeof window==='object'?window:{});
