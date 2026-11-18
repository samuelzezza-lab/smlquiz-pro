import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const MODEL="claude-haiku-5-5";
const MAX_OUTPUT_TOKENS=30000;
const INPUT_USD_PER_M=0.10, OUTPUT_USD_PER_M=0.50;
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors});}
function normalizeText(s:string){return s.toLocaleLowerCase("it").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function questionValidationErrors(q:any):string[] {
 const errors:string[]=[];
 if(!q||typeof q!=="object")return ["oggetto_domanda_non_valido"];
 if(typeof q.testo_domanda!=="string"||q.testo_domanda.trim().length<90)errors.push("testo_domanda_troppo_corto_o_assente");
 if(typeof q.spiegazione!=="string"||q.spiegazione.trim().length<120)errors.push("spiegazione_troppo_corta_o_assente");
 if(typeof q.concetto_chiave!=="string"||q.concetto_chiave.trim().length<3)errors.push("concetto_chiave_assente");
 if(!Array.isArray(q.opzioni)||q.opzioni.length!==4)errors.push("numero_opzioni_diverso_da_quattro");
 const opts=Array.isArray(q.opzioni)?q.opzioni.map((x:any)=>String(x).trim()):[];
 if(opts.some((x:string)=>x.length<18))errors.push("distrattore_o_opzione_troppo_corta");
 if(new Set(opts.map((x:string)=>normalizeText(x))).size!==opts.length)errors.push("opzioni_duplicate");
 const answer=String(q.risposta_corretta??"").trim();
 if(!opts.includes(answer))errors.push("risposta_corretta_non_corrisponde_a_un_opzione");
 const explanation=normalizeText(typeof q.spiegazione==="string"?q.spiegazione:"");
 if(/quesito va verificato|domanda non valida|risposta non corretta|non e valida come formulata|dunque l opzione/.test(explanation))errors.push("spiegazione_ammette_un_errore");
 if(/opzione [abcd]|risposta [abcd]|prima opzione|seconda opzione|terza opzione|quarta opzione/.test(explanation))errors.push("spiegazione_riferisce_la_posizione_dell_opzione");
 return errors;
}
function validQuestion(q:any):boolean { return questionValidationErrors(q).length===0; }
async function insertQuestionsDirect(db: any, item: any, candidates: any[]) {
  let imported = 0;
  const rejectedForRetry: string[] = [];
  for (const q of candidates) {
    const { error } = await db.from("domande").insert({
      capitolo_id: item.capitolo_id,
      microargomento_id: item.microargomento_id ?? null,
      quiz_id: null,
      concetto_chiave: q.concetto_chiave.trim(),
      testo_domanda: q.testo_domanda.trim(),
      opzioni: q.opzioni.map((x: any) => String(x).trim()),
      risposta_corretta: String(q.risposta_corretta).trim(),
      spiegazione: q.spiegazione.trim()
    });
    if (!error) imported++;
    else rejectedForRetry.push(q.testo_domanda.trim() + " [scartata: " + String(error.message ?? error).slice(0,180) + "]");
  }
  return { imported, rejectedForRetry };
}

function normalizeGeneratedQuestion(q: any): any {
  if (!q || typeof q !== "object") return q;
  const options = Array.isArray(q.options) ? q.options : q.opzioni;
  let correct = q.risposta_corretta;
  if (Number.isInteger(q.correct_answer_index) && Array.isArray(options)
      && q.correct_answer_index >= 0 && q.correct_answer_index < 4) {
    correct = options[q.correct_answer_index];
  }
  return {
    concetto_chiave: q.topic ?? q.concetto_chiave,
    testo_domanda: q.question ?? q.testo_domanda,
    opzioni: options,
    risposta_corretta: correct,
    spiegazione: q.explanation ?? q.spiegazione
  };
}
function questionsFrom(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed.map(normalizeGeneratedQuestion);
  for (const key of ["questions", "domande", "items"]) {
    if (Array.isArray(parsed?.[key])) return parsed[key].map(normalizeGeneratedQuestion);
  }
  return (parsed?.question || parsed?.testo_domanda) ? [normalizeGeneratedQuestion(parsed)] : [];
}
const QUESTION_TOOL=(n:number)=>({name:"generate_questions",description:"Genera esattamente il numero richiesto di domande universitarie conformi al programma e alle regole permanenti.",input_schema:{type:"object",additionalProperties:false,properties:{questions:{type:"array",minItems:n,maxItems:n,items:{type:"object",additionalProperties:false,properties:{question:{type:"string"},options:{type:"array",minItems:4,maxItems:4,items:{type:"string"}},correct_answer_index:{type:"integer",enum:[0,1,2,3]},explanation:{type:"string"},topic:{type:"string"}},required:["question","options","correct_answer_index","explanation","topic"]}}},required:["questions"]}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Metodo non supportato"},405);
 const url=Deno.env.get("SUPABASE_URL"), serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), claudeKey=Deno.env.get("ANTHROPIC_API_KEY") ?? "";
 if(!url||!serviceKey||!claudeKey)return reply({error:"Configurazione server incompleta: verificare ANTHROPIC_API_KEY."},500);
 const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
 const payload=await req.json().catch(()=>({}));
 const token=req.headers.get("x-cron-token")??String(payload.worker_token??"");
 const {data:control,error:controlError}=await db.from("quiz_generation_control").select("cron_token,status").eq("singleton",true).single();
 if(controlError||!control?.cron_token||token!==control.cron_token)return reply({error:"Non autorizzato"},401);
 const action=String(payload.action??"run");
 const planKey=String(payload.plan_key??"").trim();
 if(!["prepare","run","generate","generate_test"].includes(action))return reply({error:"Azione non valida. Le vecchie azioni OpenAI sono disabilitate."},400);
 if(action==="generate_test"&&control.status!=="paused")return reply({error:"I test isolati sono consentiti soltanto con la produzione in pausa."},409);
 if(action!=="prepare"&&action!=="generate_test"&&control.status!=="active")return reply({status:"paused",message:"Sistema in pausa: nessuna chiamata Claude effettuata."});
     async function prepare() {
      const requestedMateriaId = String(payload.materia_id ?? "").trim();
      let subjects: any[] = [];
      if (planKey) {
        const { data: plannedSubjects, error: planError } = await db.rpc("get_quiz_generation_work_plan", { p_plan_key: planKey });
        if (planError) throw planError;
        subjects = (plannedSubjects ?? [])
          .map((x: any) => ({ id: x.materia_id, topic_ids: Array.isArray(x.topic_ids) ? x.topic_ids : [] }))
          .filter((x: any) => !requestedMateriaId || x.id === requestedMateriaId);
      } else if (requestedMateriaId) {
        // Explicit user-selected subject: do not hide it behind the global 25-subject ready-list limit.
        subjects = [{ id: requestedMateriaId }];
      } else {
        const { data: readySubjects, error: subjectError } = await db.rpc("list_quiz_generation_ready_subjects", { p_limit: 25 });
        if (subjectError) throw subjectError;
        subjects = (readySubjects ?? []).map((x: any) => ({ id: x.materia_id }));
      }
      const { data: rules, error: rulesError } = await db.from("quiz_generation_rules").select("rule_text").eq("id", true).single();
      if (rulesError || !rules?.rule_text) throw new Error("Regole fisse dei quiz non disponibili.");

      let created = 0, skipped = 0, topicRequests = 0;
      const createdItemIds:string[]=[];
      for (const subject of subjects) {
        const { data: spec, error: specError } = await db.rpc("get_quiz_generation_spec", { p_materia_id: subject.id });
        if (specError || !spec) { skipped++; continue; }
        if (spec.generation_ready !== true || spec.academic_review_passed !== true || spec.programma_standard_stato !== "pronto") {
          skipped++; continue;
        }
        const existing = Number(spec.domande_gia_presenti ?? 0);
        const { data: chapters, error: chapterError } = await db.from("capitoli")
          .select("id,nome").eq("materia_id", subject.id).order("nome");
        if (chapterError || !chapters?.length) { skipped++; continue; }
        const chapterIds = chapters.map((c: any) => c.id);
        const { data: todayRows, error: todayError } = await db.from("domande")
          .select("id").in("capitolo_id", chapterIds)
          .gte("created_at", new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString());
        if (todayError) throw todayError;
        const savedToday = (todayRows ?? []).length;
        const { data: pendingRows, error: pendingRowsError } = await db.from("quiz_question_batch_items")
          .select("requested_count").eq("materia_id", subject.id)
          .in("status", ["queued", "submitted", "review"]);
        if (pendingRowsError) throw pendingRowsError;
        const pending = (pendingRows ?? []).reduce((n: number, row: any) => n + Number(row.requested_count ?? 0), 0);
        const dailyRemaining = Math.max(0, 300 - savedToday - pending);
        const archiveRemaining = Math.max(0, 300 - existing - pending);
        const requestedTestCount = Number(payload.test_count ?? 0);
        const safeTestCount = Number.isInteger(requestedTestCount) && requestedTestCount > 0 ? Math.min(requestedTestCount, 200) : Number.MAX_SAFE_INTEGER;
        const missing = Math.min(dailyRemaining, archiveRemaining, safeTestCount);
        if (!missing) { skipped++; continue; }

        let topicQuery = db.from("materia_microargomenti")
          .select("id,numero,titolo,descrizione,area_tematica")
          .eq("materia_id", subject.id).eq("stato", "verificato");
        if (Array.isArray(subject.topic_ids)) {
          if (subject.topic_ids.length === 0) { skipped++; continue; }
          topicQuery = topicQuery.in("id", subject.topic_ids);
        }
        const { data: topics, error: topicError } = await topicQuery.order("numero");
        if (topicError) throw topicError;
        if (!topics?.length || topics.some((t: any) => !t.titolo || !t.descrizione || String(t.descrizione).trim().length < 20)) {
          skipped++; continue;
        }
        const chapter = chapters.find((c: any) => String(c.nome).toLocaleLowerCase("it").includes("banca generale")) ?? chapters[0];

        // Recupera le domande PIÙ RECENTI, non le prime 1000 storiche:
        // il vecchio ordinamento crescente faceva ignorare al prompt i quesiti nuovi.
        const { data: prior, error: priorError } = await db.from("domande")
          .select("testo_domanda,concetto_chiave,microargomento_id")
          .in("capitolo_id", chapters.map((c: any) => c.id))
          .order("created_at", { ascending: false }).limit(500);
        if (priorError) throw priorError;
        // Unica fonte di confronto e destinazione: public.domande.

        const { data: previousAttempts, error: attemptError } = await db.from("quiz_question_batch_items")
          .select("attempt_no").eq("materia_id", subject.id)
          .order("attempt_no", { ascending: false }).limit(1);
        if (attemptError) throw attemptError;
        const attemptNo = Number(previousAttempts?.[0]?.attempt_no ?? 0) + 1;
        const requests:any[]=[];

        const basePrompt =
          "Genera quesiti universitari di livello AVANZATO, selettivo, da esame con voto 28-30/30, in italiano accademico preciso. Devono risultare difficili anche per chi ha studiato bene. Non confondere difficoltà con testo contorto, ambiguità o trabocchetti linguistici. " +
          "DISTRIBUZIONE per lotto da 50: massimo 1 quesito di richiamo puntuale; almeno 3 di applicazione non immediata; almeno 6 di ragionamento, interpretazione, confronto, deduzione, analisi di casi/dati o integrazione di principi. Per lotti più piccoli mantieni la proporzione, privilegiando sempre ragionamento. " +
          "AMBITO: usa solo programma, modulo e microargomento verificati inclusi nel contesto. Non introdurre conoscenze fuori perimetro e non inventare contenuti mancanti. " +
          "DIFFICOLTÀ AUTENTICA: richiedi almeno due passaggi cognitivi quando pertinente: interpretare condizioni, distinguere ipotesi simili, applicare un principio in un caso non standard, individuare conseguenze, leggere dati, valutare un modello o discriminare spiegazioni concorrenti. Evita risposte riconoscibili per semplice memoria, parole chiave o eliminazione intuitiva. " +
          "DISTRATTORI OBBLIGATORIAMENTE DI ALTA QUALITÀ: ogni domanda deve avere tre alternative errate che siano credibili a un candidato competente e non soltanto a un principiante. Ogni distrattore deve essere della stessa categoria, lunghezza e livello di specificità della risposta corretta; deve sembrare corretto a prima vista, ma risultare falso per una precisa ragione disciplinare. Costruiscili a partire da errori concettuali realistici: confusione tra condizioni necessarie e sufficienti, ipotesi applicate fuori contesto, inversione di causalità/relazione, interpretazione parziale di dati, confusione tra concetti contigui, passaggio matematico o logico errato ma plausibile. " +
          "VIETATO: opzioni assurde, generiche, palesemente fuori tema, troppo brevi rispetto alla corretta, formulazioni caricaturali, assoluti gratuiti usati come indizi, sinonimi della stessa alternativa, due opzioni entrambe difendibili, distrattori eliminabili senza conoscere la materia. Evita che la corretta sia sistematicamente più lunga, più precisa o stilisticamente diversa. Le quattro alternative devono essere omogenee e competitive; la risposta non deve saltare agli occhi. " +
          "ANTI-DOMANDA BANale: vietato formulare quesiti che chiedano soltanto definizioni, funzioni principali o caratteristiche generiche, oppure domande generiche senza dati e condizioni concrete. Ogni quesito deve presentare un problema specifico, un caso, dati, vincoli, ipotesi concorrenti, confronto teorico o inferenza; la risposta deve richiedere almeno due passaggi cognitivi. I tre distrattori devono sembrare credibili a uno studente preparato e differire dalla corretta per un errore disciplinare preciso; vietati distrattori assurdi o palesemente estranei. Non usare lo stesso scenario o la stessa struttura per domande diverse. " +
          "CONTROLLO INTERNO OBBLIGATORIO: risolvi il quesito; verifica che esista una sola risposta incontrovertibilmente corretta; per ciascuno dei tre distrattori formula mentalmente la specifica ragione della sua falsità; se uno è debole o troppo ovvio, riscrivi domanda e alternative. Non mostrare questo controllo nel JSON, ma la spiegazione finale deve chiarire la corretta e smontare ogni distrattore. " +
          "ORIGINALITÀ FORTE E ANTI-MODELLO: non usare un modello fisso di formulazione. È vietato generare serie in cui cambia soltanto il nome della materia, il corso, l'anno, il caso clinico, il numero o il termine tecnico mentre la domanda resta costruita allo stesso modo. Ogni quesito deve cambiare realmente oggetto specifico, competenza valutata, scenario e percorso logico. Alterna in modo naturale forme diverse: interpretazione di dati, previsione di conseguenze, scelta della condizione necessaria, confronto tra ipotesi, individuazione dell'errore in un ragionamento, applicazione a un caso non standard, calcolo motivato, valutazione di un'affermazione o scelta della spiegazione più rigorosa. Non ripetere la stessa apertura o struttura sintattica in domande consecutive o in lotti diversi. Non forzare forme non pertinenti alla disciplina. " +
          "ORIGINALITÀ: ciascun quesito deve testare un concetto/focus e un percorso logico sostanzialmente differente da tutte le domande pregresse elencate e dagli altri quesiti dello stesso lotto. Scarta parafrasi, variazioni cosmetiche, numeri/nominativi cambiati e medesime strutture risolutive. " +
          "CONFRONTO OBBLIGATORIO: confronta i candidati con le domande pregresse fornite nel contesto. Resta SEMPRE e soltanto nel microargomento assegnato a questa richiesta: non spostarti su altri microargomenti della materia e non generare domande che saranno poi etichettate con un microargomento diverso da quello trattato. Se il focus è già coperto, scegli un sotto-tema differente DENTRO lo stesso microargomento; se non ci sono sotto-temi sufficienti, non riempire con contenuti estranei. " +
          "SPIEGAZIONE SENZA POSIZIONI: non scrivere mai opzione 0/1/2/3, A/B/C/D, prima/seconda/terza/quarta opzione o riferimenti alla posizione. Spiega il principio corretto e l’errore concettuale di ciascun distrattore, perché le opzioni vengono rimescolate dopo il salvataggio. " +
          "CORRETTEZZA: controlla dati, unità, formule, segni, condizioni, terminologia e passaggi. In caso di dubbio scientifico, ambiguità o insufficiente base nel programma, non produrre il quesito. " +
          "CONTROLLO DI COERENZA SCIENTIFICA: verifica che tutte le premesse del caso siano possibili e non si contraddicano; non attribuire a una sostanza funzioni o elementi che non possiede (per esempio il glucosio è fonte di carbonio, non di azoto). Per ogni calcolo svolgi tutti i passaggi, ricalcola il risultato numerico e verifica che l'opzione indicata coincida esattamente con il risultato. La spiegazione deve confermare la risposta scelta e non deve contenere autocorrezioni, dubbi o frasi che dichiarano il quesito errato. Se il controllo fallisce, sostituisci il quesito prima di restituirlo. " +
           "FILTRO DI AFFIDABILITÀ DISCIPLINARE — PRIORITÀ ASSOLUTA: la correttezza scientifica e didattica prevale sempre sul numero richiesto. Non inventare dati, studi, norme, date, autori, formule, valori, eccezioni o relazioni causali. Usa soltanto nozioni consolidate e coerenti con il programma approvato e con il microargomento fornito. Se un contenuto è controverso, dipende da linee guida mutevoli, manca una premessa essenziale o non puoi verificarlo con elevata sicurezza, NON formulare quel quesito: sostituiscilo con un altro contenuto stabile dello stesso microargomento. VERIFICA DELLA RISPOSTA: risolvi ogni quesito indipendentemente dalle alternative; poi confronta il risultato con tutte e quattro le alternative. Deve esserci una e una sola risposta corretta in base alle condizioni esplicitate. Verifica che nessuna alternativa errata possa diventare corretta con un'interpretazione ragionevole, una convenzione diversa o un'ipotesi non esclusa dal testo. Se ciò accade, specifica meglio le condizioni oppure scarta il quesito. VERIFICA DELLE PREMESSE: controlla che caso, dati, unità, cronologia, definizioni e ipotesi siano compatibili con la disciplina. Non inserire dati superflui che suggeriscano la risposta. Non chiedere conclusioni che non seguono dalle informazioni fornite. VERIFICA DEI CALCOLI: per ogni esercizio quantitativo, svolgi il calcolo in modo autonomo, controlla dimensionalmente le unità, ricontrolla segni, arrotondamenti e ordine di grandezza, quindi verifica che una sola alternativa coincida con il risultato. Se non puoi verificare il calcolo, non produrre il quesito. SPIEGAZIONE DIDATTICA: deve giustificare la risposta con il principio o il procedimento corretto e chiarire le principali ragioni per cui le interpretazioni concorrenti sono errate, senza riferimenti a lettere, numeri o posizione delle alternative. Non introdurre nella spiegazione fatti nuovi non necessari o non verificati. CONTROLLO DI AMBIGUITÀ: evita formulazioni come 'sempre', 'mai', 'principalmente' o 'in genere' quando non sono rigorosamente giustificate; definisci il contesto, le condizioni al contorno e le convenzioni quando incidono sulla risposta. Non usare domande negative o doppie negazioni salvo reale necessità disciplinare. CONTROLLO FINALE INDIVIDUALE: prima di consegnare ogni domanda, chiediti: (1) è nel microargomento assegnato? (2) è corretta secondo conoscenze consolidate? (3) il testo contiene tutte le premesse? (4) esiste una sola risposta difendibile? (5) i tre distrattori sono falsi per motivi disciplinari precisi? (6) la spiegazione dimostra la soluzione? (7) è davvero diversa dalle domande pregresse? Se anche una risposta è no o incerta, sostituisci la domanda. Non sacrificare mai la correttezza per raggiungere il conteggio. REQUISITI DI OUTPUT NON NEGOZIABILI: per OGNI domanda compila esplicitamente tutti i campi testo_domanda, opzioni, risposta_corretta, spiegazione e concetto_chiave. Non omettere mai concetto_chiave: deve essere una breve etichetta disciplinare specifica del quesito, non il nome generico della materia. " +
           "CONTROLLO MECCANICO PRIMA DI INVIARE: testo_domanda almeno 90 caratteri; spiegazione almeno 120 caratteri; concetto_chiave presente; esattamente 4 opzioni, ciascuna di almeno 18 caratteri; tutte e 4 semanticamente e testualmente distinte; risposta_corretta copiata IDENTICA carattere per carattere da una sola delle quattro opzioni. Se anche un solo requisito non è rispettato, correggi la domanda prima dell'output. " +
           "SPIEGAZIONE: non usare mai le parole opzione, risposta A/B/C/D, prima, seconda, terza, quarta, né riferimenti a lettere, numeri o posizione. Non commentare le alternative una per una usando etichette. Scrivi invece una spiegazione disciplinare autonoma: enuncia il principio, dimostra perché la soluzione è corretta e chiarisci gli errori concettuali sottostanti senza nominare o indicare le alternative. " +
           "ANTI-DUPLICATO NEL LOTTO: prima dell'output confronta ogni coppia di domande del lotto; se due verificano lo stesso concetto con lo stesso percorso logico, conserva la migliore e sostituisci l'altra con un focus diverso dello stesso microargomento. " +
           "Restituisci esattamente il numero richiesto solo se ogni elemento supera tutti i controlli. Ogni elemento deve avere testo autonomo, quattro opzioni distinte, una sola risposta corretta identica a un'opzione, spiegazione rigorosa e concetto_chiave valorizzato. Non anteporre A/B/C/D: l'app distribuirà le posizioni. Output JSON esclusivamente conforme allo schema strutturato richiesto dal worker. ";
        const basePerTopic = Math.floor(missing / topics.length);
        let remainder = missing % topics.length;
        for (const topic of topics) {
          const topicQuota = basePerTopic + (remainder-- > 0 ? 1 : 0);
          if (topicQuota < 1) continue;
          const topicPrior = (prior ?? []).filter((q: any) => q.microargomento_id === topic.id);
          let remainingTopicQuota = topicQuota;
          let partNo = 0;
          while (remainingTopicQuota > 0) {
            const count = Math.min(remainingTopicQuota, 50);
            const userPrompt = basePrompt +
              "Numero esatto di domande: " + count + ". " +
              "Questa richiesta è il lotto " + attemptNo + ", parte " + (partNo + 1) + " del microargomento " + topic.numero + ". " +
              "OBBLIGO DI VARIETÀ: assegna a ciascun quesito un diverso focus tra quelli non ancora coperti; non ripetere diagnosi, meccanismo, reperto, gene, marcatore, scenario clinico o passaggio logico già usato. " +
              "Questa è una parte distinta dello stesso microargomento: scegli sotto-aree, casi e competenze differenti rispetto alle altre parti; non riciclare lo stesso ragionamento. " +
              "Se il microargomento è ampio, scegli sotto-aree diverse; se è ristretto, varia la competenza verificata senza riciclare lo stesso ragionamento. " +
              "Prima di scrivere, confronta ogni idea con l'elenco dei quesiti già salvati e scarta internamente ogni idea sovrapponibile. " +
              "Non produrre varianti dello stesso caso: i quesiti del lotto devono avere contesti e obiettivi cognitivi distinti. " +
              "GATE QUALITÀ: vietate domande generiche su scopo, funzione, vantaggio, importanza, caratteristica o definizione. Ogni quesito deve partire da un caso, dati, condizioni, un risultato da interpretare o ipotesi da confrontare e richiedere almeno due passaggi di ragionamento. " +
              "La spiegazione non deve mai citare lettere, numeri o posizione delle alternative: deve spiegare il contenuto disciplinare.\n" +
              "DATI DEL CORSO E PROGRAMMA APPROVATO:\n" + JSON.stringify({
                facolta: spec.facolta, corso: spec.corso_di_laurea, anno: spec.anno_corso,
                materia: spec.materia,
                modulo_programma_pertinente: (Array.isArray(spec.programma_standard?.moduli)
                  ? spec.programma_standard.moduli.filter((m: any) =>
                      String(m.titolo ?? "").trim().toLocaleLowerCase("it") === String(topic.area_tematica ?? "").trim().toLocaleLowerCase("it"))
                  : []),
                microargomento: topic,
                domande_gia_salvate_nello_stesso_microargomento: topicPrior,
                domande_gia_presenti_in_tutta_la_materia_da_non_ripetere: (prior ?? [])
              });
            const body = {
              model: MODEL, reasoning: { effort: "medium" }, store: false, max_output_tokens: MAX_OUTPUT_TOKENS,
              text: { format: { type: "json_object" } },
              input: [
                { role: "system", content: [{ type: "input_text", text: String(rules.rule_text) }] },
                { role: "user", content: [{ type: "input_text", text: userPrompt }] }
              ]
            };
            requests.push({
              custom_id: crypto.randomUUID(),
              generation_key: subject.id + ":" + topic.id + ":" + existing + ":" + attemptNo + ":" + partNo,
              work_plan_key: planKey || null,
              attempt_no: attemptNo, materia_id: subject.id, capitolo_id: chapter.id,
              microargomento_id: topic.id, requested_count: count, status: "queued", input_prompt: body
            });
            remainingTopicQuota -= count;
            partNo++;
          }
        }
        for (let i = 0; i < requests.length; i += 200) {
          const { data: insertedRows, error } = await db.from("quiz_question_batch_items")
            .upsert(requests.slice(i, i + 200), { onConflict: "generation_key", ignoreDuplicates: true })
            .select("id");
          if (error) throw error;
          created += insertedRows?.length ?? 0;
          for(const row of insertedRows??[])if(row?.id)createdItemIds.push(String(row.id));
        }
        topicRequests += requests.length;
      }
      return { status: "prepared", requests_created: created, item_ids: createdItemIds, topic_scoped_requests: topicRequests, subjects_skipped: skipped, api_calls: 0 };
    }
 async function generateOne(specificItemId?:string){
  let claimResult:any;
  if (specificItemId) {
    claimResult = await db.rpc("claim_claude_quiz_batch_item_by_id",{p_item_id:specificItemId});
  } else if (planKey) {
    const {data:nextItem,error:nextError}=await db.from("quiz_question_batch_items")
      .select("id").eq("work_plan_key",planKey).eq("status","queued")
      .is("batch_id",null).order("created_at",{ascending:true}).limit(1).maybeSingle();
    if (nextError) throw nextError;
    claimResult = nextItem
      ? await db.rpc("claim_claude_quiz_batch_item_by_id",{p_item_id:nextItem.id})
      : {data:null,error:null};
  } else {
    claimResult = await db.rpc("claim_one_claude_quiz_batch_item");
  }
  const {data:claimed,error:claimError}=claimResult;
  if(claimError)throw claimError;
  const item=Array.isArray(claimed)?claimed[0]:claimed;
  if(!item)return {status:"idle"};
  const id=item.id;
  const n=Number(item.requested_count??0);
  if(n<1||n>50){await db.from("quiz_question_batch_items").update({status:"failed",error_message:"Blocco non valido: richieste da 1 a 50 domande."}).eq("id",id);return {status:"invalid_count",id,n};}
  const prompt=item.input_prompt??{};
  const sys=String(prompt.input?.[0]?.content?.[0]?.text??"Sei un generatore di quiz universitari.");
  const user=String(prompt.input?.[1]?.content?.[0]?.text??"");
  const estimatedInput=Math.ceil((sys.length+user.length)/3.2);
  const reserve=Math.max(0.01,(estimatedInput*INPUT_USD_PER_M+n*420*OUTPUT_USD_PER_M)/1000000*1.5);
  const {data:reserved,error:reserveError}=await db.rpc("reserve_quiz_generation_budget_claude",{p_reservation_usd:reserve});
  if(reserveError){
   await db.from("quiz_question_batch_items").update({status:"queued",error_message:String(reserveError.message??reserveError).slice(0,1000)}).eq("id",id);
   throw reserveError;
  }
  if(reserved!==true){
   await db.from("quiz_question_batch_items").update({status:"queued",error_message:"Budget Claude esaurito: richiesta mantenuta in coda."}).eq("id",id);
   return {status:"budget_stopped",id,reserve};
  }
  let actual=0;
  try{
   const response=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":claudeKey,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:MODEL,max_tokens:30000,system:sys,messages:[{role:"user",content:user}],tools:[QUESTION_TOOL(n)],tool_choice:{type:"tool",name:"generate_questions"}})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body?.error?.message??"Errore API Claude "+response.status);
   const usage=body.usage??{};
   actual=(Number(usage.input_tokens??0)*INPUT_USD_PER_M+Number(usage.output_tokens??0)*OUTPUT_USD_PER_M)/1000000;
   const tool=Array.isArray(body.content)?body.content.find((x:any)=>x.type==="tool_use"&&x.name==="generate_questions"):null;
   if(!tool?.input)throw new Error("Claude non ha restituito l'output strutturato richiesto.");
   const questions=questionsFrom(tool.input);
   // Recupera il titolo del microargomento approvato: non inventare il concetto chiave.
   let officialTopicTitle="";
   if(item.microargomento_id){
     const {data:topicRow,error:topicLookupError}=await db.from("materia_microargomenti").select("titolo").eq("id",item.microargomento_id).maybeSingle();
     if(topicLookupError) throw topicLookupError;
     officialTopicTitle=String(topicRow?.titolo??"").trim();
   }
   for(const q of questions){
     if(q && typeof q==="object" && (!q.concetto_chiave || String(q.concetto_chiave).trim().length<3) && officialTopicTitle){
       q.concetto_chiave=officialTopicTitle;
     }
   }
   const checked=questions.map((q:any)=>({q,errors:questionValidationErrors(q)}));
   const validationRejected=checked.filter((x:any)=>x.errors.length>0);
   const candidates=checked.filter((x:any)=>x.errors.length===0).map((x:any)=>x.q).slice(0,n);
   const {imported,rejectedForRetry}=await insertQuestionsDirect(db,item,candidates);
   const retryFeedback=[
     ...validationRejected.map((x:any)=>JSON.stringify({question:x.q?.testo_domanda??x.q?.question??"",errors:x.errors})),
     ...rejectedForRetry
   ];
   await db.rpc("settle_quiz_generation_budget_claude",{p_reserved_usd:reserve,p_actual_usd:actual});
   const shortfall=Math.max(0,n-imported), retries=Number(item.retry_count??0)+1;
   let retryItemId:string|null=null;
   await db.from("quiz_question_batch_items").update({status:"completed",accepted_count:imported,rejected_count:shortfall,output_payload:{provider:"anthropic",model:MODEL,returned:questions.length,valid:candidates.length,imported,validation_rejected:validationRejected.length,rejected_reasons:validationRejected.map((x:any)=>x.errors),usage,actual_usd:actual},completed_at:new Date().toISOString(),error_message:null}).eq("id",id);
   if(shortfall>0&&retries<=8){
    const retryPrompt=JSON.parse(JSON.stringify(prompt));
    if(retryPrompt.input?.[1]?.content?.[0]?.text)retryPrompt.input[1].content[0].text+="\\n\\nGenera soltanto "+shortfall+" domande sostitutive nuove. Correggi i difetti rilevati e non ripetere i quesiti respinti: "+retryFeedback.join(" | ");
    const {data:retryRow,error:retryError}=await db.from("quiz_question_batch_items").insert({custom_id:crypto.randomUUID(),materia_id:item.materia_id,capitolo_id:item.capitolo_id,microargomento_id:item.microargomento_id,requested_count:shortfall,status:"queued",input_prompt:retryPrompt,generation_key:String(item.generation_key??id)+":claude-retry:"+retries,work_plan_key:item.work_plan_key??null,attempt_no:item.attempt_no,retry_count:retries}).select("id").single();
    if(retryError)throw retryError;
    retryItemId=retryRow?.id??null;
   }
   await db.rpc("sync_materia_agents_progress");
   return {status:"completed",id,materia_id:item.materia_id,requested:n,returned:questions.length,valid:candidates.length,imported,shortfall,retry_item_id:retryItemId,actual_usd:Number(actual.toFixed(6))};
  }catch(e){
   await db.rpc("settle_quiz_generation_budget_claude",{p_reserved_usd:reserve,p_actual_usd:actual});
   await db.from("quiz_question_batch_items").update({status:"queued",error_message:(e instanceof Error?e.message:String(e)).slice(0,2000)}).eq("id",id);
   throw e;
  }
 }
 if(action==="prepare")return reply(await prepare());
 if(action==="generate_test"){
   const itemId=String(payload.item_id??"").trim();
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId))return reply({error:"Per il test isolato serve un item_id UUID valido."},400);
   return reply({status:"claude_test_worker",model:MODEL,result:await generateOne(itemId)});
 }
 const prepared=action==="run"?await prepare():{status:"not_requested"};
 const results:any[]=[];
 for(let workerSlot=0;workerSlot<4;workerSlot++){
   const result=await generateOne();
   results.push(result);
   if(result.status==="idle"||result.status==="budget_stopped")break;
 }
 return reply({status:"claude_worker",model:MODEL,prepared,results});
 }catch(e){return reply({status:"error",error:(e instanceof Error?e.message:String(e)).slice(0,1800)},500);}
});