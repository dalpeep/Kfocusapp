const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
const categoryNames={driving:'운전·차량',health:'병원·보험',education:'학교·교육',business:'세금·비즈니스',housing:'주거·생활',immigration:'비자·여권'};
function outputText(json){return json.output_text||json.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text||'';}
async function callResponses(payload){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),55000);
  try{const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await res.json();if(!res.ok)throw new Error(json?.error?.message||`OpenAI 오류 ${res.status}`);return json;}
  catch(e){if(e.name==='AbortError')throw new Error('기사 작성이 제한 시간 안에 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.');throw e;}finally{clearTimeout(timer);}
}
const articleSchema={type:'object',additionalProperties:false,properties:{title:{type:'string'},summary:{type:'string'},content:{type:'string'},author_name:{type:'string'},link_label:{type:'string'},source_url:{type:'string'}},required:['title','summary','content','author_name','link_label','source_url']};
function candidateName(c){return String(c.place?.name||c.name||'이름 미확인').trim();}
function businessEvidence(c,i,total){return `[업소 후보 ${i+1}/${total}]\n이름: ${candidateName(c)}\n주소: ${c.place?.address||c.address||'확인되지 않음'}\n전화: ${c.place?.phone||c.phone||'확인되지 않음'}\n웹사이트: ${c.place?.website||c.website||'없음'}\nGoogle 지도: ${c.place?.google_maps_url||'없음'}\n평점: ${c.place?.rating??c.rating??'확인되지 않음'}\n리뷰 수: ${c.place?.userRatingCount??c.place?.user_ratings_total??c.review_count??'확인되지 않음'}\n전문분야: ${c.specialty||''}\n필수조건 근거: ${c.qualifier_evidence||''}\n출처: ${(c.source_titles||c.source_names||[]).join(', ')||'검색 후보'}\n근거 URL: ${(c.source_urls||[]).join(', ')}`;}
function infoEvidence(c,i,total){return `[생활정보 근거 ${i+1}/${total}]\n기관/페이지: ${candidateName(c)}\n주제: ${c.specialty||''}\n공식 출처 여부: ${c.official_source?'예':'아니오 또는 미확인'}\n게시/갱신일: ${c.published_or_updated||'확인되지 않음'}\n핵심 근거: ${c.qualifier_evidence||''}\n출처 제목: ${(c.source_titles||[]).join(', ')}\n근거 URL: ${(c.source_urls||[]).join(', ')}`;}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers,body:''};
  if(event.httpMethod!=='POST')return{statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  try{
    if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY가 필요합니다.');
    const body=JSON.parse(event.body||'{}');
    const topic=String(body.topic||'').trim(); const category=String(body.category||'driving'); const instructions=String(body.instructions||'').trim();
    const selected=Array.isArray(body.selected_candidates)?body.selected_candidates:[];
    if(!topic)return{statusCode:400,headers,body:JSON.stringify({error:'작성 주제를 입력하세요.'})};
    if(!selected.length)return{statusCode:400,headers,body:JSON.stringify({error:'먼저 검색 근거를 찾고 기사에 사용할 항목을 선택하세요.'})};
    const businesses=selected.filter(c=>c.candidate_kind!=='information');
    const infos=selected.filter(c=>c.candidate_kind==='information');
    const mode=businesses.length&&infos.length?'mixed':infos.length?'information':'business';
    const evidence=[...infos.map((c,i)=>infoEvidence(c,i,infos.length)),...businesses.map((c,i)=>businessEvidence(c,i,businesses.length))].join('\n\n');
    let rules='';
    if(mode==='information'){
      rules=`- 이 글은 생활정보 안내문입니다. 기관 목록을 광고성 추천 순위처럼 작성하지 마세요.\n- 선택된 ${infos.length}개 근거를 서로 교차 확인하여 절차, 자격, 준비서류, 비용, 처리기간, 주의사항을 주제에 맞게 구조화하세요.\n- 공식 출처와 비공식 출처가 충돌하면 공식 출처를 우선하고, 관할 지역과 시행일을 명확히 구분하세요.\n- 확인되지 않은 금액, 날짜, 자격, 법률 요건을 만들지 마세요.\n- 본문 마지막에 '공식 확인처' 섹션을 만들고 선택된 근거의 기관명과 URL을 빠짐없이 정리하세요.`;
    }else if(mode==='mixed'){
      rules=`- 첫 부분은 선택된 생활정보 근거를 바탕으로 절차와 주의사항을 설명하세요.\n- 그 다음 '관련 업소 안내' 섹션에서 선택된 ${businesses.length}개 업소를 1번부터 모두 빠짐없이 소개하세요.\n- 생활정보와 업소 추천을 혼동하지 말고, 공식 제도 설명과 민간 업소 정보의 출처를 구분하세요.\n- 업소는 근거 없는 순위나 최고 표현 없이 주소, 전화, 웹사이트, 평점과 확인 근거만 사용하세요.\n- 본문 마지막에 공식 출처와 업소 근거 URL을 정리하세요.`;
    }else{
      rules=`- 선택된 ${businesses.length}개 업소를 단 하나도 빠뜨리지 말고 모두 소개하세요. 하나만 대표로 고르면 안 됩니다.\n- 각 업소를 별도 번호 제목으로 작성하세요: '1. 업체명', '2. 업체명' 형식.\n- 후보별 분량은 2~5문장으로 균형 있게 작성하세요.\n- 확인된 주소, 전화, 웹사이트, 평점, 출처만 사용하고 근거 없는 최고·1위 표현을 쓰지 마세요.\n- 선택된 후보 외의 업소를 추가하지 마세요.`;
    }
    const response=await callResponses({
      model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
      input:[
        {role:'system',content:[{type:'input_text',text:'당신은 달라스 한인 미디어의 사실 검증 편집자입니다. 제공된 근거 밖의 이름, 주소, 전화번호, 비용, 날짜, 법률 요건을 만들지 않습니다. 공식 출처를 우선하고 불확실한 내용은 확인 필요라고 명시합니다.'}]},
        {role:'user',content:[{type:'input_text',text:`기사 주제: ${topic}\n분야: ${categoryNames[category]||category}\n작성 유형: ${mode}\n추가 지시: ${instructions||'없음'}\n\n${evidence}\n\n작성 규칙:\n${rules}\n- 한국어로 자연스럽고 실용적으로 작성하세요.\n- 정보가 없는 항목은 생략하세요.\n- source_url은 선택된 공식 또는 핵심 근거 URL 중 하나를 사용하세요.\n- author_name은 '달타운맵 편집부'로 작성하세요.`}]}
      ],
      max_output_tokens:6000,
      text:{format:{type:'json_schema',name:'daltown_guide_article_v18',strict:true,schema:articleSchema}}
    });
    const text=outputText(response); if(!text)throw new Error('기사 응답이 비어 있습니다.');
    const article=JSON.parse(text);
    if(mode!=='information'){
      const content=String(article.content||'');
      const missing=businesses.filter(c=>!content.toLowerCase().includes(candidateName(c).toLowerCase()));
      if(missing.length){
        const appendix=missing.map(c=>{
          const lines=[candidateName(c)]; const address=c.place?.address||c.address; const phone=c.place?.phone||c.phone; const website=c.place?.website||c.website; const rating=c.place?.rating??c.rating;
          if(address)lines.push(`주소: ${address}`); if(phone)lines.push(`전화: ${phone}`); if(rating!=null)lines.push(`Google 평점: ${rating}`); if(website)lines.push(`웹사이트: ${website}`);
          return lines.join('\n');
        }).join('\n\n');
        article.content=`${content.trim()}\n\n선택 업소 추가 안내\n\n${appendix}`.trim();
      }
    }
    return{statusCode:200,headers,body:JSON.stringify({article,category,category_name:categoryNames[category]||category,search_type:mode,quality:{selected_candidates:selected.length,information_sources:infos.length,business_candidates:businesses.length,all_selected_businesses_preserved:true,official_source_first:true}})};
  }catch(error){console.error('generate-guide v18 error',error);return{statusCode:500,headers,body:JSON.stringify({error:error.message||'AI 글 생성 오류'})};}
};
