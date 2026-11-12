import {origin} from './handler.generated.mjs';

const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};
Deno.serve(request => {
  if (request.headers.get('origin') !== origin) return new Response(null, {status: 403});
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  return Response.json({ok: false, code: 'OWNER_QA_PILOT_OFF'}, {status: 503, headers});
});
