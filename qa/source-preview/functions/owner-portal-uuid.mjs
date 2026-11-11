import target from '../target.cjs';

const origin = 'https://deploy-preview-59--daltownmap-owner-uuid-qa.netlify.app';

function blocked() {
  return Response.json({ok: false, phase1: true, code: 'OWNER_QA_PILOT_OFF',
    error: '업주 관리 시험 운영이 중지됐습니다.'}, {
    status: 503, headers: {'Cache-Control': 'no-store'},
  });
}

export default async function ownerPortal(request, context) {
  const url = new URL(request.url);
  if (context?.site?.id !== target.SITE_ID || url.origin !== origin ||
      process.env.OWNER_UUID_ACCESS_MODE !== 'phase1' ||
      process.env.QA_OWNER_PHASE1_RUNTIME_ENABLED !== 'true') return blocked();
  if (!['GET', 'POST'].includes(request.method)) return new Response(null, {status: 405});

  try {
    const env = target.requireTarget(process.env);
    const endpoint = new URL('/functions/v1/owner-phase1-qa', target.SUPABASE_URL);
    endpoint.search = url.search;
    const headers = new Headers({Origin: origin, apikey: env.SUPABASE_ANON_KEY});
    const token = request.headers.get('authorization');
    if (!token) return Response.json({ok: false, phase1: true, error: '로그인이 필요합니다.'}, {
      status: 401, headers: {'Cache-Control': 'no-store'},
    });
    headers.set('Authorization', token);
    const options = {method: request.method, headers, redirect: 'error'};
    if (request.method === 'POST') {
      headers.set('Content-Type', 'application/json');
      options.body = request.body;
      options.duplex = 'half';
    }
    const response = await fetch(endpoint, options);
    if (!response.headers.get('content-type')?.includes('application/json')) return blocked();
    return new Response(response.body, {status: response.status,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
  } catch {
    return blocked();
  }
}
