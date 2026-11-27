import {hashBusinessMailToken} from '../business-mail/transport.mjs';

const origin = 'https://daltownmap.com';

export function createBusinessMailConfirmation(consumeToken) {
  return async request => {
    const headers = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
    if (request.method !== 'POST') return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
    if (request.headers.get('Origin') !== origin) return new Response(null,{status:403,headers});
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
      return new Response(null,{status:415,headers});
    }
    let payload;
    let hash;
    try {
      const body = await request.text();
      if (body.length > 512) return new Response(null,{status:413,headers});
      payload = JSON.parse(body);
      if (!['verify','unsubscribe'].includes(payload.purpose)) throw new Error('Invalid purpose');
      hash = hashBusinessMailToken(payload.token);
    } catch {
      return new Response(null,{status:400,headers});
    }
    const consent = payload.purpose === 'verify' && payload.consent === true ? 'business-mail-v1' : null;
    try {
      const ok = await consumeToken(hash,payload.purpose,consent);
      return new Response(null,{status:ok ? 204 : 410,headers});
    } catch {
      return new Response(null,{status:503,headers});
    }
  };
}
