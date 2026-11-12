import {Buffer} from 'node:buffer';
import portal from './owner-portal-uuid.js';

export const origin = 'https://daltownmap.com';
export const supabase = 'https://ydrxuqmjzayejlnjzzew.supabase.co';
const rpcNames = new Set(['owner_pilot_status_v1', 'owner_pilot_read_v1', 'owner_pilot_command_v1']);

export function makeEdgeHandler({projectUrl, serviceKey, transport = fetch}) {
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
          if (size > 20000) {
            await reader.cancel();
            return json(400, {ok: false, error: '요청 크기를 확인해 주세요.'});
          }
          chunks.push(value);
        }
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    const result = await handle({
      httpMethod: method, headers: authorization ? {authorization} : {},
      queryStringParameters: Object.fromEntries(new URL(request.url).searchParams), body,
    });
    return new Response(result.body, {status: result.statusCode, headers: result.headers});
  };
}
