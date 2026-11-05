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
  const isOwner = (authData.user.email ?? "").trim().toLowerCase() === "samuel.zezza@gmail.com";

  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "profile") {
      const { data: existing, error: readError } = await admin.from("user_profiles").select("user_id,display_name,language,leaderboard_opt_in,university_name,university_city,university_course,privacy_policy_version,terms_version,consented_at").eq("user_id", userId).maybeSingle();
      if (readError) throw readError;
      if (body.mode === "read") {
        if (existing) return json({ profile: existing });
        const { data, error } = await admin.from("user_profiles").insert({ user_id: userId, display_name: authData.user.email?.split("@")[0] ?? "" }).select("user_id,display_name,language,leaderboard_opt_in,university_name,university_city,university_course,privacy_policy_version,terms_version,consented_at").single();
        if (error) throw error;
        return json({ profile: data });
      }
      const values = {
        display_name: String(body.displayName ?? existing?.display_name ?? "").trim().slice(0, 60),
        language: ["it","en","fr","de","es","zh"].includes(String(body.language ?? existing?.language)) ? String(body.language ?? existing?.language) : "it",
        leaderboard_opt_in: body.leaderboardOptIn === true,
        university_name: String(body.universityName ?? existing?.university_name ?? "").trim().slice(0, 140) || null,
        university_city: String(body.universityCity ?? existing?.university_city ?? "").trim().slice(0, 80) || null,
        university_course: String(body.universityCourse ?? existing?.university_course ?? "").trim().slice(0, 120) || null,
        updated_at: new Date().toISOString(),
      };
      const result = existing
        ? await admin.from("user_profiles").update(values).eq("user_id", userId).select("user_id,display_name,language,leaderboard_opt_in,university_name,university_city,university_course,privacy_policy_version,terms_version,consented_at").single()
        : await admin.from("user_profiles").insert({ user_id: userId, ...values }).select("user_id,display_name,language,leaderboard_opt_in,university_name,university_city,university_course,privacy_policy_version,terms_version,consented_at").single();
      if (result.error) throw result.error;
      return json({ profile: result.data });
    }

    if (action === "university-leaderboard") {
      const { data: profile, error: profileError } = await admin.from("user_profiles")
        .select("university_course").eq("user_id", userId).maybeSingle();
      if (profileError) throw profileError;
      const course = String(profile?.university_course ?? "").trim();
      if (!course) return json({ leaderboard: [], needsProfile: true });
      const { data, error } = await admin.rpc("get_university_leaderboard", { p_course: course });
      if (error) throw error;
      return json({ leaderboard: data ?? [], course });
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
      const { data: allowed, error: limitError } = await admin.rpc("claim_ai_request", {
        p_user_id: userId, p_limit: 20,
      });
      if (limitError) throw limitError;
      if (allowed !== true) return json({ error: "Hai raggiunto il limite di 20 richieste AI per oggi. Riprova domani." }, 429);

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
        paidCredits: isOwner ? 1000000000 : (wallet.data?.balance ?? 0),
        freeUsed: isOwner ? 0 : (usage.count ?? 0),
        freeRemaining: isOwner ? 1000000000 : Math.max(0, 5 - (usage.count ?? 0)),
        ownerUnlimited: isOwner,
        ledger: ledger.data ?? [],
      });
    }

    if (action === "study-program") {
      const materiaId = String(body.materiaId ?? "").trim();
      if (!materiaId || materiaId.length > 160) return json({ error: "Materia non valida." }, 400);
      const { data: subject, error: subjectError } = await admin.from("materie")
        .select("id,nome,facolta_id,anno_corso,corso_di_laurea,classe_laurea")
        .eq("id", materiaId).maybeSingle();
      if (subjectError) throw subjectError;
      if (!subject) return json({ error: "Materia non trovata." }, 404);

      const { data: existing, error: existingError } = await admin.from("programmi_standard")
        .select("programma,stato,aggiornato_il").eq("materia_id", materiaId).maybeSingle();
      if (existingError) throw existingError;
      if (existing?.stato === "pronto" && Array.isArray(existing.programma?.moduli)) {
        return json({ program: existing.programma, cached: true });
      }

      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) return json({ error: "Programma specifico non ancora disponibile: manca la chiave Anthropic sul server." }, 503);
      const { data: aiAllowed, error: aiLimitError } = await admin.rpc("claim_ai_request", { p_user_id: userId, p_limit: 20 });
      if (aiLimitError) throw aiLimitError;
      if (aiAllowed !== true) return json({ error: "Hai raggiunto il limite di 20 richieste AI per oggi. Riprova domani." }, 429);
      if (existing?.stato === "in_generazione" && Date.now() - Date.parse(String(existing.aggiornato_il)) < 10 * 60_000) {
        return json({ error: "Il programma di questa materia è già in preparazione. Riprova tra qualche minuto." }, 409);
      }

      const now = new Date().toISOString();
      if (existing) {
        const { data: claimed, error: claimError } = await admin.from("programmi_standard")
          .update({ stato: "in_generazione", aggiornato_il: now })
          .eq("materia_id", materiaId).eq("stato", existing.stato)
          .select("materia_id").maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) return json({ error: "Il programma è già in preparazione. Riprova tra poco." }, 409);
      } else {
        const { error: insertError } = await admin.from("programmi_standard")
          .insert({ materia_id: materiaId, stato: "in_generazione", aggiornato_il: now });
        if (insertError) throw insertError;
      }

      try {
        const { data: faculty } = await admin.from("facolta").select("nome").eq("id", subject.facolta_id).maybeSingle();
        const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-5-5";
        const prompt = [
          "Crea un programma di studio universitario italiano orientativo per una singola materia.",
          "Non attribuire il programma a un ateneo specifico e non inventare fonti o obblighi ufficiali.",
          "Adatta profondità e prerequisiti al corso e all'anno indicati. Evita argomenti generici non pertinenti.",
          "Restituisci esclusivamente un oggetto JSON valido, senza markdown, con questa struttura:",
          '{"materia":"...","livello":"...","anno_corso":1,"standard":"...","obiettivi":["..."],"moduli":[{"titolo":"...","argomenti":["...","...","..."]}],"progressione_quiz":"..."}',
          "Crea da 8 a 12 moduli; ogni modulo deve contenere da 3 a 5 argomenti specifici e non ripetuti.",
          "Inserisci 3-5 obiettivi misurabili. La progressione deve essere adatta a preparare quiz progressivi e prove universitarie.",
          "Materia: " + subject.nome,
          "Facoltà: " + String(faculty?.nome ?? "non specificata"),
          "Corso di laurea: " + String(subject.corso_di_laurea ?? "non specificato"),
          "Classe di laurea: " + String(subject.classe_laurea ?? "non specificata"),
          "Anno di corso: " + String(subject.anno_corso ?? "non specificato"),
        ].join("\n");
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({ model, max_tokens: 7000, messages: [{ role: "user", content: prompt }] }),
        });
        if (!response.ok) {
          const detail = await response.text();
          console.error("Anthropic study program error:", detail.slice(0, 500));
          throw new Error("Il servizio AI non è disponibile in questo momento.");
        }
        const payload = await response.json();
        const rawText = (payload.content ?? [])
          .filter((part: any) => part.type === "text" && typeof part.text === "string")
          .map((part: any) => part.text).join("\n").trim();
        const jsonStart = rawText.indexOf("{");
        const jsonEnd = rawText.lastIndexOf("}");
        if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("Il programma generato non è un JSON valido.");
        const program = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
        if (!Array.isArray(program.obiettivi) || program.obiettivi.length < 3
          || !Array.isArray(program.moduli) || program.moduli.length < 8 || program.moduli.length > 12) {
          throw new Error("Il programma generato non rispetta la struttura richiesta.");
        }
        program.moduli = program.moduli.map((module: any) => ({
          titolo: String(module.titolo ?? "").trim(),
          argomenti: Array.isArray(module.argomenti) ? module.argomenti.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 5) : [],
        }));
        if (program.moduli.some((module: any) => !module.titolo || module.argomenti.length < 3)) {
          throw new Error("Il programma generato contiene moduli incompleti.");
        }
        program.materia = subject.nome;
        program.anno_corso = subject.anno_corso ?? null;
        program.standard = "Programma universitario italiano orientativo, non attribuito a uno specifico ateneo.";
        const { error: saveError } = await admin.from("programmi_standard").update({
          programma: program,
          stato: "pronto",
          preparato_il: now,
          aggiornato_il: now,
          fonte_metodo: "Programma standard orientativo generato con Anthropic Claude; non specifico di ateneo.",
        }).eq("materia_id", materiaId);
        if (saveError) throw saveError;
        return json({ program, cached: false });
      } catch (error) {
        await admin.from("programmi_standard").update({ stato: "errore", aggiornato_il: new Date().toISOString() }).eq("materia_id", materiaId);
        throw error;
      }
    }

    if (action === "study-tutor") {
      const question = String(body.question ?? "").trim().slice(0, 1800);
      if (question.length < 3) return json({ error: "Scrivi una domanda un po' più dettagliata." }, 400);
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) return json({ error: "Tutor non ancora configurato: manca la chiave Anthropic sul server." }, 503);

      const { data: attempts, error: attemptsError } = await admin.from("quiz_attempts")
        .select("materia_id,score,total_questions,completed_at")
        .eq("user_id", userId).eq("status", "completed")
        .order("completed_at", { ascending: false }).limit(12);
      if (attemptsError) throw attemptsError;
      const subjectIds = [...new Set((attempts ?? []).map((a: any) => a.materia_id).filter(Boolean))];
      const subjectNames = new Map<string, string>();
      if (subjectIds.length) {
        const { data: subjectRows, error: subjectError } = await admin.from("materie")
          .select("id,nome").in("id", subjectIds);
        if (subjectError) throw subjectError;
        for (const row of subjectRows ?? []) subjectNames.set(row.id, row.nome);
      }
      const performance = (attempts ?? []).map((a: any) =>
        (subjectNames.get(a.materia_id) ?? a.materia_id) + ": " + a.score + "/" + a.total_questions
      );
      const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-5-5";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          system: [
            "Sei il tutor didattico di SMLQUIZ. Rispondi in italiano, con parole semplici e spiegazioni corrette.",
            "Spiega i passaggi, fai esempi brevi e, quando utile, proponi un piccolo esercizio con soluzione.",
            "Non inventare regole ufficiali TOLC, programmi universitari o fonti. Se non sei sicuro, dichiaralo.",
            "Non dare solo la risposta: aiuta lo studente a capire il ragionamento. Mantieni la risposta chiara e non troppo lunga."
          ].join(" "),
          messages: [{
            role: "user",
            content: "Risultati recenti dello studente (solo contesto facoltativo): " +
              (performance.length ? performance.join("; ") : "nessun quiz completato") +
              "\n\nDomanda dello studente: " + question
          }],
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error("Anthropic tutor error:", detail.slice(0, 500));
        return json({ error: "Il tutor non è disponibile in questo momento. Riprova tra poco." }, 502);
      }
      const payload = await response.json();
      const answer = (payload.content ?? [])
        .filter((part: any) => part.type === "text" && typeof part.text === "string")
        .map((part: any) => part.text).join("\n").trim();
      if (!answer) return json({ error: "Il tutor non ha prodotto una risposta. Riprova." }, 502);
      return json({ answer });
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
      return json({ questions: [...unique.values()], total: unique.size });
    }

    if (action === "weak-topics") {
      const { data: attempts, error: attemptsError } = await admin.from("quiz_attempts")
        .select("id,completed_at").eq("user_id", userId).eq("status", "completed").gte("completed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1000);
      if (attemptsError) throw attemptsError;
      const attemptIds = (attempts ?? []).map((x) => x.id);
      if (!attemptIds.length) return json({ topics: [] });
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
      return json({ topics });
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
      return json({ attempts: (data ?? []).map((x) => {
        const stats = statsByAttempt.get(x.id) ?? { score: 0, correct: 0, wrong: 0 };
        return {
          id: x.id, subject: names.get(x.materia_id) ?? "Quiz",
          score: Number(stats.score.toFixed(2)), correct: stats.correct, wrong: stats.wrong,
          total: x.total_questions, date: x.completed_at ?? x.started_at, mode: x.mode,
        };
      }) });
    }

    if (action === "translate-quiz-set") {
      const quizSetId = String(body.quizSetId ?? "").trim();
      const language = String(body.language ?? "");
      const languageNames: Record<string, string> = { en: "English", fr: "French", de: "German", es: "Spanish", zh: "Simplified Chinese" };
      if (!quizSetId || !languageNames[language]) return json({ error: "Lingua o quiz non valido." }, 400);
      const { data: questions, error: questionsError } = await admin.from("domande")
        .select("id,testo_domanda,concetto_chiave,opzioni,risposta_corretta,spiegazione,traduzioni")
        .eq("quiz_id", quizSetId);
      if (questionsError) throw questionsError;
      if (!questions || questions.length !== 10) return json({ error: "Il quiz non contiene 10 domande verificate." }, 409);
      const missing = questions.filter((q: any) => {
        const t = q.traduzioni?.[language];
        return !t || !t.testo_domanda || !Array.isArray(t.opzioni) || t.opzioni.length !== 4
          || !t.risposta_corretta || !t.spiegazione;
      });
      if (!missing.length) return json({ translated: true, cached: true });
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) return json({ error: "Traduzione non disponibile: manca la chiave Anthropic sul server." }, 503);
      const { data: aiAllowed, error: aiLimitError } = await admin.rpc("claim_ai_request", { p_user_id: userId, p_limit: 20 });
      if (aiLimitError) throw aiLimitError;
      if (aiAllowed !== true) return json({ error: "Hai raggiunto il limite di 20 richieste AI per oggi. Riprova domani." }, 429);
      const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-5-5";
      const prompt = [
        "Traduci integralmente in " + languageNames[language] + " le domande universitarie seguenti.",
        "Mantieni invariati significato, livello, numeri, formule, simboli, unità di misura e nomi propri.",
        "Traduci anche opzioni, risposta corretta, spiegazione e concetto chiave.",
        "Non cambiare il contenuto scientifico e non aggiungere informazioni.",
        "Mantieni le quattro opzioni nello stesso ordine dell'originale.",
        "Restituisci esclusivamente un array JSON valido con un oggetto per ogni domanda e gli stessi id.",
        'Schema: [{"id":"...","testo_domanda":"...","concetto_chiave":"...","opzioni":["...","...","...","..."],"risposta_corretta":"...","spiegazione":"..."}]',
        "Domande: " + JSON.stringify(missing.map((q: any) => ({
          id: q.id, testo_domanda: q.testo_domanda, concetto_chiave: q.concetto_chiave,
          opzioni: q.opzioni, risposta_corretta: q.risposta_corretta, spiegazione: q.spiegazione,
        }))),
      ].join("\n");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: 12000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error("Anthropic translation error:", detail.slice(0, 500));
        return json({ error: "Il servizio di traduzione non è disponibile in questo momento." }, 502);
      }
      const payload = await response.json();
      const rawText = (payload.content ?? [])
        .filter((part: any) => part.type === "text" && typeof part.text === "string")
        .map((part: any) => part.text).join("\n").trim();
      const jsonStart = rawText.indexOf("[");
      const jsonEnd = rawText.lastIndexOf("]");
      if (jsonStart < 0 || jsonEnd <= jsonStart) return json({ error: "La traduzione generata non è valida." }, 502);
      const translatedRows = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
      if (!Array.isArray(translatedRows) || translatedRows.length !== missing.length) {
        return json({ error: "La traduzione non contiene tutte le domande richieste." }, 502);
      }
      const byId = new Map<string, any>(translatedRows.map((t: any) => [String(t.id), t]));
      for (const question of missing as any[]) {
        const t = byId.get(question.id);
        const options = Array.isArray(t?.opzioni) ? t.opzioni.map((x: any) => String(x).trim()) : [];
        const correct = String(t?.risposta_corretta ?? "").trim();
        if (!t || !String(t.testo_domanda ?? "").trim() || options.length !== 4
          || new Set(options.map((x: string) => x.toLocaleLowerCase())).size !== 4
          || !options.includes(correct) || !String(t.spiegazione ?? "").trim()) {
          return json({ error: "Una o più traduzioni non hanno superato i controlli di qualità." }, 502);
        }
        const merged = {
          ...(question.traduzioni ?? {}),
          [language]: {
            testo_domanda: String(t.testo_domanda).trim(),
            concetto_chiave: String(t.concetto_chiave ?? question.concetto_chiave ?? "").trim(),
            opzioni: options,
            risposta_corretta: correct,
            spiegazione: String(t.spiegazione).trim(),
          },
        };
        const { error: saveError } = await admin.from("domande").update({ traduzioni: merged }).eq("id", question.id);
        if (saveError) throw saveError;
      }
      return json({ translated: true, cached: false, count: missing.length });
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
        .select("id,testo_domanda,opzioni,traduzioni").eq("quiz_id", quizSetId);
      if (bankError) throw bankError;
      if (!bank || bank.length !== 10) return json({ error: "Il quiz non contiene 10 domande verificate" }, 409);
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
        const message = startError.message.includes("esaurito")
          ? "Hai terminato i 5 quiz gratuiti e non hai crediti extra. Scegli un pacchetto per continuare."
          : startError.message;
        return json({ error: message }, 403);
      }
      const attemptId = started.attempt_id as string;
      const { data: rows, error: rowsError } = await admin.from("quiz_attempt_questions")
        .select("domanda_id,position,domande!inner(id,testo_domanda,opzioni,traduzioni)")
        .eq("attempt_id", attemptId).order("position");
      if (rowsError) throw rowsError;
      const language = ["it", "en", "fr", "de", "es", "zh"].includes(String(body.language)) ? String(body.language) : "it";
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
      return json({ attemptId, accessSource: started.access_source, existing: started.existing, questions });
    }

    if (action === "answer") {
      const attemptId = String(body.attemptId ?? "");
      const questionId = String(body.questionId ?? "");
      const selectedIndex = Number(body.selectedIndex);
      const legacySelectedAnswer = String(body.selectedAnswer ?? "");
      if (!attemptId || !questionId || (!Number.isInteger(selectedIndex) && !legacySelectedAnswer)) return json({ error: "Risposta incompleta" }, 400);
      const { data: attempt, error: attemptError } = await admin.from("quiz_attempts")
        .select("id,status").eq("id", attemptId).eq("user_id", userId).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt || attempt.status !== "started") return json({ error: "Sessione non valida o già conclusa" }, 409);
      const { data: row, error: rowError } = await admin.from("quiz_attempt_questions")
        .select("id,risposta_selezionata,esito_corretto,domande!inner(id,opzioni,risposta_corretta,spiegazione,traduzioni)")
        .eq("attempt_id", attemptId).eq("domanda_id", questionId).maybeSingle();
      if (rowError) throw rowError;
      if (!row) return json({ error: "Domanda non appartenente a questa sessione" }, 404);
      const question = row.domande as unknown as { opzioni: string[]; risposta_corretta: string; spiegazione: string | null; traduzioni?: Record<string, any> };
      const language = ["it", "en", "fr", "de", "es", "zh"].includes(String(body.language)) ? String(body.language) : "it";
      const localized = localizedQuestion(question, language) as typeof question;
      const localizedOptions = localized.opzioni ?? question.opzioni;
      const localizedCorrect = localized.risposta_corretta ?? question.risposta_corretta;
      const selectedAnswer = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < localizedOptions.length
        ? localizedOptions[selectedIndex] : legacySelectedAnswer;
      if (!localizedOptions.includes(selectedAnswer)) return json({ error: "Risposta non valida" }, 400);
      if (row.risposta_selezionata !== null) {
        return json({ correct: row.esito_corretto, correctAnswer: localized.risposta_corretta, explanation: localized.spiegazione, alreadyAnswered: true });
      }
      const correct = selectedAnswer === localizedCorrect;
      const { data: savedAnswer, error: updateError } = await admin.from("quiz_attempt_questions")
        .update({ risposta_selezionata: selectedAnswer, esito_corretto: correct, answered_at: new Date().toISOString() })
        .eq("id", row.id).is("risposta_selezionata", null).select("id").maybeSingle();
      if (updateError) throw updateError;
      if (!savedAnswer) {
        const { data: currentAnswer, error: currentError } = await admin.from("quiz_attempt_questions")
          .select("esito_corretto").eq("id", row.id).maybeSingle();
        if (currentError) throw currentError;
        return json({ correct: currentAnswer?.esito_corretto === true, correctAnswer: localizedCorrect, explanation: localized.spiegazione, alreadyAnswered: true });
      }
      return json({ correct, correctAnswer: localizedCorrect, explanation: localized.spiegazione, alreadyAnswered: false });
    }

    if (action === "referral-claim") {
      const inviterId = String(body.inviterId ?? "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(inviterId)) return json({ error: "Link invito non valido." }, 400);
      if (inviterId === userId) return json({ claimed: false, reason: "self_referral" });
      const createdAt = Date.parse(String(authData.user.created_at ?? ""));
      if (!authData.user.email_confirmed_at || !Number.isFinite(createdAt) || Date.now() - createdAt > 7 * 86400000) {
        return json({ error: "L'invito si può confermare entro 7 giorni dalla registrazione, dopo la verifica dell'email." }, 403);
      }
      const { count, error: completedError } = await admin.from("quiz_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "completed");
      if (completedError) throw completedError;
      if ((count ?? 0) > 0) return json({ claimed: false, reason: "existing_activity" });
      const { data: inviter, error: inviterError } = await admin.auth.admin.getUserById(inviterId);
      if (inviterError || !inviter.user) return json({ error: "Il link invito non appartiene a un account valido." }, 400);
      const { data: existing, error: existingError } = await admin.from("user_referrals")
        .select("id,inviter_id,status").eq("referred_user_id", userId).maybeSingle();
      if (existingError) throw existingError;
      if (existing) return json({ claimed: existing.inviter_id === inviterId, alreadyClaimed: true, status: existing.status });
      const { data: referral, error: referralError } = await admin.from("user_referrals")
        .insert({ inviter_id: inviterId, referred_user_id: userId })
        .select("id").single();
      if (referralError) {
        if (referralError.code === "23505") return json({ claimed: false, alreadyClaimed: true });
        throw referralError;
      }
      return json({ claimed: true, status: "pending", rewardCredits: 1 });
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
      return json({ total, correct, wrong, score: Number((correct - wrong * 0.25).toFixed(2)), streak, unlocked, referralRewarded });
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

    if (action.startsWith("admin-") && !isOwner) return json({ error: "Permessi amministratore richiesti" }, 403);
    if (action === "admin-list") {
      const [questions, reports, sets, chapters] = await Promise.all([
        admin.from("domande").select("id,capitolo_id,concetto_chiave,testo_domanda,opzioni,risposta_corretta,spiegazione,quiz_id").order("created_at", { ascending: false }).limit(100),
        admin.from("question_reports").select("id,question_id,category,details,status,created_at,domande!inner(testo_domanda)").order("created_at", { ascending: false }).limit(100),
        admin.from("quiz_sets").select("id,materia_id,quiz_number,status,question_count").order("created_at", { ascending: false }).limit(100),
        admin.from("capitoli").select("id,materia_id,nome").order("nome").limit(2000),
      ]);
      for (const result of [questions,reports,sets,chapters]) if (result.error) throw result.error;
      return json({
        questions: questions.data ?? [],
        reports: reports.data ?? [],
        quizSets: sets.data ?? [],
        chapters: chapters.data ?? [],
        systemStatus: {
          anthropicConfigured: Boolean(Deno.env.get("ANTHROPIC_API_KEY")),
          anthropicModel: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-5-5",
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
      if (!capitoloId || !question || options.length !== 4 || options.some((x: string) => !x) || new Set(options).size !== 4 || !options.includes(correct)) return json({ error: "Servono una domanda, quattro risposte diverse e la risposta corretta" }, 400);
      const { data: chapter, error: chapterError } = await admin.from("capitoli").select("id,materia_id").eq("id", capitoloId).maybeSingle();
      if (chapterError) throw chapterError; if (!chapter) return json({ error: "Capitolo non valido" }, 400);
      const values = { capitolo_id: capitoloId, concetto_chiave: String(body.concept ?? "").trim() || question.slice(0,120), testo_domanda: question, opzioni: options, risposta_corretta: correct, spiegazione: String(body.explanation ?? "").trim(), ...(body.quizId !== undefined ? { quiz_id: body.quizId || null } : id ? {} : { quiz_id: null }) };
      const result = id ? await admin.from("domande").update(values).eq("id", id).select("id").single() : await admin.from("domande").insert(values).select("id").single();
      if (result.error) throw result.error; return json({ saved: true, id: result.data.id });
    }
    if (action === "admin-report-status") {
      const id = String(body.reportId ?? ""); const status = String(body.status ?? "");
      if (!id || !["new","reviewing","resolved","rejected"].includes(status)) return json({ error: "Stato non valido" }, 400);
      const { error } = await admin.from("question_reports").update({ status }).eq("id", id); if (error) throw error; return json({ updated: true });
    }
    return json({ error: "Operazione non riconosciuta" }, 400);
  } catch (error) {
    console.error("quiz-api error:", error);
    return json({ error: errorMessage(error) }, 500);
  }
});
