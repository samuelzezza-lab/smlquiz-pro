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
      return json({ attempts: (data ?? []).map((x) => ({
        id: x.id, subject: names.get(x.materia_id) ?? "Quiz",
        score: Number(x.score ?? 0), total: x.total_questions,
        date: x.completed_at ?? x.started_at, mode: x.mode,
      })) });
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
        .select("domanda_id,position").eq("attempt_id", attemptId).order("position");
      if (rowsError) throw rowsError;
      const questionMap = new Map(selected.map((q) => [q.id, q]));
      const questions = (rows ?? []).map((row) => {
        const q = questionMap.get(row.domanda_id);
        return q ? { id: q.id, testo_domanda: q.testo_domanda, opzioni: q.opzioni, position: row.position } : null;
      }).filter(Boolean);
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
      return json({ total, correct, wrong, score: Number((correct - wrong * 0.25).toFixed(2)) });
    }

    if (action === "report") {
      return json({ error: "Il modulo di segnalazione verrà attivato insieme alla tabella dedicata." }, 501);
    }

    return json({ error: "Operazione non riconosciuta" }, 400);
  } catch (error) {
    console.error("quiz-api error:", error);
    return json({ error: errorMessage(error) }, 500);
  }
});
