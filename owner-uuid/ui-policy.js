(()=>{'use strict';
// Only server-returned capabilities decide presentation; internal tiers stay unchanged.
const subscriber=p=>p?.premium_preparing!==true&&p?.images===true&&p?.custom_image===true&&p?.free_description===false;
window.OwnerUiPolicy=Object.freeze({subscriber,label:p=>p?.subscription_plan==='PREMIUM'&&p?.premium_preparing!==true?'PREMIUM · 유료 서비스':'STANDARD · 무료 서비스'});
})();
