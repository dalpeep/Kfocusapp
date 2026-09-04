const {ensureDailyCore}=require('./lib/daily-core');
const crypto=require('crypto');
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate','Access-Control-Allow-Origin':'*'};
function dallasDate(){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date());
}
function audit(event,details={}){
  console.info('[daily-core-refresh]',JSON.stringify({event,dallas_date:dallasDate(),...details}));
}
function safeEqual(left,right){
  const a=Buffer.from(String(left||''));
  const b=Buffer.from(String(right||''));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function scheduledInvocation(event){
  try{return Boolean(JSON.parse(event.body||'{}')?.next_run);}catch{return false;}
}
function manualAuthorized(event){
  const secret=String(process.env.DAILY_CORE_REFRESH_SECRET||'').trim();
  if(!secret)return false;
  const authorization=String(event.headers?.authorization||event.headers?.Authorization||'');
  const bearer=authorization.replace(/^Bearer\s+/i,'').trim();
  const headerToken=String(event.headers?.['x-daily-core-token']||event.headers?.['X-Daily-Core-Token']||'').trim();
  return safeEqual(bearer||headerToken,secret);
}
exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS')return {statusCode:200,headers,body:JSON.stringify({ok:true})};
  try{
    const scheduled=scheduledInvocation(event);
    const authorized=manualAuthorized(event);
    audit('invocation_received',{
      scheduled,
      source:scheduled?'scheduled':authorized?'authorized_manual':'unauthorized',
      method:String(event.httpMethod||'')
    });
    if(!scheduled&&!authorized){
      audit('invocation_denied',{scheduled,reason:'not_scheduled_or_authorized'});
      return {statusCode:403,headers,body:JSON.stringify({ok:false,error:'Daily Core refresh is restricted.'})};
    }
    const region=String(event.queryStringParameters?.region||'dallas').toLowerCase();
    // 스케줄 실행은 항상 누락분만 생성합니다. 강제 재생성은 인증된 수동 요청에서만 허용합니다.
    const force=!scheduled&&authorized&&String(event.queryStringParameters?.force||'')==='1';
    audit('generation_check_started',{scheduled,region,force});
    const result=await ensureDailyCore(region,{force});
    audit('generation_check_completed',{
      scheduled,region,force,
      generated:Boolean(result?.generated),
      locked:Boolean(result?.locked),
      missing:Array.isArray(result?.missing)?result.missing:[],
      saved:Array.isArray(result?.saved)?result.saved.map(row=>({category:row.category,id:row.id,action:row.action})):[]
    });
    return {statusCode:200,headers,body:JSON.stringify(result)};
  }catch(error){
    console.error('[daily-core-refresh]',JSON.stringify({
      event:'invocation_failed',
      dallas_date:dallasDate(),
      stage:error?.dailyCoreStage||'handler',
      message:error?.message||String(error)
    }));
    return {statusCode:500,headers,body:JSON.stringify({ok:false,error:error?.message||String(error)})};
  }
};
exports.config={schedule:'15 11 * * *'}; // 06:15 Dallas during CDT
