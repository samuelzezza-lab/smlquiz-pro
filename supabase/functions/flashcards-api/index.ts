import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const allowedOrigins = new Set(["https://smlquiz.it", "https://www.smlquiz.it"]);
const headers = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://smlquiz.it",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json"
});
const reply = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: headers(origin) });
  if (req.method !== "POST") return reply({ error: "Metodo non consentito" }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origin non autorizzata" }, 403, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return reply({ error: "Servizio non configurato" }, 503, origin);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json();
    const subjectId = String(body.subjectId ?? "").trim();
    if (!subjectId || subjectId.length > 160) return reply({ error: "Materia non valida" }, 400, origin);
    const { data: subject, error: subjectError } = await admin.from("materie").select("id,nome").eq("id", subjectId).maybeSingle();
    if (subjectError) throw subjectError;
    if (!subject) return reply({ error: "Materia non trovata" }, 404, origin);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    let userId: string | null = null;
    if (token) {
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) userId = data.user.id;
    }

    let unlocked = false;
    if (userId) {
      const [entitlements, purchases] = await Promise.all([
        admin.from("user_subject_entitlements").select("id").eq("user_id", userId)
          .eq("materia_id", subjectId).gt("expires_at", new Date().toISOString()).limit(1),
        admin.from("user_purchases").select("id").eq("user_id", userId)
          .eq("subject_id", subjectId).eq("payment_status", "paid").limit(1)
      ]);
      if (entitlements.error) throw entitlements.error;
      if (purchases.error) throw purchases.error;
      unlocked = (entitlements.data ?? []).length > 0 || (purchases.data ?? []).length > 0;
    }

    const freeLimit = 50;
    const paidLimit = 300;
    const action = String(body.action ?? "list");
    if (action === "rate") {
      if (!userId) return reply({ error: "Accedi per salvare i progressi" }, 401, origin);
      const flashcardId = String(body.flashcardId ?? "");
      const rating = String(body.rating ?? "");
      if (!flashcardId || !["difficult", "medium", "easy"].includes(rating)) {
        return reply({ error: "Valutazione non valida" }, 400, origin);
      }
      const maxAccessible = unlocked ? paidLimit : freeLimit;
      const { data: accessibleCards, error: accessError } = await admin.from("flashcards")
        .select("id").eq("subject_id", subjectId)
        .order("order_index", { ascending: true }).range(0, maxAccessible - 1);
      if (accessError) throw accessError;
      if (!(accessibleCards ?? []).some((card: { id: string }) => card.id === flashcardId)) {
        return reply({ error: "Questa flashcard non è inclusa nel tuo accesso" }, 403, origin);
      }
      const ratingIt = rating === "difficult" ? "difficile" : rating === "medium" ? "media" : "facile";
      const { error: saveError } = await admin.from("flashcard_reviews").upsert({
        user_id: userId, flashcard_id: flashcardId, rating: ratingIt, reviewed_at: new Date().toISOString()
      }, { onConflict: "user_id,flashcard_id" });
      if (saveError) throw saveError;
      return reply({ saved: true }, 200, origin);
    }

    const requestedOffset = Number.isInteger(body.offset) ? Math.max(0, body.offset) : 0;
    const requestedLimit = Number.isInteger(body.limit) ? Math.min(50, Math.max(1, body.limit)) : 50;
    const maxCards = unlocked ? paidLimit : freeLimit;
    if (requestedOffset >= maxCards) {
      return reply({ paywall: !unlocked, unlocked, subject: subject.nome, free_limit: freeLimit, total_cards: Math.min(paidLimit, maxCards) }, 200, origin);
    }
    const safeLimit = Math.min(requestedLimit, maxCards - requestedOffset);
    const { data: cards, error: cardsError, count } = await admin.from("flashcards")
      .select("id,subject_id,question_front,answer_back,explanation,order_index,quiz_number", { count: "exact" })
      .eq("subject_id", subjectId)
      .order("order_index", { ascending: true })
      .range(requestedOffset, requestedOffset + safeLimit - 1);
    if (cardsError) throw cardsError;

    let progress: Record<string, string> = {};
    if (userId && cards?.length) {
      const ids = cards.map((card: { id: string }) => card.id);
      const { data: rows, error } = await admin.from("flashcard_reviews")
        .select("flashcard_id,rating").eq("user_id", userId).in("flashcard_id", ids);
      if (error) throw error;
      progress = Object.fromEntries((rows ?? []).map((row: { flashcard_id: string; rating: string }) => [
        row.flashcard_id, row.rating === "difficile" ? "difficult" : row.rating === "media" ? "medium" : "easy"
      ]));
    }
    return reply({
      subject: subject.nome, subject_id: subjectId, cards: (cards ?? []).map((card: Record<string, unknown>) => ({
        ...card, user_rating: progress[String(card.id)] ?? null
      })),
      total_cards: Math.min(paidLimit, count ?? 0), offset: requestedOffset, unlocked,
      free_limit: freeLimit, paid_limit: paidLimit, paywall: !unlocked && requestedOffset + (cards?.length ?? 0) >= freeLimit,
      next_offset: requestedOffset + (cards?.length ?? 0)
    }, 200, origin);
  } catch (error) {
    console.error("flashcards-api error", error instanceof Error ? error.name : "UnknownError");
    return reply({ error: "Errore nel caricamento delle flashcard" }, 500, origin);
  }
});
