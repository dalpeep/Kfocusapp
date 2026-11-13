const origin = 'https://daltownmap.com';
const project = 'https://ydrxuqmjzayejlnjzzew.supabase.co';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store',Vary:'Origin'};

Deno.serve(async request => {
  const reply = (status: number, body: unknown) => Response.json(body,{status,headers});
  if (request.headers.get('origin')!==origin) return reply(403,{code:'ORIGIN'});
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
  if (request.method!=='POST') return reply(405,{code:'METHOD'});
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const turnstile = Deno.env.get('RESERVATION_TURNSTILE_SECRET_KEY');
  if (Deno.env.get('SUPABASE_URL')!==project || !service || !turnstile) return reply(503,{code:'RESERVATION_UNAVAILABLE'});
  try {
    const reader=request.body?.getReader();
    if (!reader) return reply(400,{code:'INPUT'});
    const chunks: Uint8Array[]=[];
    let size=0;
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      size+=value.length;
      if(size>6000){await reader.cancel();return reply(413,{code:'SIZE'});}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let body;
    try { body=JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400,{code:'INPUT'}); }
    if (!body || !uuid.test(body.id||'') || !uuid.test(body.secret||'')) return reply(400,{code:'INPUT'});
    const params = {p_id:body.id,p_secret:body.secret};
    let rpc, args;
    if (body.action==='submit') {
      if (!uuid.test(body.business||'') || !Number.isInteger(body.party) || body.party<1 || body.party>100 ||
          typeof body.slot!=='string' || !Number.isFinite(Date.parse(body.slot)) ||
          typeof body.name!=='string' || !body.name.trim() || body.name.length>100 ||
          typeof body.phone!=='string' || !/^[0-9+(). -]{10,25}$/.test(body.phone) ||
          (body.email && (typeof body.email!=='string' || body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))) ||
          (body.note && (typeof body.note!=='string' || body.note.length>300)) ||
          typeof body.proof!=='string' || !body.proof || body.proof.length>2048) return reply(400,{code:'INPUT'});
      const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(6000),
        body:new URLSearchParams({secret:turnstile,response:body.proof})
      });
      const result=await verification.json();
      if(!verification.ok || !result.success || result.hostname!=='daltownmap.com' || result.action!=='reservation')
        return reply(403,{code:'BOT_CHECK'});
      rpc='business_reservation_submit_v1';
      args={...params,p_business:body.business,p_slot:body.slot,p_party:body.party,p_name:body.name,
        p_phone:body.phone,p_email:body.email||null,p_note:body.note||null};
    } else if(body.action==='lookup'||body.action==='cancel') {
      rpc='customer_reservation_v1';
      args={...params,p_cancel:body.action==='cancel'};
    } else return reply(400,{code:'INPUT'});
    const response=await fetch(project+'/rest/v1/rpc/'+rpc,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify(args)});
    const data=await response.json();
    if(response.ok)return reply(200,{result:data});
    const status=({OP400:400,OP403:403,OP409:409,OP429:429} as Record<string,number>)[data.code]||503;
    return reply(status,{code:status===503?'RESERVATION_UNAVAILABLE':data.code});
  } catch { return reply(503,{code:'RESERVATION_UNAVAILABLE'}); }
});
