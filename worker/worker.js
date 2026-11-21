const ALLOWED_ORIGINS = new Set([
  "https://smlquiz.it",
  "https://www.smlquiz.it",
  "http://localhost:5173"
]);
const MAX_TEXT = 30000;
const MODES = new Set(["riassunto", "mappa", "quiz"]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://smlquiz.it",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origine non autorizzata." }, 403, origin);
    if (request.method !== "POST") return json({ error: "Metodo non consentito." }, 405, origin);
    if (!env.GEMINI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: "Servizio AI non configurato." }, 503, origin);

    try {
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > 140000) return json({ error: "Richiesta troppo grande." }, 413, origin);
      const authorization = request.headers.get("Authorization") || "";\n      if (!authorization.startsWith("Bearer ")) return json({ error: "Accesso richiesto. Accedi al tuo account." }, 401, origin);\n      const authCheck = await fetch(env.SUPABASE_URL.replace(/\\/$/, "") + "/auth/v1/user", {\n        headers: { "Authorization": authorization, "apikey": env.SUPABASE_ANON_KEY }\n      });\n      if (!authCheck.ok) return json({ error: "Sessione non valida. Accedi nuovamente." }, 401, origin);\n\n      const body = await request.json();
      const testoInput = typeof body.testoInput === "string" ? body.testoInput.trim() : "";
      const tipo = body.tipo;
      if (!MODES.has(tipo)) return json({ error: "Tipo di elaborazione non valido." }, 400, origin);
      if (!testoInput) return json({ error: "Inserisci del testo da elaborare." }, 400, origin);
      if (testoInput.length > MAX_TEXT) return json({ error: "Il testo supera il limite di 30.000 caratteri." }, 413, origin);

      const instructions = {
        riassunto: "Agisci come un docente universitario. Crea un riassunto accurato, ordinato e completo in italiano. Mantieni definizioni, nessi causali, formule e dettagli importanti; usa titoli Markdown, elenchi e parole chiave. Non inventare informazioni assenti dal testo. Evidenzia eventuali ambiguità.",
        mappa: "Trasforma il materiale in una mappa concettuale gerarchica in Markdown, in italiano. Usa ESCLUSIVAMENTE una struttura di titoli (#, ##, ###) e punti elenco (-), con un solo concetto principale al livello #, concetti secondari ## e dettagli ### o elenchi. Niente introduzione o conclusione in prosa. Mantieni le relazioni concettuali e non inventare informazioni.",
        quiz: "Crea 10 domande universitarie a scelta multipla basate esclusivamente sul materiale. Ogni domanda deve avere quattro opzioni A-D, una sola corretta. Dopo le domande inserisci una sezione Soluzioni con risposta corretta e breve spiegazione. Usa Markdown e non introdurre argomenti esterni."
      };
      const prompt = instructions[tipo] + "\n\nMATERIALE DA ELABORARE:\n" + testoInput;
      const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: tipo === "riassunto" ? 5000 : 6500 }
        })
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : 502;
        return json({ error: upstream.status === 429 ? "Limite gratuito Gemini temporaneamente raggiunto. Riprova più tardi." : "Errore nella generazione AI." }, status, origin);
      }
      const output = result.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
      if (!output) return json({ error: "Il modello non ha prodotto un risultato. Riprova." }, 502, origin);
      return json({ result: output }, 200, origin);
    } catch {
      return json({ error: "Richiesta non valida o errore temporaneo." }, 400, origin);
    }
  }
};
