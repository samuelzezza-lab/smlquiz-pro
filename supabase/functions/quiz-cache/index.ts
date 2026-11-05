import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const parseGeneratedArray = (raw: string): any[] => {
  const text = raw.replace(/\uFEFF/g, "").trim()
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "").trim();
  try {
    const direct = JSON.parse(text);
    if (Array.isArray(direct)) return direct;
  } catch { /* Try to recover an array embedded in surrounding text. */ }
  const start = text.indexOf("[");
  if (start < 0) throw new Error("Il provider AI non ha restituito un array JSON.");
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) {
      const parsed = JSON.parse(text.slice(start, i + 1));
      if (Array.isArray(parsed)) return parsed;
      break;
    }
  }
  throw new Error("Il provider AI ha restituito JSON incompleto o non valido.");
};
const tokens = (s: string) => new Set(norm(s).split(/\s+/).filter(x => x.length > 2));
const similarity = (a: string, b: string) => {
  const aa = tokens(a), bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const t of aa) if (bb.has(t)) common++;
  return common / (aa.size + bb.size - common);
};
const shuffle = <T>(a: T[]): T[] => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const x = new Uint32Array(1);
    crypto.getRandomValues(x);
    const j = x[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non supportato." }, 405);

  let db: any = null;
  let activeQuizId: string | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const anthropicModel = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-5-5";
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Configurazione server incompleta." }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticazione richiesta." }, 401);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Sessione non valida." }, 401);
    db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json();
    const action = body.action ?? "get_quiz";

    if (action === "get_wallet") {
      const { data: wallet, error } = await db.from("user_quiz_wallets")
        .select("balance").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      const { data: attempts, error: attemptsError } = await db.from("quiz_attempts")
        .select("started_at").eq("user_id", user.id).eq("access_source", "free");
      if (attemptsError) throw attemptsError;
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      const used = (attempts ?? []).filter((a: { started_at: string }) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(a.started_at)) === today).length;
      return json({ free_used: used, free_remaining: Math.max(0, 5 - used), credits: wallet?.balance ?? 0 });
    }

    if (action === "get_quiz") {
      let materiaId = body.materia_id;
      if (!materiaId && typeof body.capitolo_id === "string") {
        const { data: chapter, error } = await db.from("capitoli")
          .select("materia_id").eq("id", body.capitolo_id).single();
        if (error || !chapter) return json({ error: "Capitolo non trovato." }, 404);
        materiaId = chapter.materia_id;
      }
      const quizNumber = Number(body.quiz_number ?? 1);
      if (typeof materiaId !== "string" || !Number.isInteger(quizNumber) || quizNumber < 1) {
        return json({ error: "Materia e numero quiz valido richiesti." }, 400);
      }
      if (quizNumber > 60) {
        const { data: sets, error: setsError } = await db.from("quiz_sets")
          .select("id,quiz_number").eq("materia_id", materiaId)
          .eq("status", "ready").eq("question_count", 10);
        if (setsError) throw setsError;
        const orderedSets = (sets ?? []).sort((a: any, b: any) => a.quiz_number - b.quiz_number);
        const completeArchive = orderedSets.length === 60
          && orderedSets.every((set: any, index: number) => set.quiz_number === index + 1);
        if (!completeArchive) return json({ error: "La modalità mista si attiva quando sono pronti tutti i 60 quiz della materia." }, 409);
        const { data: allQuestions, error: qError } = await db.from("domande")
          .select("id,concetto_chiave,testo_domanda,opzioni")
          .in("quiz_id", orderedSets.map((set: any) => set.id));
        if (qError) throw qError;
        if (!allQuestions || allQuestions.length !== 600) return json({ error: "Archivio incompleto: attese 600 domande nei 60 quiz." }, 409);
        const questions = shuffle(allQuestions as { id: string; concetto_chiave: string; testo_domanda: string; opzioni: string[] }[]).slice(0, 10);
        const fingerprint = await sha256(questions.map((q: any) => q.id).sort().join(":"));
        return json({ mode: "simulation", materia_id: materiaId, requested_quiz_number: quizNumber, mix_fingerprint: fingerprint, questions });
      }
      const { data: quiz, error: quizError } = await db.from("quiz_sets")
        .select("id,materia_id,quiz_number,status,question_count")
        .eq("materia_id", materiaId).eq("quiz_number", quizNumber).maybeSingle();
      if (quizError) throw quizError;

      if (!quiz || quiz.status !== "ready") {
        if (!anthropicKey) return json({ error: "Chiave Anthropic non configurata sul server. Aggiungi ANTHROPIC_API_KEY nei segreti Supabase." }, 503);
        const { data: claimed, error: claimError } = await db.rpc("claim_quiz_generation", {
          p_materia_id: materiaId, p_quiz_number: quizNumber,
        });
        if (claimError) return json({ error: claimError.message }, 409);
        if (claimed !== true) {
          const { data: current } = await db.from("quiz_sets")
            .select("id,status").eq("materia_id", materiaId).eq("quiz_number", quizNumber).single();
          return json({ status: current?.status ?? "generating", quiz_number: quizNumber, ready: false }, 202);
        }

        const { data: claimedQuiz, error: claimedError } = await db.from("quiz_sets")
          .select("id,materia_id,quiz_number,status").eq("materia_id", materiaId)
          .eq("quiz_number", quizNumber).single();
        if (claimedError || !claimedQuiz) throw claimedError ?? new Error("Quiz non trovato dopo la prenotazione.");
        activeQuizId = claimedQuiz.id;

        const { data: chapter, error: chapterError } = await db.from("capitoli")
          .select("id,nome,materia_id,materie(nome,anno_corso,facolta_id,corso_di_laurea,classe_laurea,facolta(nome,classe_laurea))")
          .eq("materia_id", materiaId).ilike("nome", "Banca generale").single();
        if (chapterError || !chapter) throw chapterError ?? new Error("Banca generale non trovata.");

        const faculty = Array.isArray(chapter.materie?.facolta)
          ? chapter.materie.facolta[0] : chapter.materie?.facolta;
        const courseYear = chapter.materie?.anno_corso ?? null;
        const facultyId = chapter.materie?.facolta_id ?? null;
        const storedDegreeName = chapter.materie?.corso_di_laurea ?? null;
        const storedDegreeClass = chapter.materie?.classe_laurea ?? faculty?.classe_laurea ?? null;
        const academicPath = body.percorso_accademico ?? body.academic_context ?? {};
        const requestedFacultyId = academicPath.facolta_id ?? body.facolta_id;
        const requestedFacultyName = academicPath.facolta ?? body.facolta;
        const requestedDegree = academicPath.corso_di_laurea ?? academicPath.corso_laurea ?? body.corso_di_laurea ?? body.corso_laurea;
        const requestedClass = academicPath.classe_laurea ?? body.classe_laurea;
        const requestedYear = academicPath.anno_corso ?? body.anno_corso;
        const requestedSubject = academicPath.materia ?? academicPath.materia_nome ?? body.materia ?? body.materia_nome;
        if (requestedFacultyId && requestedFacultyId !== facultyId) throw new Error("La facoltà indicata non corrisponde alla materia selezionata.");
        if (requestedFacultyName && norm(String(requestedFacultyName)) !== norm(String(faculty?.nome ?? ""))) throw new Error("La facoltà indicata non corrisponde ai dati della materia.");
        if (requestedYear !== undefined && Number(requestedYear) !== Number(courseYear)) throw new Error("L'anno di corso indicato non corrisponde al percorso accademico della materia.");
        if (requestedDegree && storedDegreeName && norm(String(requestedDegree)) !== norm(String(storedDegreeName))) throw new Error("Il corso di laurea indicato non corrisponde ai dati accademici della materia.");
        if (requestedClass && storedDegreeClass && norm(String(requestedClass)) !== norm(String(storedDegreeClass))) throw new Error("La classe di laurea indicata non corrisponde ai dati accademici della materia.");
        if (requestedSubject && norm(String(requestedSubject)) !== norm(String(chapter.materie?.nome ?? ""))) throw new Error("La materia indicata non corrisponde alla materia selezionata.");
        if ((requestedDegree && !storedDegreeName) || (requestedClass && !storedDegreeClass)) {
          const academicUpdate: Record<string, string> = {};
          if (requestedDegree && !storedDegreeName) academicUpdate.corso_di_laurea = String(requestedDegree).trim();
          if (requestedClass && !storedDegreeClass) academicUpdate.classe_laurea = String(requestedClass).trim();
          const { error: academicUpdateError } = await db.from("materie")
            .update(academicUpdate).eq("id", materiaId);
          if (academicUpdateError) throw academicUpdateError;
        }
        const academicContext = {
          facolta_id: facultyId,
          facolta: faculty?.nome ?? null,
          corso_di_laurea: requestedDegree ?? storedDegreeName ?? null,
          classe_laurea: requestedClass ?? storedDegreeClass,
          anno_corso: courseYear, materia_id: materiaId,
          materia: chapter.materie?.nome ?? materiaId,
        };
        let yearSubjects: string[] = [];
        if (facultyId && courseYear !== null) {
          const { data: siblingSubjects, error: siblingError } = await db.from("materie")
            .select("nome").eq("facolta_id", facultyId).eq("anno_corso", courseYear)
            .order("nome", { ascending: true });
          if (siblingError) throw siblingError;
          yearSubjects = (siblingSubjects ?? []).map((x: { nome: string }) => x.nome);
        }

        const { data: standardProgramRow, error: programReadError } = await db
          .from("programmi_standard").select("programma,versione,stato")
          .eq("materia_id", materiaId).maybeSingle();
        if (programReadError) throw programReadError;
        const savedStandardProgram = standardProgramRow?.stato === "pronto"
          ? standardProgramRow.programma : null;

        const { data: history, error: historyError } = await db.rpc("get_materia_question_history", {
          p_materia_id: materiaId,
        });
        if (historyError) throw historyError;
        const historyRows = Array.isArray(history) ? history : [];

        const PROMPT_VERSION = "2.8";
        const { error: versionError } = await db.from("quiz_sets")
          .update({ prompt_version: PROMPT_VERSION })
          .eq("id", claimedQuiz.id);
        if (versionError) throw versionError;

        const prompt = [
          "RUOLO",
          "Agisci come una commissione di docenti universitari, specialisti della materia, progettisti di prove d'esame e revisori scientifici. Il tuo compito è creare domande che misurino una preparazione universitaria autentica, non nozioni superficiali.",
          "",
          "CONTESTO",
          "Materia: " + (chapter.materie?.nome ?? materiaId),
          "Facoltà: " + (academicContext.facolta ?? "non specificata"),
          "Corso di laurea: " + (academicContext.corso_di_laurea ?? "non specificato"),
          "Classe di laurea: " + (academicContext.classe_laurea ?? "non specificata"),
          "Anno di corso: " + (academicContext.anno_corso ?? "non specificato"),
          "Identificativi del percorso accademico verificato: " + JSON.stringify(academicContext),
          "Altre materie previste nello stesso anno e nello stesso corso: " + (yearSubjects.length ? yearSubjects.join("; ") : "non disponibili"),
          "ATTENZIONE: usa un programma standard italiano orientativo, non il piano di studi di una specifica università. Distingui i contenuti fondamentali della disciplina dalle specializzazioni e calibra profondità e prerequisiti sull'anno del corso.",
          "PROGRAMMA DI RIFERIMENTO: " + (savedStandardProgram ? JSON.stringify(savedStandardProgram) : "Nessun programma specifico salvato. Usa il programma standard italiano orientativo della disciplina, coerente con facoltà, classe di laurea, corso e anno. Non inventare un piano ufficiale di uno specifico ateneo e non restituire il programma: genera esclusivamente le 10 domande richieste."),
          "Numero del quiz: " + quizNumber + " su 60.",
          "Ogni quiz contiene 10 domande. L'intero percorso comprende fino a 60 quiz e 600 domande per materia.",
          "",
          "OBIETTIVO DIDATTICO E PIANO DEI 60 QUIZ",
          "Costruisci mentalmente una mappa ampia e ordinata degli argomenti fondamentali, intermedi e specialistici della materia. Distribuisci progressivamente la copertura nell'arco dei 60 quiz: non esaurire subito un singolo capitolo e non concentrarti sempre sugli argomenti più noti.",
          "Prima di scrivere, esamina tutte le domande precedenti fornite in fondo al prompt. Ricava quali formulazioni, casi specifici e nuclei di ragionamento sono già stati verificati. Gli stessi concetti e argomenti possono ricomparire, ma solo con un'applicazione, una prospettiva o un ragionamento realmente differenti.",
          "Considera il numero del quiz per mantenere una progressione: alterna argomenti fondativi, applicazioni, collegamenti interdisciplinari e contenuti specialistici. Non abbassare la difficoltà nei quiz successivi e non riproporre lo stesso obiettivo di apprendimento già verificato.",
          "",
          "DIFFICOLTÀ E RIGORE",
          "Livello universitario ALTO. Le domande devono essere difficili e selettive, da esame universitario impegnativo e adatte a distinguere una preparazione eccellente da una preparazione soltanto sufficiente. Richiedi ragionamento profondo, applicazione avanzata, analisi critica, confronto tra modelli, interpretazione di dati e casi complessi, collegamenti tra più parti della materia e calcoli articolati quando pertinenti. Evita domande nozionistiche, definizioni semplici, memoria meccanica e quesiti risolvibili per intuizione. La difficoltà deve restare alta in tutti i 60 quiz, senza diventare artificiosamente ambigua o trabocchetto.",
          "Quando adatto alla materia, usa mini-casi, scenari professionali, dati, risultati sperimentali, situazioni concrete, problemi numerici o interpretazione di fenomeni. Non forzare calcoli o casi pratici se non sono pertinenti.",
          "",
          "ORIGINALITÀ E DIVIETO DI RIPETIZIONE",
          "Le 10 nuove domande devono verificare 10 concetti o abilità distinti tra loro.",
          "È vietato riproporre una domanda precedente identica, parafrasata, invertita, con numeri o nomi cambiati, oppure simile nella formulazione o nella struttura del ragionamento.",
          "Puoi riutilizzare gli stessi concetti chiave e gli stessi argomenti del programma, ma devi cambiare in modo sostanziale angolatura, sfumatura, applicazione, caso, dati o trabocchetto concettuale. Non basta sostituire parole, numeri o nomi: il nuovo quesito deve verificare un'applicazione o un ragionamento realmente distinto.",
          "Non creare domande simili tra loro all'interno dello stesso quiz. Ogni domanda deve aggiungere una competenza o conoscenza distinta.",
          "",
          "COSTRUZIONE DELLE DOMANDE",
          "Ogni domanda deve essere autosufficiente, chiara, precisa e formulata in italiano corretto. Inserisci nel testo tutti i dati e le condizioni necessari per rispondere, senza presupporre informazioni non dichiarate.",
          "Varia la forma delle prove: applicazione di principi, interpretazione, confronto tra teorie o metodi, diagnosi di un errore concettuale, analisi di un caso, conseguenze di una modifica, calcolo o scelta della procedura corretta. Usa solo forme pertinenti alla materia.",
          "Evita trabocchetti linguistici, negazioni inutili, ambiguità, dettagli irrilevanti e domande basate su opinioni. Non usare formule come 'tutte le precedenti' o 'nessuna delle precedenti'.",
          "",
          "QUATTRO OPZIONI E UNA SOLA RISPOSTA",
          "Ogni domanda deve avere esattamente quattro opzioni diverse e plausibili. Deve esserci una sola risposta corretta in modo inequivocabile, date le condizioni scritte nella domanda.",
          "I distrattori devono essere credibili e appartenere allo stesso ambito concettuale della risposta corretta. Devono rappresentare errori, confusioni o interpretazioni alternative realistiche, non risposte assurde o palesemente false.",
          "Mantieni le opzioni simili per lunghezza, precisione, struttura grammaticale e livello di dettaglio. Non suggerire la risposta corretta con parole ripetute nella domanda, maggiore lunghezza, assoluti sospetti o dettagli aggiuntivi.",
          "Non inserire due opzioni che potrebbero essere entrambe corrette. Se esistono interpretazioni o scuole differenti, specifica nel testo il contesto necessario oppure scegli un quesito diverso.",
          "",
          "RISPOSTA CORRETTA E SPIEGAZIONE",
          "Verifica autonomamente la soluzione prima di scrivere il risultato. Per calcoli, formule, date, classificazioni e relazioni causali, ricontrolla il procedimento e il risultato.",
          "La risposta_corretta deve coincidere carattere per carattere con una delle quattro opzioni.",
          "La spiegazione deve essere didattica e sostanziale: chiarisci perché la risposta è corretta, quale principio la giustifica e, quando utile, perché i distrattori principali non sono adeguati. Non limitarti a ripetere la risposta.",
          "Non inventare dati, fonti, citazioni, studi, norme, sentenze o dettagli specialistici. Se non sei sicuro che un fatto sia corretto o che esista una sola risposta difendibile, sostituisci la domanda.",
          "",
          "CONTROLLO FINALE OBBLIGATORIO",
          "Prima di restituire il quiz, controlla una per una tutte le 10 domande: correttezza disciplinare; difficoltà universitaria; chiarezza; autosufficienza; una sola risposta valida; quattro opzioni plausibili e distinte; spiegazione corretta; concetto non duplicato nelle altre nove domande; assenza di duplicati o parafrasi rispetto a tutto lo storico.",
          "Se una domanda non supera anche uno solo dei controlli, riscrivila o sostituiscila prima di rispondere. Non dichiarare di aver effettuato controlli: applicali davvero.",
          "",
          "FORMATO DI USCITA OBBLIGATORIO",
          "Restituisci esclusivamente un array JSON puro, valido e composto da esattamente 10 oggetti.",
          "Ogni oggetto deve contenere soltanto questi campi: concetto_chiave, testo_domanda, opzioni (array di esattamente 4 stringhe), risposta_corretta, spiegazione.",
          "Non restituire programmi, metadati, oggetti contenitore o campi aggiuntivi: soltanto l'array delle 10 domande.",
          "Nessun markdown, nessun commento, nessun testo prima o dopo l'array JSON. Usa stringhe JSON valide ed evita virgole finali.",
          "",
          "STORICO COMPLETO DELLE DOMANDE GIÀ PRESENTI IN QUESTA MATERIA. È materiale da evitare, non da copiare:",
          JSON.stringify(historyRows)
        ].join("\n");        const { error: cleanupError } = await db.from("domande").delete().eq("quiz_id", claimedQuiz.id);
        if (cleanupError) throw cleanupError;

        const questionSchema = {
          type: "object",
          properties: {
            concetto_chiave: { type: "string" },
            testo_domanda: { type: "string" },
            opzioni: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
            risposta_corretta: { type: "string" },
            spiegazione: { type: "string" }
          },
          required: ["concetto_chiave", "testo_domanda", "opzioni", "risposta_corretta", "spiegazione"],
          additionalProperties: false
        };
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: anthropicModel,
            max_tokens: 20000,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error("Anthropic API: " + detail.slice(0, 500));
        }
        const payload = await response.json();
        const rawText = (payload.content ?? [])
          .filter((part: any) => part.type === "text" && typeof part.text === "string")
          .map((part: any) => part.text)
          .join("\n");
        const generated = parseGeneratedArray(rawText);
        if (!Array.isArray(generated)) throw new Error("Anthropic non ha restituito un array di domande valido.");
        if (generated.length !== 10) {
          throw new Error("Anthropic ha restituito " + generated.length
            + " domande invece di 10 (stop_reason=" + String(payload.stop_reason ?? "sconosciuto")
            + ", outputTokens=" + String(payload.usage?.output_tokens ?? "sconosciuto") + ").");
        }

        const concepts = new Set<string>();
        for (const q of generated) {
          if (!q || typeof q.concetto_chiave !== "string" || !q.concetto_chiave.trim()
            || typeof q.testo_domanda !== "string" || !q.testo_domanda.trim()
            || !Array.isArray(q.opzioni) || q.opzioni.length !== 4
            || q.opzioni.some((o: unknown) => typeof o !== "string" || !o.trim())
            || new Set(q.opzioni.map((o: string) => norm(o))).size !== 4
            || typeof q.risposta_corretta !== "string" || !q.opzioni.includes(q.risposta_corretta)
            || typeof q.spiegazione !== "string" || !q.spiegazione.trim()) {
            throw new Error("Una o più domande non rispettano i requisiti di qualità.");
          }
          const c = norm(q.concetto_chiave);
          if (concepts.has(c)) throw new Error("I concetti delle nuove domande non sono tutti diversi.");
          concepts.add(c);
          for (const old of historyRows) {
            const oldQuestion = String(old.question ?? "");
            if (norm(q.testo_domanda) === norm(oldQuestion) || similarity(q.testo_domanda, oldQuestion) >= 0.76) {
              throw new Error("Rilevata una domanda uguale o troppo simile a una già presente. Generazione annullata.");
            }
          }
        }

        const targetPositions = generated.map(() => { const x = new Uint32Array(1); crypto.getRandomValues(x); return x[0] % 4; });
        const rows = generated.map((q: any, i: number) => {
          const options = [...q.opzioni];
          const current = options.indexOf(q.risposta_corretta);
          const target = targetPositions[i];
          [options[current], options[target]] = [options[target], options[current]];
          return {
            capitolo_id: chapter.id, quiz_id: claimedQuiz.id,
            concetto_chiave: q.concetto_chiave.trim(),
            testo_domanda: q.testo_domanda.trim(), opzioni: options,
            risposta_corretta: q.risposta_corretta, spiegazione: q.spiegazione.trim(),
          };
        });

        const { error: insertError } = await db.from("domande").insert(rows);
        if (insertError) throw insertError;
        const { error: publishError } = await db.rpc("publish_quiz_set", { p_quiz_set_id: claimedQuiz.id });
        if (publishError) throw publishError;
        activeQuizId = null;
      }

      const { data: readyQuiz, error: readyError } = await db.from("quiz_sets")
        .select("id,quiz_number,status,question_count")
        .eq("materia_id", materiaId).eq("quiz_number", quizNumber).eq("status", "ready").single();
      if (readyError || !readyQuiz) throw readyError ?? new Error("Quiz non pronto.");
      const { data: questions, error: questionsError } = await db.from("domande")
        .select("id,concetto_chiave,testo_domanda,opzioni")
        .eq("quiz_id", readyQuiz.id).order("created_at", { ascending: true });
      if (questionsError) throw questionsError;
      if (!questions || questions.length !== 10) throw new Error("Il quiz non contiene 10 domande.");
      return json({ quiz_set_id: readyQuiz.id, materia_id: materiaId, quiz_number: quizNumber, questions });
    }

    if (action === "get_simulation") {
      const materiaId = body.materia_id;
      if (typeof materiaId !== "string") return json({ error: "materia_id richiesto." }, 400);
      const { data: sets, error: setsError } = await db.from("quiz_sets")
        .select("id,quiz_number").eq("materia_id", materiaId).eq("status", "ready").eq("question_count", 10);
      if (setsError) throw setsError;
      const orderedSets = (sets ?? []).sort((a: any, b: any) => a.quiz_number - b.quiz_number);
      const completeArchive = orderedSets.length === 60
        && orderedSets.every((set: any, index: number) => set.quiz_number === index + 1);
      if (!completeArchive) return json({ error: "La simulazione sarà disponibile dopo 60 quiz completi." }, 409);
      const { data: allQuestions, error: qError } = await db.from("domande")
        .select("id,concetto_chiave,testo_domanda,opzioni").in("quiz_id", sets.map((s: { id: string }) => s.id));
      if (qError) throw qError;
      if (!allQuestions || allQuestions.length !== 600) return json({ error: "Archivio quiz incompleto." }, 409);
      const questions = shuffle(allQuestions as { id: string; concetto_chiave: string; testo_domanda: string; opzioni: string[] }[]).slice(0, 10);
      const fingerprint = await sha256(questions.map((q: { id: string }) => q.id).sort().join(":"));
      return json({ mode: "simulation", materia_id: materiaId, mix_fingerprint: fingerprint, questions });
    }

    if (action === "start_attempt") {
      const { materia_id, mode, quiz_set_id, question_ids, idempotency_key, mix_fingerprint } = body;
      if (typeof materia_id !== "string" || !Array.isArray(question_ids)
        || typeof idempotency_key !== "string" || !idempotency_key.trim()) {
        return json({ error: "Dati del tentativo incompleti." }, 400);
      }
      const { data, error } = await db.rpc("start_quiz_attempt", {
        p_user_id: user.id, p_materia_id: materia_id, p_mode: mode ?? "standard",
        p_quiz_set_id: quiz_set_id ?? null, p_question_ids: question_ids,
        p_idempotency_key: idempotency_key, p_mix_fingerprint: mix_fingerprint ?? null,
      });
      if (error) return json({ error: error.message }, 402);
      return json(data);
    }

    if (action === "submit_answer") {
      const { attempt_id, domanda_id, risposta_selezionata } = body;
      if (typeof attempt_id !== "string" || typeof domanda_id !== "string"
        || typeof risposta_selezionata !== "string") {
        return json({ error: "Tentativo, domanda e risposta selezionata sono richiesti." }, 400);
      }
      const { data: attempt, error: attemptError } = await db.from("quiz_attempts")
        .select("id,user_id,status").eq("id", attempt_id).eq("user_id", user.id).single();
      if (attemptError || !attempt || attempt.status !== "started") return json({ error: "Tentativo non attivo." }, 404);
      const { data: question, error: questionError } = await db.from("domande")
        .select("risposta_corretta,opzioni").eq("id", domanda_id).single();
      if (questionError || !question) return json({ error: "Domanda non trovata." }, 404);
      const optionList = Array.isArray(question.opzioni) ? question.opzioni : [];
      const selectedOption = optionList.find((option: any) =>
        typeof option === "string"
          ? option === risposta_selezionata
          : option && typeof option === "object"
            && (option.testo === risposta_selezionata || option.id === risposta_selezionata)
      );
      if (!selectedOption) return json({ error: "Risposta non valida." }, 400);
      const normalizedAnswer = typeof selectedOption === "string"
        ? selectedOption : String(selectedOption.testo ?? "");
      if (!normalizedAnswer) return json({ error: "Opzione priva di testo valido." }, 400);
      const { data: link, error: linkError } = await db.from("quiz_attempt_questions")
        .select("id").eq("attempt_id", attempt_id).eq("domanda_id", domanda_id).single();
      if (linkError || !link) return json({ error: "La domanda non appartiene a questo tentativo." }, 403);
      const correct = normalizedAnswer === question.risposta_corretta;
      const { error: updateError } = await db.from("quiz_attempt_questions").update({
        risposta_selezionata: normalizedAnswer, esito_corretto: correct, answered_at: new Date().toISOString(),
      }).eq("id", link.id);
      if (updateError) throw updateError;
      const { error: responseError } = await db.from("risposte_utenti").insert({
        user_id: user.id, domanda_id, esito_corretto: correct,
      });
      if (responseError && responseError.code !== "23505") throw responseError;
      return json({ saved: true });
    }

    if (action === "complete_attempt") {
      const attemptId = body.attempt_id;
      if (typeof attemptId !== "string") return json({ error: "attempt_id richiesto." }, 400);
      const { data: attempt, error: attemptError } = await db.from("quiz_attempts")
        .select("id,user_id,status").eq("id", attemptId).eq("user_id", user.id).single();
      if (attemptError || !attempt || attempt.status !== "started") return json({ error: "Tentativo non attivo." }, 404);
      const { data: links, error: linksError } = await db.from("quiz_attempt_questions")
        .select("domanda_id,risposta_selezionata,esito_corretto").eq("attempt_id", attemptId).order("position");
      if (linksError) throw linksError;
      if (!links || links.length !== 10 || links.some((x: any) => x.esito_corretto === null)) {
        return json({ error: "Prima di concludere devi rispondere a tutte e 10 le domande." }, 409);
      }
      const score = links.filter((x: any) => x.esito_corretto === true).length;
      const { error: completeError } = await db.rpc("complete_quiz_attempt", {
        p_attempt_id: attemptId, p_score: score,
      });
      if (completeError) throw completeError;
      const ids = links.map((x: any) => x.domanda_id);
      const { data: questions, error: resultError } = await db.from("domande")
        .select("id,risposta_corretta,spiegazione").in("id", ids);
      if (resultError) throw resultError;
      const byId = new Map<string, any>((questions ?? []).map((q: any) => [q.id, q] as [string, any]));
      const results = links.map((x: any) => ({
        domanda_id: x.domanda_id, risposta_selezionata: x.risposta_selezionata,
        esito_corretto: x.esito_corretto,
        risposta_corretta: byId.get(x.domanda_id)?.risposta_corretta,
        spiegazione: byId.get(x.domanda_id)?.spiegazione,
      }));
      return json({ completed: true, score, total: 10, results });
    }

    return json({ error: "Azione non supportata." }, 400);
  } catch (error) {
    if (db && activeQuizId) {
      await db.from("domande").delete().eq("quiz_id", activeQuizId);
      await db.rpc("fail_quiz_generation", {
        p_quiz_set_id: activeQuizId,
        p_error: error instanceof Error ? error.message : "Errore di generazione",
      });
    }
    return json({ error: error instanceof Error ? error.message : "Errore interno." }, 500);
  }
});