const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
function outputText(j){return j.output_text||j.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text||'';}
const schema={type:'object',additionalProperties:false,properties:{
  campaign_title:{type:'string'},
  dalpick:{type:'object',additionalProperties:false,properties:{title:{type:'string'},summary:{type:'string'},content:{type:'string'},category:{type:'string'},image_prompt:{type:'string'}},required:['title','summary','content','category','image_prompt']},
  coupon:{type:'object',additionalProperties:false,properties:{title:{type:'string'},discount_label:{type:'string'},description:{type:'string'},coupon_code:{type:'string'},button_label:{type:'string'}},required:['title','discount_label','description','coupon_code','button_label']},
  banner:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},button_label:{type:'string'},image_prompt:{type:'string'}},required:['title','description','button_label','image_prompt']},
  social:{type:'object',additionalProperties:false,properties:{instagram:{type:'string'},facebook:{type:'string'},short_caption:{type:'string'}},required:['instagram','facebook','short_caption']},
  video:{type:'object',additionalProperties:false,properties:{hook:{type:'string'},script:{type:'string'},thumbnail_text:{type:'string'}},required:['hook','script','thumbnail_text']}
},required:['campaign_title','dalpick','coupon','banner','social','video']};
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers,body:''};
  if(event.httpMethod!=='POST')return{statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  try{
    if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY가 없습니다.');
    const b=JSON.parse(event.body||'{}');
    const topic=String(b.topic||'').trim();
    if(!topic)return{statusCode:400,headers,body:JSON.stringify({error:'주제를 입력하세요.'})};
    const business=b.business&&typeof b.business==='object'?b.business:null;
    const prompt=`하나의 주제로 DalTownMap 통합 콘텐츠 캠페인을 작성하세요.\n\n주제: ${topic}\n추가 지시: ${String(b.instructions||'없음')}\n연결 업소: ${business?JSON.stringify(business):'없음'}\n\n요구사항:\n- 모든 문구는 자연스러운 한국어\n- 사실이 주어지지 않은 할인율, 가격, 기간, 의료·법률 효능을 만들지 말 것\n- 쿠폰 정보가 불명확하면 discount_label은 '특별 혜택', coupon_code는 빈 문자열\n- DalPick은 모바일에서 읽기 쉬운 소제목과 짧은 문단, 500~900자\n- 배너 제목 28자 이내, 설명 70자 이내\n- 영상 대본은 약 30~45초\n- 이미지 프롬프트에는 실제 로고나 읽을 수 있는 글자를 만들지 말라고 명시`;
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',input:[{role:'system',content:[{type:'input_text',text:'당신은 달라스 한인 지역 미디어의 광고·콘텐츠 통합 편집장입니다.'}]},{role:'user',content:[{type:'input_text',text:prompt}]}],text:{format:{type:'json_schema',name:'content_suite',strict:true,schema}}})});
    const j=await r.json(); if(!r.ok)throw new Error(j?.error?.message||'AI 요청 실패');
    const t=outputText(j); if(!t)throw new Error('AI 응답이 비어 있습니다.');
    return{statusCode:200,headers,body:JSON.stringify({suite:JSON.parse(t)})};
  }catch(e){console.error(e);return{statusCode:500,headers,body:JSON.stringify({error:e.message||'통합 콘텐츠 생성 오류'})};}
};
