import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import StudyCompletion from './StudyCompletion'
import { ArrowLeft, ArrowRight, Clock3, CheckCircle2, GraduationCap } from 'lucide-react'

type SubjectId='biologia'|'chimica'|'fisica'
type Question={id:string;codice:string;materia:SubjectId;argomento:string;tipo:'scelta_multipla'|'completamento';difficolta:string;testo_domanda:string;opzioni:string[]}
type Review=Question&{given:string|null;correct:string;correct_text:string;accepted:string[];is_correct:boolean;spiegazione:string}
type Result={correct:number;wrong:number;blank:number;score:number;review:Review[]}
const subjects=[{id:'biologia' as const,label:'Biologia',tone:'bio'},{id:'chimica' as const,label:'Chimica e propedeutica biochimica',tone:'chem'},{id:'fisica' as const,label:'Fisica',tone:'phys'}]
const fmt=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')

type SemestreFiltroProps={onBuyPackage:(priceId:string,subjectIds:string[],consentConfirmed:boolean)=>void;onRequireLogin:()=>void}
const semestreSinglePrice='price_1UcVlkBCybXKHSfRs9hj7caG'
const semestreCompletePrice='price_1UcVo8BCybXKHSfRDXpOyB0q'
export default function SemestreFiltro({onBuyPackage,onRequireLogin}:SemestreFiltroProps){
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
 const [paywall,setPaywall]=useState(false)
 const [accessType,setAccessType]=useState<'free'|'single_subject'|'complete'|'unlimited'|''>('')
 const [digitalConsent,setDigitalConsent]=useState(false)
 const [freeUsed,setFreeUsed]=useState(0),[freeRemaining,setFreeRemaining]=useState(5),[freeUsageLoaded,setFreeUsageLoaded]=useState(false)
 const finishLock=useRef(false)
 const draftKey='smlquiz.semestre-filtro-draft.v1'
 useEffect(()=>{let active=true;if(!supabase)return;void supabase.rpc('get_semestre_filtro_free_usage').then(({data,error})=>{if(!active||error||!data)return;const usage=data as {free_used?:number;free_remaining?:number};setFreeUsed(Math.max(0,Math.min(5,Number(usage.free_used)||0)));setFreeRemaining(Math.max(0,Math.min(5,Number(usage.free_remaining)||0)));setFreeUsageLoaded(true)});return()=>{active=false}},[])
 useEffect(()=>{
  try{
   const raw=localStorage.getItem(draftKey)
   if(!raw)return
   const draft=JSON.parse(raw) as {examId?:string;exam?:Question[];answers?:Record<string,string>;subject?:SubjectId;startedAt?:number;accessType?:'free'|'single_subject'|'complete'|'unlimited'}
   if(!draft.examId||!Array.isArray(draft.exam)||draft.exam.length!==31||!draft.startedAt){localStorage.removeItem(draftKey);return}
   const elapsed=Math.max(0,Date.now()-draft.startedAt)
   if(elapsed>=3000000){localStorage.removeItem(draftKey);window.dispatchEvent(new Event('smlquiz-semestre-draft-change'));return}
   const remaining=Math.max(0,3000-Math.floor(elapsed/1000))
   const resume=window.confirm(`Hai una simulazione precedente di Semestre Filtro con ${fmt(remaining)} rimanenti. Vuoi riprenderla? Se scegli Annulla, la vecchia bozza verrà eliminata e potrai iniziare una nuova prova da 50:00.`)
   if(!resume){localStorage.removeItem(draftKey);window.dispatchEvent(new Event('smlquiz-semestre-draft-change'));return}
   setExamId(draft.examId);setExam(draft.exam);setAnswers(draft.answers||{});setSubject(draft.subject||'biologia');setAccessType(draft.accessType||'');setStartedAt(draft.startedAt);setSeconds(remaining);setMode('exam')
  }catch{localStorage.removeItem(draftKey)}
 },[])
 useEffect(()=>{
  if(mode!=='exam'||!examId||exam.length!==31||!startedAt)return
  try{localStorage.setItem(draftKey,JSON.stringify({examId,exam,answers,subject,startedAt,accessType}))}catch{};window.dispatchEvent(new Event('smlquiz-semestre-draft-change'))
 },[mode,examId,exam,answers,subject,startedAt,accessType])
 const exitMode=()=>{if(mode==='exam'&&!window.confirm('Uscire dalla simulazione? Le risposte inserite vengono salvate su questo dispositivo e potrai riprendere la prova riaprendola.'))return;if(window.history.state?.semestreFiltroMode)window.history.back();else setMode('intro')}
 useEffect(()=>{const onPopState=()=>{if(mode!=='intro'){setMode('intro');setStartedAt(null)}};window.addEventListener('popstate',onPopState);return()=>window.removeEventListener('popstate',onPopState)},[mode])
 useEffect(()=>{if(mode==='exam'||mode==='result'){const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}}},[mode])
 const answered=Object.values(answers).filter(v=>v.trim()).length
 const mcq=exam.filter(q=>q.tipo==='scelta_multipla').length
 const finish=useCallback(async()=>{
  if(finishLock.current||!examId||!supabase)return
  finishLock.current=true;setSubmitting(true);setError('')
  try{
   const {data,error:rpcError}=await supabase.rpc('submit_semestre_filtro_exam',{p_exam_id:examId,p_answers:answers})
   if(rpcError)throw rpcError
   setResult(data as Result);setMode('result');try{localStorage.removeItem(draftKey)}catch{};window.dispatchEvent(new Event('smlquiz-semestre-draft-change'))
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
  const {data:auth}=await supabase.auth.getUser();if(!auth.user){onRequireLogin();return}
  setLoading(true);setError('')
  try{
   // Rinnova il JWT prima della RPC: il controllo server usa il claim session_id
   // per verificare la sessione autenticata e applicare il limite dispositivi.
   const {data:refreshed,error:refreshError}=await supabase.auth.refreshSession()
   if(refreshError||!refreshed.session){onRequireLogin();throw new Error('Sessione scaduta. Accedi di nuovo e riprova.')}
   const {data,error}=await supabase.rpc('start_semestre_filtro_exam',{p_materia:subject})
   if(error)throw error
   const payload=data as {exam_id?:string;questions?:Question[];duration_seconds?:number;paywall?:boolean;access_type?:'free'|'single_subject'|'complete'|'unlimited';free_used?:number;free_remaining?:number}
   if(payload?.paywall){setPaywall(true);setFreeUsed(5);setFreeRemaining(0);setFreeUsageLoaded(true);return}
   if(!payload?.exam_id||payload.questions?.length!==31)throw new Error('Il materiale per questa simulazione non è ancora completo. SMLQUIZ è in continua crescita: nuove domande e simulazioni verranno aggiunte progressivamente. Nel frattempo puoi scegliere un’altra materia.')
   setPaywall(false);setAccessType(payload.access_type||'');if(typeof payload.free_used==='number')setFreeUsed(payload.free_used);if(typeof payload.free_remaining==='number')setFreeRemaining(payload.free_remaining);setFreeUsageLoaded(true)
   setExamId(payload.exam_id);setExam(payload.questions);setAnswers({});setResult(null);setSeconds(3000);setStartedAt(Date.now());finishLock.current=false;try{localStorage.setItem(draftKey,JSON.stringify({examId:payload.exam_id,exam:payload.questions,answers:{},subject,startedAt:Date.now(),accessType:payload.access_type||''}))}catch{};window.dispatchEvent(new Event('smlquiz-semestre-draft-change'));window.history.pushState({...window.history.state,semestreFiltroMode:true},'','/semestre-filtro');setMode('exam')
  }catch(e){const message=e instanceof Error?e.message:'Non riesco a preparare la simulazione.';if(message.toLowerCase().includes('accedere')){onRequireLogin();return}setError(message)}
  finally{setLoading(false)}
 }
 const review=useMemo(()=>result?.review||[],[result])
 return <section className={"content progress-page sf-page "+(mode!=='intro'?"sf-mode-screen":"")}>
  {mode==='intro'&&<>
   <div className="page-heading"><div><div className="eyebrow"><GraduationCap size={15}/> PROVA NAZIONALE · A.A. 2026/27</div><h1>Semestre Filtro</h1><p>Preparazione per Medicina, Odontoiatria e Veterinaria. Il semestre filtro 2026/27 prevede lo stesso programma nazionale e le stesse tre prove per tutti e tre i corsi.</p></div></div>
   <div className="sf-hero panel"><div><span className="sf-kicker">FORMATO D'ESAME</span><h2>Allenati come il giorno della prova.</h2><p>31 quesiti · 50 minuti · soluzioni visibili soltanto alla consegna.</p></div><div className="sf-big-number">31<small>quesiti</small></div></div>
   <div className="sf-specs"><div><b>21</b><span>Scelta multipla</span></div><div><b>10</b><span>Completamento</span></div><div><b>50 min</b><span>Tempo massimo</span></div><div><b>+1 / −0,1</b><span>Corretta / errata</span></div></div>
   <div className="notice"><div><b>Un’unica preparazione per tre corsi</b><span>Le simulazioni sono valide per Medicina e Chirurgia, Odontoiatria e Protesi Dentaria e Medicina Veterinaria: il programma e le tre materie del Semestre Filtro sono comuni.</span></div></div>
   <p className="sf-scoring-note">Queste sono simulazioni didattiche create da SMLQUIZ, non prove ufficiali del Ministero. Ogni simulazione seleziona 31 quesiti dalla banca dati della materia.</p>
   <div className="section-head"><div><h2>Scegli la materia</h2><p>Ogni prova contiene 21 domande a scelta multipla e 10 a completamento.</p></div></div>
   <div className="sf-subjects">{subjects.map(s=><button key={s.id} className={'sf-subject panel '+(subject===s.id?'selected':'')} onClick={()=>setSubject(s.id)}><span className={'sf-subject-mark '+s.tone}>{s.label[0]}</span><span><b>{s.label}</b><small>Simulazione completa da 31 quesiti</small></span><span className="sf-radio">{subject===s.id?'✓':''}</span></button>)}</div>
   {error&&<div className="notice">{error}</div>}
   <div className="sf-start-row"><div><b>{freeUsageLoaded?`${freeRemaining} simulazioni gratuite disponibili`:'Verifica simulazioni gratuite…'}</b><small>{freeUsageLoaded?`${freeUsed} di 5 già utilizzate · quota totale per account, non giornaliera.`:'La disponibilità viene aggiornata direttamente dal tuo account.'} Dopo le prime cinque puoi scegliere il pacchetto più adatto.</small></div><button className="primary" disabled={loading} onClick={()=>void start()}>{loading?'Preparazione…':'Inizia simulazione'} <ArrowRight size={16}/></button></div>
   <div className="sf-paywall panel sf-pricing-always"><div className="eyebrow">{paywall?'SIMULAZIONI GRATUITE ESAURITE':'PACCHETTI SEMESTRE FILTRO'}</div><h2>Continua ad allenarti</h2><p>{paywall?'Hai utilizzato tutte le 5 simulazioni gratuite. Sblocca questa materia oppure tutte e tre.':'Puoi acquistare l’accesso anche prima di esaurire le simulazioni gratuite.'}</p><div className="sf-paywall-plans"><article><span>UNA MATERIA</span><h3>Semestre Filtro – {subjects.find(s=>s.id===subject)?.label}</h3><p>Tutte le simulazioni della materia selezionata, senza limiti.</p><strong>1,99 €</strong><button className="primary" disabled={!digitalConsent} onClick={()=>onBuyPackage(semestreSinglePrice,[subject],digitalConsent)}>Sblocca questa materia</button></article><article className="featured"><span>PACCHETTO COMPLETO</span><h3>Semestre Filtro – Completo</h3><p>Accesso illimitato a Biologia, Chimica e Fisica: tutte le 900 domande.</p><strong>3,99 €</strong><button className="primary" disabled={!digitalConsent} onClick={()=>onBuyPackage(semestreCompletePrice,[],digitalConsent)}>Sblocca tutte e 3</button></article></div><label className="sf-digital-consent"><input type="checkbox" checked={digitalConsent} onChange={e=>setDigitalConsent(e.target.checked)}/> Richiedo l'accesso immediato ai contenuti digitali e riconosco che, iniziata la fornitura, perdo il diritto di recesso.</label>{!digitalConsent&&<small className="sf-consent-hint">Conferma per procedere al pagamento.</small>}</div>
  </>}
  {mode==='exam'&&<>
   <div className="sf-mode-toolbar"><button type="button" className="sf-mode-back" onClick={exitMode}><ArrowLeft size={17}/> Indietro</button><span>MODALITÀ ESAME</span></div><div className="sf-exam-top"><div><div className="eyebrow">SEMESTRE FILTRO · {subjects.find(s=>s.id===subject)?.label.toUpperCase()}</div><h1>Simulazione d'esame</h1><p>{answered} di 31 risposte inserite · {mcq} a scelta multipla · 10 completamenti</p></div><div className={'sf-clock '+(seconds<300?'urgent':'')}><Clock3 size={18}/><b>{fmt(seconds)}</b></div></div>
   <div className="sf-progress"><i style={{width:(answered/31*100)+'%'}}/></div>
   <div className="sf-exam-layout"><div className="sf-question-list">{exam.map((q,i)=><article className="panel sf-question" id={'sfq-'+q.id} key={q.id}><div className="sf-question-meta"><span>QUESITO {String(i+1).padStart(2,'0')} / 31</span><span>{q.tipo==='scelta_multipla'?'SCELTA MULTIPLA':'COMPLETAMENTO'}</span></div><h3>{q.testo_domanda}</h3>{q.tipo==='scelta_multipla'?<div className="sf-options">{q.opzioni.map((o,j)=>{const letter=String.fromCharCode(65+j);return <button type="button" key={j} className={answers[q.id]===letter?'chosen':''} aria-pressed={answers[q.id]===letter} onClick={()=>setAnswers(a=>({...a,[q.id]:letter}))}><b>{letter}</b><span>{o}</span></button>})}</div>:<label className="sf-fill">Inserisci la risposta<input value={answers[q.id]||''} onChange={e=>setAnswers(a=>({...a,[q.id]:e.target.value}))} placeholder="Scrivi qui la risposta"/></label>}</article>)}</div>
    <aside className="panel sf-exam-aside"><b>Riepilogo prova</b><div className="sf-counter"><strong>{answered}</strong><span>/ 31 risposte</span></div><div className="sf-mini-grid">{exam.map((q,i)=><button type="button" key={q.id} className={answers[q.id]?.trim()?'done':''} onClick={()=>document.getElementById('sfq-'+q.id)?.scrollIntoView({behavior:'smooth',block:'center'})}>{i+1}</button>)}</div><p>Le soluzioni restano nascoste fino alla consegna.</p><button className="primary" disabled={submitting} onClick={()=>{if(window.confirm('Consegnare la prova? Dopo la consegna non potrai modificare le risposte.'))void finish()}}>{submitting?'Consegna…':'Consegna prova'} <ArrowRight size={15}/></button></aside>
   </div>{error&&<div className="notice">{error}</div>}
  </>}
  {mode==='result'&&result&&<>
   <div className="sf-mode-toolbar"><button type="button" className="sf-mode-back" onClick={exitMode}><ArrowLeft size={17}/> Indietro</button><span>RISULTATO ESAME</span></div><div className="page-heading"><div><div className="eyebrow"><CheckCircle2 size={15}/> PROVA CONSEGNATA</div><h1>Risultato della simulazione</h1><p>{subjects.find(s=>s.id===subject)?.label} · 31 quesiti · 50 minuti</p></div></div>
   <div className="panel sf-result-hero"><div><small>PUNTEGGIO SIMULAZIONE</small><strong>{Number(result.score).toFixed(1)}<span> punti grezzi</span></strong><p>{result.correct} corrette · {result.wrong} errate · {result.blank} omesse</p></div><div className="sf-result-grade">{result.correct===31?'30 e lode':result.score>=18?Math.round(result.score)+'/30':'Non superata'}<small>{result.correct===31?'31/30 · lode':result.score>=18?'Prova superata · voto arrotondato':'Soglia richiesta: 18/30'}</small></div></div>
   <p className="sf-scoring-note">Calcolo: +1 per risposta corretta, −0,1 per risposta errata, 0 per omessa. La soglia per superare la prova è 18/30; solo i punteggi pari o superiori a 18 vengono arrotondati all’unità più prossima. Con 31 risposte corrette è prevista la lode. Simulazione didattica non ufficiale.</p>
   <div className="sf-review-head"><h2>Correzione completa</h2><button className="secondary" onClick={()=>setShowExplanations(v=>!v)}>{showExplanations?'Nascondi spiegazioni':'Mostra spiegazioni'}</button></div>
   {review.map((q,i)=><article className="panel sf-review" key={q.id}><div className="sf-question-meta"><span>QUESITO {i+1} · {q.tipo==='scelta_multipla'?'SCELTA MULTIPLA':'COMPLETAMENTO'}</span><b className={!q.given?'is-blank':q.is_correct?'is-correct':'is-wrong'}>{!q.given?'OMESSA':q.is_correct?'CORRETTA':'ERRATA'}</b></div><h3>{q.testo_domanda}</h3><p>La tua risposta: <b>{q.given?(q.tipo==='scelta_multipla'?q.given+'. '+(q.opzioni['ABCDE'.indexOf(q.given)]||''):q.given):'Non risposta'}</b></p><p>Risposta corretta: <b>{q.tipo==='scelta_multipla'?q.correct+'. '+q.correct_text:q.correct_text}</b></p>{showExplanations&&<p className="sf-explanation">{q.spiegazione}</p>}</article>)}
   <StudyCompletion
    eyebrow="SIMULAZIONE COMPLETATA"
    title="Hai concluso questa prova."
    description="La correzione è completa e il risultato è stato calcolato. Puoi allenarti ancora sulla stessa materia oppure scegliere una delle altre prove del Semestre Filtro."
    meta={`${result.correct} corrette · ${result.wrong} errate · ${result.blank} omesse`}
    primaryLabel="Nuova simulazione"
    onPrimary={()=>void start()}
    secondaryLabel="Scegli un'altra materia"
    onSecondary={exitMode}
   />
  </>}
 </section>
}
