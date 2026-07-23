const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
const categoryNames={driving:'운전·차량',health:'병원·보험',education:'학교·교육',business:'세금·비즈니스',housing:'주거·생활',immigration:'비자·여권'};
function outputText(json){return json.output_text||json.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text||'';}
async function callResponses(payload){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),50000);
  try{const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await res.json();if(!res.ok)throw new Error(json?.error?.message||`OpenAI 오류 ${res.status}`);return json;}
  catch(e){if(e.name==='AbortError')throw new Error('기사 작성이 50초 안에 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.');throw e;}finally{clearTimeout(timer);}
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

    const candidateName=(c)=>String(c.place?.name||c.name||'이름 미확인').trim();
    const evidence=selected.map((c,i)=>`[반드시 소개할 후보 ${i+1}/${selected.length}]\n이름: ${candidateName(c)}\n주소: ${c.place?.address||c.address||'확인되지 않음'}\n전화: ${c.place?.phone||c.phone||'확인되지 않음'}\n웹사이트: ${c.place?.website||c.website||'없음'}\nGoogle 지도: ${c.place?.google_maps_url||'없음'}\n평점: ${c.place?.rating??c.rating??'확인되지 않음'}\n리뷰 수: ${c.place?.user_ratings_total??c.review_count??'확인되지 않음'}\n전문분야: ${c.specialty||''}\n필수조건 근거: ${c.qualifier_evidence||''}\n출처: ${(c.sources||c.source_names||[]).join(', ')||'검색 후보'}\n근거 URL: ${(c.source_urls||[]).join(', ')}`).join('\n\n');

    const response=await callResponses({
      model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
      input:[
        {role:'system',content:[{type:'input_text',text:'당신은 달라스 한인 미디어의 사실 검증 편집자입니다. 제공된 선택 후보와 근거 밖의 장소, 전화번호, 주소, 의사명, 운영시간을 절대 만들지 않습니다. 관리자가 선택한 모든 후보를 빠짐없이 소개해야 합니다.'}]},
        {role:'user',content:[{type:'input_text',text:`기사 주제: ${topic}\n분야: ${categoryNames[category]||category}\n추가 지시: ${instructions||'없음'}\n\n${evidence}\n\n작성 규칙:\n- 매우 중요: 선택된 ${selected.length}개 후보를 단 하나도 빠뜨리지 말고 모두 소개하세요. 하나만 대표로 골라 쓰면 안 됩니다.\n- content는 '지역 한인 업소 비교 가이드' 형식으로 작성하세요.\n- 첫 문단 뒤에 각 후보를 반드시 별도 번호 제목으로 작성하세요: '1. 업체명', '2. 업체명' ... '${selected.length}. 업체명'.\n- 각 후보 항목에는 제공된 정보 중 확인된 주소, 전화, 웹사이트, 평점, 출처, 확인 근거를 간결하게 넣으세요.\n- 후보별 분량은 2~5문장으로 균형 있게 작성하고 특정 한 곳만 과도하게 길게 쓰지 마세요.\n- 마지막에는 확인된 정보만 바탕으로 비교할 때 살펴볼 점을 짧게 정리하세요. 근거 없는 '최고', '1위', '가장 추천' 표현은 쓰지 마세요.\n- 선택된 후보 외의 업소를 추가하지 마세요.\n- 이름, 주소, 전화번호는 제공된 값을 그대로 사용하고 임의로 수정하거나 만들지 마세요.\n- '한인/한국어 진료'는 필수조건 근거 문장에 근거가 있을 때만 표현하세요.\n- 확인되지 않은 운영시간, 보험, 순위, 후기, 진료과목을 추측하지 마세요.\n- 정보가 없는 항목은 생략하세요. 예시 번호(555)나 임의 주소를 쓰지 마세요.\n- source_url은 선택 후보의 실제 근거 URL 또는 공식 웹사이트 중 가장 핵심적인 주소를 사용하세요.\n- 최종 출력 전에 ${selected.length}개 후보 이름이 content에 모두 들어갔는지 스스로 확인하세요.`}]}
      ],
      max_output_tokens:5000,
      text:{format:{type:'json_schema',name:'daltown_guide_article_v17',strict:true,schema:articleSchema}}
    });

    const text=outputText(response); if(!text)throw new Error('기사 응답이 비어 있습니다.');
    const article=JSON.parse(text);

    // AI가 실수로 후보를 누락해도 선택된 후보가 최종 기사에서 사라지지 않도록 보충합니다.
    const normalizedContent=String(article.content||'');
    const missing=selected.filter(c=>!normalizedContent.toLowerCase().includes(candidateName(c).toLowerCase()));
    if(missing.length){
      const appendix=missing.map((c,idx)=>{
        const originalIndex=selected.indexOf(c)+1;
        const lines=[`${originalIndex}. ${candidateName(c)}`];
        const address=c.place?.address||c.address;
        const phone=c.place?.phone||c.phone;
        const website=c.place?.website||c.website;
        const rating=c.place?.rating??c.rating;
        const reviews=c.place?.user_ratings_total??c.review_count;
        if(address)lines.push(`주소: ${address}`);
        if(phone)lines.push(`전화: ${phone}`);
        if(rating!=null)lines.push(`Google 평점: ${rating}${reviews!=null?` (${reviews}개 리뷰)`:''}`);
        if(website)lines.push(`웹사이트: ${website}`);
        lines.push('방문 전 최신 진료 내용과 예약 가능 여부를 해당 기관에 직접 확인하시기 바랍니다.');
        return lines.join('\n');
      }).join('\n\n');
      article.content=`${normalizedContent.trim()}\n\n선택 후보 추가 안내\n\n${appendix}`.trim();
    }

    return{statusCode:200,headers,body:JSON.stringify({article,category,category_name:categoryNames[category]||category,quality:{selected_candidates:selected.length,appended_missing_candidates:missing.length,all_selected_candidates_preserved:true,search_and_generation_split:true,google_places_used:selected.some(c=>c.place_verified)}})};
  }catch(error){console.error('generate-guide error',error);return{statusCode:500,headers,body:JSON.stringify({error:error.message||'AI 글 생성 오류'})};}
};
