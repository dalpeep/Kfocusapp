import source from '../../../netlify/legacy-functions/today-daltown-feed.js';
import target from '../target.cjs';

export default async request => {
  if (request.method !== 'GET') return new Response(null, {status: 405});
  try {
    const env = target.requireTarget(process.env);
    const queryStringParameters = Object.fromEntries(new URL(request.url).searchParams);
    const result = await source.readFeed({httpMethod: 'GET', queryStringParameters}, env, target.qaRead);
    return new Response(result.body, {status: result.statusCode, headers: result.headers});
  } catch {
    return new Response('QA feed unavailable', {status: 503});
  }
};
