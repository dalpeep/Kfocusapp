import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { buildBusinessMail, sendBusinessMail } from "./transport.mjs";

const env = (key: string) => Deno.env.get(key) ?? "";
const service = env("SUPABASE_SERVICE_ROLE_KEY");
const url = env("SUPABASE_URL");
const db = createClient(url, service, { auth: { persistSession: false } });
const origin = "https://daltownmap.com";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Origin",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
async function isAdmin(request: Request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token || token.length > 8192) return false;
  if (service && token.length === service.length &&
      Buffer.byteLength(token) === Buffer.byteLength(service) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(service))) return true;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile, error: profileError } = await db.from("profiles").select("role")
    .eq("user_id", data.user.id).maybeSingle();
  return !profileError && (profile?.role ?? data.user.app_metadata?.role) === "super_admin";
}

async function remainingQuota() {
  const key = env("BUSINESS_MAIL_USAGE_KEY") || env("RESEND_API_KEY");
  if (!key) return null;
  const response = await fetch("https://api.resend.com/usage", {
    headers: { Authorization: "Bearer " + key }, redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  const { emails } = await response.json();
  const daily = emails?.daily;
  const monthly = emails?.monthly;
  if (daily?.limit !== 100 || monthly?.limit !== 3000 ||
      !Number.isSafeInteger(daily.used) || daily.used < 0 ||
      !Number.isSafeInteger(monthly.used) || monthly.used < 0) return null;
  return { daily: Math.max(0, daily.limit - daily.used), monthly: Math.max(0, monthly.limit - monthly.used) };
}

Deno.serve(async request => {
  const action = new URL(request.url).searchParams.get("action");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (action !== "quota" && action !== "admin-test") return json({ error: "campaign_locked" }, 403);
  const callerOrigin = request.headers.get("Origin");
  if (callerOrigin && callerOrigin !== origin) return json({ error: "origin" }, 403);
  try {
    if (!await isAdmin(request)) return json({ error: "authorization" }, 403);
    const quota = await remainingQuota();
    if (!quota) return json({ error: "quota_unavailable" }, 503);
    if (action === "quota") return json(quota);
    if (quota.daily < 1 || quota.monthly < 1) return json({ error: "quota_exhausted" }, 429);
    const raw = await request.text();
    if (raw.length > 1400000) return json({ error: "message_too_large" }, 413);
    let message;
    try {
      const body = JSON.parse(raw);
      const from = (env("RESEND_FROM_EMAIL").match(/<([^<>]+)>\s*$/)?.[1] || env("RESEND_FROM_EMAIL")).trim();
      if (!from.toLowerCase().endsWith("@daltownmap.com")) return json({ error: "sender_configuration" }, 503);
      message = buildBusinessMail({
        from, to: "info@daltownmap.com", subject: body.subject, body: body.body,
        businessName: "관리자 테스트", images: body.images,
      });
    } catch {
      return json({ error: "invalid_message" }, 400);
    }
    const id = await sendBusinessMail({
      mode: "admin-test", message, requestId: "daltownmap-admin-" + new Date().toISOString().slice(0, 10),
      apiKey: env("RESEND_API_KEY"), internalRecipient: "info@daltownmap.com",
    });
    return json({ id });
  } catch {
    return json({ error: "transport_unavailable" }, 503);
  }
});
