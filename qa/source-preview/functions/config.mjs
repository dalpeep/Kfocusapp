import source from '../../../netlify/legacy-functions/config.js';
import target from '../target.cjs';

export default async request => {
  if (request.method !== 'GET') return new Response(null, {status: 405});
  try {
    const env = target.requireTarget(process.env);
    const result = await source.renderConfig(env, new URL(request.url).origin);
    return new Response(result.body, {status: result.statusCode, headers: result.headers});
  } catch {
    return new Response('QA configuration unavailable', {status: 503});
  }
};
