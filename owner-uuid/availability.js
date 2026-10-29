(()=>{'use strict';
window.OwnerAvailability=Object.freeze({async start({check=fetch,createClient,ready,disabled}){
 try{const r=await check('/.netlify/functions/owner-portal-uuid',{method:'GET',cache:'no-store',credentials:'omit'});if(r.status!==401||!r.headers.get('content-type')?.includes('application/json')){disabled(r.status===503?'disabled':'unavailable');return false;}const body=await r.json();if(body?.ok!==false||typeof body.error!=='string'){disabled('unavailable');return false;}await ready(createClient());return true;}catch{disabled('unavailable');return false;}
}});
})();
