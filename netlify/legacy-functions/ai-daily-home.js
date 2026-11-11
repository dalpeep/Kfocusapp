const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  let body={};try{body=JSON.parse(event.body||'{}')}catch(e){return{statusCode:400,headers,body:JSON.stringify({error:'Invalid JSON'})}}
  const items=Array.isArray(body.items)?body.items.slice(0,8):[];
  const fallback={kicker:body.weekend?'주말 생활 제안':'오늘의 생활 제안',summary:'오늘 수집된 생활 정보를 바탕으로 일정을 여유 있게 준비해 보세요.',tip:'외출 전 최신 공지와 행사 시간을 한 번 더 확인하세요.',checklist:['일정 확인'],order:items.map(x=>x.title),source:'생활 패턴 자동 분석'};
  // Public page views must never be an OpenAI generation authority. Daily Core
  // generation is exclusively owned by the authenticated/scheduled refresh path.
  return{statusCode:200,headers,body:JSON.stringify(fallback)};
};
