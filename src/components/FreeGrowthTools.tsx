import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Copy, Users, ShieldCheck } from 'lucide-react'

type Subject = { id: string; nome: string }
type Attempt = { id: string; subject: string; score: number; total: number; correct: number; wrong: number; date: string }

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
