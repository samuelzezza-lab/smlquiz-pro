import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CalendarDays, Copy, Brain, Users, ShieldCheck } from 'lucide-react'

type Subject = { id: string; nome: string }
type Attempt = { id: string; subject: string; score: number; total: number; correct: number; wrong: number; date: string }

export function FreeStudyPlanner({ subjects, dailyGoal }: { subjects: Subject[]; dailyGoal: number }) {
  const [subjectId, setSubjectId] = useState('')
  const [examDate, setExamDate] = useState('')
  const [plan, setPlan] = useState<{ date: string; task: string }[]>([])
  const selected = subjects.find(s => s.id === subjectId)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('smlquiz.study-plan.v1') || 'null')
      if (saved && Array.isArray(saved.rows)) {
        setSubjectId(typeof saved.subjectId === 'string' ? saved.subjectId : '')
        setExamDate(typeof saved.examDate === 'string' ? saved.examDate : '')
        setPlan(saved.rows.filter((row: any) => row && typeof row.date === 'string' && typeof row.task === 'string'))
      }
    } catch { localStorage.removeItem('smlquiz.study-plan.v1') }
  }, [])
  useEffect(() => {
    if (!subjectId && subjects.length) setSubjectId(subjects[0].id)
  }, [subjects, subjectId])
  function createPlan() {
    if (!selected || !examDate) return
    const exam = new Date(examDate + 'T00:00:00')
    if (!Number.isFinite(exam.getTime()) || exam.getTime() < new Date(new Date().toDateString()).getTime()) return
    const start = new Date(); start.setHours(0,0,0,0)
    const end = new Date(examDate+'T00:00:00')
    const days = Math.max(1, Math.ceil((end.getTime()-start.getTime())/86400000))
    const sessions = Math.min(120, days*dailyGoal)
    const tasks = ['Ripasso degli argomenti','Svolgi un quiz','Rivedi gli errori','Ripasso mirato e quiz']
    const rows = Array.from({length:sessions},(_,i)=>{
      const date = new Date(start.getTime()+Math.floor(i/dailyGoal)*86400000)
      return {date:date.toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short'}),task:tasks[i%tasks.length]}
    })
    setPlan(rows)
    try { localStorage.setItem('smlquiz.study-plan.v1',JSON.stringify({subjectId:selected.id,subject:selected.nome,examDate,rows})) } catch {}
  }
  return <div className="panel" style={{marginTop:16,padding:20}}>
    <div className="panel-title"><div><h3><CalendarDays size={18} style={{verticalAlign:'middle',marginRight:8}}/>Piano di studio automatico</h3><p>Gratis, creato direttamente nel browser. Nessun servizio esterno.</p></div></div>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
      <label style={{flex:'1 1 220px'}}>Materia<select style={{display:'block',width:'100%'}} value={subjectId} onChange={e=>setSubjectId(e.target.value)}>{subjects.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
      <label>Data esame<input type="date" min={new Date().toISOString().slice(0,10)} value={examDate} onChange={e=>setExamDate(e.target.value)}/></label>
      <button className="primary" type="button" disabled={!subjectId||!examDate} onClick={createPlan}>Crea piano</button>
    </div>
    {plan.length>0&&<div style={{marginTop:14,maxHeight:300,overflow:'auto'}}><b>{selected?.nome} · {plan.length} sessioni</b>{plan.map((r,i)=><div key={i} className="performance-row"><div><b>{r.date}</b><small>{r.task}</small></div></div>)}</div>}
  </div>
}

export function FreeTutor({ history }: { history: Attempt[] }) {
  const insights = useMemo(()=>{
    const totals = new Map<string,{correct:number;total:number}>()
    history.forEach(h=>{const v=totals.get(h.subject)||{correct:0,total:0};v.correct+=h.correct;v.total+=h.total;totals.set(h.subject,v)})
    return [...totals.entries()].map(([subject,v])=>({subject,accuracy:Math.round(100*v.correct/Math.max(1,v.total)),total:v.total})).filter(x=>x.total>0).sort((a,b)=>a.accuracy-b.accuracy).slice(0,3)
  },[history])
  return <div className="panel" style={{marginTop:16,padding:20}}>
    <div className="panel-title"><div><h3><Brain size={18} style={{verticalAlign:'middle',marginRight:8}}/>Tutor di studio gratuito</h3><p>Consigli personalizzati usando i tuoi risultati, senza API a pagamento.</p></div></div>
    {insights.length? <>{insights.map(x=><div key={x.subject} className="performance-row"><div><b>{x.subject} · {x.accuracy}% corrette</b><small>{x.accuracy<60?'Priorità alta: ripassa i concetti e poi svolgi un quiz.':x.accuracy<80?'Consolidamento: ripassa gli errori recenti e fai un altro quiz.':'Buon livello: mantieni la materia con ripassi periodici.'}</small></div></div>)}</>:<p>Completa almeno un quiz: il tutor individuerà le materie da rinforzare.</p>}
  </div>
}

export function ReferralCard({ userId }: { userId: string }) {
  const [copied,setCopied] = useState(false)
  const url = typeof window!=='undefined' ? window.location.origin+'/?ref='+encodeURIComponent(userId) : ''
  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(()=>setCopied(false),2200) } catch { const el=document.createElement('textarea');el.value=url;document.body.appendChild(el);el.select();document.execCommand('copy');el.remove();setCopied(true) } }
  return <div className="panel" style={{marginTop:16,padding:20}}>
    <div className="panel-title"><div><h3><Users size={18} style={{verticalAlign:'middle',marginRight:8}}/>Invita amici</h3><p>Condividi SMLQUIZ con il tuo link personale. La ricompensa automatica in crediti non è attiva ancora.</p></div></div>
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
 <div className="stats"><div className="stat"><span>Materie</span><b>{subjectsCount}</b></div><div className="stat"><span>Quiz pronti</span><b>{readyCount}</b></div><div className="stat"><span>Domande</span><b>{items.questions.length}</b></div><div className="stat"><span>Segnalazioni</span><b>{items.reports.length}</b></div></div>
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
