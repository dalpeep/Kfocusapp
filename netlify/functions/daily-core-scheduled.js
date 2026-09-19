const {ensureDailyCore}=require('./lib/daily-core');
const dallasTime=require('../../assets/dallas-time.js');

const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, no-cache, must-revalidate'
};

function audit(event,details={}){
  console.info('[daily-core-scheduled]',JSON.stringify({
    event,
    dallas_date:dallasTime.dateKey(),
    ...details
  }));
}

exports.handler=async function(){
  const region=String(process.env.DAILY_CORE_SCHEDULE_REGION||process.env.APP_REGION||'dallas').toLowerCase();
  try{
    audit('scheduled_invocation_received',{region});
    const result=await ensureDailyCore(region,{force:false});
    audit('generation_check_completed',{
      region,
      generated:Boolean(result?.generated),
      locked:Boolean(result?.locked),
      missing:Array.isArray(result?.missing)?result.missing:[],
      saved:Array.isArray(result?.saved)?result.saved.map(row=>({category:row.category,id:row.id,action:row.action})):[]
    });
    return {statusCode:200,headers,body:JSON.stringify(result)};
  }catch(error){
    console.error('[daily-core-scheduled]',JSON.stringify({
      event:'scheduled_invocation_failed',
      dallas_date:dallasTime.dateKey(),
      stage:error?.dailyCoreStage||'handler',
      message:error?.message||String(error)
    }));
    return {statusCode:500,headers,body:JSON.stringify({ok:false,error:'Daily Core scheduled refresh failed.'})};
  }
};

// Netlify makes a function with a schedule configuration unavailable through
// its public function URL. This platform boundary is the scheduler authority;
// daily-core-refresh remains the separately authenticated recovery endpoint.
exports.config={schedule:'15 11 * * *'};
