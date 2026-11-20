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

type SemestreFiltroProps={onBuyPackage:(priceId:string,subjectIds:string[],consentConfirmed:boolean)=>void;onRequireLogin:()=>void;onFreeComplete:()=>void}
const semestreSinglePrice='price_1UcVlkBCybXKHSfRs9hj7caG'
const semestreCompletePrice='price_1UcVo8BCybXKHSfRDXpOyB0q'
export default function SemestreFiltro({onBuyPackage,onRequireLogin,onFreeComplete}:SemestreFiltroProps){
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
 const finishLock=useRef(false)
 const draftKey='smlquiz.semestre-filtro-draft.v1'
 useEffect(()=>{
  try{
   const raw=localStorage.getItem(draftKey)
   if(!raw)return
   const draft=JSON.parse(raw) as {examId?:string;exam?:Question[];answers?:Record<string,string>;subject?:SubjectId;startedAt?:number;accessType?:'free'|'single_subject'|'complete'|'unlimited'}
   if(!draft.examId||!Array.isArray(draft.exam)||draft.exam.length!==31||!draft.startedAt||Date.now()-draft.startedAt>=3000000)return
   setExamId(draft.examId);setExam(draft.exam);setAnswers(draft.answers||{});setSubject(draft.subject||'biologia');setAccessType(draft.accessType||'');setStartedAt(draft.startedAt);setSeconds(Math.max(0,3000-Math.floor((Date.now()-draft.startedAt)/1000)));setMode('exam')
  }catch{localStorage.removeItem(draftKey)}
 },[])
 useEffect(()=>{
  if(mode!=='exam'||!examId||exam.length!==31||!startedAt)return
  try{localStorage.setItem(draftKey,JSON.stringify({examId,exam,answers,subject,startedAt,accessType}))}catch{}
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
   setResult(data as Result);setMode('result');try{localStorage.removeItem(draftKey)}catch{}if(accessType==='free')onFreeComplete()
  }catch(e){setError(e instanceof Error?e.message:'Consegna non riuscita. Riprova.');finishLock.current=false}
  finally{setSubmitting(false)}
 },[examId,answers,accessType,onFreeComplete])
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
   const payload=data as {exam_id?:string;questions?:Question[];duration_seconds?:number;paywall?:boolean;access_type?:'free'|'single_subject'|'complete'|'unlimited'}
   if(payload?.paywall){setPaywall(true);return}
   const questionSet:Question[]=Array.isArray(payload?.questions)?payload.questions:[]
   const multipleChoice=questionSet.filter(q=>q.tipo==='scelta_multipla')
   const completion=questionSet.filter(q=>q.tipo==='completamento')
   const validStructure=questionSet.length===31&&multipleChoice.length===21&&completion.length===10&&multipleChoice.every(q=>Array.isArray(q.opzioni)&&q.opzioni.length===5)
   if(!payload?.exam_id||!validStructure)throw new Error('La banca dati non contiene ancora una prova completa nel formato ufficiale 2026/27 (21 quesiti a scelta multipla con 5 opzioni e 10 a completamento). Scegli un’altra materia o riprova più tardi.')
   setPaywall(false);setAccessType(payload.access_type||'')
   setExamId(payload.exam_id);setExam(questionSet);setAnswers({});setResult(null);setSeconds(3000);setStartedAt(Date.now());finishLock.current=false;try{localStorage.setItem(draftKey,JSON.stringify({examId:payload.exam_id,exam:payload.questions,answers:{},subject,startedAt:Date.now(),accessType:payload.access_type||''}))}catch{}window.history.pushState({...window.history.state,semestreFiltroMode:true},'','/semestre-filtro');setMode('exam')
  }catch(e){const message=e instanceof Error?e.message:'Non riesco a preparare la simulazione.';if(message.toLowerCase().includes('accedere')){onRequireLogin();return}setError(message)}
  finally{setLoading(false)}
 }
 useEffect(()=>{window.scrollTo(0,0);document.querySelector('.app-shell .content')?.scrollTo(0,0)},[mode])
 const review=useMemo(()=>result?.review||[],[result])
 return <section className={"content progress-page sf-page "+(mode!=='intro'?"sf-mode-screen":"")}>
  {mode==='intro'&&<>
   <header className="sf-page-heading">
    <div className="sf-heading-icon"><GraduationCap size={23}/></div>
    <div className="sf-heading-copy"><span className="sf-kicker">PREPARAZIONE · ANNO ACCADEMICO 2026/27</span><h1>Semestre Filtro</h1><p>Allenati sulle tre materie con simulazioni strutturate come le prove del semestre filtro.</p></div>
    <span className="sf-official-tag">Formato 2026/27</span>
   </header>
   <section className="sf-intro-grid" aria-label="Come funziona">
    <article className="sf-intro-main">
     <div className="sf-intro-main-top"><span className="sf-kicker">LA SIMULAZIONE</span><span className="sf-pill"><CheckCircle2 size={13}/> Correzione alla fine</span></div>
     <h2>Una prova alla volta.<br/><em>Un obiettivo chiaro.</em></h2>
     <p>Scegli la materia, rispondi ai quesiti e consegna quando hai finito. Durante la prova non vedrai le soluzioni: le troverai tutte nella correzione finale.</p>
     <div className="sf-step-list"><div><span>01</span><b>Scegli</b><small>Biologia, Chimica o Fisica</small></div><div><span>02</span><b>Svolgi</b><small>31 quesiti in 50 minuti</small></div><div><span>03</span><b>Rivedi</b><small>Punteggio, risposte e spiegazioni</small></div></div>
    </article>
    <aside className="sf-format-card">
     <span className="sf-kicker">STRUTTURA DELLA PROVA</span>
     <div className="sf-format-total"><strong>31</strong><span>quesiti<br/>per materia</span></div>
     <div className="sf-format-row"><span><b>21</b> scelta multipla</span><small>5 alternative · 1 corretta</small></div>
     <div className="sf-format-row"><span><b>10</b> completamento</span><small>Inserisci il termine richiesto</small></div>
     <div className="sf-format-row"><span><b>50 min</b> durata</span><small>Tempo per ogni prova</small></div>
     <div className="sf-format-score"><b>+1</b> corretta <b>−0,1</b> errata <b>0</b> omessa</div>
    </aside>
   </section>
   <section className="sf-subject-section">
    <div className="sf-section-title"><div><span className="sf-kicker">PASSAGGIO 1 DI 2</span><h2>Quale materia vuoi allenare?</h2><p>Ogni simulazione riguarda una sola materia. Puoi tornare qui per sceglierne un’altra.</p></div><span className="sf-selection-count">3 materie disponibili</span></div>
    <div className="sf-subjects">{subjects.map(s=><button key={s.id} type="button" className={'sf-subject sf-subject-card '+s.tone+(subject===s.id?' selected':'')} onClick={()=>{setSubject(s.id);setError('')}} aria-pressed={subject===s.id}>
     <span className="sf-subject-mark">{s.id==='chimica'?'Ch':s.label[0]}</span><span className="sf-subject-copy"><b>{s.label}</b><small>31 quesiti · 50 minuti</small></span><span className="sf-subject-check">{subject===s.id?<CheckCircle2 size={20}/>:<span/>}</span>
    </button>)}</div>
    <div className="sf-selected-summary"><div className="sf-selected-check"><CheckCircle2 size={18}/></div><div><small>MATERIA SELEZIONATA</small><b>{subjects.find(s=>s.id===subject)?.label}</b></div><div className="sf-selected-meta"><span>21 scelta multipla</span><span>10 completamenti</span></div></div>
    {error&&<div className="sf-error" role="alert">{error}</div>}
    <div className="sf-start-panel"><div><span className="sf-kicker">PASSAGGIO 2 DI 2</span><b>Pronto per iniziare?</b><small>Hai 5 simulazioni gratuite totali per account. Le risposte vengono salvate su questo dispositivo se esci dalla prova.</small></div><button className="primary sf-start-button" disabled={loading} onClick={()=>void start()}>{loading?'Preparazione della prova…':'Inizia la simulazione'} <ArrowRight size={17}/></button></div>
   </section>
   <p className="sf-disclaimer">Le simulazioni SMLQUIZ sono strumenti didattici di preparazione e non costituiscono prove ufficiali ministeriali. Il programma è comune a Medicina e Chirurgia, Odontoiatria e Protesi Dentaria e Medicina Veterinaria. Tra le prove ufficiali è prevista una pausa di 30 minuti.</p>
   <section className="sf-access-section">
    <div className="sf-access-heading"><div><span className="sf-kicker">ACCESSO ALLE SIMULAZIONI</span><h2>Continua ad allenarti</h2><p>{paywall?'Hai utilizzato tutte le 5 simulazioni gratuite. Scegli come proseguire.':'Le prime 5 simulazioni sono gratuite. Puoi acquistare un accesso esteso in qualsiasi momento.'}</p></div><span className="sf-access-free">5 prove gratuite</span></div>
    <div className="sf-paywall-plans">
     <article><span>ACCESSO SINGOLO</span><h3>Una materia</h3><p>Tutte le simulazioni di {subjects.find(s=>s.id===subject)?.label}, senza limiti.</p><strong>1,99 €</strong><button className="primary" disabled={!digitalConsent} onClick={()=>onBuyPackage(semestreSinglePrice,[subject],digitalConsent)}>Sblocca questa materia</button></article>
     <article className="featured"><span>ACCESSO COMPLETO</span><h3>Tutte e tre le materie</h3><p>Biologia, Chimica e Fisica: accesso illimitato alle simulazioni.</p><strong>3,99 €</strong><button className="primary" disabled={!digitalConsent} onClick={()=>onBuyPackage(semestreCompletePrice,[],digitalConsent)}>Sblocca il pacchetto completo</button></article>
    </div>
    <label className="sf-digital-consent"><input type="checkbox" checked={digitalConsent} onChange={e=>setDigitalConsent(e.target.checked)}/> Richiedo l'accesso immediato ai contenuti digitali e riconosco che, iniziata la fornitura, perdo il diritto di recesso.</label>
    {!digitalConsent&&<small className="sf-consent-hint">Conferma questa opzione per procedere al pagamento.</small>}
   </section>
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
