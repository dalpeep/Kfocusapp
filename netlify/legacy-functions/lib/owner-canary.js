'use strict';
const values=v=>String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const active=env=>env.OWNER_UUID_CANARY_MODE==='true';
function actorAllowed(id,env=process.env){return !active(env)||values(env.OWNER_NOTIFICATION_ACTORS).includes(String(id).toLowerCase());}
function businessAllowed(id,env=process.env){return !active(env)||values(env.OWNER_NOTIFICATION_BUSINESSES).includes(String(id).toLowerCase());}
function recipientAllowed(email,env=process.env){return !active(env)||values(env.OWNER_NOTIFICATION_RECIPIENTS).includes(String(email).trim().toLowerCase());}
module.exports={active,actorAllowed,businessAllowed,recipientAllowed};
