import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const allowedOrigins = new Set(["https://smlquiz.it", "https://www.smlquiz.it"]);
const configuredOrigin = Deno.env.get("APP_ORIGIN");
if (configuredOrigin && configuredOrigin !== "*") allowedOrigins.add(configuredOrigin);

function corsHeadersFor(origin: string | null) {
  return {
    ...corsHeaders,
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://smlquiz.it",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeadersFor(origin) });
}

function normalizeOptionValue(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}
function findNormalizedOptionIndex(options: string[], value: unknown) {
  const target = normalizeOptionValue(value);
  const exact = options.findIndex(option => normalizeOptionValue(option) === target);
  if (exact >= 0) return exact;
  const raw = String(value ?? "").trim();
  return /^[A-D]$/i.test(raw) ? "ABCD".indexOf(raw.toUpperCase()) : -1;
}

function localizedQuestion<T extends { testo_domanda?: string; opzioni?: string[]; risposta_corretta?: string; spiegazione?: string | null; traduzioni?: Record<string, any> }>(q: T, language: string) {
  const translated = language === "it" ? null : q.traduzioni?.[language];
  if (!translated) return q;
  return {
    ...q,
    testo_domanda: translated.testo_domanda || q.testo_domanda,
    opzioni: Array.isArray(translated.opzioni) && translated.opzioni.length === 4 ? translated.opzioni : q.opzioni,
    risposta_corretta: translated.risposta_corretta || q.risposta_corretta,
    spiegazione: translated.spiegazione ?? q.spiegazione,
  };
}

function sessionIdFromJwt(token: string): string | null {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

function romeDayStart() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  const y = Number(part("year")), m = Number(part("month")), d = Number(part("day"));
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const offset = localNow.getTime() - now.getTime();
  return new Date(Date.UTC(y, m - 1, d) - offset).toISOString();
}

Deno.serve(async (req: Request) => {
  const requestJson = (body: unknown, status = 200) => json(body, status, req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req.headers.get("Origin")) });
  if (req.method !== "POST") return requestJson({ error: "Metodo non consentito" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return requestJson({ error: "Configurazione server incompleta" }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return requestJson({ error: "Accesso richiesto" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return requestJson({ error: "Sessione non valida. Accedi di nuovo." }, 401);
  const userId = authData.user.id;
  const isOwner = (authData.user.email ?? "").trim().toLowerCase() === "samuel.zezza@gmail.com";

  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (!isOwner) {
      const sessionId = sessionIdFromJwt(token);
      if (!sessionId) return requestJson({ error: "Sessione non valida. Accedi di nuovo." }, 401);
      const { data: guardResult, error: guardError } = await admin.rpc("guard_quiz_api_request", {
        p_user_id: userId,
        p_session_id: sessionId,
        p_action: action,
      });
      if (guardError) throw guardError;
      if (!guardResult?.allowed) {
        if (guardResult?.reason === "session_limit") {
          return requestJson({
            error: "Questo account è già attivo su 2 dispositivi. Per continuare, esci da Quizmind su un altro dispositivo e aggiorna questa pagina.",
            code: "SESSION_LIMIT",
            activeSessions: guardResult.active_sessions,
            sessionLimit: guardResult.session_limit,
          }, 409);
        }
        if (guardResult?.reason === "rate_limit") {
          return requestJson({
            error: `Troppe richieste in poco tempo. Riprova tra ${guardResult.retry_after_seconds ?? 60} secondi.`,
            code: "RATE_LIMIT",
            retryAfterSeconds: guardResult.retry_after_seconds ?? 60,
          }, 429);
        }
        return requestJson({ error: "Sessione scaduta o non più valida. Accedi di nuovo.", code: "INVALID_SESSION" }, 401);
      }
    }

    if (action === "session-check") return requestJson({ sessionOk: true });

    if (action === "profile") {
      const profileColumns = "user_id,display_name,language,leaderboard_opt_in,university_id,university_name,university_city,university_course,privacy_policy_version,terms_version,consented_at";
      const { data: existing, error: readError } = await admin.from("user_profiles").select(profileColumns).eq("user_id", userId).maybeSingle();
      if (readError) throw readError;
      if (body.mode === "read") {
        if (existing) {
          if (existing.language !== "it") {
            const { data, error } = await admin.from("user_profiles").update({ language: "it" }).eq("user_id", userId).select(profileColumns).single();
            if (error) throw error;
            return requestJson({ profile: data });
          }
          return requestJson({ profile: existing });
        }
        const { data, error } = await admin.from("user_profiles").insert({ user_id: userId, display_name: authData.user.email?.split("@")[0] ?? "", language: "it" }).select(profileColumns).single();
        if (error) throw error;
        return requestJson({ profile: data });
      }
      let universityId = existing?.university_id ?? null;
      let universityName = String(body.universityName ?? existing?.university_name ?? "").trim().slice(0, 140) || null;
      let universityCity = String(body.universityCity ?? existing?.university_city ?? "").trim().slice(0, 80) || null;
      if (Object.prototype.hasOwnProperty.call(body, "universityId")) {
        const requestedId = String(body.universityId ?? "").trim();
        if (requestedId) {
          const { data: university, error: universityError } = await admin.from("universities").select("id,name,city").eq("id", requestedId).maybeSingle();
          if (universityError) throw universityError;
          if (!university) return requestJson({ error: "Università non valida. Selezionala dall’elenco." }, 400);
          universityId = university.id;
          universityName = university.name;
          universityCity = university.city;
        } else {
          universityId = null;
          universityName = null;
          universityCity = null;
        }
      }
      const values = {
        display_name: String(body.displayName ?? existing?.display_name ?? "").trim().slice(0, 60),
        language: "it",
        leaderboard_opt_in: body.leaderboardOptIn === undefined ? Boolean(existing?.leaderboard_opt_in) : body.leaderboardOptIn === true,
        university_id: universityId,
        university_name: universityName,
        university_city: universityCity,
        university_course: String(body.universityCourse ?? existing?.university_course ?? "").trim().slice(0, 120) || null,
        updated_at: new Date().toISOString(),
      };
      const result = existing
        ? await admin.from("user_profiles").update(values).eq("user_id", userId).select(profileColumns).single()
        : await admin.from("user_profiles").insert({ user_id: userId, ...values }).select(profileColumns).single();
      if (result.error) throw result.error;
      return requestJson({ profile: result.data });
    }

    if (action === "subject-leaderboard") {
      const materiaId = String(body.materiaId ?? "").trim();
      if (!materiaId || materiaId.length > 200) return requestJson({ error: "Materia non valida" }, 400);
      const { data: subject, error: subjectError } = await admin.from("materie")
        .select("id,nome,anno_corso,facolta_id").eq("id", materiaId).maybeSingle();
      if (subjectError) throw subjectError;
      if (!subject) return requestJson({ error: "Materia non trovata" }, 404);
      const { data, error } = await admin.rpc("get_subject_leaderboard", {
        p_materia_id: materiaId,
        p_current_user_id: userId,
      });
      if (error) throw error;
      return requestJson({ leaderboard: data ?? [], subject });
    }

    if (action === "university-leaderboard") {
      const { data: profile, error: profileError } = await admin.from("user_profiles")
        .select("university_course").eq("user_id", userId).maybeSingle();
      if (profileError) throw profileError;
      const course = String(profile?.university_course ?? "").trim();
      if (!course) return requestJson({ leaderboard: [], needsProfile: true });
      const { data, error } = await admin.rpc("get_university_leaderboard", { p_course: course });
      if (error) throw error;
      return requestJson({ leaderboard: data ?? [], course });
    }
    if (action === "consent") {
      if (body.accepted !== true) return requestJson({ error: "Il consenso richiesto non risulta accettato" }, 400);
      const values = { privacy_policy_version: "2026-11-03", terms_version: "2026-11-03", consented_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const { data: existing, error: readError } = await admin.from("user_profiles").select("user_id").eq("user_id", userId).maybeSingle();
      if (readError) throw readError;
      const result = existing
        ? await admin.from("user_profiles").update(values).eq("user_id", userId)
        : await admin.from("user_profiles").insert({ user_id: userId, ...values });
      if (result.error) throw result.error;
      return requestJson({ accepted: true });
    }
    if (action === "streaks") {
      const [streak, achievements] = await Promise.all([
        admin.from("user_streaks").select("current_streak,longest_streak,last_study_date").eq("user_id", userId).maybeSingle(),
        admin.from("user_achievements").select("achievement_key,unlocked_at").eq("user_id", userId).order("unlocked_at", { ascending: false }),
      ]);
      if (streak.error) throw streak.error;
      if (achievements.error) throw achievements.error;
      return requestJson({ streak: streak.data ?? { current_streak: 0, longest_streak: 0, last_study_date: null }, achievements: achievements.data ?? [] });
    }
    if (action === "delete-account") {
      if (body.confirmation !== "ELIMINA" || typeof body.password !== "string" || body.password.length < 8) return requestJson({ error: "Conferma la cancellazione e inserisci la password attuale" }, 400);
      let publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const publishableKeysJson = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
      if (publishableKeysJson) {
        try {
          const keys = JSON.parse(publishableKeysJson) as Record<string, unknown>;
          if (typeof keys.default === "string") publishableKey = keys.default;
        } catch {
          return requestJson({ error: "Configurazione autenticazione non valida" }, 500);
        }
      }
      if (!publishableKey) return requestJson({ error: "Configurazione autenticazione incompleta" }, 500);
      const verifier = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
        email: authData.user.email ?? "",
        password: body.password,
      });
      if (verifyError || verified.user?.id !== userId) return requestJson({ error: "Password non corretta" }, 401);

      // Prima di cancellare l'account, annulla davvero ogni abbonamento Stripe ancora attivo.
      const { data: subscriptions, error: subscriptionsError } = await admin.from("user_site_subscriptions")
        .select("stripe_subscription_id,status").eq("user_id", userId);
      if (subscriptionsError) throw subscriptionsError;
      const cancellable = (subscriptions ?? []).filter((s) => !["canceled","incomplete_expired"].includes(String(s.status)));
      if (cancellable.length) {
        const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
        if (!stripeSecret) return requestJson({ error: "Non posso completare la cancellazione: impossibile verificare e interrompere l'abbonamento. Contatta l'assistenza." }, 503);
        for (const subscription of cancellable) {
          const response = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(subscription.stripe_subscription_id), {
            method: "DELETE",
            headers: { Authorization: "Bearer " + stripeSecret },
          });
          if (!response.ok && response.status !== 404) {
            const detail = await response.text();
            console.error("Stripe subscription cancellation failed:", subscription.stripe_subscription_id, detail.slice(0, 500));
            return requestJson({ error: "Non sono riuscito a interrompere tutti gli abbonamenti. L'account non è stato cancellato: riprova o contatta l'assistenza." }, 502);
          }
        }
      }

      // Elimina prima voti e segnalazioni collegate alle esperienze pubblicate dall'utente.
      const experienceCleanup = await Promise.all([
        admin.from("exam_experience_reports").delete().eq("user_id", userId),
        admin.from("exam_experience_votes").delete().eq("user_id", userId),
      ]);
      const experienceCleanupError = experienceCleanup.find((x) => x.error);
      if (experienceCleanupError?.error) throw experienceCleanupError.error;
      const { error: experiencesDeleteError } = await admin.from("exam_experiences").delete().eq("user_id", userId);
      if (experiencesDeleteError) throw experiencesDeleteError;

      const { data: attempts, error: attemptsError } = await admin.from("quiz_attempts").select("id").eq("user_id", userId);
      if (attemptsError) throw attemptsError;
      const attemptIds = (attempts ?? []).map((x) => x.id);
      if (attemptIds.length) {
        const { error } = await admin.from("quiz_attempt_questions").delete().in("attempt_id", attemptIds);
        if (error) throw error;
      }
      const deletions = await Promise.all([
        admin.from("user_subject_entitlements").delete().eq("user_id", userId),
        admin.from("user_semestre_filtro_entitlements").delete().eq("user_id", userId),
        admin.from("user_site_subscriptions").delete().eq("user_id", userId),
        admin.from("user_study_data").delete().eq("user_id", userId),
        admin.from("semestre_filtro_tentativi").delete().eq("user_id", userId),
        admin.from("quiz_api_rate_limits").delete().eq("user_id", userId),
        admin.from("quiz_credit_ledger").delete().eq("user_id", userId),
        admin.from("quiz_coupon_redemptions").delete().eq("user_id", userId),
        admin.from("question_reports").delete().eq("user_id", userId),
        admin.from("user_achievements").delete().eq("user_id", userId),
        admin.from("user_streaks").delete().eq("user_id", userId),
        admin.from("user_profiles").delete().eq("user_id", userId),
        admin.from("user_quiz_wallets").delete().eq("user_id", userId),
        admin.from("user_materia_quiz_cycles").delete().eq("user_id", userId),
        admin.from("user_quiz_progress").delete().eq("user_id", userId),
        admin.from("user_study_plans").delete().eq("user_id", userId),
        admin.from("user_referrals").delete().eq("inviter_id", userId),
        admin.from("user_referrals").delete().eq("referred_user_id", userId),
        admin.from("risposte_utenti").delete().eq("user_id", userId),
      ]);
      const failed = deletions.find((x) => x.error);
      if (failed?.error) throw failed.error;
      const { error: attemptsDeleteError } = await admin.from("quiz_attempts").delete().eq("user_id", userId);
      if (attemptsDeleteError) throw attemptsDeleteError;
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
      if (deleteUserError) throw deleteUserError;
      return requestJson({ deleted: true });
    }

    if (action === "coupon") {
      const code = String(body.code ?? "").trim().toUpperCase();
      if (!code || code.length > 64) return requestJson({ error: "Inserisci un codice valido" }, 400);
      const { data, error } = await admin.rpc("redeem_quiz_coupon", { p_user_id: userId, p_code: code });
      if (error) return requestJson({ error: error.message }, 400);
      return requestJson({ ...data, success: true });
    }

    if (action === "wallet") {
      const [wallet, ledger, siteSubscriptions, subjectEntitlements, freeAttempts] = await Promise.all([
        admin.from("user_quiz_wallets").select("balance").eq("user_id", userId).maybeSingle(),
        admin.from("quiz_credit_ledger").select("id,delta,reason,description,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
        admin.from("user_site_subscriptions").select("id,status,current_period_end,cancel_at_period_end").eq("user_id", userId)
          .in("status", ["active", "trialing"]).or("current_period_end.is.null,current_period_end.gt." + new Date().toISOString()).limit(1),
        admin.from("user_subject_entitlements").select("id,materia_id,entitlement_type,starts_at,expires_at").eq("user_id", userId)
          .lte("starts_at", new Date().toISOString()).gt("expires_at", new Date().toISOString()),
        admin.from("quiz_attempts").select("materia_id").eq("user_id", userId)
          .eq("status", "completed").eq("access_source", "free"),
      ]);
      if (wallet.error) throw wallet.error;
      if (ledger.error) throw ledger.error;
      if (siteSubscriptions.error) throw siteSubscriptions.error;
      if (subjectEntitlements.error) throw subjectEntitlements.error;
      if (freeAttempts.error) throw freeAttempts.error;
      const freeUsedBySubject: Record<string, number> = {};
      for (const attempt of freeAttempts.data ?? []) {
        freeUsedBySubject[attempt.materia_id] = (freeUsedBySubject[attempt.materia_id] ?? 0) + 1;
      }
      const freeRemainingBySubject = Object.fromEntries(
        Object.entries(freeUsedBySubject).map(([materiaId, used]) => [materiaId, Math.max(0, 5 - used)]),
      );
      const paidCredits = isOwner ? 1000000000 : (wallet.data?.balance ?? 0);
      // Advertising is disabled only for users with an active "Tutto il sito" (illimitato) subscription.
      // Owner privileges and one-off quiz purchases do not remove advertising.
      const hasAdsRemoved = (siteSubscriptions.data?.length ?? 0) > 0;
      return requestJson({
        paidCredits,
        freeUsed: 0,
        freeRemaining: 5,
        freePerSubject: true,
        freeUsedBySubject,
        freeRemainingBySubject,
        hasAdsRemoved,
        activeSiteSubscription: siteSubscriptions.data?.[0] ?? null,
        activeSubjectEntitlements: subjectEntitlements.data ?? [],
        ownerUnlimited: isOwner,
        ledger: ledger.data ?? [],
      });
    }

    if (action === "wrong-questions") {
      const unique = new Map();
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: rows, error } = await admin.from("quiz_attempt_questions")
          .select("domanda_id,answered_at,domande!inner(id,testo_domanda,opzioni,risposta_corretta,spiegazione,traduzioni),quiz_attempts!inner(user_id)")
          .eq("quiz_attempts.user_id", userId)
          .eq("esito_corretto", false)
          .order("answered_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        for (const row of rows ?? []) {
          const raw = row.domande;
          const q = Array.isArray(raw) ? raw[0] : raw;
          if (q?.id && !unique.has(q.id)) unique.set(q.id, {
            id: q.id, testo_domanda: q.testo_domanda, opzioni: q.opzioni,
            risposta_corretta: q.risposta_corretta, spiegazione: q.spiegazione, traduzioni: q.traduzioni ?? {},
          });
        }
        if (!rows || rows.length < pageSize) break;
        offset += pageSize;
      }
      return requestJson({ questions: [...unique.values()], total: unique.size });
    }

    if (action === "weak-topics") {
      const { data: attempts, error: attemptsError } = await admin.from("quiz_attempts")
        .select("id,completed_at").eq("user_id", userId).eq("status", "completed").gte("completed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1000);
      if (attemptsError) throw attemptsError;
      const attemptIds = (attempts ?? []).map((x) => x.id);
      if (!attemptIds.length) return requestJson({ topics: [] });
      const { data: answers, error: answersError } = await admin.from("quiz_attempt_questions")
        .select("domanda_id,esito_corretto").in("attempt_id", attemptIds);
      if (answersError) throw answersError;
      const questionIds = [...new Set((answers ?? []).map((x) => x.domanda_id))];
      const { data: questions, error: questionsError } = questionIds.length
        ? await admin.from("domande").select("id,concetto_chiave,capitolo_id").in("id", questionIds)
        : { data: [], error: null };
      if (questionsError) throw questionsError;
      const chapterIds = [...new Set((questions ?? []).map((x) => x.capitolo_id).filter(Boolean))];
      const { data: chapters, error: chaptersError } = chapterIds.length
        ? await admin.from("capitoli").select("id,nome").in("id", chapterIds)
        : { data: [], error: null };
      if (chaptersError) throw chaptersError;
      const chapterNames = new Map((chapters ?? []).map((x) => [x.id, x.nome]));
      const topicByQuestion = new Map((questions ?? []).map((x) => [
        x.id, String(x.concetto_chiave || chapterNames.get(x.capitolo_id) || "Argomento non classificato").trim(),
      ]));
      const totals = new Map<string, { correct: number; wrong: number }>();
      for (const answer of answers ?? []) {
        const topic = topicByQuestion.get(answer.domanda_id) || "Argomento non classificato";
        const stats = totals.get(topic) ?? { correct: 0, wrong: 0 };
        if (answer.esito_corretto === true) stats.correct++;
        if (answer.esito_corretto === false) stats.wrong++;
        totals.set(topic, stats);
      }
      const topics = [...totals.entries()].map(([topic, stats]) => ({
        topic, correct: stats.correct, wrong: stats.wrong, total: stats.correct + stats.wrong,
        errorRate: stats.correct + stats.wrong ? stats.wrong / (stats.correct + stats.wrong) : 0,
      })).filter((x) => x.total > 0).sort((a, b) => b.errorRate - a.errorRate || b.wrong - a.wrong).slice(0, 8);
      return requestJson({ topics });
    }

    if (action === "history") {
      const { data, error } = await admin.from("quiz_attempts")
        .select("id,materia_id,score,total_questions,completed_at,status,mode,started_at")
        .eq("user_id", userId).eq("status", "completed")
        .gte("completed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("completed_at", { ascending: false }).limit(100);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((x) => x.materia_id))];
      const { data: subjects, error: subjectsError } = ids.length
        ? await admin.from("materie").select("id,nome").in("id", ids)
        : { data: [], error: null };
      if (subjectsError) throw subjectsError;
      const names = new Map((subjects ?? []).map((s) => [s.id, s.nome]));
      const attemptIds = (data ?? []).map((x) => x.id);
      const { data: answerRows, error: answerError } = attemptIds.length
        ? await admin.from("quiz_attempt_questions").select("attempt_id,esito_corretto").in("attempt_id", attemptIds)
        : { data: [], error: null };
      if (answerError) throw answerError;
      const statsByAttempt = new Map<string, { score: number; correct: number; wrong: number }>();
      for (const answer of answerRows ?? []) {
        const stats = statsByAttempt.get(answer.attempt_id) ?? { score: 0, correct: 0, wrong: 0 };
        if (answer.esito_corretto === true) {
          stats.correct++;
          stats.score++;
        } else if (answer.esito_corretto === false) {
          stats.wrong++;
          stats.score -= 0.25;
        }
        statsByAttempt.set(answer.attempt_id, stats);
      }
      return requestJson({ attempts: (data ?? []).map((x) => {
        const stats = statsByAttempt.get(x.id) ?? { score: 0, correct: 0, wrong: 0 };
        return {
          id: x.id, subject: names.get(x.materia_id) ?? "Quiz",
          score: Number(stats.score.toFixed(2)), correct: stats.correct, wrong: stats.wrong,
          total: x.total_questions, date: x.completed_at ?? x.started_at, mode: x.mode,
        };
      }) });
    }

    if (action === "translate-catalog" || action === "translate-quiz-set") {
      return requestJson({ error: "SMLQUIZ è disponibile esclusivamente in italiano." }, 410);
    }

    if (action === "start") {
      const materiaId = String(body.materiaId ?? "");
      const quizSetId = String(body.quizSetId ?? "");
      const idempotencyKey = String(body.idempotencyKey ?? req.headers.get("Idempotency-Key") ?? "");
      if (!materiaId || !quizSetId || idempotencyKey.length < 12 || idempotencyKey.length > 100) {
        return requestJson({ error: "Dati del quiz incompleti" }, 400);
      }
      const { data: set, error: setError } = await admin.from("quiz_sets")
        .select("id,materia_id,status,question_count")
        .eq("id", quizSetId).eq("materia_id", materiaId).eq("status", "ready").maybeSingle();
      if (setError) throw setError;
      if (!set || set.question_count !== 10) return requestJson({ error: "Questo quiz non è ancora disponibile" }, 404);

      const language = "it";
      const { data: bank, error: bankError } = await admin.from("domande")
        .select("id,testo_domanda,opzioni,risposta_corretta,spiegazione,traduzioni").eq("quiz_id", quizSetId);
      if (bankError) throw bankError;
      if (!bank || bank.length !== 10) return requestJson({ error: "Il quiz non contiene 10 domande verificate" }, 409);
      const invalidQuestion = bank.find((q) => {
        const options = Array.isArray(q.opzioni) ? q.opzioni.map(normalizeOptionValue) : [];
        const answerIndex = findNormalizedOptionIndex(Array.isArray(q.opzioni) ? q.opzioni : [], q.risposta_corretta);
        return options.length !== 4 || options.some((option:string) => !option) || new Set(options).size !== 4 || answerIndex < 0;
      });
      if (invalidQuestion) return requestJson({ error: "Questo quiz contiene una domanda con opzioni duplicate o risposta non associata. È stato bloccato per evitare correzioni errate." }, 409);
      const selected = [...bank].sort(() => Math.random() - 0.5);
      const questionIds = selected.map((q) => q.id);
      if (isOwner) {
        const { data: ownerWallet, error: ownerWalletError } = await admin.from("user_quiz_wallets")
          .select("balance").eq("user_id", userId).maybeSingle();
        if (ownerWalletError) throw ownerWalletError;
        if (!ownerWallet || ownerWallet.balance < 100000000) {
          const { error: refillError } = await admin.from("user_quiz_wallets").upsert({
            user_id: userId, balance: 1000000000, updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          if (refillError) throw refillError;
        }
      }

      const { data: started, error: startError } = await admin.rpc("start_quiz_attempt", {
        p_user_id: userId,
        p_materia_id: materiaId,
        p_mode: "standard",
        p_quiz_set_id: quizSetId,
        p_question_ids: questionIds,
        p_idempotency_key: idempotencyKey,
        p_mix_fingerprint: null,
      });
      if (startError) {
        const message = startError.message.includes("Jolly") || startError.message.includes("primi 5 quiz")
          ? "I primi 5 quiz sono gratuiti per ogni materia. Per questo quiz scegli un pass oppure usa un credito Jolly."
          : "Non è stato possibile avviare il quiz. Riprova.";
        return requestJson({ error: message }, 403);
      }
      const attemptId = started.attempt_id as string;
      const { data: rows, error: rowsError } = await admin.from("quiz_attempt_questions")
        .select("domanda_id,position,domande!inner(id,testo_domanda,opzioni,traduzioni)")
        .eq("attempt_id", attemptId).order("position");
      if (rowsError) throw rowsError;
      const questions = (rows ?? []).map((row) => {
        const q = row.domande as unknown as { id: string; testo_domanda: string; opzioni: string[]; traduzioni?: Record<string, any> };
        const localized = localizedQuestion(q, language);
        return {
          id: q.id,
          testo_domanda: localized.testo_domanda ?? q.testo_domanda,
          opzioni: localized.opzioni ?? q.opzioni,
          position: row.position,
        };
      });
      return requestJson({ attemptId, accessSource: started.access_source, existing: started.existing, language, questions });
    }

    if (action === "answer") {
      const attemptId = String(body.attemptId ?? "");
      const questionId = String(body.questionId ?? "");
      const selectedIndex = Number(body.selectedIndex);
      const selectedAnswerInput = String(body.selectedAnswer ?? "").trim();
      if (!attemptId || !questionId || (!selectedAnswerInput && !Number.isInteger(selectedIndex))) return requestJson({ error: "Risposta incompleta" }, 400);
      const { data: attempt, error: attemptError } = await admin.from("quiz_attempts")
        .select("id,status").eq("id", attemptId).eq("user_id", userId).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt || attempt.status !== "started") return requestJson({ error: "Sessione non valida o già conclusa" }, 409);
      const { data: row, error: rowError } = await admin.from("quiz_attempt_questions")
        .select("id,risposta_selezionata,risposta_selezionata_lettera,esito_corretto,domande!inner(id,opzioni,risposta_corretta,spiegazione,traduzioni)")
        .eq("attempt_id", attemptId).eq("domanda_id", questionId).maybeSingle();
      if (rowError) throw rowError;
      if (!row) return requestJson({ error: "Domanda non appartenente a questa sessione" }, 404);
      const question = row.domande as unknown as { opzioni: string[]; risposta_corretta: string; spiegazione: string | null; traduzioni?: Record<string, any> };
      const language = "it";
      const localized = localizedQuestion(question, language) as typeof question;
      const localizedOptions = localized.opzioni ?? question.opzioni;
      const localizedCorrect = localized.risposta_corretta ?? question.risposta_corretta;
      // Usa il testo dell'opzione visualizzata quando presente: resta corretto anche se l'ordine cambia.
      const resolvedSelectedIndex = selectedAnswerInput
        ? localizedOptions.findIndex(option => normalizeOptionValue(option) === normalizeOptionValue(selectedAnswerInput))
        : (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < localizedOptions.length ? selectedIndex : -1);
      if (resolvedSelectedIndex < 0 || resolvedSelectedIndex >= localizedOptions.length) return requestJson({ error: "Risposta non valida: l'opzione selezionata non corrisponde a quelle mostrate." }, 400);
      const selectedAnswer = localizedOptions[resolvedSelectedIndex];
      const selectedLetter = String.fromCharCode(65 + resolvedSelectedIndex);
      const correctIndex = findNormalizedOptionIndex(localizedOptions, localizedCorrect);
      if (correctIndex < 0) return requestJson({ error: "La risposta corretta non corrisponde alle opzioni di questa domanda. Quiz sospeso per evitare una correzione errata." }, 409);
      if (row.risposta_selezionata !== null) {
        return requestJson({
          saved: true,
          selectedLetter: row.risposta_selezionata_lettera ?? null,
          alreadyAnswered: true,
        });
      }
      const correct = resolvedSelectedIndex === correctIndex;
      const { data: savedAnswer, error: updateError } = await admin.from("quiz_attempt_questions")
        .update({
          risposta_selezionata: selectedAnswer,
          risposta_selezionata_lettera: selectedLetter,
          esito_corretto: correct,
          answered_at: new Date().toISOString(),
        })
        .eq("id", row.id).is("risposta_selezionata", null).select("id").maybeSingle();
      if (updateError) throw updateError;
      if (!savedAnswer) {
        const { data: currentAnswer, error: currentError } = await admin.from("quiz_attempt_questions")
          .select("esito_corretto,risposta_selezionata_lettera").eq("id", row.id).maybeSingle();
        if (currentError) throw currentError;
        return requestJson({
          saved: true,
          selectedLetter: currentAnswer?.risposta_selezionata_lettera ?? null,
          alreadyAnswered: true,
        });
      }
      return requestJson({
        saved: true,
        selectedLetter,
        alreadyAnswered: false,
      });
    }

    if (action === "referral-claim") {
      const inviterId = String(body.inviterId ?? "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(inviterId)) return requestJson({ error: "Link invito non valido." }, 400);
      if (inviterId === userId) return requestJson({ claimed: false, reason: "self_referral" });
      const createdAt = Date.parse(String(authData.user.created_at ?? ""));
      if (!authData.user.email_confirmed_at || !Number.isFinite(createdAt) || Date.now() - createdAt > 7 * 86400000) {
        return requestJson({ error: "L'invito si può confermare entro 7 giorni dalla registrazione, dopo la verifica dell'email." }, 403);
      }
      const { count, error: completedError } = await admin.from("quiz_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "completed");
      if (completedError) throw completedError;
      const hasCompletedQuiz = (count ?? 0) > 0;
      const { data: inviter, error: inviterError } = await admin.auth.admin.getUserById(inviterId);
      if (inviterError || !inviter.user) return requestJson({ error: "Il link invito non appartiene a un account valido." }, 400);
      const { data: existing, error: existingError } = await admin.from("user_referrals")
        .select("id,inviter_id,status").eq("referred_user_id", userId).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (existing.inviter_id !== inviterId) return requestJson({ claimed: false, alreadyClaimed: true });
        if (existing.status === "pending" && hasCompletedQuiz) {
          const { data: rewarded, error: rewardError } = await admin.rpc("reward_user_referral", { p_referral_id: existing.id });
          if (rewardError) throw rewardError;
          return requestJson({ claimed: true, alreadyClaimed: true, status: rewarded ? "rewarded" : "pending", rewarded, rewardCredits: 1 });
        }
        return requestJson({ claimed: true, alreadyClaimed: true, status: existing.status });
      }
      const { data: referral, error: referralError } = await admin.from("user_referrals")
        .insert({ inviter_id: inviterId, referred_user_id: userId })
        .select("id").single();
      if (referralError) {
        if (referralError.code === "23505") return requestJson({ claimed: false, alreadyClaimed: true });
        throw referralError;
      }
      if (hasCompletedQuiz) {
        const { data: rewarded, error: rewardError } = await admin.rpc("reward_user_referral", { p_referral_id: referral.id });
        if (rewardError) throw rewardError;
        return requestJson({ claimed: true, status: rewarded ? "rewarded" : "pending", rewarded, rewardCredits: 1 });
      }
      return requestJson({ claimed: true, status: "pending", rewardCredits: 1 });
    }

    if (action === "finish") {
      const attemptId = String(body.attemptId ?? "");
      if (!attemptId) return requestJson({ error: "Sessione mancante" }, 400);
      const { data: attempt, error: attemptError } = await admin.from("quiz_attempts")
        .select("id,status").eq("id", attemptId).eq("user_id", userId).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt || attempt.status !== "started") return requestJson({ error: "Sessione già conclusa o non valida" }, 409);
      const { data: answers, error: answersError } = await admin.from("quiz_attempt_questions")
        .select("position,domanda_id,risposta_selezionata,risposta_selezionata_lettera,esito_corretto,domande!inner(id,testo_domanda,opzioni,risposta_corretta,spiegazione)")
        .eq("attempt_id", attemptId).order("position");
      if (answersError) throw answersError;
      const language = "it";
      const total = answers?.length ?? 0;
      const correct = (answers ?? []).filter((x) => x.esito_corretto === true).length;
      const wrong = (answers ?? []).filter((x) => x.esito_corretto === false).length;
      const { error: completeError } = await admin.rpc("complete_quiz_attempt", {
        p_attempt_id: attemptId, p_score: Number((correct - wrong * 0.25).toFixed(2)),
      });
      if (completeError) throw completeError;
      const { data: streak, error: streakError } = await admin.rpc("update_user_streak", { p_user_id: userId });
      if (streakError) throw streakError;
      const { count: completedCount, error: countError } = await admin.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed");
      if (countError) throw countError;
      const { data: completedAttempts, error: allError } = await admin.from("quiz_attempts").select("id").eq("user_id", userId).eq("status", "completed");
      if (allError) throw allError;
      const completedIds = (completedAttempts ?? []).map((x) => x.id);
      const { data: allAnswers, error: allAnswersError } = completedIds.length
        ? await admin.from("quiz_attempt_questions").select("esito_corretto").in("attempt_id", completedIds)
        : { data: [], error: null };
      if (allAnswersError) throw allAnswersError;
      const totalCorrect = (allAnswers ?? []).filter((x) => x.esito_corretto === true).length;
      const unlocked: string[] = [];
      if ((completedCount ?? 0) >= 1) unlocked.push("first_quiz");
      if ((completedCount ?? 0) >= 5) unlocked.push("five_quizzes");
      if (totalCorrect >= 25) unlocked.push("twenty_five_correct");
      if ((streak?.current_streak ?? 0) >= 3) unlocked.push("streak_3");
      if ((streak?.current_streak ?? 0) >= 7) unlocked.push("streak_7");
      if (unlocked.length) {
        const rows = unlocked.map((achievement_key) => ({ user_id: userId, achievement_key }));
        const { error: achievementError } = await admin.from("user_achievements").upsert(rows, { onConflict: "user_id,achievement_key", ignoreDuplicates: true });
        if (achievementError) throw achievementError;
      }
      let referralRewarded = false;
      const { data: pendingReferral, error: referralLookupError } = await admin.from("user_referrals")
        .select("id").eq("referred_user_id", userId).eq("status", "pending").maybeSingle();
      if (referralLookupError) throw referralLookupError;
      if (pendingReferral) {
        const { data: rewarded, error: rewardError } = await admin.rpc("reward_user_referral", { p_referral_id: pendingReferral.id });
        if (rewardError) throw rewardError;
        referralRewarded = rewarded === true;
      }
      const review = (answers ?? []).map((row) => {
        const raw = row.domande as unknown as { id:string; testo_domanda:string; opzioni:string[]; risposta_corretta:string; spiegazione:string|null };
        const question = Array.isArray(raw) ? raw[0] : raw;
        const localized = localizedQuestion(question, language) as typeof question;
        const options = Array.isArray(localized?.opzioni) ? localized.opzioni : [];
        const correctRaw = String(localized?.risposta_corretta ?? question?.risposta_corretta ?? "").trim();
        const correctIndex = findNormalizedOptionIndex(options, correctRaw);
        const selectedAnswer = String(row.risposta_selezionata ?? "");
        const selectedIndex = selectedAnswer
          ? options.findIndex((option: string) => normalizeOptionValue(option) === normalizeOptionValue(selectedAnswer))
          : -1;
        const normalizedQuestion = {
          id: question?.id ?? row.domanda_id,
          testo_domanda: localized?.testo_domanda ?? question?.testo_domanda ?? "",
          opzioni: options,
          risposta_corretta: correctIndex >= 0 ? options[correctIndex] : correctRaw,
          correct_index: correctIndex,
          spiegazione: question?.spiegazione ?? null,
        };
        const response = selectedAnswer ? {
          selectedAnswer,
          selectedLetter: row.risposta_selezionata_lettera ?? (selectedIndex >= 0 ? String.fromCharCode(65 + selectedIndex) : ""),
          correctAnswer: normalizedQuestion.risposta_corretta,
          correctLetter: correctIndex >= 0 ? String.fromCharCode(65 + correctIndex) : "",
          correctIndex,
          isCorrect: row.esito_corretto === true,
          explanation: normalizedQuestion.spiegazione,
        } : null;
        return { question: normalizedQuestion, response };
      });
      return requestJson({ total, correct, wrong, score: Number((correct - wrong * 0.25).toFixed(2)), streak, unlocked, referralRewarded, review });
    }

    if (action === "report") {
      const questionId = String(body.questionId ?? "");
      const category = String(body.category ?? "altro");
      const details = String(body.details ?? "").trim().slice(0, 2000);
      if (!questionId || !["errore_testo","risposta_errata","spiegazione","duplicato","altro"].includes(category)) return requestJson({ error: "Seleziona un tipo di segnalazione valido" }, 400);
      const { data, error } = await admin.from("question_reports").insert({ user_id: userId, question_id: questionId, category, details }).select("id").single();
      if (error) throw error;
      return requestJson({ submitted: true, reportId: data.id });
    }

    if (action.startsWith("admin-") && !isOwner) return requestJson({ error: "Permessi amministratore richiesti" }, 403);
    if (action === "admin-list") {
      const [questions, reports, sets, chapters] = await Promise.all([
        admin.from("domande").select("id,capitolo_id,concetto_chiave,testo_domanda,opzioni,risposta_corretta,spiegazione,quiz_id").order("created_at", { ascending: false }).limit(100),
        admin.from("question_reports").select("id,question_id,category,details,status,created_at,domande!inner(testo_domanda)").order("created_at", { ascending: false }).limit(100),
        admin.from("quiz_sets").select("id,materia_id,quiz_number,status,question_count").order("created_at", { ascending: false }).limit(100),
        admin.from("capitoli").select("id,materia_id,nome").order("nome").limit(2000),
      ]);
      for (const result of [questions,reports,sets,chapters]) if (result.error) throw result.error;
      return requestJson({
        questions: questions.data ?? [],
        reports: reports.data ?? [],
        quizSets: sets.data ?? [],
        chapters: chapters.data ?? [],
        systemStatus: {
          anthropicConfigured: Boolean(Deno.env.get("ANTHROPIC_API_KEY")),
          anthropicModel: ["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5", "claude-fable-5"].includes(Deno.env.get("ANTHROPIC_MODEL")?.trim() ?? "") ? Deno.env.get("ANTHROPIC_MODEL")!.trim() : "claude-haiku-4-5",
          stripeSecretConfigured: Boolean(Deno.env.get("STRIPE_SECRET_KEY")),
          stripeWebhookConfigured: Boolean(Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET")),
          stripeLiveEnabled: Deno.env.get("STRIPE_LIVE_ENABLED") === "true",
        },
      });
    }
    if (action === "admin-save-question") {
      const id = String(body.id ?? ""); const capitoloId = String(body.capitoloId ?? "");
      const question = String(body.question ?? "").trim(); const options = Array.isArray(body.options) ? body.options.map((x: unknown) => String(x).trim()) : [];
      const correct = String(body.correct ?? "").trim();
      if (!capitoloId || !question || options.length !== 4 || options.some((x: string) => !x) || new Set(options).size !== 4 || !options.includes(correct)) return requestJson({ error: "Servono una domanda, quattro risposte diverse e la risposta corretta" }, 400);
      const { data: chapter, error: chapterError } = await admin.from("capitoli").select("id,materia_id").eq("id", capitoloId).maybeSingle();
      if (chapterError) throw chapterError; if (!chapter) return requestJson({ error: "Capitolo non valido" }, 400);
      const values = { capitolo_id: capitoloId, concetto_chiave: String(body.concept ?? "").trim() || question.slice(0,120), testo_domanda: question, opzioni: options, risposta_corretta: correct, spiegazione: String(body.explanation ?? "").trim(), ...(body.quizId !== undefined ? { quiz_id: body.quizId || null } : id ? {} : { quiz_id: null }) };
      const result = id ? await admin.from("domande").update(values).eq("id", id).select("id").single() : await admin.from("domande").insert(values).select("id").single();
      if (result.error) throw result.error; return requestJson({ saved: true, id: result.data.id });
    }
    if (action === "admin-report-status") {
      const id = String(body.reportId ?? ""); const status = String(body.status ?? "");
      if (!id || !["new","reviewing","resolved","rejected"].includes(status)) return requestJson({ error: "Stato non valido" }, 400);
      const { error } = await admin.from("question_reports").update({ status }).eq("id", id); if (error) throw error; return requestJson({ updated: true });
    }
    return requestJson({ error: "Operazione non riconosciuta" }, 400);
  } catch (error) {
    console.error("quiz-api error:", error instanceof Error ? error.name : "UnknownError");
    return requestJson({ error: "Operazione non riuscita. Riprova tra qualche istante." }, 500);
  }
});
