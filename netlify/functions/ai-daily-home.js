const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  let body={};try{body=JSON.parse(event.body||'{}')}catch(e){return{statusCode:400,headers,body:JSON.stringify({error:'Invalid JSON'})}}
  const items=Array.isArray(body.items)?body.items.slice(0,8):[];
  const fallback={kicker:body.weekend?'주말 AI 브리핑':'오늘의 AI 브리핑',summary:items.length?`${items[0].title} 소식을 먼저 확인해 보세요. AI가 최신성과 중요도를 기준으로 오늘의 정보를 자동 선정했습니다.`:'오늘 필요한 달라스 생활 정보를 확인해 보세요.',order:items.map(x=>x.title),source:'자동 점수 엔진'};
  const key=process.env.OPENAI_API_KEY;if(!key)return{statusCode:200,headers,body:JSON.stringify(fallback)};
  try{
    const prompt=`당신은 달라스 한인 생활앱 DalTownMap의 편집 AI입니다. 날짜 ${body.date}. 다음 후보만 근거로 한국어 오늘 브리핑을 작성하세요. 과장하거나 없는 사실을 만들지 마세요. 2문장, 140자 안팎. 중요도 순 제목 배열도 반환하세요. 후보: ${JSON.stringify(items)}. JSON 형식: {"kicker":"...","summary":"...","order":["정확한 제목"...]}`;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.NEWSROOM_OPENAI_MODEL||'gpt-4.1-mini',temperature:.25,response_format:{type:'json_object'},messages:[{role:'user',content:prompt}]})});
    if(!r.ok)throw new Error(`OpenAI ${r.status}`);const j=await r.json();const out=JSON.parse(j.choices?.[0]?.message?.content||'{}');
    return{statusCode:200,headers,body:JSON.stringify({...fallback,...out,source:'AI 자동 생성'})};
  }catch(e){console.error(e);return{statusCode:200,headers,body:JSON.stringify(fallback)}}
};
