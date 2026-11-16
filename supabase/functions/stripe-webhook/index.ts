import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function equalHex(a:string,b:string){if(a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0;}
async function signature(secret:string,timestamp:string,body:string){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamp+"."+body));
 return [...new Uint8Array(signed)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
const products = new Map([
 ["price_1Uc9w5BCybXKHSfRCFwx5NAT",{type:"single_subject",amount:199,mode:"payment"}],
 ["price_1Uc9yMBCybXKHSfRP4SJ4wuL",{type:"jolly_100",amount:349,mode:"payment"}],
 ["price_1UcA1EBCybXKHSfRwyemWunq",{type:"session",amount:399,mode:"payment"}],
 ["price_1UcC6ZBCybXKHSfRotiMdjz9",{type:"site_subscription",amount:999,mode:"subscription"}],
 ["price_1UcVlkBCybXKHSfRs9hj7caG",{type:"semestre_single_subject",amount:199,mode:"payment"}],
 ["price_1UcVo8BCybXKHSfRDXpOyB0q",{type:"semestre_complete",amount:499,mode:"payment"}]
]);
async function getSubscription(stripe:string,id:string){
 const response=await fetch("https://api.stripe.com/v1/subscriptions/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+stripe}});
 const data=await response.json();
 if(!response.ok)throw new Error("Impossibile verificare la subscription Stripe");
 return data;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),secret=Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET"),stripe=Deno.env.get("STRIPE_SECRET_KEY");
 if(!url||!service||!secret||!stripe)return new Response("Webhook not configured",{status:503});
 const raw=await req.text(),header=req.headers.get("Stripe-Signature")??"";
 const fields=header.split(",").map(x=>x.split("=")),ts=fields.find(x=>x[0]==="t")?.[1],signatures=fields.filter(x=>x[0]==="v1").map(x=>x[1]);
 if(!ts||Math.abs(Date.now()/1000-Number(ts))>300)return new Response("Invalid timestamp",{status:400});
 const expected=await signature(secret,ts,raw);
 if(!signatures.some(s=>equalHex(s,expected)))return new Response("Invalid signature",{status:400});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const event=JSON.parse(raw),obj=event.data?.object;
  if(!["checkout.session.completed","checkout.session.async_payment_succeeded","invoice.paid","invoice.payment_failed","customer.subscription.created","customer.subscription.updated","customer.subscription.paused","customer.subscription.resumed","customer.subscription.deleted"].includes(event.type))return Response.json({received:true,ignored:true});
  let args:any={p_event_id:event.id,p_event_type:event.type};
  if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded"){
    const session=obj,metadata=session?.metadata??{},priceId=String(metadata.price_id??""),product=products.get(priceId);
    if(!product)return new Response("Unknown price", {status:400});
    if(session.mode!==product.mode||session.currency!=="eur"||Number(session.amount_total)!==product.amount)return new Response("Checkout amount or mode mismatch",{status:400});
    const userId=String(metadata.user_id??session.client_reference_id??"");
    if(!userId||(session.client_reference_id&&session.client_reference_id!==userId))return new Response("Invalid user reference",{status:400});
    let subjectIds:string[]=[];
    try{const parsed=JSON.parse(String(metadata.subject_ids??"[]"));if(Array.isArray(parsed))subjectIds=parsed.map((x:unknown)=>String(x));}catch{return new Response("Invalid subject metadata",{status:400});}
    args={...args,p_user_id:userId,p_price_id:priceId,p_checkout_session_id:session.id,p_subject_ids:subjectIds};
    if(product.mode==="payment"){
      if(session.payment_status!=="paid"||metadata.digital_content_consent!=="true")return new Response("Payment or digital consent missing",{status:400});
      const consentAt=Date.parse(String(metadata.digital_content_consent_at??""));
      if(!Number.isFinite(consentAt)||consentAt>Date.now()+60000)return new Response("Invalid digital consent timestamp",{status:400});
      const pi=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
      if(!pi)return new Response("Missing payment intent",{status:400});
      args.p_payment_intent_id=pi;
    }else{
      const subscriptionId=typeof session.subscription==="string"?session.subscription:session.subscription?.id;
      if(!subscriptionId)return new Response("Missing subscription ID",{status:400});
      const subscription=await getSubscription(stripe,subscriptionId);
      if(subscription.metadata?.user_id!==userId)return new Response("Subscription owner mismatch",{status:400});
      args={...args,p_subscription_id:subscription.id,p_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id,
        p_subscription_status:subscription.status,p_current_period_end:subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():null,
        p_cancel_at_period_end:subscription.cancel_at_period_end===true};
    }
  }else if(event.type==="customer.subscription.deleted"){
    const subscription=obj;
    args={...args,p_subscription_id:subscription.id,p_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id,
      p_subscription_status:"canceled",p_current_period_end:subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():null,
      p_cancel_at_period_end:true};
  }else{
    const isSubscriptionEvent=event.type.startsWith("customer.subscription.");
    const subscriptionId=isSubscriptionEvent?obj?.id:(typeof obj?.subscription==="string"?obj.subscription:obj?.parent?.subscription_details?.subscription);
    if(subscriptionId){
      const subscription=await getSubscription(stripe,String(subscriptionId));
      args={...args,p_subscription_id:subscription.id,p_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id,
        p_subscription_status:subscription.status,p_current_period_end:subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():null,
        p_cancel_at_period_end:subscription.cancel_at_period_end===true};
    }
  }
  const {data,error}=await admin.rpc("process_smlquiz_stripe_event",args);
  if(error){console.error("Stripe event fulfillment failed",event.id,error);return new Response("Webhook processing failed",{status:500});}
  return Response.json({received:true,...data});
 }catch(e){console.error("Stripe webhook error",e);return new Response("Webhook processing failed",{status:500});}
});
