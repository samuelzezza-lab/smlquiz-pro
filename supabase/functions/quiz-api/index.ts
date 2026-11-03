import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Configurazione server incompleta" }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json({ error: "Accesso richiesto" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Sessione non valida. Accedi di nuovo." }, 401);
  const userId = authData.user.id;

  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "profile") {
      const { data: existing, error: readError } = await admin.from("user_profiles").select("user_id,display_name,language,leaderboard_opt_in,privacy_policy_version,terms_version,consented_at").eq("user_id", userId).maybeSingle();
      if (readError) throw readError;
      if (body.mode === "read") {
        if (existing) return json({ profile: existing });
        const { data, error } = await admin.from("user_profiles").insert({ user_id: userId, display_name: authData.user.email?.split("@")[0] ?? "" }).select("user_id,display_name,language,leaderboard_opt_in,privacy_policy_version,terms_version,consented_at").single();
        if (error) throw error;
        return json({ profile: data });
      }
      const values = {
        display_name: String(body.displayName ?? existing?.display_name ?? "").trim().slice(0, 60),
        language: ["it","en","fr","de","es","zh"].includes(String(body.language ?? existing?.language)) ? String(body.language ?? existing?.language) : "it",
        leaderboard_opt_in: body.leaderboardOptIn === true,
        updated_at: new Date().toISOString(),
      };
      const result = existing
        ? await admin.from("user_profiles").update(values).eq("user_id", userId).select("user_id,display_name,language,leaderboard_opt_in,privacy_policy_version,terms_version,consented_at").single()
        : await admin.from("user_profiles").insert({ user_id: userId, ...values }).select("user_id,display_name,language,leaderboard_opt_in,privacy_policy_version,terms_version,consented_at").single();
      if (result.error) throw result.error;
      return json({ profile: result.data });
    }

    if (action === "leaderboard") {
      const { data: attempts, error: attemptsError } = await admin.from("quiz_attempts").select("id,user_id").eq("status", "completed").limit(10000);
      if (attemptsError) throw attemptsError;
      const attemptIds = (attempts ?? []).map((x) => x.id);
      const { data: answers, error: answersError } = attemptIds.length
        ? await admin.from("quiz_attempt_questions").select("attempt_id,esito_corretto").in("attempt_id", attemptIds)
        : { data: [], error: null };
      if (answersError) throw answersError;
      const byAttempt = new Map<string,{correct:number;wrong:number}>();
      for (const answer of answers ?? []) {
        const s = byAttempt.get(answer.attempt_id) ?? {correct:0,wrong:0};
        if (answer.esito_corretto === true) s.correct++;
        if (answer.esito_corretto === false) s.wrong++;
        byAttempt.set(answer.attempt_id,s);
      }
      const byUser = new Map<string,{score:number;correct:number;sessions:number}>();
      for (const attempt of attempts ?? []) {
        const s = byAttempt.get(attempt.id) ?? {correct:0,wrong:0};
        const u = byUser.get(attempt.user_id) ?? {score:0,correct:0,sessions:0};
        u.score += s.correct - s.wrong * 0.25; u.correct += s.correct; u.sessions++;
        byUser.set(attempt.user_id,u);
      }
      const { data: profiles, error: profilesError } = await admin.from("user_profiles").select("user_id,display_name").eq("leaderboard_opt_in",true).neq("display_name","");
      if (profilesError) throw profilesError;
      const ranked = (profiles ?? []).map((p) => ({ name:p.display_name, ...(byUser.get(p.user_id) ?? {score:0,correct:0,sessions:0}) }))
        .filter((x) => x.sessions > 0).sort((a,b) => b.score-a.score).slice(0,50);
      return json({ leaderboard: ranked });
    }
    if (action === "consent") {
      if (body.accepted !== true) return json({ error: "Il consenso richiesto non risulta accettato" }, 400);
      const values = { privacy_policy_version: "2026-11-03", terms_version: "2026-11-03", consented_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const { data: existing, error: readError } = await admin.from("user_profiles").select("user_id").eq("user_id", userId).maybeSingle();
      if (readError) throw readError;
      const result = existing
        ? await admin.from("user_profiles").update(values).eq("user_id", userId)
        : await admin.from("user_profiles").insert({ user_id: userId, ...values });
      if (result.error) throw result.error;
      return json({ accepted: true });
    }
    if (action === "streaks") {
      const [streak, achievements] = await Promise.all([
        admin.from("user_streaks").select("current_streak,longest_streak,last_study_date").eq("user_id", userId).maybeSingle(),
        admin.from("user_achievements").select("achievement_key,unlocked_at").eq("user_id", userId).order("unlocked_at", { ascending: false }),
      ]);
      if (streak.error) throw streak.error;
      if (achievements.error) throw achievements.error;
      return json({ streak: streak.data ?? { current_streak: 0, longest_streak: 0, last_study_date: null }, achievements: achievements.data ?? [] });
    }
    if (action === "delete-account") {
      if (body.confirmation !== "ELIMINA" || typeof body.password !== "string" || body.password.length < 8) return json({ error: "Conferma la cancellazione e inserisci la password attuale" }, 400);
      let publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const publishableKeysJson = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
      if (publishableKeysJson) {
        try {
          const keys = JSON.parse(publishableKeysJson) as Record<string, unknown>;
          if (typeof keys.default === "string") publishableKey = keys.default;
        } catch {
          return json({ error: "Configurazione autenticazione non valida" }, 500);
        }
      }
      if (!publishableKey) return json({ error: "Configurazione autenticazione incompleta" }, 500);
      const verifier = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
        email: authData.user.email ?? "",
        password: body.password,
      });
      if (verifyError || verified.user?.id !== userId) return json({ error: "Password non corretta" }, 401);
      const { data: attempts, error: attemptsError } = await admin.from("quiz_attempts").select("id").eq("user_id", userId);
      if (attemptsError) throw attemptsError;
      const attemptIds = (attempts ?? []).map((x) => x.id);
      if (attemptIds.length) {
        const { error } = await admin.from("quiz_attempt_questions").delete().in("attempt_id", attemptIds);
        if (error) throw error;
      }
      const deletions = await Promise.all([
        admin.from("quiz_credit_ledger").delete().eq("user_id", userId),
        admin.from("quiz_coupon_redemptions").delete().eq("user_id", userId),
        admin.from("question_reports").delete().eq("user_id", userId),
        admin.from("user_achievements").delete().eq("user_id", userId),
        admin.from("user_streaks").delete().eq("user_id", userId),
        admin.from("user_profiles").delete().eq("user_id", userId),
        admin.from("user_quiz_wallets").delete().eq("user_id", userId),
        admin.from("risposte_utenti").delete().eq("user_id", userId),
      ]);
      const failed = deletions.find((x) => x.error);
      if (failed?.error) throw failed.error;
      const { error: attemptsDeleteError } = await admin.from("quiz_attempts").delete().eq("user_id", userId);
      if (attemptsDeleteError) throw attemptsDeleteError;
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
      if (deleteUserError) throw deleteUserError;
      return json({ deleted: true });
    }

    if (action === "coupon") {
      const code = String(body.code ?? "").trim().toUpperCase();
      if (!code || code.length > 64) return json({ error: "Inserisci un codice valido" }, 400);
      const { data, error } = await admin.rpc("redeem_quiz_coupon", { p_user_id: userId, p_code: code });
      if (error) return json({ error: error.message }, 400);
      return json({ ...data, success: true });
    }

    if (action === "wallet") {
      const dayStart = romeDayStart();
      const [wallet, usage, ledger] = await Promise.all([
        admin.from("user_quiz_wallets").select("balance").eq("user_id", userId).maybeSingle(),
        admin.from("quiz_attempts").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("access_source", "free").gte("started_at", dayStart),
        admin.from("quiz_credit_ledger").select("id,delta,reason,description,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
      ]);
      if (wallet.error) throw wallet.error;
      if (usage.error) throw usage.error;
      if (ledger.error) throw ledger.error;
      return json({
        paidCredits: wallet.data?.balance ?? 0,
        freeUsed: usage.count ?? 0,
        freeRemaining: Math.max(0, 5 - (usage.count ?? 0)),
        ledger: ledger.data ?? [],
      });
    }

    if (action === "history") {
      const { data, error } = await admin.from("quiz_attempts")
        .select("id,materia_id,score,total_questions,completed_at,status,mode,started_at")
        .eq("user_id", userId).eq("status", "completed")
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
      return json({ attempts: (data ?? []).map((x) => {
        const stats = statsByAttempt.get(x.id) ?? { score: 0, correct: 0, wrong: 0 };
        return {
          id: x.id, subject: names.get(x.materia_id) ?? "Quiz",
          score: Number(stats.score.toFixed(2)), correct: stats.correct, wrong: stats.wrong,
          total: x.total_questions, date: x.completed_at ?? x.started_at, mode: x.mode,
        };
      }) });
    }

    if (action === "start") {
      const materiaId = String(body.materiaId ?? "");
      const quizSetId = String(body.quizSetId ?? "");
      const idempotencyKey = String(body.idempotencyKey ?? req.headers.get("Idempotency-Key") ?? "");
      if (!materiaId || !quizSetId || idempotencyKey.length < 12 || idempotencyKey.length > 100) {
        return json({ error: "Dati del quiz incompleti" }, 400);
      }
      const { data: set, error: setError } = await admin.from("quiz_sets")
        .select("id,materia_id,status,question_count")
        .eq("id", quizSetId).eq("materia_id", materiaId).eq("status", "ready").maybeSingle();
      if (setError) throw setError;
      if (!set || set.question_count !== 10) return json({ error: "Questo quiz non è ancora disponibile" }, 404);

      const { data: bank, error: bankError } = await admin.from("domande")
        .select("id,testo_domanda,opzioni").eq("quiz_id", quizSetId);
      if (bankError) throw bankError;
      if (!bank || bank.length !== 10) return json({ error: "Il quiz non contiene 10 domande verificate" }, 409);
      const selected = [...bank].sort(() => Math.random() - 0.5);
      const questionIds = selected.map((q) => q.id);
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
        const message = startError.message.includes("esaurito")
          ? "Hai terminato i 5 quiz gratuiti e non hai crediti extra. Scegli un pacchetto per continuare."
          : startError.message;
        return json({ error: message }, 403);
      }
      const attemptId = started.attempt_id as string;
      const { data: rows, error: rowsError } = await admin.from("quiz_attempt_questions")
        .select("domanda_id,position,domande!inner(id,testo_domanda,opzioni)")
        .eq("attempt_id", attemptId).order("position");
      if (rowsError) throw rowsError;
      const questions = (rows ?? []).map((row) => {
        const q = row.domande as unknown as { id: string; testo_domanda: string; opzioni: string[] };
        return { id: q.id, testo_domanda: q.testo_domanda, opzioni: q.opzioni, position: row.position };
      });
      return json({ attemptId, accessSource: started.access_source, existing: started.existing, questions });
    }

    if (action === "answer") {
      const attemptId = String(body.attemptId ?? "");
      const questionId = String(body.questionId ?? "");
      const selectedAnswer = String(body.selectedAnswer ?? "");
      if (!attemptId || !questionId || !selectedAnswer) return json({ error: "Risposta incompleta" }, 400);
      const { data: attempt, error: attemptError } = await admin.from("quiz_attempts")
        .select("id,status").eq("id", attemptId).eq("user_id", userId).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt || attempt.status !== "started") return json({ error: "Sessione non valida o già conclusa" }, 409);
      const { data: row, error: rowError } = await admin.from("quiz_attempt_questions")
        .select("id,risposta_selezionata,esito_corretto,domande!inner(id,opzioni,risposta_corretta,spiegazione)")
        .eq("attempt_id", attemptId).eq("domanda_id", questionId).maybeSingle();
      if (rowError) throw rowError;
      if (!row) return json({ error: "Domanda non appartenente a questa sessione" }, 404);
      const question = row.domande as unknown as { opzioni: string[]; risposta_corretta: string; spiegazione: string | null };
      if (!question.opzioni.includes(selectedAnswer)) return json({ error: "Risposta non valida" }, 400);
      if (row.risposta_selezionata !== null) {
        return json({ correct: row.esito_corretto, correctAnswer: question.risposta_corretta, explanation: question.spiegazione, alreadyAnswered: true });
      }
      const correct = selectedAnswer === question.risposta_corretta;
      const { error: updateError } = await admin.from("quiz_attempt_questions")
        .update({ risposta_selezionata: selectedAnswer, esito_corretto: correct, answered_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updateError) throw updateError;
      return json({ correct, correctAnswer: question.risposta_corretta, explanation: question.spiegazione, alreadyAnswered: false });
    }

    if (action === "finish") {
      const attemptId = String(body.attemptId ?? "");
      if (!attemptId) return json({ error: "Sessione mancante" }, 400);
      const { data: attempt, error: attemptError } = await admin.from("quiz_attempts")
        .select("id,status").eq("id", attemptId).eq("user_id", userId).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt || attempt.status !== "started") return json({ error: "Sessione già conclusa o non valida" }, 409);
      const { data: answers, error: answersError } = await admin.from("quiz_attempt_questions")
        .select("esito_corretto").eq("attempt_id", attemptId);
      if (answersError) throw answersError;
      const total = answers?.length ?? 0;
      const correct = (answers ?? []).filter((x) => x.esito_corretto === true).length;
      const wrong = (answers ?? []).filter((x) => x.esito_corretto === false).length;
      const { error: completeError } = await admin.rpc("complete_quiz_attempt", {
        p_attempt_id: attemptId, p_score: correct,
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
      return json({ total, correct, wrong, score: Number((correct - wrong * 0.25).toFixed(2)), streak, unlocked });
    }

    if (action === "report") {
      const questionId = String(body.questionId ?? "");
      const category = String(body.category ?? "altro");
      const details = String(body.details ?? "").trim().slice(0, 2000);
      if (!questionId || !["errore_testo","risposta_errata","spiegazione","duplicato","altro"].includes(category)) return json({ error: "Seleziona un tipo di segnalazione valido" }, 400);
      const { data, error } = await admin.from("question_reports").insert({ user_id: userId, question_id: questionId, category, details }).select("id").single();
      if (error) throw error;
      return json({ submitted: true, reportId: data.id });
    }

    return json({ error: "Operazione non riconosciuta" }, 400);
  } catch (error) {
    console.error("quiz-api error:", error);
    return json({ error: errorMessage(error) }, 500);
  }
});
