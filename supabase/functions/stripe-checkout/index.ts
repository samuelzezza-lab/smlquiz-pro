import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const configuredOrigin = Deno.env.get("APP_ORIGIN");
const allowedOrigins = new Set(["https://smlquiz.it", "https://www.smlquiz.it"]);
if (configuredOrigin) { try { allowedOrigins.add(new URL(configuredOrigin).origin); } catch {} }
const corsHeaders = (origin: string | null) => {
  const accepted = origin && allowedOrigins.has(origin) ? origin : (configuredOrigin ? new URL(configuredOrigin).origin : "https://smlquiz.it");
  return {
    "Access-Control-Allow-Origin": accepted,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, idempotency-key, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
};
const reply=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:corsHeaders(origin)});
const packages = new Map([
 ["price_1UaMP6BCybXKHSfRPRAEBhfX",{credits:5,amount:100}],
 ["price_1UaMQKBCybXKHSfRKYkb8GaP",{credits:20,amount:500}]
]);
const supportProducts = new Map([["price_1UaMRGBCybXKHSfReuEL1WYK",{amount:100}]]);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");
 if(req.method==="OPTIONS"){
   if(origin && !allowedOrigins.has(origin)) return new Response("Origin non autorizzata",{status:403,headers:corsHeaders(null)});
   return new Response("ok",{status:200,headers:corsHeaders(origin)});
 }
 if(req.method!=="POST")return reply({error:"Metodo non consentito"},405,origin);
 if(origin && !allowedOrigins.has(origin))return reply({error:"Origin non autorizzata"},403,origin);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),stripe=Deno.env.get("STRIPE_SECRET_KEY"),appUrl=Deno.env.get("APP_URL");
 if(!url||!service||!stripe||!appUrl)return reply({error:"Configurazione pagamenti incompleta"},503,origin);
 const auth=req.headers.get("Authorization")??"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token)return reply({error:"Accesso richiesto"},401,origin);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(token);
 if(authError||!authData.user)return reply({error:"Sessione non valida"},401,origin);
 try{
  const body=await req.json(),priceId=String(body.priceId??""),productType=String(body.productType??"credits");
  const selected=productType==="support"?supportProducts.get(priceId):productType==="credits"?packages.get(priceId):undefined;
  if(!selected)return reply({error:"Prodotto non riconosciuto"},400,origin);
  const consentTimestamp=Date.parse(String(body.digitalContentConsentAt??""));
  if(productType==="credits"&&(body.digitalContentConsent!==true||!Number.isFinite(consentTimestamp)||consentTimestamp>Date.now()+60000||Date.now()-consentTimestamp>10*60_000)){
   return reply({error:"Conferma il consenso richiesto per i contenuti digitali prima di procedere."},400,origin);
  }
  const checkoutOrigin=new URL(appUrl).origin;
  const form=new URLSearchParams();
  form.set("mode","payment");form.set("line_items[0][price]",priceId);form.set("line_items[0][quantity]","1");
  form.set("client_reference_id",authData.user.id);
  if(authData.user.email)form.set("customer_email",authData.user.email);
  form.set("metadata[user_id]",authData.user.id);form.set("metadata[product_type]",productType);form.set("metadata[credits]",String(productType==="credits"?selected.credits:0));form.set("metadata[price_id]",priceId);
  if(productType==="credits"){form.set("metadata[digital_content_consent]","true");form.set("metadata[digital_content_consent_at]",new Date(consentTimestamp).toISOString());}
  form.set("success_url",checkoutOrigin+"/?checkout=success&session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url",checkoutOrigin+"/?checkout=cancelled");form.set("billing_address_collection","auto");
  const response=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{"Authorization":"Bearer "+stripe,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":req.headers.get("Idempotency-Key")??crypto.randomUUID()},body:form});
  const session=await response.json();
  if(!response.ok){console.error("Stripe checkout:",session);return reply({error:"Stripe non ha potuto creare il pagamento. Riprova più tardi."},502,origin);}
  return reply({url:session.url,sessionId:session.id,productType,credits:productType==="credits"?selected.credits:0,amount:selected.amount},200,origin);
 }catch(e){console.error(e);return reply({error:"Errore nella preparazione del pagamento"},500,origin);}
});