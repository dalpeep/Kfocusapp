import {createHmac,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';

const tracked=new Set(['email.delivered','email.bounced','email.complained','email.failed']);

export function createBusinessMailWebhook({secret,recordEvent,now=Date.now}) {
  const signingKey=typeof secret==='string'&&secret.startsWith('whsec_')?
    Buffer.from(secret.slice(6),'base64'):Buffer.alloc(0);
  return async request=>{
    if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
    if(signingKey.length<16)return new Response(null,{status:503});
    const id=request.headers.get('svix-id')||'';
    const timestamp=request.headers.get('svix-timestamp')||'';
    const signature=request.headers.get('svix-signature')||'';
    if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id)||!/^\d{10}$/.test(timestamp)||
       Math.abs(now()/1000-Number(timestamp))>300||signature.length>1024){
      return new Response(null,{status:401});
    }
    const raw=Buffer.from(await request.arrayBuffer());
    if(raw.length>131072)return new Response(null,{status:413});
    const expected=createHmac('sha256',signingKey).update(id+'.'+timestamp+'.').update(raw).digest();
    const valid=signature.split(' ').some(item=>{
      if(!item.startsWith('v1,'))return false;
      const actual=Buffer.from(item.slice(3),'base64');
      return actual.length===expected.length&&timingSafeEqual(actual,expected);
    });
    if(!valid)return new Response(null,{status:401});
    let event;
    try{event=JSON.parse(raw.toString('utf8'));}catch{return new Response(null,{status:400});}
    if(!tracked.has(event?.type))return new Response(null,{status:204});
    const providerId=event.data?.email_id;
    if(typeof providerId!=='string'||!/^[a-z0-9-]{1,100}$/i.test(providerId)){
      return new Response(null,{status:400});
    }
    try{
      const found=await recordEvent(id,providerId,event.type,event.data?.bounce?.type==='Permanent');
      if(found===false && event.data?.tags?.category==='dtm_business_campaign'){
        return new Response(null,{status:503});
      }
      return new Response(null,{status:204});
    }catch{return new Response(null,{status:503});}
  };
}
