-- Do not recreate purchases or entitlements if Stripe delivers a delayed checkout event
-- after the account has already been deleted.
CREATE OR REPLACE FUNCTION public.process_smlquiz_stripe_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_price_id text DEFAULT NULL::text,
  p_checkout_session_id text DEFAULT NULL::text,
  p_payment_intent_id text DEFAULT NULL::text,
  p_subject_ids text[] DEFAULT '{}'::text[],
  p_subscription_id text DEFAULT NULL::text,
  p_customer_id text DEFAULT NULL::text,
  p_subscription_status text DEFAULT NULL::text,
  p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cancel_at_period_end boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_inserted text;
  v_subject text;
  v_expires timestamptz;
  v_count integer;
begin
  if p_event_id is null or p_event_type not in (
    'checkout.session.completed','checkout.session.async_payment_succeeded','invoice.paid','invoice.payment_failed',
    'customer.subscription.created','customer.subscription.updated','customer.subscription.paused',
    'customer.subscription.resumed','customer.subscription.deleted'
  ) then
    raise exception 'Evento Stripe non valido';
  end if;

  insert into public.stripe_webhook_events(event_id,event_type)
  values (p_event_id,p_event_type)
  on conflict (event_id) do nothing
  returning event_id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object('processed',false,'duplicate',true);
  end if;

  if p_event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded') then
    if p_user_id is null or p_checkout_session_id is null or p_price_id is null then
      raise exception 'Checkout Stripe incompleto';
    end if;

    if not exists (select 1 from auth.users u where u.id = p_user_id) then
      return jsonb_build_object('processed',true,'ignored',true,'reason','account_deleted');
    end if;

    if p_price_id = 'price_1Uc9yMBCybXKHSfRP4SJ4wuL' then
      if p_payment_intent_id is null then raise exception 'PaymentIntent mancante'; end if;
      perform public.add_quiz_credits(p_user_id,100,p_event_id,p_payment_intent_id,'Acquisto 100 Quiz Jolly');
      return jsonb_build_object('processed',true,'product','jolly_100');
    elsif p_price_id = 'price_1Uc9w5BCybXKHSfRCFwx5NAT' then
      if coalesce(array_length(p_subject_ids,1),0) <> 1 then raise exception 'Seleziona esattamente una materia'; end if;
      v_expires := now() + interval '30 days';
      insert into public.user_subject_entitlements(user_id,materia_id,entitlement_type,expires_at,stripe_checkout_session_id,stripe_payment_intent_id)
      values (p_user_id,p_subject_ids[1],'single_subject',v_expires,p_checkout_session_id,p_payment_intent_id);
      return jsonb_build_object('processed',true,'product','single_subject','expires_at',v_expires);
    elsif p_price_id = 'price_1UcA1EBCybXKHSfRwyemWunq' then
      if coalesce(array_length(p_subject_ids,1),0) <> 5 or (select count(distinct x) from unnest(p_subject_ids) x) <> 5 then
        raise exception 'Seleziona esattamente cinque materie diverse';
      end if;
      v_expires := now() + interval '180 days';
      foreach v_subject in array p_subject_ids loop
        insert into public.user_subject_entitlements(user_id,materia_id,entitlement_type,expires_at,stripe_checkout_session_id,stripe_payment_intent_id)
        values (p_user_id,v_subject,'session',v_expires,p_checkout_session_id,p_payment_intent_id);
      end loop;
      return jsonb_build_object('processed',true,'product','session','subjects',5,'expires_at',v_expires);
    elsif p_price_id = 'price_1UcVlkBCybXKHSfRs9hj7caG' then
      if p_payment_intent_id is null or coalesce(array_length(p_subject_ids,1),0) <> 1 or p_subject_ids[1] not in ('biologia','chimica','fisica') then
        raise exception 'Selezione materia Semestre Filtro non valida';
      end if;
      insert into public.user_semestre_filtro_entitlements(user_id,subject,entitlement_type,stripe_checkout_session_id,stripe_payment_intent_id)
      values (p_user_id,p_subject_ids[1],'single_subject',p_checkout_session_id,p_payment_intent_id);
      return jsonb_build_object('processed',true,'product','semestre_single_subject','subject',p_subject_ids[1]);
    elsif p_price_id = 'price_1UcVo8BCybXKHSfRDXpOyB0q' then
      if p_payment_intent_id is null or coalesce(array_length(p_subject_ids,1),0) <> 0 then raise exception 'Pacchetto completo Semestre Filtro non valido'; end if;
      insert into public.user_semestre_filtro_entitlements(user_id,subject,entitlement_type,stripe_checkout_session_id,stripe_payment_intent_id)
      values (p_user_id,'all','complete',p_checkout_session_id,p_payment_intent_id);
      return jsonb_build_object('processed',true,'product','semestre_complete','subjects',3);
    elsif p_price_id = 'price_1UcC6ZBCybXKHSfRotiMdjz9' then
      if p_subscription_id is null or p_current_period_end is null then raise exception 'Subscription ID o scadenza Stripe mancanti'; end if;
      insert into public.user_site_subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end,updated_at)
      values (p_user_id,p_customer_id,p_subscription_id,coalesce(p_subscription_status,'incomplete'),p_current_period_end,p_cancel_at_period_end,now())
      on conflict (stripe_subscription_id) do update set
        user_id=excluded.user_id,stripe_customer_id=excluded.stripe_customer_id,status=excluded.status,
        current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=now();
      return jsonb_build_object('processed',true,'product','site_subscription','current_period_end',p_current_period_end);
    else
      raise exception 'Price ID non riconosciuto';
    end if;
  elsif p_event_type in (
    'invoice.paid','invoice.payment_failed','customer.subscription.created','customer.subscription.updated',
    'customer.subscription.paused','customer.subscription.resumed','customer.subscription.deleted'
  ) then
    if p_subscription_id is null then return jsonb_build_object('processed',true,'ignored',true); end if;
    update public.user_site_subscriptions
       set status=coalesce(p_subscription_status,case when p_event_type='customer.subscription.deleted' then 'canceled' else status end),
           current_period_end=coalesce(p_current_period_end,current_period_end),
           cancel_at_period_end=coalesce(p_cancel_at_period_end,false),updated_at=now()
     where stripe_subscription_id=p_subscription_id;
    get diagnostics v_count = row_count;
    return jsonb_build_object('processed',true,'subscription_updated',v_count > 0);
  end if;
  return jsonb_build_object('processed',true);
end;
$function$;
