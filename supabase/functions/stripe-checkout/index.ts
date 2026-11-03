import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, idempotency-key", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const packages = new Map([["price_1UWEWpBCybXKHSfREO6VERj5",{credits:5,amount:100}],["price_1UWEYHBCybXKHSfRXIqOpDZU",{credits:10,amount:200}],["price_1UWEZwBCybXKHSfRuy0N3K0X",{credits:15,amount:300}]]);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Metodo non consentito"},405);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),stripe=Deno.env.get("STRIPE_SECRET_KEY"),appUrl=Deno.env.get("APP_URL");
 if(!url||!service||!stripe||!appUrl)return reply({error:"Configurazione pagamenti incompleta"},503);
 if(Deno.env.get("STRIPE_LIVE_ENABLED")!=="true")return reply({error:"Il checkout è predisposto ma non ancora attivato in produzione."},503);
 const auth=req.headers.get("Authorization")??"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token)return reply({error:"Accesso richiesto"},401);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(token);
 if(authError||!authData.user)return reply({error:"Sessione non valida"},401);
 try{
  const body=await req.json(),priceId=String(body.priceId??""),selected=packages.get(priceId);
  if(!selected)return reply({error:"Pacchetto non riconosciuto"},400);
  const origin=new URL(appUrl).origin;
  const form=new URLSearchParams();
  form.set("mode","payment");form.set("line_items[0][price]",priceId);form.set("line_items[0][quantity]","1");
  form.set("client_reference_id",authData.user.id);
  form.set("metadata[user_id]",authData.user.id);form.set("metadata[credits]",String(selected.credits));form.set("metadata[price_id]",priceId);
  form.set("success_url",origin+"/?checkout=success&session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url",origin+"/?checkout=cancelled");
  form.set("billing_address_collection","auto");
  const response=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{"Authorization":"Bearer "+stripe,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":req.headers.get("Idempotency-Key")??crypto.randomUUID()},body:form});
  const session=await response.json();
  if(!response.ok){console.error("Stripe checkout:",session);return reply({error:"Stripe non ha potuto creare il pagamento. Riprova più tardi."},502);}
  return reply({url:session.url,sessionId:session.id,credits:selected.credits,amount:selected.amount});
 }catch(e){console.error(e);return reply({error:"Errore nella preparazione del pagamento"},500);}
});
