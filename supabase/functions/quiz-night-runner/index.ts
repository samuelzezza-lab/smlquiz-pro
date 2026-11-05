import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" }
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Metodo non supportato." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Configurazione Supabase incompleta." }, 500);
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: control, error: controlError } = await db.from("quiz_generation_control")
      .select("status,cron_token,generated_quizzes").eq("singleton", true).single();
    if (controlError || !control) return json({ error: "Controllo generazione non disponibile." }, 500);
    if (req.headers.get("x-night-token") !== control.cron_token) return json({ error: "Non autorizzato." }, 401);
    if (control.status !== "active") return json({ status: control.status, skipped: true });

    const [{ data: subjects, error: subjectsError }, { data: sets, error: setsError }] = await Promise.all([
      db.from("materie").select("id,nome").order("nome", { ascending: true }),
      db.from("quiz_sets").select("materia_id,quiz_number,status,question_count,generation_started_at")
    ]);
    if (subjectsError) throw subjectsError;
    if (setsError) throw setsError;

    const bySubject = new Map<string, any[]>();
    for (const set of (sets ?? [])) {
      const list = bySubject.get(set.materia_id) ?? [];
      list.push(set);
      bySubject.set(set.materia_id, list);
    }
    const now = Date.now();
    const candidates: Array<{ id: string; name: string; quizNumber: number; readyCount: number }> = [];
    for (const subject of (subjects ?? [])) {
      const subjectSets = bySubject.get(subject.id) ?? [];
      const readyCount = subjectSets.filter(x => x.status === "ready" && x.question_count === 10).length;
      let next: number | null = null;
      for (let n = 1; n <= 60; n++) {
        const existing = subjectSets.find(x => x.quiz_number === n);
        if (!existing) { next = n; break; }
        if (existing.status === "ready" && existing.question_count === 10) continue;
        if (existing.status === "generating") {
          const started = existing.generation_started_at ? new Date(existing.generation_started_at).getTime() : 0;
          if (started && now - started < 10 * 60 * 1000) break;
          next = n; break;
        }
        if (existing.status === "pending" || existing.status === "failed") { next = n; break; }
        break;
      }
      if (next !== null) candidates.push({ id: subject.id, name: subject.nome, quizNumber: next, readyCount });
    }

    candidates.sort((a, b) => a.readyCount - b.readyCount || a.name.localeCompare(b.name, "it"));
    if (!candidates.length) {
      await db.from("quiz_generation_control").update({ status: "completed", last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("singleton", true);
      return json({ status: "completed", message: "Tutte le materie hanno raggiunto 60 quiz completi." });
    }

    const target = candidates[0];
    const response = await fetch(supabaseUrl + "/functions/v1/quiz-cache", {
      method: "POST",
      headers: { "content-type": "application/json", "apikey": serviceKey, "authorization": "Bearer " + serviceKey },
      body: JSON.stringify({ action: "get_quiz", materia_id: target.id, quiz_number: target.quizNumber })
    });
    const result = await response.json().catch(() => ({}));
    const errorText = String(result.error ?? result.message ?? "");
    const exhausted = response.status === 402
      || /credit balance|billing_error|insufficient_quota|payment required|credito.*esaurit|quota.*exhaust/i.test(errorText);

    if (exhausted) {
      await db.from("quiz_generation_control").update({
        status: "paused", last_error: errorText.slice(0, 1000),
        last_run_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq("singleton", true);
      return json({ status: "paused", reason: "Credito Anthropic esaurito o Gemini non configurato.", detail: errorText }, 200);
    }

    const completed = Boolean(result.quiz_set_id) && response.ok;
    const update: Record<string, unknown> = {
      last_run_at: new Date().toISOString(), last_error: completed ? null : errorText.slice(0, 1000),
      updated_at: new Date().toISOString()
    };
    if (completed) update.generated_quizzes = (control.generated_quizzes ?? 0) + 1;
    await db.from("quiz_generation_control").update(update).eq("singleton", true);
    return json({
      status: completed ? "quiz_ready" : (result.status ?? "retry_later"),
      materia: target.name, materia_id: target.id, quiz_number: target.quizNumber,
      generated_quizzes: completed ? (control.generated_quizzes ?? 0) + 1 : control.generated_quizzes,
      detail: completed ? undefined : errorText || result
    }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});