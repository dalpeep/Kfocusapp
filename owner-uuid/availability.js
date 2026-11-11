(()=>{
'use strict';

window.OwnerAvailability=Object.freeze({
 async start({check=fetch,createClient,ready,disabled,allowQaLogin=false}){
  try{
   const response=await check('/.netlify/functions/owner-portal-uuid',{
    method:'GET',cache:'no-store',credentials:'same-origin',redirect:'error',
   });
   if(!response.headers.get('content-type')?.includes('application/json')){
    disabled('unavailable');
    return false;
   }
   const body=await response.json();
   const qaLoginOnly=allowQaLogin&&response.status===503&&body?.phase1===true&&body.code==='OWNER_QA_PILOT_OFF';
   if((response.status!==401&&!qaLoginOnly)||body?.ok!==false||typeof body.error!=='string'){
    disabled(response.status===503?'disabled':'unavailable');
    return false;
   }
   await ready(createClient(),body.phase1===true,qaLoginOnly);
   return true;
  }catch{
   disabled('unavailable');
   return false;
  }
 }
});
})();
