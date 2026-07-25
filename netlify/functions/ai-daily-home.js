const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  let body={};try{body=JSON.parse(event.body||'{}')}catch(e){return{statusCode:400,headers,body:JSON.stringify({error:'Invalid JSON'})}}
  const items=Array.isArray(body.items)?body.items.slice(0,8):[];
  const fallback={kicker:body.weekend?'주말 생활 제안':'오늘의 생활 제안',summary:'오늘 수집된 생활 정보를 바탕으로 일정을 여유 있게 준비해 보세요.',tip:'외출 전 최신 공지와 행사 시간을 한 번 더 확인하세요.',checklist:['일정 확인'],order:items.map(x=>x.title),source:'생활 패턴 자동 분석'};
  const key=process.env.OPENAI_API_KEY;if(!key)return{statusCode:200,headers,body:JSON.stringify(fallback)};
  try{
    const prompt=`당신은 달라스 한인 생활앱 DalTownMap의 생활 도우미입니다. 날짜 ${body.date}. 제공된 수집 정보만 참고해 기사 제목을 복사하거나 특정 게시물을 홍보하지 말고, 사용자가 오늘 어떻게 행동하면 좋은지 한국어 생활 제안으로 작성하세요. 링크나 '클릭하세요' 표현은 쓰지 마세요. 날씨·안전·교통·공연·스포츠·마트 세일·한인 행사·은행 및 금융 공지 같은 신호가 있으면 부드러운 생활 제안으로 바꾸세요. 금융 정보는 수익을 약속하거나 특정 상품을 권하지 말고, 조건과 날짜를 확인해 볼 수 있다는 정도로 중립적으로 표현하세요. 사실을 만들지 말고 근거가 부족하면 일반적인 일정 확인 안내만 하세요. summary는 2~3문장, tip은 안전하고 구체적인 1문장, checklist는 1~3개의 짧은 준비물/확인사항입니다. 중요도 순 제목 배열도 반환하세요. 후보: ${JSON.stringify(items)}. JSON 형식: {"kicker":"생활 패턴 · 생활 제안","summary":"...","tip":"...","checklist":["..."],"order":["정확한 제목"...]}`;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.NEWSROOM_OPENAI_MODEL||'gpt-4.1-mini',temperature:.25,response_format:{type:'json_object'},messages:[{role:'user',content:prompt}]})});
    if(!r.ok)throw new Error(`OpenAI ${r.status}`);const j=await r.json();const out=JSON.parse(j.choices?.[0]?.message?.content||'{}');
    return{statusCode:200,headers,body:JSON.stringify({...fallback,...out,source:'AI 생활 제안'})};
  }catch(e){console.error(e);return{statusCode:200,headers,body:JSON.stringify(fallback)}}
};
