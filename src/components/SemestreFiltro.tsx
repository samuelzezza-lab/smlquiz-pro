import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeft, ArrowRight, Clock3, CheckCircle2, GraduationCap, RotateCcw } from 'lucide-react'

type SubjectId='biologia'|'chimica'|'fisica'
type Question={id:string;codice:string;materia:SubjectId;argomento:string;tipo:'scelta_multipla'|'completamento';difficolta:string;testo_domanda:string;opzioni:string[]}
type Review=Question&{given:string|null;correct:string;correct_text:string;accepted:string[];is_correct:boolean;spiegazione:string}
type Result={correct:number;wrong:number;blank:number;score:number;review:Review[]}
const subjects=[{id:'biologia' as const,label:'Biologia',tone:'bio'},{id:'chimica' as const,label:'Chimica e propedeutica biochimica',tone:'chem'},{id:'fisica' as const,label:'Fisica',tone:'phys'}]
const fmt=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')

export default function SemestreFiltro(){
 const [subject,setSubject]=useState<SubjectId>('biologia')
 const [mode,setMode]=useState<'intro'|'exam'|'result'>('intro')
 const [examId,setExamId]=useState('')
 const [exam,setExam]=useState<Question[]>([])
 const [answers,setAnswers]=useState<Record<string,string>>({})
 const [seconds,setSeconds]=useState(3000)
 const [loading,setLoading]=useState(false)
 const [submitting,setSubmitting]=useState(false)
 const [error,setError]=useState('')
 const [startedAt,setStartedAt]=useState<number|null>(null)
 const [result,setResult]=useState<Result|null>(null)
 const [showExplanations,setShowExplanations]=useState(true)
 const finishLock=useRef(false)
 const answered=Object.values(answers).filter(v=>v.trim()).length
 const mcq=exam.filter(q=>q.tipo==='scelta_multipla').length
 const finish=useCallback(async()=>{
  if(finishLock.current||!examId||!supabase)return
  finishLock.current=true;setSubmitting(true);setError('')
  try{
   const {data,error:rpcError}=await supabase.rpc('submit_semestre_filtro_exam',{p_exam_id:examId,p_answers:answers})
   if(rpcError)throw rpcError
   setResult(data as Result);setMode('result')
  }catch(e){setError(e instanceof Error?e.message:'Consegna non riuscita. Riprova.');finishLock.current=false}
  finally{setSubmitting(false)}
 },[examId,answers])
 useEffect(()=>{
  if(mode!=='exam'||!startedAt)return
  const tick=()=>setSeconds(Math.max(0,3000-Math.floor((Date.now()-startedAt)/1000)))
  tick();const timer=window.setInterval(tick,1000);return()=>window.clearInterval(timer)
 },[mode,startedAt])
 useEffect(()=>{if(mode==='exam'&&seconds===0)void finish()},[mode,seconds,finish])
 const start=async()=>{
  if(!supabase){setError('Il database non è configurato.');return}
  setLoading(true);setError('')
  try{
   const {data,error}=await supabase.rpc('start_semestre_filtro_exam',{p_materia:subject})
   if(error)throw error
   const payload=data as {exam_id:string;questions:Question[];duration_seconds:number}
   if(!payload?.exam_id||payload.questions?.length!==31)throw new Error('La banca non contiene ancora 31 domande utilizzabili per questa materia.')
   setExamId(payload.exam_id);setExam(payload.questions);setAnswers({});setResult(null);setSeconds(3000);setStartedAt(Date.now());finishLock.current=false;setMode('exam')
  }catch(e){setError(e instanceof Error?e.message:'Non riesco a preparare la simulazione.')}
  finally{setLoading(false)}
 }
 const review=useMemo(()=>result?.review||[],[result])
 return <section className="content progress-page sf-page">
  {mode==='intro'&&<>
   <div className="page-heading"><div><div className="eyebrow"><GraduationCap size={15}/> PROVA NAZIONALE · A.A. 2026/27</div><h1>Semestre Filtro</h1><p>Simulazioni dedicate a Medicina, Odontoiatria e Veterinaria. Una banca dati separata dai quiz universitari.</p></div></div>
   <div className="sf-hero panel"><div><span className="sf-kicker">FORMATO D'ESAME</span><h2>Allenati come il giorno della prova.</h2><p>31 quesiti · 50 minuti · soluzioni visibili soltanto alla consegna.</p></div><div className="sf-big-number">31<small>quesiti</small></div></div>
   <div className="sf-specs"><div><b>21</b><span>Scelta multipla</span></div><div><b>10</b><span>Completamento</span></div><div><b>50 min</b><span>Tempo massimo</span></div><div><b>+1 / −0,1</b><span>Corretta / errata</span></div></div>
   <div className="section-head"><div><h2>Scegli la materia</h2><p>Ogni prova contiene 21 domande a scelta multipla e 10 a completamento.</p></div></div>
   <div className="sf-subjects">{subjects.map(s=><button key={s.id} className={'sf-subject panel '+(subject===s.id?'selected':'')} onClick={()=>setSubject(s.id)}><span className={'sf-subject-mark '+s.tone}>{s.label[0]}</span><span><b>{s.label}</b><small>Simulazione completa da 31 quesiti</small></span><span className="sf-radio">{subject===s.id?'✓':''}</span></button>)}</div>
   {error&&<div className="notice">{error}</div>}
   <div className="sf-start-row"><div><b>Correzione soltanto alla fine</b><small>Durante la prova non mostriamo suggerimenti né risposte corrette.</small></div><button className="primary" disabled={loading} onClick={()=>void start()}>{loading?'Preparazione…':'Inizia simulazione'} <ArrowRight size={16}/></button></div>
  </>}
  {mode==='exam'&&<>
   <div className="sf-exam-top"><div><div className="eyebrow">SEMESTRE FILTRO · {subjects.find(s=>s.id===subject)?.label.toUpperCase()}</div><h1>Simulazione d'esame</h1><p>{answered} di 31 risposte inserite · {mcq} a scelta multipla · 10 completamenti</p></div><div className={'sf-clock '+(seconds<300?'urgent':'')}><Clock3 size={18}/><b>{fmt(seconds)}</b></div></div>
   <div className="sf-progress"><i style={{width:(answered/31*100)+'%'}}/></div>
   <div className="sf-exam-layout"><div className="sf-question-list">{exam.map((q,i)=><article className="panel sf-question" id={'sfq-'+q.id} key={q.id}><div className="sf-question-meta"><span>QUESITO {String(i+1).padStart(2,'0')} / 31</span><span>{q.tipo==='scelta_multipla'?'SCELTA MULTIPLA':'COMPLETAMENTO'}</span></div><h3>{q.testo_domanda}</h3>{q.tipo==='scelta_multipla'?<div className="sf-options">{q.opzioni.map((o,j)=>{const letter=String.fromCharCode(65+j);return <button type="button" key={j} className={answers[q.id]===letter?'chosen':''} aria-pressed={answers[q.id]===letter} onClick={()=>setAnswers(a=>({...a,[q.id]:letter}))}><b>{letter}</b><span>{o}</span></button>})}</div>:<label className="sf-fill">Inserisci la risposta<input value={answers[q.id]||''} onChange={e=>setAnswers(a=>({...a,[q.id]:e.target.value}))} placeholder="Scrivi qui la risposta"/></label>}</article>)}</div>
    <aside className="panel sf-exam-aside"><b>Riepilogo prova</b><div className="sf-counter"><strong>{answered}</strong><span>/ 31 risposte</span></div><div className="sf-mini-grid">{exam.map((q,i)=><button type="button" key={q.id} className={answers[q.id]?.trim()?'done':''} onClick={()=>document.getElementById('sfq-'+q.id)?.scrollIntoView({behavior:'smooth',block:'center'})}>{i+1}</button>)}</div><p>Le soluzioni restano nascoste fino alla consegna.</p><button className="primary" disabled={submitting} onClick={()=>{if(window.confirm('Consegnare la prova? Dopo la consegna non potrai modificare le risposte.'))void finish()}}>{submitting?'Consegna…':'Consegna prova'} <ArrowRight size={15}/></button></aside>
   </div>{error&&<div className="notice">{error}</div>}
  </>}
  {mode==='result'&&result&&<>
   <div className="page-heading"><div><div className="eyebrow"><CheckCircle2 size={15}/> PROVA CONSEGNATA</div><h1>Risultato della simulazione</h1><p>{subjects.find(s=>s.id===subject)?.label} · 31 quesiti · 50 minuti</p></div></div>
   <div className="panel sf-result-hero"><div><small>PUNTEGGIO SIMULAZIONE</small><strong>{Number(result.score).toFixed(1)}<span> punti</span></strong><p>{result.correct} corrette · {result.wrong} errate · {result.blank} omesse</p></div><div className="sf-result-grade">{Math.round(result.correct/31*100)}%<small>risposte corrette</small></div></div>
   <p className="sf-scoring-note">Calcolo: +1 per risposta corretta, −0,1 per risposta errata, 0 per omessa. Il punteggio è una simulazione didattica e non sostituisce la valutazione ufficiale.</p>
   <div className="sf-review-head"><h2>Correzione completa</h2><button className="secondary" onClick={()=>setShowExplanations(v=>!v)}>{showExplanations?'Nascondi spiegazioni':'Mostra spiegazioni'}</button></div>
   {review.map((q,i)=><article className="panel sf-review" key={q.id}><div className="sf-question-meta"><span>QUESITO {i+1} · {q.tipo==='scelta_multipla'?'SCELTA MULTIPLA':'COMPLETAMENTO'}</span><b className={!q.given?'is-blank':q.is_correct?'is-correct':'is-wrong'}>{!q.given?'OMESSA':q.is_correct?'CORRETTA':'ERRATA'}</b></div><h3>{q.testo_domanda}</h3><p>La tua risposta: <b>{q.given?(q.tipo==='scelta_multipla'?q.given+'. '+(q.opzioni['ABCDE'.indexOf(q.given)]||''):q.given):'Non risposta'}</b></p><p>Risposta corretta: <b>{q.tipo==='scelta_multipla'?q.correct+'. '+q.correct_text:q.correct_text}</b></p>{showExplanations&&<p className="sf-explanation">{q.spiegazione}</p>}</article>)}
   <div className="sf-start-row"><button className="secondary" onClick={()=>{setMode('intro');setError('')}}><ArrowLeft size={15}/> Torna alle materie</button><button className="primary" onClick={()=>void start()}><RotateCcw size={15}/> Nuova simulazione</button></div>
  </>}
 </section>
}
