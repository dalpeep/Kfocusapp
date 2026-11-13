import {scheduleReservationMail} from '../_shared/reservation-mail.mjs';

const origin = 'https://daltownmap.com';
const project = 'https://ydrxuqmjzayejlnjzzew.supabase.co';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const bookingNumber = /^[A-F0-9]{20}$/;
const passwordSize = (value: unknown): value is string =>
  typeof value==='string' && new TextEncoder().encode(value).length<=72;
const isPin = (value: unknown): value is string => typeof value==='string' && /^[0-9]{4}$/.test(value);
async function pinDigest(secret: string, purpose: string, value: string) {
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,encoder.encode(purpose+':'+value));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
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
    if (!body || typeof body!=='object') return reply(400,{code:'INPUT'});
    const credentialLookup=body.action==='lookup-number'||body.action==='cancel-number';
    const pinSubmission=body.action==='submit-pin';
    const pinLookup=credentialLookup&&isPin(body.password);
    const pepper=Deno.env.get('RESERVATION_PIN_PEPPER');
    if((pinSubmission||pinLookup)&&(!pepper||pepper.length<32))
      return reply(pinLookup?403:503,{code:pinLookup?'CREDENTIALS':'RESERVATION_UNAVAILABLE'});
    if (!credentialLookup && (!uuid.test(body.id||'') || !uuid.test(body.secret||''))) return reply(400,{code:'INPUT'});
    const params = {p_id:body.id,p_secret:body.secret};
    let rpc, args;
    if (body.action==='submit'||body.action==='submit-number'||pinSubmission) {
      const numbered=body.action==='submit-number';
      if((pinSubmission&&!isPin(body.password))||(numbered&&(!passwordSize(body.password)||body.password.length<8)))
        return reply(400,{code:'INPUT'});
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
      rpc=pinSubmission?'business_reservation_submit_pin_v1':numbered?'business_reservation_submit_v2':'business_reservation_submit_v1';
      args={...params,p_business:body.business,p_slot:body.slot,p_party:body.party,p_name:body.name,
        p_phone:body.phone,p_email:body.email||null,p_note:body.note||null};
      if(numbered)Object.assign(args,{p_password:body.password});
      if(pinSubmission)Object.assign(args,{p_peppered_pin:await pinDigest(pepper!,'pin',body.password)});
    } else if(credentialLookup){
      if(!uuid.test(body.business||'')||typeof body.number!=='string'||!bookingNumber.test(body.number)||!passwordSize(body.password))
        return reply(403,{code:'CREDENTIALS'});
      rpc='customer_reservation_v2';
      args={p_business:body.business,p_number:body.number,p_password:body.password,p_cancel:body.action==='cancel-number'};
      if(pinLookup){
        const limit=await fetch(project+'/rest/v1/rpc/reserve_pin_attempt_v1',{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
          headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
          body:JSON.stringify({p_number:body.number})
        });
        if(!limit.ok||await limit.json()!==true)return reply(403,{code:'CREDENTIALS'});
        rpc='customer_reservation_pin_v1';
        Object.assign(args,{p_password:await pinDigest(pepper!,'pin',body.password)});
      }
    } else if(body.action==='lookup'||body.action==='cancel') {
      rpc='customer_reservation_v1';
      args={...params,p_cancel:body.action==='cancel'};
    } else return reply(400,{code:'INPUT'});
    const response=await fetch(project+'/rest/v1/rpc/'+rpc,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify(args)});
    const data=await response.json();
    if(credentialLookup && response.ok && data.error==='CREDENTIALS')return reply(403,{code:'CREDENTIALS'});
    if(response.ok){
      if(body.action==='submit'||body.action==='submit-number'||pinSubmission||body.action==='cancel'||body.action==='cancel-number'){
        try{scheduleReservationMail(project,service,data);}
        catch{console.warn('RESERVATION_MAIL_SCHEDULE_FAILED');}
      }
      return reply(200,{result:data});
    }
    const status=({OP400:400,OP403:403,OP409:409,OP429:429} as Record<string,number>)[data.code]||503;
    return reply(status,{code:status===503?'RESERVATION_UNAVAILABLE':data.code});
  } catch { return reply(503,{code:'RESERVATION_UNAVAILABLE'}); }
});
