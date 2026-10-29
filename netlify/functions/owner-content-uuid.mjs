import legacy from '../legacy-functions/owner-content-uuid.js';
import { adapt } from '../migration/adapter.mjs';
const run=adapt(legacy.handler);
export default (request,context)=>process.env.OWNER_UUID_ENABLED!=='true'?new Response(JSON.stringify({error:'OWNER_DISABLED'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}}):run(request,context);
