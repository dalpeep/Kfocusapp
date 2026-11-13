import {Buffer} from 'node:buffer';
import portal from './owner-portal-uuid.js';

export const origin = 'https://daltownmap.com';
export const supabase = 'https://ydrxuqmjzayejlnjzzew.supabase.co';
const galleryPrefix = '/storage/v1/object/public-images/owner-phase2/';
const maxImageBytes = 4 * 1024 * 1024;

function imageType(bytes) {
  if (bytes.length < 16) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return ['png', 'image/png'];
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return ['jpg', 'image/jpeg'];
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return ['webp', 'image/webp'];
  return null;
}

const rpcNames = new Set(['owner_pilot_status_v1', 'owner_pilot_read_v1', 'owner_pilot_command_v1', 'owner_pilot_gallery_v1', 'owner_pilot_special_v1']);

export function makeEdgeHandler({projectUrl, serviceKey, galleryEnabled = false, specialsEnabled = false, transport = fetch}) {
  const json = (status, body) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
  const denied = () => json(403, {ok: false, error: '달타운맵에서만 이용할 수 있습니다.'});
  const off = () => json(503, {ok: false, phase1: true, code: 'OWNER_QA_PILOT_OFF',
    error: '업주 관리 시험 운영이 중지됐습니다.'});

  async function call(path, {method, bearer, body}) {
    const response = await transport(supabase + path, {
      method, redirect: 'error', headers: {apikey: serviceKey, Authorization: 'Bearer ' + bearer,
        'Content-Type': 'application/json'}, body,
    });
    const result = await response.json();
    return response.ok ? {data: result} : {error: {code: result.code, message: result.message}};
  }

  const client = {
    auth: {async getUser(token) {
      const result = await call('/auth/v1/user', {method: 'GET', bearer: token});
      return result.error ? result : {data: {user: result.data}};
    }},
    rpc(name, params) {
      if (!rpcNames.has(name)) throw Error('Unexpected owner pilot RPC');
      return call('/rest/v1/rpc/' + name, {method: 'POST', bearer: serviceKey, body: JSON.stringify(params)});
    },
  };
  const handle = portal.makeHandler({getClient: () => client, accessMode: () => 'phase1',
    bookingEnabled: () => false, mediaEnabled: () => false});

  return async request => {
    // Origin limits browser entry points. Auth and the database enforce access.
    if (request.headers.get('origin') !== origin) return denied();
    if (projectUrl !== supabase || !serviceKey) return off();
    const authorization = request.headers.get('authorization');
    const method = request.method;
    if (method !== 'GET' && method !== 'POST') return json(405, {ok: false, error: '허용되지 않은 메서드입니다.'});
    if (!/^Bearer [^\s]+$/.test(authorization || '')) return json(401, {ok: false, error: '로그인이 필요합니다.'});
    const url = new URL(request.url);
    const gallery = url.searchParams.get('content') === 'gallery';
    const specials = url.searchParams.get('content') === 'specials';
    if (specials && !specialsEnabled) return off();
    const upload = gallery && url.searchParams.get('upload') === '1';
    if (gallery && !galleryEnabled) return off();
    if (upload && method !== 'POST') return json(405, {ok: false});
    let body;
    if (method === 'POST') {
      const reader = request.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > (upload ? maxImageBytes : 20000)) {
            await reader.cancel();
            return json(400, {ok: false, error: '요청 크기를 확인해 주세요.'});
          }
          chunks.push(value);
        }
      }
      body = Buffer.concat(chunks);
    }
    if (gallery || specials) {
      const business = url.searchParams.get('business');
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(business || '')) {
        return json(400, {ok: false});
      }
      try {
        const actor = await client.auth.getUser(authorization.slice(7));
        if (!actor.data?.user?.id) return json(401, {ok: false});
        const params = {p_actor: actor.data.user.id, p_business: business};
        if (specials) {
          if (method === 'POST') {
            try { params.p_command = JSON.parse(body.toString('utf8')); }
            catch { return json(400, {ok: false}); }
            if (!params.p_command || typeof params.p_command !== 'object' || Array.isArray(params.p_command)) {
              return json(400, {ok: false});
            }
          }
          const result = await client.rpc('owner_pilot_special_v1', params);
          if (!result.error) return json(200, {ok: true, result: result.data});
          return json({OP400: 400, OP403: 403, OP409: 409, OP503: 503}[result.error.code] || 502, {ok: false});
        }
        if (upload) {
          const image = imageType(body);
          if (!image) return json(400, {ok: false});
          const allowed = await client.rpc('owner_pilot_gallery_v1', params);
          if (allowed.error) return json({OP403: 403, OP503: 503}[allowed.error.code] || 502, {ok: false});
          const [extension, mime] = image;
          const path = business.toLowerCase() + '/' + crypto.randomUUID() + '.' + extension;
          const stored = await transport(supabase + galleryPrefix + path, {
            method: 'POST', redirect: 'error', body,
            headers: {apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': mime, 'x-upsert': 'false'},
          });
          if (!stored.ok) return json(502, {ok: false});
          return json(200, {ok: true, result: supabase + galleryPrefix.replace('/object/', '/object/public/') + path});
        }
        if (method === 'POST') {
          let payload;
          try { payload = JSON.parse(body.toString('utf8')); } catch { return json(400, {ok: false}); }
          if (!Array.isArray(payload?.expected) || !Array.isArray(payload?.urls)) return json(400, {ok: false});
          params.p_expected = payload.expected;
          params.p_urls = payload.urls;
        }
        const result = await client.rpc('owner_pilot_gallery_v1', params);
        if (!result.error) return json(200, {ok: true, result: result.data});
        const status = {OP400: 400, OP403: 403, OP409: 409, OP503: 503}[result.error.code] || 502;
        return json(status, {ok: false});
      } catch {
        return json(502, {ok: false});
      }
    }
    const result = await handle({
      httpMethod: method, headers: authorization ? {authorization} : {},
      queryStringParameters: Object.fromEntries(new URL(request.url).searchParams), body: body?.toString('utf8'),
    });
    return new Response(result.body, {status: result.statusCode, headers: result.headers});
  };
}
