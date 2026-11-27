import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createBusinessMailConfirmation } from "./confirmation.mjs";
import { createBusinessMailWebhook } from "./webhook.mjs";

const origin="https://daltownmap.com";
const headers={
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"content-type",
  "Cache-Control":"no-store",
  "Referrer-Policy":"no-referrer",
  Vary:"Origin",
};
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
  auth:{persistSession:false},
});
async function rpc(name:string,args:Record<string,unknown>){
  const {data,error}=await db.rpc(name,args);
  if(error)throw error;
  return data;
}
const confirm=createBusinessMailConfirmation((hash:string,purpose:string,consent:string|null)=>
  rpc("business_mail_consume_token_v1",{p_hash:hash,p_purpose:purpose,p_consent_version:consent}));
const webhook=createBusinessMailWebhook({
  secret:Deno.env.get("BUSINESS_MAIL_WEBHOOK_SECRET"),
  recordEvent:(id:string,provider:string,type:string,hardBounce:boolean)=>
    rpc("business_mail_record_event_v1",{p_event:id,p_provider_id:provider,p_type:type,p_hard_bounce:hardBounce}),
});
Deno.serve(async request=>{
  const action=new URL(request.url).searchParams.get("action");
  if(action==="webhook")return webhook(request);
  if(action!=="confirm")return new Response(null,{status:404,headers});
  if(request.headers.get("Origin")!==origin)return new Response(null,{status:403,headers});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  const result=await confirm(request);
  return new Response(null,{status:result.status,headers});
});
