import portal from '../../../netlify/legacy-functions/lib/owner-portal-uuid.js';
import target from '../target.cjs';

const previewHost = /^deploy-preview-[1-9]\d*--daltownmap-owner-uuid-qa\.netlify\.app$/;
const pilotPaths = new Set([
  '/auth/v1/user',
  '/rest/v1/rpc/owner_pilot_status_v1',
  '/rest/v1/rpc/owner_pilot_read_v1',
  '/rest/v1/rpc/owner_pilot_command_v1',
]);

function blocked() {
  return Response.json({ok: false, phase1: true, code: 'OWNER_QA_PILOT_OFF',
    error: '업주 관리 시험 운영이 중지됐습니다.'}, {
    status: 503, headers: {'Cache-Control': 'no-store'},
  });
}

export function pilotFetch(input, options) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== target.SUPABASE_URL || url.username || url.password || !pilotPaths.has(url.pathname)) {
    throw Error('QA_OWNER_TARGET_REQUIRED');
  }
  return fetch(input, {...options, redirect: 'error'});
}

export default async function ownerPortal(request, context) {
  const url = new URL(request.url);
  if (context?.site?.id !== target.SITE_ID || url.protocol !== 'https:' || url.port ||
      !previewHost.test(url.hostname) || process.env.OWNER_UUID_ACCESS_MODE !== 'phase1' ||
      process.env.QA_OWNER_PHASE1_RUNTIME_ENABLED !== 'true') return blocked();

  try {
    target.requireTarget(process.env);
    const service = process.env.QA_OWNER_PHASE1_SERVICE_ROLE_KEY || '';
    const claims = target.tokenClaims(service);
    if (claims?.role !== 'service_role' || claims.ref !== new URL(target.SUPABASE_URL).hostname.split('.')[0]) return blocked();
    const {createClient} = await import('@supabase/supabase-js');
    const db = createClient(target.SUPABASE_URL, service, {
      auth: {persistSession: false, autoRefreshToken: false},
      global: {fetch: pilotFetch},
    });
    const handler = portal.makeHandler({getClient: () => db});
    const result = await handler({httpMethod: request.method, headers: Object.fromEntries(request.headers),
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: request.method === 'POST' ? await request.text() : undefined});
    return new Response(result.body, {status: result.statusCode, headers: result.headers});
  } catch {
    return blocked();
  }
}
