import {makeEdgeHandler, origin, supabase} from './handler.generated.mjs';

const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};
const projectUrl = Deno.env.get('SUPABASE_URL');
const handle = makeEdgeHandler({projectUrl, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  galleryEnabled: Deno.env.get('OWNER_PHASE2_GALLERY_ENABLED') === 'true',
  specialsEnabled: Deno.env.get('OWNER_PHASE2_SPECIALS_ENABLED') === 'true'});

Deno.serve(async request => {
  if (request.headers.get('origin') !== origin) return new Response(null, {status: 403});
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (projectUrl !== supabase || Deno.env.get('OWNER_PHASE1_RUNTIME_ENABLED') !== 'true') {
    return Response.json({ok: false, code: 'OWNER_QA_PILOT_OFF'}, {status: 503, headers});
  }
  const result = await handle(request);
  const responseHeaders = new Headers(result.headers);
  for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
  return new Response(result.body, {status: result.status, headers: responseHeaders});
});
