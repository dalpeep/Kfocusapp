// Explicit Test admin invocation only. No schedule export; use the canonical draw RPC.
const {requireTestPreview}=require('../functions/lib/test-preview-guard');
const winner=require('../functions/event-winner-admin');
exports.handler=async event=>{
  requireTestPreview();
  if(event.httpMethod!=='POST')return {statusCode:405,body:JSON.stringify({ok:false,error:'POST only'})};
  let body;
  try{body=JSON.parse(event.body||'{}')}catch{return {statusCode:400,body:'{"ok":false}'}}
  // event-winner-admin verifies the administrator, UUID, count and raffle mode.
  return winner.handler({...event,body:JSON.stringify({...body,action:'draw'})});
};
