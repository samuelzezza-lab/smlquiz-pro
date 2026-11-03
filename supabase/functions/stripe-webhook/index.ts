import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const allowed = new Map([['price_1UWEWpBCybXKHSfREO6VERj5',{credits:5,amount:100}],['price_1UWEYHBCybXKHSfRXIqOpDZU',{credits:10,amount:200}],['price_1UWEZwBCybXKHSfRuy0N3K0X',{credits:15,amount:300}]]);
function equalHex(a:string,b:string){if(a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0;}
async function signature(secret:string,timestamp:string,body:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamp+"."+body));return [...new Uint8Array(signed)].map(x=>x.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");
 if(!url||!service||!secret)return new Response("Webhook not configured",{status:503});
 const raw=await req.text(),header=req.headers.get("Stripe-Signature")??"";
 const fields=header.split(",").map(x=>x.split("=")),ts=fields.find(x=>x[0]==="t")?.[1],signatures=fields.filter(x=>x[0]==="v1").map(x=>x[1]);
 if(!ts||Math.abs(Date.now()/1000-Number(ts))>300)return new Response("Invalid timestamp",{status:400});
 const expected=await signature(secret,ts,raw);
 if(!signatures.some(s=>equalHex(s,expected)))return new Response("Invalid signature",{status:400});
 try{
  const event=JSON.parse(raw);
  if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type))return Response.json({received:true});
  const session=event.data?.object;
  if(session?.mode!=="payment"||session?.payment_status!=="paid")return Response.json({received:true,ignored:true});
  const metadata=session.metadata??"";
  const userId=String(metadata.user_id??session.client_reference_id??"");
  const credits=Number(metadata.credits??0);
  const priceId=String(metadata.price_id??"");
  const amount=Number(session.amount_total??0);
  const selected=allowed.get(priceId);
  const consentAt=Date.parse(String(metadata.digital_content_consent_at??""));
  if(!userId||!selected||selected.credits!==credits||selected.amount!==amount||session.currency!=="eur"||
     metadata.digital_content_consent!=="true"||!Number.isFinite(consentAt)||consentAt>Date.now()+60_000||
     (session.client_reference_id&&session.client_reference_id!==userId)){
   return new Response("Invalid checkout metadata",{status:400});
  }
  const paymentIntent=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
  if(!paymentIntent)return new Response("Missing payment intent",{status:400});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.rpc("add_quiz_credits",{p_user_id:userId,p_credits:credits,p_stripe_event_id:event.id,p_payment_intent_id:paymentIntent,p_description:"Acquisto pacchetto "+credits+" quiz"});
  if(error){console.error("Credit fulfillment failed",error);return new Response("Credit fulfillment failed",{status:500});}
  return Response.json({received:true,creditsAdded:data===true?credits:0,idempotent:data===false});
 }catch(e){console.error("Stripe webhook error",e);return new Response("Webhook processing failed",{status:500});}
});
