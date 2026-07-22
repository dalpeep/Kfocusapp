const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const typeNames = { local_info:'지역 정보', lifestyle:'생활 정보', themed:'테마 추천', recommended:'추천 업소', new_business:'신규 업소', coupon:'쿠폰', event:'행사', business_story:'업소탐방' };
function outputText(json){ return json.output_text || json.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text || ''; }
async function ask({name,schema,system,prompt}){
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',input:[{role:'system',content:[{type:'input_text',text:system}]},{role:'user',content:[{type:'input_text',text:prompt}]}],text:{format:{type:'json_schema',name,strict:true,schema}}})});
  const j=await r.json(); if(!r.ok) throw new Error(j?.error?.message||'AI 요청 실패'); const t=outputText(j); if(!t) throw new Error('AI 응답이 비어 있습니다.'); return JSON.parse(t);
}
const planSchema={type:'object',additionalProperties:false,properties:{intent_type:{type:'string'},user_goal:{type:'string'},must_cover:{type:'array',items:{type:'string'}},must_avoid:{type:'array',items:{type:'string'}},outline:{type:'array',items:{type:'string'}}},required:['intent_type','user_goal','must_cover','must_avoid','outline']};
const articleSchema={type:'object',additionalProperties:false,properties:{title:{type:'string'},summary:{type:'string'},content:{type:'string'},image_search_keywords:{type:'string'}},required:['title','summary','content','image_search_keywords']};
const reviewSchema={type:'object',additionalProperties:false,properties:{score:{type:'integer'},intent_match:{type:'integer'},problems:{type:'array',items:{type:'string'}},revised_article:articleSchema},required:['score','intent_match','problems','revised_article']};
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers,body:''};
  if(event.httpMethod!=='POST')return{statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  try{
    if(!process.env.OPENAI_API_KEY)throw new Error('Netlify 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.');
    const b=JSON.parse(event.body||'{}'); const topic=String(b.topic||'').trim(); const category=String(b.category||'local_info'); const instructions=String(b.instructions||'').trim(); const business=b.business&&typeof b.business==='object'?b.business:null; const sources=Array.isArray(b.sources)?b.sources.map(v=>String(v).trim()).filter(Boolean):[];
    if(!topic)return{statusCode:400,headers,body:JSON.stringify({error:'주제를 입력하세요.'})};
    const plan=await ask({name:'dalpick_intent_plan',schema:planSchema,system:'사용자 요청의 목적을 분류하고 주제 이탈을 막는 콘텐츠 기획자입니다.',prompt:`주제: ${topic}\n유형: ${typeNames[category]||category}\n추가 지시: ${instructions||'없음'}\n\n특징·장점·비교 요청은 절차형으로 바꾸지 마세요. 방법·신청·등록이 명시된 경우에만 절차형으로 분류하세요. 반드시 포함/제외 항목과 개요를 만드세요.`});
    const businessText=business?`업소명:${business.name||''}\n업종:${business.category||''}\n지역:${business.city||''}\n설명:${business.description||''}`:'연결 업소 없음';
    const draft=await ask({name:'dalpick_draft',schema:articleSchema,system:'달라스 지역 미디어의 정확하고 실용적인 한국어 편집자입니다. 기획서의 의도를 최우선으로 따릅니다.',prompt:`사용자 요청: ${topic}\n콘텐츠 유형: ${typeNames[category]||category}\n목표: ${plan.user_goal}\n반드시 포함: ${plan.must_cover.join(' / ')}\n반드시 제외: ${plan.must_avoid.join(' / ')}\n개요: ${plan.outline.join(' > ')}\n${businessText}\n출처: ${sources.join(' / ')||'제공 없음'}\n\n500~900자, 모바일용 짧은 문단과 소제목. 연결 업소가 없으면 업체를 만들지 마세요. 사용자가 원하지 않은 등록 방법·준비물·절차를 습관적으로 넣지 마세요. title 45자, summary 140자 이내.`});
    const review=await ask({name:'dalpick_review',schema:reviewSchema,system:'사용자 의도 불일치를 찾아 자동 수정하는 엄격한 편집장입니다.',prompt:`사용자 요청:${topic}\n목표:${plan.user_goal}\n포함:${plan.must_cover.join(' / ')}\n제외:${plan.must_avoid.join(' / ')}\n초안:${JSON.stringify(draft)}\n\n100점으로 채점하고 85점 미만이면 완전히 고쳐 쓰세요. revised_article은 항상 최종 완성본 전체를 반환하세요.`});
    return{statusCode:200,headers,body:JSON.stringify({article:review.revised_article,quality:{score:review.score,intent_match:review.intent_match,problems:review.problems,intent_type:plan.intent_type}})};
  }catch(error){console.error('generate-dalpick error',error);return{statusCode:500,headers,body:JSON.stringify({error:error.message||'AI 글 생성 오류'})};}
};
