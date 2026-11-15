import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const configuredOrigin = Deno.env.get("APP_ORIGIN");
const allowedOrigins = new Set(["https://smlquiz.it", "https://www.smlquiz.it"]);
if (configuredOrigin) { try { allowedOrigins.add(new URL(configuredOrigin).origin); } catch {} }
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://smlquiz.it",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, idempotency-key, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json"
});
const reply=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:corsHeaders(origin)});
const catalog = new Map([
  ["price_1Uc9w5BCybXKHSfRCFwx5NAT",{type:"single_subject",amount:199,mode:"payment",subjectCount:1}],
  ["price_1Uc9yMBCybXKHSfRP4SJ4wuL",{type:"jolly_100",amount:349,mode:"payment",subjectCount:0}],
  ["price_1UcA1EBCybXKHSfRwyemWunq",{type:"session",amount:499,mode:"payment",subjectCount:5}],
  ["price_1UcA5OBCybXKHSfRTyXzcBji",{type:"site_subscription",amount:699,mode:"subscription",subjectCount:0}]
]);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");
 if(req.method==="OPTIONS"){
   if(origin&&!allowedOrigins.has(origin))return new Response("Origin non autorizzata",{status:403,headers:corsHeaders(null)});
   return new Response("ok",{status:200,headers:corsHeaders(origin)});
 }
 if(req.method!=="POST")return reply({error:"Metodo non consentito"},405,origin);
 if(origin&&!allowedOrigins.has(origin))return reply({error:"Origin non autorizzata"},403,origin);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),stripe=Deno.env.get("STRIPE_SECRET_KEY"),appUrl=Deno.env.get("APP_URL")??"https://smlquiz.it";
 if(!url||!service||!stripe)return reply({error:"Configurazione pagamenti incompleta"},503,origin);
 const auth=req.headers.get("Authorization")??"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token)return reply({error:"Accesso richiesto"},401,origin);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(token);
 if(authError||!authData.user)return reply({error:"Sessione non valida"},401,origin);
 try{
  const body=await req.json(),priceId=String(body.priceId??""),product=catalog.get(priceId);
  if(!product)return reply({error:"Prodotto non riconosciuto"},400,origin);
  const subjectIds=Array.isArray(body.subjectIds)?[...new Set(body.subjectIds.map((x:unknown)=>String(x).trim()).filter(Boolean))]:[];
  if(subjectIds.length!==product.subjectCount)return reply({error:product.subjectCount===1?"Seleziona una materia.":"Seleziona esattamente cinque materie diverse."},400,origin);
  if(subjectIds.length){
    const {data:subjects,error}=await admin.from("materie").select("id").in("id",subjectIds);
    if(error)throw error;
    if((subjects??[]).length!==product.subjectCount)return reply({error:"Una o più materie selezionate non sono valide."},400,origin);
  }
  if(product.mode==="payment"){
    const consentAt=Date.parse(String(body.digitalContentConsentAt??""));
    if(body.digitalContentConsent!==true||!Number.isFinite(consentAt)||consentAt>Date.now()+60000||Date.now()-consentAt>10*60_000){
      return reply({error:"Conferma il consenso alla fornitura immediata dei contenuti digitali prima di procedere."},400,origin);
    }
  }
  const checkoutOrigin=new URL(appUrl).origin;
  const form=new URLSearchParams();
  form.set("mode",product.mode);
  form.set("line_items[0][price]",priceId);
  form.set("line_items[0][quantity]","1");
  form.set("client_reference_id",authData.user.id);
  if(authData.user.email)form.set("customer_email",authData.user.email);
  form.set("metadata[user_id]",authData.user.id);
  form.set("metadata[product_type]",product.type);
  form.set("metadata[price_id]",priceId);
  form.set("metadata[subject_ids]",JSON.stringify(subjectIds));
  if(product.mode==="payment"){
    form.set("metadata[digital_content_consent]","true");
    form.set("metadata[digital_content_consent_at]",new Date(Date.parse(String(body.digitalContentConsentAt))).toISOString());
  }else{
    form.set("subscription_data[metadata][user_id]",authData.user.id);
    form.set("subscription_data[metadata][product_type]",product.type);
    form.set("subscription_data[metadata][price_id]",priceId);
  }
  form.set("success_url",checkoutOrigin+"/?checkout=success&session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url",checkoutOrigin+"/?checkout=cancelled");
  form.set("billing_address_collection","auto");
  const response=await fetch("https://api.stripe.com/v1/checkout/sessions",{
    method:"POST",
    headers:{"Authorization":"Bearer "+stripe,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":req.headers.get("Idempotency-Key")??crypto.randomUUID()},
    body:form
  });
  const session=await response.json();
  if(!response.ok){console.error("Stripe checkout:",session);return reply({error:"Stripe non ha potuto creare il pagamento. Riprova più tardi."},502,origin);}
  return reply({url:session.url,sessionId:session.id,productType:product.type,amount:product.amount},200,origin);
 }catch(e){console.error(e);return reply({error:"Errore nella preparazione del pagamento"},500,origin);}
});
