import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CalendarDays, Copy, Brain, Users, ShieldCheck, Send } from 'lucide-react'

type Subject = { id: string; nome: string }
type Attempt = { id: string; subject: string; score: number; total: number; correct: number; wrong: number; date: string }

export function FreeStudyPlanner({ subjects, dailyGoal, history }: { subjects: Subject[]; dailyGoal: number; history: Attempt[] }) {
  type PlanRow = { date: string; task: string; done?: boolean; focus?: string }
  const [subjectId,setSubjectId]=useState('')
  const [examDate,setExamDate]=useState('')
  const [plan,setPlan]=useState<PlanRow[]>([])
  const [saveStatus,setSaveStatus]=useState('')
  const [busy,setBusy]=useState(false)
  const selected=subjects.find(s=>s.id===subjectId)
  const subjectHistory=useMemo(()=>history.filter(h=>h.subject.toLocaleLowerCase()===selected?.nome.toLocaleLowerCase()),[history,selected])
  const accuracy=subjectHistory.length?Math.round(subjectHistory.reduce((a,h)=>a+h.correct,0)/Math.max(1,subjectHistory.reduce((a,h)=>a+h.total,0))*100):null
  useEffect(()=>{let active=true;async function load(){try{const saved=JSON.parse(localStorage.getItem('smlquiz.study-plan.v1')||'null');if(saved&&Array.isArray(saved.rows)){setSubjectId(saved.subjectId||'');setExamDate(saved.examDate||'');setPlan(saved.rows.filter((r:any)=>r&&typeof r.date==='string'&&typeof r.task==='string'))}}catch{localStorage.removeItem('smlquiz.study-plan.v1')}
    if(!supabase)return;try{const {data:u}=await supabase.auth.getUser();if(!u.user)return;const {data,error}=await supabase.from('user_study_plans').select('subject_id,exam_date,plan').eq('user_id',u.user.id).maybeSingle();if(!active||error||!data||!Array.isArray(data.plan))return;setSubjectId(data.subject_id||'');setExamDate(data.exam_date||'');setPlan(data.plan.filter((r:any)=>r&&typeof r.date==='string'&&typeof r.task==='string'));localStorage.setItem('smlquiz.study-plan.v1',JSON.stringify({subjectId:data.subject_id,examDate:data.exam_date,rows:data.plan}));setSaveStatus('Percorso recuperato dal tuo account.')}catch{}
  }void load();return()=>{active=false}},[])
  useEffect(()=>{if(!subjectId&&subjects.length)setSubjectId(subjects[0].id)},[subjects,subjectId])
  function persist(rows:PlanRow[]){setPlan(rows);try{localStorage.setItem('smlquiz.study-plan.v1',JSON.stringify({subjectId,subject:selected?.nome,examDate,rows}))}catch{}}
  async function createPlan(){
    if(!selected||!examDate||busy)return
    const start=new Date();start.setHours(0,0,0,0);const end=new Date(examDate+'T00:00:00')
    if(!Number.isFinite(end.getTime())||end<start){setSaveStatus('Scegli una data di esame futura.');return}
    setBusy(true);setSaveStatus('Sto organizzando il percorso in base alla materia e ai tuoi risultati…')
    const days=Math.max(1,Math.ceil((end.getTime()-start.getTime())/86400000))
    let topics:string[]=[]
    if(supabase){try{const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'study-program',materiaId:selected.id}});const modules=Array.isArray(data?.program?.moduli)?data.program.moduli:[];topics=modules.flatMap((m:any)=>Array.isArray(m.argomenti)?m.argomenti.map((x:string)=>String(m.titolo||'Modulo')+' — '+String(x)):[]).filter(Boolean);if(error||!topics.length)topics=[]}catch{}}
    const totalSessions=Math.min(180,Math.max(1,days*dailyGoal))
    const priority=accuracy===null?['Studio guidato dei concetti fondamentali','Quiz di verifica iniziale','Riepilogo e memorizzazione']:accuracy<60?['Recupero dei concetti base','Esercizi guidati sugli errori','Quiz mirato: consolidamento']:accuracy<80?['Consolidamento degli argomenti incerti','Quiz misto a difficoltà crescente','Ripasso attivo e richiamo']:['Ripasso avanzato','Simulazione quiz a tempo','Richiamo rapido e verifica finale']
    const schedule=Array.from({length:totalSessions},(_,i)=>{
      const day=Math.floor(i/dailyGoal);const date=new Date(start.getTime()+day*86400000)
      const dateString=date.toLocaleDateString('it-IT',{weekday:'long',day:'2-digit',month:'long'})
      const topic=topics.length?topics[Math.floor(i/Math.max(1,dailyGoal))%topics.length]:null
      const phase=Math.min(2,Math.floor(i/Math.max(1,totalSessions/3)))
      const task=topic?(phase===0?'Studia e schematizza: ':phase===1?'Esercitati e verifica: ':'Ripassa e consolida: ')+topic:priority[i%priority.length]
      const focus=topic||selected.nome
      return {date:dateString,task,focus,done:false}
    })
    // Le sessioni finali sono dedicate al richiamo globale e alla simulazione, senza aggiungere giornate oltre l'esame.
    if(schedule.length){schedule[schedule.length-1]={...schedule[schedule.length-1],task:'Simulazione finale e revisione degli ultimi errori',focus:selected.nome}}
    persist(schedule)
    let status=topics.length?'Percorso creato usando gli argomenti del programma della materia.':'Percorso personalizzato creato; programma dettagliato non disponibile, quindi le attività sono strutturate per fasi di apprendimento.'
    if(accuracy!==null)status+=' I tuoi quiz mostrano '+accuracy+'% di accuratezza: intensità e ripassi sono calibrati su questo dato.'
    setSaveStatus(status+' Salvataggio…')
    if(supabase){try{const {data:u}=await supabase.auth.getUser();if(u.user){const {error}=await supabase.from('user_study_plans').upsert({user_id:u.user.id,subject_id:selected.id,exam_date:examDate,plan:schedule,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;status+=' Sincronizzato con l’account.'}else status+=' Salvato su questo dispositivo.'}catch{status+=' Salvato sul dispositivo; sincronizzazione account non riuscita.'}}else status+=' Salvato su questo dispositivo.'
    setSaveStatus(status);setBusy(false)
  }
  async function toggle(index:number){const rows=plan.map((r,i)=>i===index?{...r,done:!r.done}:r);persist(rows);if(supabase){try{const {data:u}=await supabase.auth.getUser();if(u.user){const {error}=await supabase.from('user_study_plans').upsert({user_id:u.user.id,subject_id:subjectId,exam_date:examDate,plan:rows,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;setSaveStatus('Progresso aggiornato e sincronizzato.')}}catch{setSaveStatus('Progresso aggiornato sul dispositivo.')}}}
  const completed=plan.filter(r=>r.done).length
  return <div className="panel" style={{marginTop:16,padding:20}}>
    <div className="panel-title"><div><h3><CalendarDays size={18} style={{verticalAlign:'middle',marginRight:8}}/>Piano di studio automatico</h3><p>Un percorso organizzato fino all’esame, con attività distribuite giorno per giorno e progressi registrabili.</p></div></div>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
      <label style={{flex:'1 1 220px'}}>Materia<select style={{display:'block',width:'100%'}} value={subjectId} onChange={e=>setSubjectId(e.target.value)}>{subjects.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
      <label>Data esame<input type="date" min={new Date().toISOString().slice(0,10)} value={examDate} onChange={e=>setExamDate(e.target.value)}/></label>
      <button className="primary" type="button" disabled={!subjectId||!examDate||busy} onClick={()=>void createPlan()}>{busy?'Elaborazione…':'Genera il mio percorso'}</button>
    </div>
    {selected&&<div style={{marginTop:12,display:'flex',gap:16,flexWrap:'wrap'}}><small>{subjectHistory.length} quiz storici sulla materia</small><small>{accuracy===null?'Accuratezza: dati ancora insufficienti':'Accuratezza media: '+accuracy+'%'}</small><small>{dailyGoal} sessioni al giorno</small></div>}
    {saveStatus&&<small role="status" style={{display:'block',marginTop:8}}>{saveStatus}</small>}
    {plan.length>0&&<div style={{marginTop:16}}><div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><b>{selected?.nome} · {completed}/{plan.length} sessioni completate</b><b>{Math.round(completed/plan.length*100)}%</b></div><div className="progress-track" style={{margin:'8px 0 14px'}}><i style={{width:(completed/plan.length*100)+'%'}}/></div><div style={{maxHeight:440,overflow:'auto'}}>{plan.map((r,i)=><label key={i} className="performance-row" style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',opacity:r.done?.65:1}}><input type="checkbox" checked={Boolean(r.done)} onChange={()=>void toggle(i)}/><div style={{flex:1}}><b style={{textDecoration:r.done?'line-through':'none'}}>{r.date}</b><small>{r.task}</small></div></label>)}</div></div>}
  </div>
}

export function ReferralCard({ userId }: { userId: string }) {
  const [copied,setCopied] = useState(false)
  const url = typeof window!=='undefined' ? window.location.origin+'/?ref='+encodeURIComponent(userId) : ''
  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(()=>setCopied(false),2200) } catch { const el=document.createElement('textarea');el.value=url;document.body.appendChild(el);el.select();document.execCommand('copy');el.remove();setCopied(true) } }
  return <div className="panel" style={{marginTop:16,padding:20}}>
    <div className="panel-title"><div><h3><Users size={18} style={{verticalAlign:'middle',marginRight:8}}/>Invita amici</h3><p>Condividi il tuo link: ricevi 1 credito quando un nuovo amico completa il suo primo quiz.</p></div></div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><input readOnly value={url} style={{flex:'1 1 240px'}}/><button className="secondary" type="button" onClick={()=>void copy()}><Copy size={15}/> {copied?'Copiato!':'Copia link'}</button></div>
  </div>
}

export function FreeAdminOverview({ subjectsCount, readyCount }: { subjectsCount: number; readyCount: number }) {
 const emptyForm = { id: '', chapterId: '', concept: '', question: '', options: ['', '', '', ''], correct: '', explanation: '' };
 const [items,setItems]=useState<any>({questions:[],reports:[],quizSets:[],chapters:[]});
 const [message,setMessage]=useState('Caricamento...');
 const [busy,setBusy]=useState(false);
 const [form,setForm]=useState<any>(emptyForm);
 const [editing,setEditing]=useState(false);
 async function load() {
   if (!supabase) { setMessage('Servizio amministratore non disponibile'); return }
   setMessage('Caricamento...');
   const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'admin-list'}});
   if(error||data?.error){setMessage(data?.error||error?.message||'Errore nel caricamento');return}
   setItems(data);setMessage('');
 }
 useEffect(()=>{void load()},[]);
 function editQuestion(q:any) {
   const options=Array.isArray(q.opzioni)?q.opzioni:[];
   setForm({id:q.id,chapterId:q.capitolo_id,concept:q.concetto_chiave||'',question:q.testo_domanda||'',options:[0,1,2,3].map(i=>String(options[i]??'')),correct:q.risposta_corretta||'',explanation:q.spiegazione||''});
   setEditing(true);
   document.getElementById('sml-admin-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function saveQuestion(e:any) {
   e.preventDefault();
   if (!supabase) { setMessage('Servizio amministratore non disponibile'); return }
   setBusy(true);setMessage('');
   const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'admin-save-question',id:form.id||undefined,chapterId:form.chapterId,concept:form.concept,question:form.question,options:form.options,correct:form.correct,explanation:form.explanation}});
   setBusy(false);
   if(error||data?.error){setMessage(data?.error||error?.message||'Salvataggio non riuscito');return}
   setMessage('Domanda salvata correttamente.');setForm(emptyForm);setEditing(false);await load();
 }
 async function setReportStatus(reportId:string,status:string) {
   if (!supabase) { setMessage('Servizio amministratore non disponibile'); return }
   setBusy(true);
   const {data,error}=await supabase.functions.invoke('quiz-api',{body:{action:'admin-report-status',reportId,status}});
   setBusy(false);
   if(error||data?.error){setMessage(data?.error||error?.message||'Aggiornamento non riuscito');return}
   await load();
 }
 return <div className="panel" style={{marginTop:16,padding:20}}>
 <div className="panel-title"><div><h3><ShieldCheck size={18}/> Pannello amministratore</h3><p>Gestione protetta del catalogo e delle segnalazioni.</p></div><button className="secondary" type="button" onClick={()=>void load()} disabled={busy}>Aggiorna</button></div>
 <div className="stats"><div className="stat"><span>Materie</span><b>{subjectsCount}</b></div><div className="stat"><span>Quiz pronti</span><b>{readyCount}</b></div><div className="stat"><span>Domande recenti</span><b>{items.questions.length}</b></div><div className="stat"><span>Segnalazioni recenti</span><b>{items.reports.length}</b></div></div>
 {items.systemStatus&&<div className="performance-row" style={{flexWrap:'wrap',gap:12,marginTop:12}}>
  <div><b>Generazione AI e tutor</b><small>{items.systemStatus.anthropicConfigured?'Anthropic configurato · '+items.systemStatus.anthropicModel:'Chiave Anthropic da configurare in Supabase'}</small></div>
  <div><b>Pagamenti Stripe</b><small>{items.systemStatus.stripeLiveEnabled?'Pagamenti reali attivi':'Pagamenti reali disattivati'} · {items.systemStatus.stripeSecretConfigured?'chiave presente':'chiave assente'} · {items.systemStatus.stripeWebhookConfigured?'webhook presente':'webhook assente'}</small></div>
 </div>}
 {message&&<p role="status">{message}</p>}
 <section id="sml-admin-editor" style={{marginTop:20}}>
 <h4>{editing?'Modifica domanda':'Aggiungi una domanda'}</h4>
 <form onSubmit={saveQuestion} style={{display:'grid',gap:10}}>
 <label>Capitolo<select required value={form.chapterId} onChange={e=>setForm((v:any)=>({...v,chapterId:e.target.value}))} style={{display:'block',width:'100%'}}><option value="">Seleziona capitolo</option>{items.chapters.map((c:any)=><option key={c.id} value={c.id}>{c.nome} · {c.materia_id}</option>)}</select></label>
 <label>Argomento<input value={form.concept} onChange={e=>setForm((v:any)=>({...v,concept:e.target.value}))} style={{display:'block',width:'100%'}} placeholder="Argomento o concetto chiave"/></label>
 <label>Testo della domanda<textarea required rows={3} value={form.question} onChange={e=>setForm((v:any)=>({...v,question:e.target.value}))} style={{display:'block',width:'100%'}}/></label>
 {form.options.map((option:string,i:number)=><label key={i}>Risposta {i+1}<input required value={option} onChange={e=>setForm((v:any)=>({...v,options:v.options.map((x:string,j:number)=>j===i?e.target.value:x)}))} style={{display:'block',width:'100%'}}/></label>)}
 <label>Risposta corretta<select required value={form.correct} onChange={e=>setForm((v:any)=>({...v,correct:e.target.value}))} style={{display:'block',width:'100%'}}><option value="">Seleziona la risposta esatta</option>{form.options.filter((x:string)=>x.trim()).map((x:string,i:number)=><option key={i} value={x}>{x}</option>)}</select></label>
 <label>Spiegazione<textarea rows={3} value={form.explanation} onChange={e=>setForm((v:any)=>({...v,explanation:e.target.value}))} style={{display:'block',width:'100%'}}/></label>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="primary" type="submit" disabled={busy||!form.chapterId}>{busy?'Salvataggio...':editing?'Salva modifiche':'Aggiungi domanda'}</button>{editing&&<button className="secondary" type="button" onClick={()=>{setForm(emptyForm);setEditing(false)}}>Annulla modifica</button>}</div>
 </form>
 </section>
 <h4 style={{marginTop:24}}>Domande recenti ({items.questions.length})</h4>
 {items.questions.map((q:any)=><div className="performance-row" key={q.id}><div><b>{q.testo_domanda}</b><small>{q.concetto_chiave||'Senza argomento'}</small></div><button className="secondary" type="button" onClick={()=>editQuestion(q)}>Modifica</button></div>)}
 <h4 style={{marginTop:24}}>Segnalazioni ({items.reports.length})</h4>
 {items.reports.map((r:any)=><div className="performance-row" key={r.id}><div><b>{r.category} · {r.status}</b><small>{r.details||r.domande?.testo_domanda||'Nessun dettaglio'}</small></div><select aria-label="Stato segnalazione" value={r.status||'new'} disabled={busy} onChange={e=>void setReportStatus(r.id,e.target.value)}><option value="new">Nuova</option><option value="reviewing">In revisione</option><option value="resolved">Risolta</option><option value="rejected">Respinta</option></select></div>)}
 <h4 style={{marginTop:24}}>Quiz</h4>{items.quizSets.map((q:any)=><div className="performance-row" key={q.id}><div><b>{q.materia_id} · Quiz {q.quiz_number}</b><small>{q.status} · {q.question_count} domande</small></div></div>)}
 </div>
}
