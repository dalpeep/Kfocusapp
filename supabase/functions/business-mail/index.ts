import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { buildBusinessMail, createBusinessMailToken, ResendResponseError, sendBusinessMail } from "./transport.mjs";

const env = (key: string) => Deno.env.get(key) ?? "";
const service = env("SUPABASE_SERVICE_ROLE_KEY");
const url = env("SUPABASE_URL");
const db = createClient(url, service, { auth: { persistSession: false } });
const origin = "https://daltownmap.com";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Origin",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
function failure(code: string, status: number, providerStatus?: number) {
  const reference = crypto.randomUUID();
  console.warn(JSON.stringify({ component: "business-mail", reference, code, status, providerStatus }));
  return json({ error: code, reference }, status);
}
async function administrator(request: Request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token || token.length > 8192) return false;
  if (service && token.length === service.length &&
      Buffer.byteLength(token) === Buffer.byteLength(service) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(service))) return { id:null };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile, error: profileError } = await db.from("profiles").select("role")
    .eq("user_id", data.user.id).maybeSingle();
  return !profileError && (profile?.role ?? data.user.app_metadata?.role) === "super_admin" ? { id:data.user.id } : false;
}

async function rpc(name:string,args:Record<string,unknown>){
  const {data,error}=await db.rpc(name,args);
  if(error)throw error;
  return data;
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function sendCampaign(actor:string,input:any,from:string,quota:{daily:number,monthly:number}){
  const recipients=input.recipients;
  if(input.confirmed!==true || !uuid.test(input.campaignId)||!Array.isArray(recipients)||
     recipients.length<1||recipients.length>13||recipients.some(row=>!uuid.test(row?.id)||typeof row?.email!=="string")){
    return failure("campaign_invalid",400);
  }
  const addresses=new Map(recipients.map(row=>[row.id,row.email]));
  if(addresses.size!==recipients.length||new Set(addresses.values()).size!==recipients.length)return failure("campaign_invalid",400);
  if(quota.daily<addresses.size||quota.monthly<addresses.size)return failure("quota_exhausted",429);
  if(!env("BUSINESS_MAIL_WEBHOOK_SECRET")||!env("BUSINESS_MAIL_POSTAL_ADDRESS"))return failure("campaign_configuration",503);
  let count;
  try{
    count=await rpc("business_mail_confirm_campaign_v1",{p_id:input.campaignId,p_actor:actor,
      p_expected:[...addresses.keys()],p_confirmation:crypto.randomUUID()});
  }catch(error){
    return failure((error as {code?:string})?.code==="23505"?"campaign_duplicate":"campaign_eligibility_changed",409);
  }
  const results={accepted:0,failed:0,uncertain:0,suppressed:0};
  for(let n=0;n<count;n++){
    const row=await rpc("business_mail_claim_delivery_v1",{p_id:input.campaignId});
    if(!row)break;
    if(row.suppressed){results.suppressed++;continue;}
    let state="failed",providerId=null,errorCode="invalid_message";
    try{
      if(addresses.get(row.business_id)!==row.email)throw new Error("Recipient changed");
      const token=createBusinessMailToken("unsubscribe");
      if(!await rpc("business_mail_issue_token_v1",{p_business_id:row.business_id,p_email:row.email,
        p_hash:token.hash,p_purpose:"unsubscribe"}))throw new Error("Cannot issue unsubscribe link");
      const message=buildBusinessMail({from,to:row.email,subject:row.subject,
        body:row.body+"\n\n달타운맵 운영팀\n"+env("BUSINESS_MAIL_POSTAL_ADDRESS"),
        businessName:row.name,images:input.images,unsubscribe:token.link});
      Object.assign(message,{tags:[{name:"category",value:"dtm_business_campaign"}]});
      errorCode="transport";
      providerId=await sendBusinessMail({mode:"campaign",message,requestId:row.id,
        apiKey:env("RESEND_API_KEY"),internalRecipient:row.email});
      state="accepted";errorCode="";
    }catch(error){
      if(errorCode==="transport"){
        state=error instanceof ResendResponseError&&error.status<500&&error.status!==409?"failed":"uncertain";
        errorCode=error instanceof ResendResponseError?"http_"+error.status:"transport";
      }
    }
    if(!await rpc("business_mail_finish_delivery_v1",{p_id:row.id,p_state:state,p_provider_id:providerId,p_error_code:errorCode})){
      return failure("provider_uncertain",503);
    }
    results[state]++;
    if(n+1<count)await new Promise(resolve=>setTimeout(resolve,600));
  }
  return json(results);
}

async function remainingQuota() {
  const configured = env("BUSINESS_MAIL_USAGE_KEY").trim();
  if (!configured) return { error: "quota_key_missing" };
  const key = configured.replace(/^(["'])(.*)\1$/, "$2").trim().replace(/^Bearer\s+/i, "");
  if (!/^re_[a-z0-9_-]+$/i.test(key)) return { error: "quota_key_format" };
  const response = await fetch("https://api.resend.com/usage", {
    headers: { Authorization: "Bearer " + key }, redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { error: response.status === 401 ? "quota_key_invalid" :
      response.status === 403 ? "quota_permission" : "quota_unavailable",
      providerStatus: response.status };
  }
  const { emails } = await response.json();
  const daily = emails?.daily;
  const monthly = emails?.monthly;
  if (daily?.limit !== 100 || monthly?.limit !== 3000 ||
      !Number.isSafeInteger(daily.used) || daily.used < 0 ||
      !Number.isSafeInteger(monthly.used) || monthly.used < 0) return { error: "quota_plan_unverified" };
  return { quota: { daily: Math.max(0, daily.limit - daily.used), monthly: Math.max(0, monthly.limit - monthly.used) } };
}

Deno.serve(async request => {
  const action = new URL(request.url).searchParams.get("action");
  const callerOrigin = request.headers.get("Origin");
  if (callerOrigin && callerOrigin !== origin) return json({ error: "origin" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!["quota","admin-test","campaign","verify"].includes(action||"")) return json({ error: "campaign_locked" }, 403);
  try {
    const actor=await administrator(request);
    if (!actor) return failure("authorization", 403);
    if ((action==="campaign"||action==="verify")&&!actor.id) return failure("authorization",403);
    const usage = await remainingQuota();
    if (!usage.quota) return failure(usage.error, 503, usage.providerStatus);
    const quota = usage.quota;
    if (action === "quota") return json(quota);
    if (quota.daily < 1 || quota.monthly < 1) return json({ error: "quota_exhausted" }, 429);
    const raw = await request.text();
    if (raw.length > 1400000) return json({ error: "message_too_large" }, 413);
    let message;
    try {
      const body = JSON.parse(raw);
      const from = (env("RESEND_FROM_EMAIL").match(/<([^<>]+)>\s*$/)?.[1] || env("RESEND_FROM_EMAIL")).trim();
      if (!from.toLowerCase().endsWith("@daltownmap.com")) return json({ error: "sender_configuration" }, 503);
      if(action==="campaign"&&actor.id)return await sendCampaign(actor.id,body,from,quota);
      if(action==="verify"){
        if(body.confirmed!==true||!uuid.test(body.id)||typeof body.email!=="string")return failure("campaign_invalid",400);
        const token=createBusinessMailToken("verify");
        if(!await rpc("business_mail_issue_token_v1",{p_business_id:body.id,p_email:body.email,p_hash:token.hash,p_purpose:"verify"})){
          return failure("campaign_eligibility_changed",409);
        }
        const verification=buildBusinessMail({from,to:body.email,subject:"달타운맵 업소 이메일 인증",
          body:"달타운맵에 등록된 업소 이메일을 확인해 주세요. 이메일 인증과 홍보 수신 동의는 각각 선택할 수 있습니다. 인증 링크는 24시간 동안 유효합니다."});
        verification.html+='<p><a href="'+token.link.replaceAll("&","&amp;")+'">업소 이메일 인증 열기</a></p>';
        const date=new Date().toISOString().slice(0,10);
        const id=await sendBusinessMail({mode:"verify",message:verification,requestId:date+"-"+body.id,
          apiKey:env("RESEND_API_KEY"),internalRecipient:body.email});
        return json({id});
      }
      message = buildBusinessMail({
        from, to: "info@daltownmap.com", subject: body.subject, body: body.body,
        businessName: "관리자 테스트", images: body.images,
      });
    } catch {
      return json({ error: "invalid_message" }, 400);
    }
    const digest = createHash("sha256").update(JSON.stringify(message)).digest("hex").slice(0, 32);
    try {
      const id = await sendBusinessMail({
        mode: "admin-test", message, requestId: "admin-" + new Date().toISOString().slice(0, 10) + "-" + digest,
        apiKey: env("RESEND_API_KEY"), internalRecipient: "info@daltownmap.com",
      });
      return json({ id });
    } catch (error) {
      if (error instanceof ResendResponseError) {
        return failure(error.status >= 500 || error.status === 409 ? "provider_uncertain" :
          error.status === 429 ? "provider_limit" : "provider_rejected", 502, error.status);
      }
      return failure("provider_uncertain", 503);
    }
  } catch {
    return failure("transport_unavailable", 503);
  }
});
