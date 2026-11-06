import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const input = process.argv[2]
if (!url || !serviceKey || !input) {
  throw new Error('Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-quiz-block.mjs file.json')
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
const batch = JSON.parse(fs.readFileSync(input, 'utf8'))
const norm = s => String(s ?? '').normalize('NFKC').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
const tokens = s => new Set(norm(s).split(' ').filter(x => x.length > 2))
const similarity = (a, b) => {
  const A = tokens(a), B = tokens(b)
  if (!A.size || !B.size) return 0
  let intersection = 0
  for (const x of A) if (B.has(x)) intersection++
  return intersection / (A.size + B.size - intersection)
}
const fail = message => { throw new Error(message) }

if (!batch.materia_id || !batch.capitolo_id || !Number.isInteger(batch.quiz_number) || batch.quiz_number < 1 || batch.quiz_number > 30) fail('Materia, capitolo o numero quiz non valido')
if (!Array.isArray(batch.questions) || batch.questions.length !== 10) fail('Ogni blocco deve contenere esattamente 10 domande')

const concepts = new Set(), questions = new Set(), optionSets = new Set()
for (const [i, q] of batch.questions.entries()) {
  if (!q.concetto_chiave?.trim() || !q.testo_domanda?.trim() || !q.spiegazione?.trim()) fail(`Domanda ${i+1}: campi obbligatori mancanti`)
  if (!Array.isArray(q.opzioni) || q.opzioni.length !== 4 || new Set(q.opzioni.map(norm)).size !== 4) fail(`Domanda ${i+1}: servono quattro opzioni diverse`)
  if (!q.opzioni.some(x => norm(x) === norm(q.risposta_corretta))) fail(`Domanda ${i+1}: risposta corretta non presente tra le opzioni`)
  const c = norm(q.concetto_chiave), t = norm(q.testo_domanda)
  if (concepts.has(c) || questions.has(t)) fail(`Duplicato interno al blocco alla domanda ${i+1}`)
  concepts.add(c); questions.add(t)
  const opts = q.opzioni.map(norm).sort().join('|')
  if (optionSets.has(opts)) fail(`Opzioni fotocopia nel blocco alla domanda ${i+1}`)
  optionSets.add(opts)
}

const { data: existingSet, error: setError } = await supabase.from('quiz_sets')
  .select('id').eq('materia_id', batch.materia_id).eq('quiz_number', batch.quiz_number).maybeSingle()
if (setError) throw setError
if (existingSet) fail('Quiz già esistente: lo script non sovrascrive contenuti')

const { data: chapter, error: chapterError } = await supabase.from('capitoli')
  .select('id').eq('id', batch.capitolo_id).eq('materia_id', batch.materia_id).maybeSingle()
if (chapterError) throw chapterError
if (!chapter) fail('Il capitolo non appartiene alla materia selezionata')

const { data: chapters, error: chaptersError } = await supabase.from('capitoli').select('id').eq('materia_id', batch.materia_id)
if (chaptersError) throw chaptersError
const chapterIds = (chapters ?? []).map(x => x.id)
const { data: oldQuestions, error: oldError } = await supabase.from('domande')
  .select('concetto_chiave,testo_domanda,opzioni').in('capitolo_id', chapterIds)
if (oldError) throw oldError

for (const [i, q] of batch.questions.entries()) {
  for (const old of oldQuestions ?? []) {
    if (norm(q.concetto_chiave) === norm(old.concetto_chiave)) fail(`Concetto già presente: ${q.concetto_chiave}`)
    if (similarity(q.testo_domanda, old.testo_domanda) >= 0.82) fail(`Possibile quesito duplicato (somiglianza elevata): ${q.testo_domanda}`)
    const A = new Set(q.opzioni.map(norm)), B = new Set((old.opzioni ?? []).map(norm))
    const overlap = [...A].filter(x => B.has(x)).length / Math.max(1, new Set([...A, ...B]).size)
    if (overlap >= 0.8) fail(`Possibili opzioni fotocopia alla domanda ${i+1}`)
  }
}

const { data: quiz, error: createError } = await supabase.from('quiz_sets').insert({
  materia_id: batch.materia_id, quiz_number: batch.quiz_number, status: 'generating',
  question_count: 0, prompt_version: 'manual-original-v1'
}).select('id').single()
if (createError) throw createError

try {
  const rows = batch.questions.map(q => ({
    capitolo_id: batch.capitolo_id, quiz_id: quiz.id,
    concetto_chiave: q.concetto_chiave, testo_domanda: q.testo_domanda,
    opzioni: q.opzioni, risposta_corretta: q.risposta_corretta, spiegazione: q.spiegazione
  }))
  const { error: insertError } = await supabase.from('domande').insert(rows)
  if (insertError) throw insertError
  const { error: readyError } = await supabase.from('quiz_sets')
    .update({ status: 'ready', question_count: 10, ready_at: new Date().toISOString() })
    .eq('id', quiz.id)
  if (readyError) throw readyError
  console.log(`Quiz ${batch.quiz_number} importato: 10 domande (ID ${quiz.id})`)
} catch (error) {
  await supabase.from('domande').delete().eq('quiz_id', quiz.id)
  await supabase.from('quiz_sets').delete().eq('id', quiz.id)
  throw error
}
