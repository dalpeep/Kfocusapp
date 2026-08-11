const {ensureDailyCore}=require('./lib/daily-core');
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate','Access-Control-Allow-Origin':'*'};
exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS')return {statusCode:200,headers,body:JSON.stringify({ok:true})};
  try{
    const region=String(event.queryStringParameters?.region||'dallas').toLowerCase();
    const force=String(event.queryStringParameters?.force||'')==='1';
    const result=await ensureDailyCore(region,{force});
    return {statusCode:200,headers,body:JSON.stringify(result)};
  }catch(error){
    console.error('[daily-core-refresh]',error);
    return {statusCode:500,headers,body:JSON.stringify({ok:false,error:error?.message||String(error)})};
  }
};
exports.config={schedule:'15 11 * * *'}; // 06:15 Dallas during CDT
