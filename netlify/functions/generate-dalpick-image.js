const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers,body:''};
  if(event.httpMethod!=='POST') return {statusCode:405,headers,body:JSON.stringify({error:'POST only'})};
  try{
    if(!process.env.OPENAI_API_KEY) throw new Error('Netlify 환경변수 OPENAI_API_KEY가 설정되지 않았습니다.');
    const body=JSON.parse(event.body||'{}');
    const title=String(body.title||'').trim(); const summary=String(body.summary||'').trim();
    if(!title) return {statusCode:400,headers,body:JSON.stringify({error:'기사 제목이 필요합니다.'})};
    const prompt=`Create a polished editorial hero image for a Korean local lifestyle magazine article. Topic: ${title}. Context: ${summary}. Dallas-Fort Worth, Texas. Photorealistic, warm natural light, clean magazine composition, no text, no logos, no watermarks, no identifiable private individuals, landscape 16:9.`;
    const r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_IMAGE_MODEL||'gpt-image-1',prompt,size:'1536x1024',quality:'medium',output_format:'png'})});
    const j=await r.json(); if(!r.ok) throw new Error(j?.error?.message||'AI 이미지 생성 실패');
    const b64=j?.data?.[0]?.b64_json; if(!b64) throw new Error('이미지 데이터가 비어 있습니다.');
    return {statusCode:200,headers,body:JSON.stringify({b64_json:b64})};
  }catch(e){console.error(e);return {statusCode:500,headers,body:JSON.stringify({error:e.message||'AI 이미지 생성 오류'})};}
};
