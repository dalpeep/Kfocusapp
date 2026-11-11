import security from '../../netlify/legacy-functions/lib/community-security.js';
import target from './target.cjs';

export function communityWrite(handler, accepts) {
  return async (request, context) => {
    if (request.method !== 'POST') return new Response(null, {status: 405});
    let config;
    try {
      config = target.requireCommunityWrite(process.env, request.url);
    } catch {
      return new Response('QA community writes unavailable', {status: 503});
    }
    if (!context?.ip) return new Response('Client address unavailable', {status: 503});
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', {status: 400});
    }
    if (!body || body.region !== 'dallas' || !accepts(body)) {
      return new Response('Unsupported QA community request', {status: 400});
    }
    const headers = Object.fromEntries(request.headers);
    headers['x-nf-client-connection-ip'] = context.ip;
    const response = await security.withCommunityConfig(config,
      () => handler({httpMethod: 'POST', headers, body: JSON.stringify(body)}));
    return new Response(response.body, {status: response.statusCode, headers: response.headers});
  };
}
