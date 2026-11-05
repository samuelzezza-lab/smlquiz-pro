import { useMemo, useState } from 'react'
import { CalendarDays, Copy, Brain, Users, ShieldCheck } from 'lucide-react'

type Subject = { id: string; nome: string }
type Attempt = { id: string; subject: string; score: number; total: number; correct: number; wrong: number; date: string }

export function FreeStudyPlanner({ subjects, dailyGoal }: { subjects: Subject[]; dailyGoal: number }) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || '')
  const [examDate, setExamDate] = useState('')
  const [plan, setPlan] = useState<{ date: string; task: string }[]>([])
  const selected = subjects.find(s => s.id === subjectId)
  function createPlan() {
    if (!selected || !examDate) return
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
    try { localStorage.setItem('smlquiz.study-plan.v1',JSON.stringify({subject:selected.nome,examDate,rows})) } catch {}
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
  return <div className="panel" style={{marginTop:16,padding:20}}>
    <div className="panel-title"><div><h3><ShieldCheck size={18} style={{verticalAlign:'middle',marginRight:8}}/>Pannello amministratore · panoramica</h3><p>Riepilogo del catalogo disponibile, visibile solo all’account amministratore.</p></div></div>
    <div className="stats"><div className="stat"><span>Materie in catalogo</span><b>{subjectsCount}</b></div><div className="stat"><span>Quiz pronti</span><b>{readyCount}</b></div></div>
    <p style={{marginTop:12}}>Gestione segnalazioni e riparazione dei quiz richiede una sezione amministrativa protetta lato server: non viene simulata qui.</p>
  </div>
}
