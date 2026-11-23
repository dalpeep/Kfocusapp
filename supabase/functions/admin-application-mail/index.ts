import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const env = (name: string) => Deno.env.get(name) ?? "";
const service = env("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(env("SUPABASE_URL"), service, { auth: { persistSession: false } });
const origin = env("ADMIN_MAIL_SITE_ORIGIN");
const types: Record<string, string> = {
  business: "업소 등록", ad: "광고 문의", claim: "소유권 신청",
  core: "정보 수정", coupon: "쿠폰 신청", event: "이벤트 신청",
};
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Origin",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
async function hash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
async function send(to: string, subject: string, text: string, key: string) {
  const from = env("RESEND_FROM_EMAIL");
  const sender = (from.match(/<([^<>]+)>\s*$/)?.[1] ?? from).trim().toLowerCase();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: "Bearer " + env("RESEND_API_KEY"),
        "Content-Type": "application/json", "Idempotency-Key": key,
      },
      body: JSON.stringify({
        from, to: [to], subject, text,
        ...(sender === "reservations@daltownmap.com" ? { reply_to: "info@daltownmap.com" } : {}),
      }),
    });
    if (response.ok) return { status: "sent", provider_id: (await response.json()).id };
    const status = response.status;
    await response.body?.cancel();
    return { status: status >= 500 || status === 409 ? "uncertain" : "failed", failure_code: "http_" + status };
  } catch {
    return { status: "uncertain", failure_code: "transport" };
  }
}
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "method" }, 405);
  try {
    const body = await request.json();
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    if (body.action === "confirm") {
      if (!/^[a-f0-9]{64}$/.test(body.token ?? "")) return json({ error: "invalid_token" }, 400);
      return json({ confirmed: await rpc("admin_mail_confirm_v1", { token_hash: await hash(body.token) }) });
    }
    if (body.action === "work") {
      const workerSecret = env("ADMIN_MAIL_WORKER_SECRET");
      if (workerSecret.length < 32 || await hash(token) !== await hash(workerSecret)) return json({ error: "forbidden" }, 403);
      if (!env("RESEND_API_KEY") || !env("RESEND_FROM_EMAIL") || !origin) return json({ error: "configuration" }, 503);
      let processed = 0;
      while (processed < 2) {
        const job = await rpc("admin_mail_work_v1", { command: "claim", args: {} });
        if (!job) break;
        const label = types[job.kind];
        const link = new URL("/admin/", origin);
        link.searchParams.set("applicationType", job.kind);
        link.searchParams.set("applicationId", job.application_id);
        const text = [
          label, "업소명 " + (job.business_name ?? "미입력"),
          "신청자 " + (job.applicant ?? "미입력"), "연락처 " + (job.contact ?? "미입력"),
          "접수 시간 " + new Date(job.received_at).toLocaleString("ko-KR", { timeZone: "America/Chicago" }),
          link.href,
        ].join("\n");
        const key = await hash(JSON.stringify([job.kind, job.application_id, job.email]));
        const result = await send(job.email, "[달타운맵] " + label, text, "admin-application/" + key);
        await rpc("admin_mail_work_v1", { command: "finish", args: { claim_token: job.claim_token, ...result } });
        processed++;
      }
      return json({ processed });
    }
    if (!token || request.headers.get("Origin") !== origin) return json({ error: "forbidden" }, 403);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return json({ error: "forbidden" }, 403);
    const { action } = body;
    if (action === "add" || action === "bootstrap") {
      if (!env("RESEND_API_KEY") || !env("RESEND_FROM_EMAIL")) return json({ error: "configuration" }, 503);
      const email = String(action === "bootstrap" ? env("ADMIN_NOTIFICATION_EMAIL") : body.email).trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return json({ error: "invalid_email" }, 400);
      const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      const added = await rpc("admin_mail_settings_v1", { actor: data.user.id, command: "add", args: { email, hash: await hash(raw) } });
      if (!added) return json({ error: "already_registered" }, 409);
      const link = new URL("/admin/mail-confirm.html", origin);
      link.hash = raw;
      const result = await send(email, "[달타운맵] 알림 이메일 주소 확인", link.href, "admin-confirm/" + await hash(raw));
      return json({ status: result.status }, result.status === "sent" ? 200 : 502);
    }
    if (!["list", "update", "remove"].includes(action)) return json({ error: "action" }, 400);
    return json(await rpc("admin_mail_settings_v1", {
      actor: data.user.id, command: action, args: { email: body.email, kinds: body.kinds, enabled: body.enabled },
    }));
  } catch (error) {
    const code = (error as { code?: string }).code;
    return json({ error: code === "42501" ? "forbidden" : "request_failed" }, code === "42501" ? 403 : 400);
  }
});

