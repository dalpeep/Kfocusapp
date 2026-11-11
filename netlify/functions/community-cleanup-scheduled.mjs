import cleanupLib from './lib/community-cleanup.js';
export default async function(){try{const result=await cleanupLib.cleanup(new Date());console.info('[community-cleanup]',JSON.stringify({event:'completed',...result}));return new Response(JSON.stringify({ok:true,...result}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}catch(error){console.error('[community-cleanup]',JSON.stringify({event:'failed',message:error?.message||String(error)}));return new Response(JSON.stringify({ok:false,error:'Community cleanup failed.'}),{status:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}}
// Separate authority; existing raffle/newsroom/Daily Core schedules remain untouched.
export const config={schedule:'30 9 * * *'};
