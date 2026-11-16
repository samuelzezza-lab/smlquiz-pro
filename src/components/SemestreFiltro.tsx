import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeft, ArrowRight, Clock3, CheckCircle2, GraduationCap, RotateCcw } from 'lucide-react'

type Row = { id:string; codice:string; materia:'biologia'|'chimica'|'fisica'; argomento:string; tipo:'scelta_multipla'|'completamento'; difficolta:string; testo_domanda:string; opzioni:string[]; risposta_corretta:string; risposte_accettate:string[]; spiegazione:string }
type Answer = string
const subjects = [{id:'biologia',label:'Biologia',color:'bio'},{id:'chimica',label:'Chimica e propedeutica biochimica',color:'chem'},{id:'fisica',label:'Fisica',color:'phys'}] as const
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')
const shuffle=<T,>(items:T[])=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const fmt=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')

export default function SemestreFiltro(){
 const [subject,setSubject]=useState<Row['materia']>('biologia')
 const [mode,setMode]=useState<'intro'|'loading'|'exam'|'result'>('intro')
 const [bank,setBank]=useState<Row[]>([])
 const [exam,setExam]=useState<Row[]>([])
 const [answers,setAnswers]=useState<Record<string,Answer>>({})
 const [seconds,setSeconds]=useState(3000)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [startedAt,setStartedAt]=useState<number|null>(null)
 const [showAll,setShowAll]=useState(false)
 const mcqCount=exam.filter(q=>q.tipo==='scelta_multipla').length
 const completeCount=exam.length-mcqCount
 const expired=seconds<=0
 const loadExam=useCallback(async()=>{
  if(!supabase){setError('Servizio database non configurato.');return}
  setLoading(true);setError('')
  try{
   const {data,error}=await supabase.from('semestre_filtro_domande').select('id,codice,materia,argomento,tipo,difficolta,testo_domanda,opzioni,risposta_corretta,risposte_accettate,spiegazione').eq('anno_accademico','2026/27').eq('materia',subject).eq('attiva',true)
   if(error)throw error
   const rows=(data||[]) as Row[]
   const mcq=shuffle(rows.filter(q=>q.tipo==='scelta_multipla'&&Array.isArray(q.opzioni)&&q.opzioni.length>=5)).slice(0,21)
   const fill=shuffle(rows.filter(q=>q.tipo==='completamento')).slice(0,10)
   if(mcq.length<21||fill.length<10)throw new Error('Banca non ancora sufficiente: servono almeno 21 quesiti a scelta multipla e 10 a completamento per questa materia.')
   const selected=shuffle([...mcq,...fill])
   setBank(rows);setExam(selected);setAnswers({});setSeconds(3000);setStartedAt(Date.now());setShowAll(false);setMode('exam')
  }catch(e){setError(e instanceof Error?e.message:'Impossibile caricare la simulazione.')}
  finally{setLoading(false)}
 },[subject])
 const finish=useCallback(()=>{setMode('result');setShowAll(true)},[])
 useEffect(()=>{if(mode!=='exam'||!startedAt)return;const tick=()=>setSeconds(Math.max(0,3000-Math.floor((Date.now()-startedAt)/1000)));tick();const id=window.setInterval(tick,1000);return()=>window.clearInterval(id)},[mode,startedAt])
 useEffect(()=>{if(mode==='exam'&&seconds===0)finish()},[mode,seconds,finish])
 const ordered=useMemo(()=>exam,[exam])
 const score=useMemo(()=>{let correct=0,wrong=0,blank=0;for(const q of exam){const a=answers[q.id];if(!a){blank++;continue}const ok=q.tipo==='scelta_multipla'?a===q.risposta_corretta:(q.risposte_accettate||[q.risposta_corretta]).some(v=>norm(v)===norm(a));if(ok)correct++;else wrong++}return {correct,wrong,blank,points:Math.max(0,correct-wrong*.1)}},[exam,answers])
 const answered=Object.keys(answers).filter(k=>answers[k]?.trim()).length
 return <section className="content progress-page sf-page">
  {mode==='intro'&&<><div className="page-heading"><div><div className="eyebrow"><GraduationCap size={15}/> PROVA NAZIONALE · A.A. 2026/27</div><h1>Semestre Filtro</h1><p>Simulazioni dedicate a Medicina, Odontoiatria e Veterinaria. Banca dati distinta dai normali quiz universitari.</p></div></div>
   <div className="sf-hero panel"><div><span className="sf-kicker">FORMATO D'ESAME</span><h2>Allenati come il giorno della prova.</h2><p>31 quesiti · 50 minuti · risposte corrette visibili solo alla consegna.</p></div><div className="sf-big-number">31<small>quesiti</small></div></div>
   <div className="sf-specs"><div><b>21</b><span>Scelta multipla</span></div><div><b>10</b><span>Completamento</span></div><div><b>50 min</b><span>Tempo massimo</span></div><div><b>+1 / −0,1</b><span>Corretta / errata</span></div></div>
   <div className="section-head"><div><h2>Scegli la materia</h2><p>Ogni simulazione pesca 21 domande a scelta multipla e 10 a completamento.</p></div></div>
   <div className="sf-subjects">{subjects.map(s=><button key={s.id} className={'sf-subject panel '+(subject===s.id?'selected':'')} onClick={()=>setSubject(s.id)}><span className={'sf-subject-mark '+s.color}>{s.label[0]}</span><span><b>{s.label}</b><small>{bank.length&&subject===s.id?bank.length+' quesiti disponibili':'Simulazione da 31 quesiti'}</small></span><span className="sf-radio">{subject===s.id?'✓':''}</span></button>)}</div>
   {error&&<div className="notice">{error}</div>}
   <div className="sf-start-row"><div><b>Correzione alla fine</b><small>Durante la prova non mostriamo suggerimenti né soluzioni.</small></div><button className="primary" disabled={loading} onClick={()=>void loadExam()}>{loading?'Preparazione…':'Inizia simulazione'} <ArrowRight size={16}/></button></div>
  </>}
  {mode==='exam'&&<><div className="sf-exam-top"><div><div className="eyebrow">SEMESTRE FILTRO · {subjects.find(s=>s.id===subject)?.label.toUpperCase()}</div><h1>Simulazione d'esame</h1><p>{answered} di 31 risposte inserite</p></div><div className={'sf-clock '+(seconds<300?'urgent':'')}><Clock3 size={18}/><b>{fmt(seconds)}</b></div></div>
   <div className="sf-progress"><i style={{width:(answered/31*100)+'%'}}/></div>
   <div className="sf-exam-layout"><div className="sf-question-list">{ordered.map((q,i)=><article className="panel sf-question" key={q.id}><div className="sf-question-meta"><span>QUESITO {String(i+1).padStart(2,'0')} / 31</span><span>{q.tipo==='scelta_multipla'?'SCELTA MULTIPLA':'COMPLETAMENTO'}</span></div><h3>{q.testo_domanda}</h3>{q.tipo==='scelta_multipla'?<div className="sf-options">{q.opzioni.map((o,j)=>{const letter=String.fromCharCode(65+j);return <button key={j} className={answers[q.id]===letter?'chosen':''} onClick={()=>setAnswers(a=>({...a,[q.id]:letter}))}><b>{letter}</b><span>{o}</span></button>})}</div>:<label className="sf-fill">Inserisci la risposta<input value={answers[q.id]||''} onChange={e=>setAnswers(a=>({...a,[q.id]:e.target.value}))} placeholder="Scrivi qui la risposta"/></label>}</article>)}</div>
    <aside className="panel sf-exam-aside"><b>Riepilogo prova</b><div className="sf-counter"><strong>{answered}</strong><span>/ 31 risposte</span></div><div className="sf-mini-grid">{ordered.map((q,i)=><button key={q.id} className={answers[q.id]?'done':''} onClick={()=>document.getElementById('sfq-'+q.id)?.scrollIntoView({behavior:'smooth',block:'center'})}>{i+1}</button>)}</div><p>Le risposte non vengono corrette durante la prova.</p><button className="primary" onClick={()=>{if(window.confirm('Consegnare la prova? Le risposte non potranno essere modificate.'))finish()}}>Consegna prova <ArrowRight size={15}/></button></aside>
   </div>
  </>}
  {mode==='result'&&<><div className="page-heading"><div><div className="eyebrow"><CheckCircle2 size={15}/> PROVA CONSEGNATA</div><h1>Risultato della simulazione</h1><p>{subjects.find(s=>s.id===subject)?.label} · 31 quesiti · 50 minuti</p></div></div><div className="panel sf-result-hero"><div><small>PUNTEGGIO SIMULAZIONE</small><strong>{score.points.toFixed(1)}<span> / 30*</span></strong><p>{score.correct} corrette · {score.wrong} errate · {score.blank} omesse</p></div><div className="sf-result-grade">{Math.round(score.correct/31*100)}%<small>accuratezza</small></div></div><p className="sf-scoring-note">Calcolo didattico: +1 per risposta corretta, −0,1 per risposta errata, 0 per omessa. Il punteggio non sostituisce la valutazione ufficiale.</p><div className="sf-review-head"><h2>Correzione completa</h2><button className="secondary" onClick={()=>setShowAll(v=>!v)}>{showAll?'Compatta':'Mostra tutte'}</button></div>{exam.map((q,i)=>{const a=answers[q.id]||'';const ok=q.tipo==='scelta_multipla'?a===q.risposta_corretta:(q.risposte_accettate||[q.risposta_corretta]).some(v=>norm(v)===norm(a));const correctText=q.tipo==='scelta_multipla'?q.opzioni['ABCDE'.indexOf(q.risposta_corretta)]||q.risposta_corretta:q.risposta_corretta;return <article className="panel sf-review" key={q.id}><div className="sf-question-meta"><span>QUESITO {i+1} · {q.tipo==='scelta_multipla'?'SCELTA MULTIPLA':'COMPLETAMENTO'}</span><b className={a?(ok?'is-correct':'is-wrong'):'is-blank'}>{!a?'OMESSA':ok?'CORRETTA':'ERRATA'}</b></div><h3>{q.testo_domanda}</h3><p>La tua risposta: <b>{a?(q.tipo==='scelta_multipla'?a+'. '+(q.opzioni['ABCDE'.indexOf(a)]||''):a):'Non risposta'}</b></p><p>Risposta corretta: <b>{correctText}</b></p>{showAll&&<p className="sf-explanation">{q.spiegazione}</p>}</article>})}<div className="sf-start-row"><button className="secondary" onClick={()=>setMode('intro')}><ArrowLeft size={15}/> Torna alle materie</button><button className="primary" onClick={()=>void loadExam()}><RotateCcw size={15}/> Nuova simulazione</button></div></>}
 </section>
}
