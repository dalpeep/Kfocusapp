const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
const categoryNames={driving:'운전·차량',health:'병원·보험',education:'학교·교육',business:'세금·비즈니스',housing:'주거·생활',immigration:'비자·여권'};
function outputText(json){return json.output_text||json.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text||'';}
async function callResponses(payload){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),24000);
  try{const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await res.json();if(!res.ok)throw new Error(json?.error?.message||`OpenAI 오류 ${res.status}`);return json;}
  catch(e){if(e.name==='AbortError')throw new Error('기사 작성이 24초 안에 끝나지 않았습니다. 후보 수를 줄여 다시 시도해 주세요.');throw e;}finally{clearTimeout(timer);}
}
const articleSchema={type:'object',additionalProperties:false,properties:{title:{type:'string'},summary:{type:'string'},content:{type:'string'},author_name:{type:'string'},link_label:{type:'string'},source_url:{type:'string'}},required:['title','summary','content','author_name','link_label','source_url']};
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers,body:''};
  if(event.httpMethod!=='POST')return{statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  try{
    if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY가 필요합니다.');
    const body=JSON.parse(event.body||'{}');
    const topic=String(body.topic||'').trim(); const category=String(body.category||'driving'); const instructions=String(body.instructions||'').trim();
    const selected=Array.isArray(body.selected_candidates)?body.selected_candidates:[];
    if(!topic)return{statusCode:400,headers,body:JSON.stringify({error:'작성 주제를 입력하세요.'})};
    if(!selected.length)return{statusCode:400,headers,body:JSON.stringify({error:'먼저 검색 후보를 찾고 기사에 사용할 후보를 선택하세요.'})};
    const evidence=selected.map((c,i)=>`[선택 후보 ${i+1}]\n이름: ${c.place?.name||c.name}\n주소: ${c.place?.address||'확인되지 않음'}\n전화: ${c.place?.phone||'확인되지 않음'}\n웹사이트: ${c.place?.website||'없음'}\nGoogle 지도: ${c.place?.google_maps_url||'없음'}\n전문분야: ${c.specialty||''}\n필수조건 근거: ${c.qualifier_evidence||''}\n근거 URL: ${(c.source_urls||[]).join(', ')}`).join('\n\n');
    const response=await callResponses({
      model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
      input:[
        {role:'system',content:[{type:'input_text',text:'당신은 달라스 한인 미디어의 사실 검증 편집자입니다. 제공된 선택 후보와 근거 밖의 장소, 전화번호, 주소, 의사명, 운영시간을 절대 만들지 않습니다.'}]},
        {role:'user',content:[{type:'input_text',text:`기사 주제: ${topic}\n분야: ${categoryNames[category]||category}\n추가 지시: ${instructions||'없음'}\n\n${evidence}\n\n작성 규칙:\n- 선택된 후보만 소개하세요.\n- 이름, 주소, 전화번호는 Google Places 값이 있을 때만 그대로 사용하세요.\n- '한인/한국어 진료'는 필수조건 근거 문장에 근거가 있을 때만 표현하세요.\n- 확인되지 않은 운영시간, 보험, 순위, 후기, 진료과목을 추측하지 마세요.\n- 정보가 없는 항목은 생략하세요. 예시 번호(555)나 임의 주소를 쓰지 마세요.\n- 한국어로 읽기 쉽게 작성하고, 각 후보의 확인 근거와 공식 확인 필요성을 명시하세요.\n- source_url은 선택 후보의 실제 근거 URL 또는 공식 웹사이트 중 가장 핵심적인 주소를 사용하세요.`}]}
      ],
      text:{format:{type:'json_schema',name:'daltown_guide_article_v12',strict:true,schema:articleSchema}}
    });
    const text=outputText(response); if(!text)throw new Error('기사 응답이 비어 있습니다.');
    const article=JSON.parse(text);
    return{statusCode:200,headers,body:JSON.stringify({article,category,category_name:categoryNames[category]||category,quality:{selected_candidates:selected.length,search_and_generation_split:true,google_places_used:selected.some(c=>c.place_verified)}})};
  }catch(error){console.error('generate-guide error',error);return{statusCode:500,headers,body:JSON.stringify({error:error.message||'AI 글 생성 오류'})};}
};
