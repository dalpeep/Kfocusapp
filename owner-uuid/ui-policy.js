(()=>{'use strict';
// Only server-returned capabilities decide presentation; internal tiers stay unchanged.
const subscriber=p=>p?.images===true&&p?.custom_image===true&&p?.free_description===false;
window.OwnerUiPolicy=Object.freeze({subscriber,label:p=>subscriber(p)?'구독 사용자':'기본 사용자'});
})();
