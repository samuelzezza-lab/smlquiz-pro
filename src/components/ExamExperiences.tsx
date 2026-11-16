import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowDownWideNarrow, BookOpen, CalendarDays, Check, Clock3, Filter, Flag, GraduationCap, MessageSquareText, Plus, Search, Send, ShieldCheck, ThumbsUp, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Faculty = { id: string; nome: string }
type Subject = { id: string; nome: string; facolta_id: string; anno_corso: number | null; corso_di_laurea: string | null }
type User = { id: string; email?: string } | null
type Experience = {
  id: string
  user_id: string
  materia_id: string
  exam_date: string | null
  university_name: string | null
  professor_name: string | null
  exam_format: 'written' | 'oral' | 'mixed' | 'practical' | 'other'
  difficulty: number
  preparation_weeks: number | null
  outcome: 'passed' | 'not_passed' | 'withdrawn' | null
  topics: string[]
  description: string
  advice: string | null
  display_name: string
  is_anonymous: boolean
  helpful_count: number
  created_at: string
}
type Props = {
  subjects: Subject[]
  faculties: Faculty[]
  user: User
  displayName: string
  universityName: string
  notify: (message: string) => void
  onRequireLogin: () => void
}
const formatLabels: Record<Experience['exam_format'], string> = {
  written: 'Scritto', oral: 'Orale', mixed: 'Scritto e orale', practical: 'Pratico', other: 'Altro'
}
const outcomeLabels: Record<NonNullable<Experience['outcome']>, string> = {
  passed: 'Superato', not_passed: 'Non superato', withdrawn: 'Ritirato'
}
const today = new Date().toISOString().slice(0, 10)

export default function ExamExperiences({ subjects, faculties, user, displayName, universityName, notify, onRequireLogin }: Props) {
  const [items, setItems] = useState<Experience[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [facultyFilter, setFacultyFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'recent' | 'helpful'>('recent')
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [voted, setVoted] = useState<string[]>([])
  const [reported, setReported] = useState<string[]>([])
  const [reportingId, setReportingId] = useState('')
  const [reportCategory, setReportCategory] = useState('fake')
  const [reportDetails, setReportDetails] = useState('')
  const [form, setForm] = useState({
    materia_id: '', exam_date: '', university_name: universityName || '', professor_name: '',
    exam_format: 'written' as Experience['exam_format'], difficulty: '3', preparation_weeks: '',
    outcome: '', topics: '', description: '', advice: '', is_anonymous: true
  })

  const subjectMap = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects])
  const facultyMap = useMemo(() => new Map(faculties.map(f => [f.id, f.nome])), [faculties])
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('it')
    return items.filter(item => {
      const subject = subjectMap.get(item.materia_id)
      if (facultyFilter && subject?.facolta_id !== facultyFilter) return false
      if (subjectFilter && item.materia_id !== subjectFilter) return false
      if (!query) return true
      return [item.description, item.advice || '', item.professor_name || '', item.university_name || '', ...(item.topics || []), subject?.nome || '']
        .join(' ').toLocaleLowerCase('it').includes(query)
    }).sort((a, b) => sort === 'helpful'
      ? b.helpful_count - a.helpful_count || b.created_at.localeCompare(a.created_at)
      : b.created_at.localeCompare(a.created_at))
  }, [items, search, facultyFilter, subjectFilter, sort, subjectMap])

  const averageDifficulty = filtered.length
    ? (filtered.reduce((sum, item) => sum + item.difficulty, 0) / filtered.length).toFixed(1)
    : '—'

  async function loadExperiences() {
    if (!supabase) {
      setLoadError('Il servizio non è configurato al momento.')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase.from('exam_experiences')
      .select('id,user_id,materia_id,exam_date,university_name,professor_name,exam_format,difficulty,preparation_weeks,outcome,topics,description,advice,display_name,is_anonymous,helpful_count,created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(150)
    if (error) {
      setLoadError('Non è stato possibile caricare le esperienze. Riprova tra poco.')
      setItems([])
    } else {
      setItems((data || []) as Experience[])
    }
    setLoading(false)
  }

  useEffect(() => { void loadExperiences() }, [])
  useEffect(() => {
    if (!user || !supabase) { setVoted([]); setReported([]); return }
    let active = true
    Promise.all([
      supabase.from('exam_experience_votes').select('experience_id').eq('user_id', user.id),
      supabase.from('exam_experience_reports').select('experience_id').eq('user_id', user.id)
    ]).then(([votes, reports]) => {
      if (!active) return
      if (!votes.error) setVoted((votes.data || []).map(x => x.experience_id))
      if (!reports.error) setReported((reports.data || []).map(x => x.experience_id))
    })
    return () => { active = false }
  }, [user?.id])

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(previous => ({ ...previous, [key]: value }))
  }

  async function submitExperience(event: FormEvent) {
    event.preventDefault()
    if (!user) { onRequireLogin(); return }
    if (!supabase || submitting) return
    const description = form.description.trim()
    if (description.length < 40) {
      notify('Racconta l’esperienza con almeno 40 caratteri: aiuterà davvero chi deve sostenere l’esame.')
      return
    }
    if (!form.materia_id) {
      notify('Seleziona la materia.')
      return
    }
    const topics = [...new Set(form.topics.split(',').map(x => x.trim()).filter(Boolean).map(x => x.slice(0, 50)))].slice(0, 8)
    setSubmitting(true)
    try {
      const { error } = await supabase.from('exam_experiences').insert({
        user_id: user.id,
        materia_id: form.materia_id,
        exam_date: form.exam_date || null,
        university_name: form.university_name.trim().slice(0, 100) || null,
        professor_name: form.professor_name.trim().slice(0, 80) || null,
        exam_format: form.exam_format,
        difficulty: Number(form.difficulty),
        preparation_weeks: form.preparation_weeks ? Number(form.preparation_weeks) : null,
        outcome: form.outcome || null,
        topics,
        description,
        advice: form.advice.trim().slice(0, 1500) || null,
        display_name: form.is_anonymous ? 'Studente anonimo' : (displayName.trim().slice(0, 40) || 'Studente SMLQUIZ'),
        is_anonymous: form.is_anonymous,
        status: 'published'
      })
      if (error) throw error
      setFormOpen(false)
      setForm({
        materia_id: '', exam_date: '', university_name: universityName || '', professor_name: '',
        exam_format: 'written', difficulty: '3', preparation_weeks: '', outcome: '',
        topics: '', description: '', advice: '', is_anonymous: true
      })
      notify('Esperienza pubblicata. Grazie per aver aiutato altri studenti!')
      await loadExperiences()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Non è stato possibile pubblicare. Riprova.')
    } finally {
      setSubmitting(false)
    }
  }

  async function markHelpful(item: Experience) {
    if (!user) { onRequireLogin(); return }
    if (!supabase || voted.includes(item.id) || item.user_id === user.id) return
    const { error } = await supabase.from('exam_experience_votes').insert({ experience_id: item.id, user_id: user.id })
    if (error) {
      notify(error.code === '23505' ? 'Hai già indicato questa esperienza come utile.' : 'Non è stato possibile registrare il voto.')
      return
    }
    setVoted(previous => [...previous, item.id])
    setItems(previous => previous.map(x => x.id === item.id ? { ...x, helpful_count: x.helpful_count + 1 } : x))
  }

  async function sendReport(event: FormEvent, experienceId: string) {
    event.preventDefault()
    if (!user) { onRequireLogin(); return }
    if (!supabase) return
    const { error } = await supabase.from('exam_experience_reports').insert({
      experience_id: experienceId, user_id: user.id, category: reportCategory, details: reportDetails.trim().slice(0, 500) || null
    })
    if (error) {
      notify(error.code === '23505' ? 'Hai già segnalato questa esperienza.' : 'Non è stato possibile inviare la segnalazione.')
      return
    }
    setReported(previous => [...previous, experienceId])
    setReportingId('')
    setReportDetails('')
    notify('Segnalazione inviata. Grazie per aiutarci a mantenere la sezione affidabile.')
    await loadExperiences()
  }

  async function deleteExperience(item: Experience) {
    if (!supabase || !user || item.user_id !== user.id) return
    if (!window.confirm('Vuoi eliminare definitivamente questa esperienza?')) return
    const { error } = await supabase.from('exam_experiences').delete().eq('id', item.id).eq('user_id', user.id)
    if (error) { notify('Non è stato possibile eliminare l’esperienza.'); return }
    setItems(previous => previous.filter(x => x.id !== item.id))
    notify('Esperienza eliminata.')
  }

  function dateText(value: string | null) {
    if (!value) return ''
    return new Date(value + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return <section className="content experiences-page">
    <div className="experiences-hero">
      <div className="experiences-hero-copy">
        <span className="experiences-eyebrow"><GraduationCap size={15}/> ARCHIVIO UNIVERSITARIO CONDIVISO</span>
        <h1>Com’è stato davvero il tuo esame?</h1>
        <p>Leggi le esperienze di chi ha già sostenuto l’esame: modalità, difficoltà, argomenti richiesti e consigli concreti. Quando toccherà a te, saprai cosa aspettarti.</p>
        <div className="experiences-hero-actions">
          <button type="button" className="primary" onClick={() => user ? setFormOpen(v => !v) : onRequireLogin()}>
            <Plus size={16}/> Condividi la tua esperienza
          </button>
          <span><ShieldCheck size={14}/> Email e dati di accesso non vengono mostrati</span>
        </div>
      </div>
      <div className="experiences-hero-aside">
        <div><strong>{items.length}</strong><span>esperienze pubblicate</span></div>
        <div><strong>{averageDifficulty}</strong><span>difficoltà media / 5</span></div>
        <div><strong>{new Set(items.map(x => x.materia_id)).size}</strong><span>materie coperte</span></div>
      </div>
    </div>

    <div className="experiences-section-heading">
      <div><span className="experiences-eyebrow">DALLA COMMUNITY</span><h2>Esperienze degli studenti</h2><p>Informazioni pratiche, organizzate per materia e consultabili prima dell’appello.</p></div>
      <span className="experiences-result-count">{filtered.length} {filtered.length === 1 ? 'risultato' : 'risultati'}</span>
    </div>

    {formOpen && <form className="panel experience-form" onSubmit={submitExperience}>
      <div className="experience-form-heading"><div><span className="experiences-eyebrow">CONTRIBUISCI ALL’ARCHIVIO</span><h2>Racconta il tuo esame</h2><p>Più dettagli inserisci, più la tua esperienza sarà utile a chi deve prepararsi.</p></div><button type="button" className="icon-button" aria-label="Chiudi" onClick={() => setFormOpen(false)}><X size={18}/></button></div>
      <div className="experience-form-grid">
        <label className="experience-field experience-field-wide">Materia *
          <select required value={form.materia_id} onChange={e => updateForm('materia_id', e.target.value)}>
            <option value="">Seleziona la materia</option>
            {subjects.slice().sort((a,b) => a.nome.localeCompare(b.nome, 'it')).map(subject => <option key={subject.id} value={subject.id}>{subject.nome}{subject.anno_corso ? ' · '+subject.anno_corso+'° anno' : ''}</option>)}
          </select>
        </label>
        <label className="experience-field">Data dell’esame
          <input type="date" max={today} value={form.exam_date} onChange={e => updateForm('exam_date', e.target.value)}/>
        </label>
        <label className="experience-field">Università (facoltativa)
          <input maxLength={100} value={form.university_name} onChange={e => updateForm('university_name', e.target.value)} placeholder="Es. Università di Bologna"/>
        </label>
        <label className="experience-field">Docente (facoltativo)
          <input maxLength={80} value={form.professor_name} onChange={e => updateForm('professor_name', e.target.value)} placeholder="Nome del docente"/>
        </label>
        <label className="experience-field">Modalità
          <select value={form.exam_format} onChange={e => updateForm('exam_format', e.target.value as Experience['exam_format'])}>
            <option value="written">Scritto</option><option value="oral">Orale</option><option value="mixed">Scritto e orale</option><option value="practical">Pratico</option><option value="other">Altro</option>
          </select>
        </label>
        <label className="experience-field">Difficoltà percepita
          <select value={form.difficulty} onChange={e => updateForm('difficulty', e.target.value)}>
            <option value="1">1 · Molto facile</option><option value="2">2 · Facile</option><option value="3">3 · Nella media</option><option value="4">4 · Difficile</option><option value="5">5 · Molto difficile</option>
          </select>
        </label>
        <label className="experience-field">Settimane di preparazione
          <input type="number" min="0" max="104" value={form.preparation_weeks} onChange={e => updateForm('preparation_weeks', e.target.value)} placeholder="Es. 4"/>
        </label>
        <label className="experience-field">Esito (facoltativo)
          <select value={form.outcome} onChange={e => updateForm('outcome', e.target.value)}>
            <option value="">Preferisco non indicarlo</option><option value="passed">Superato</option><option value="not_passed">Non superato</option><option value="withdrawn">Ritirato</option>
          </select>
        </label>
        <label className="experience-field experience-field-wide">Argomenti affrontati (separati da virgola)
          <input maxLength={500} value={form.topics} onChange={e => updateForm('topics', e.target.value)} placeholder="Es. apparato locomotore, neuroanatomia, istologia"/>
          <small>Massimo 8 argomenti: aiutano gli altri a capire cosa viene chiesto più spesso.</small>
        </label>
        <label className="experience-field experience-field-wide">Com’è andato l’esame? *
          <textarea required minLength={40} maxLength={3000} rows={5} value={form.description} onChange={e => updateForm('description', e.target.value)} placeholder="Descrivi la struttura dell’esame, il tipo di domande, il tempo a disposizione e quanto erano approfonditi gli argomenti…"/>
          <small>{form.description.length}/3000 caratteri · minimo 40</small>
        </label>
        <label className="experience-field experience-field-wide">Consigli per chi deve sostenerlo
          <textarea maxLength={1500} rows={3} value={form.advice} onChange={e => updateForm('advice', e.target.value)} placeholder="Su cosa concentrarsi? Come organizzare lo studio? Cosa avresti voluto sapere prima?"/>
        </label>
      </div>
      <div className="experience-form-footer">
        <label className="experience-anonymous"><input type="checkbox" checked={form.is_anonymous} onChange={e => updateForm('is_anonymous', e.target.checked)}/> Pubblica come studente anonimo</label>
        <button type="submit" className="primary" disabled={submitting || !form.materia_id || form.description.trim().length < 40}>{submitting ? 'Pubblicazione…' : 'Pubblica esperienza'} <Send size={15}/></button>
      </div>
      <p className="experience-privacy-note"><ShieldCheck size={14}/> Non inserire dati personali tuoi o di altri, numeri di telefono, email o informazioni private. Le esperienze possono essere segnalate e vengono nascoste automaticamente dopo più segnalazioni indipendenti.</p>
    </form>}

    <div className="panel experiences-filters">
      <label className="experience-search"><Search size={17}/><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca argomenti, docente, università…"/></label>
      <label><Filter size={15}/><select value={facultyFilter} onChange={e => { setFacultyFilter(e.target.value); setSubjectFilter('') }}><option value="">Tutte le facoltà</option>{faculties.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
      <label><BookOpen size={15}/><select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}><option value="">Tutte le materie</option>{subjects.filter(s => !facultyFilter || s.facolta_id === facultyFilter).slice().sort((a,b) => a.nome.localeCompare(b.nome,'it')).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
      <label><ArrowDownWideNarrow size={15}/><select value={sort} onChange={e => setSort(e.target.value as 'recent'|'helpful')}><option value="recent">Più recenti</option><option value="helpful">Più utili</option></select></label>
    </div>

    {loading ? <div className="panel experiences-empty"><div className="experience-loader"/><b>Caricamento delle esperienze</b><span>Stiamo recuperando i contributi degli studenti.</span></div>
      : loadError ? <div className="panel experiences-empty"><AlertTriangle size={25}/><b>Archivio momentaneamente non disponibile</b><span>{loadError}</span><button type="button" className="secondary" onClick={() => void loadExperiences()}>Riprova</button></div>
      : filtered.length === 0 ? <div className="panel experiences-empty"><MessageSquareText size={28}/><b>{items.length ? 'Nessuna esperienza corrisponde ai filtri' : 'Qui inizia l’archivio degli esami'}</b><span>{items.length ? 'Prova a cambiare materia o parole di ricerca.' : 'Non ci sono ancora esperienze pubblicate. Puoi essere tra i primi a condividere com’è andato il tuo esame e aiutare altri studenti.'}</span>{items.length ? <button type="button" className="secondary" onClick={() => { setSearch(''); setFacultyFilter(''); setSubjectFilter('') }}>Azzera filtri</button> : <button type="button" className="primary" onClick={() => user ? setFormOpen(true) : onRequireLogin()}><Plus size={15}/> Condividi la prima esperienza</button>}</div>
      : <div className="experiences-list">{filtered.map(item => {
        const subject = subjectMap.get(item.materia_id)
        const facultyName = subject ? facultyMap.get(subject.facolta_id) : ''
        const isMine = user?.id === item.user_id
        return <article className="panel experience-card" key={item.id}>
          <div className="experience-card-top"><div className="experience-subject"><BookOpen size={16}/><span>{subject?.nome || 'Materia universitaria'}</span>{subject?.anno_corso ? <small>{subject.anno_corso}° anno</small> : null}</div><span className="experience-date"><CalendarDays size={13}/>{item.exam_date ? dateText(item.exam_date) : "Data esame non indicata"}</span></div>
          <div className="experience-card-meta"><span>{formatLabels[item.exam_format]}</span><span className="experience-difficulty">{'★'.repeat(item.difficulty)}{'☆'.repeat(5-item.difficulty)} <small>{item.difficulty}/5</small></span>{item.preparation_weeks !== null ? <span><Clock3 size={12}/>{item.preparation_weeks} sett. di preparazione</span> : null}{item.outcome ? <span className="experience-outcome">{outcomeLabels[item.outcome]}</span> : null}</div>
          <div className="experience-card-location">{item.university_name ? <span><GraduationCap size={13}/>{item.university_name}</span> : null}{item.professor_name ? <span>Docente: {item.professor_name}</span> : null}{facultyName ? <span>{facultyName}</span> : null}</div>
          <p className="experience-description">{item.description}</p>
          {item.topics.length > 0 && <div className="experience-topics">{item.topics.map(topic => <span key={topic}>{topic}</span>)}</div>}
          {item.advice && <div className="experience-advice"><strong>Consiglio dello studente</strong><p>{item.advice}</p></div>}
          <div className="experience-card-footer"><span>Condivisa da {item.is_anonymous ? 'studente anonimo' : item.display_name} · Pubblicata il {dateText(item.created_at.slice(0,10))}</span><div>
            <button type="button" className={'experience-helpful '+(voted.includes(item.id)?'selected':'')} disabled={voted.includes(item.id)||isMine} onClick={() => void markHelpful(item)}><ThumbsUp size={14}/>{voted.includes(item.id)?'Utile':'È utile?'} <b>{item.helpful_count}</b></button>
            {isMine ? <button type="button" className="experience-report-button" onClick={() => void deleteExperience(item)}><Trash2 size={14}/> Elimina</button> : reported.includes(item.id) ? <span className="experience-reported"><Check size={14}/> Segnalata</span> : <button type="button" className="experience-report-button" onClick={() => { setReportingId(reportingId === item.id ? '' : item.id); setReportCategory('fake') }}><Flag size={14}/> Segnala</button>}
          </div></div>
          {reportingId === item.id && <form className="experience-report-form" onSubmit={e => void sendReport(e, item.id)}><label>Motivo della segnalazione<select value={reportCategory} onChange={e => setReportCategory(e.target.value)}><option value="fake">Informazioni false o fuorvianti</option><option value="offensive">Contenuto offensivo</option><option value="personal_data">Dati personali o informazioni private</option><option value="spam">Spam o pubblicità</option><option value="other">Altro</option></select></label><input maxLength={500} value={reportDetails} onChange={e => setReportDetails(e.target.value)} placeholder="Dettagli facoltativi"/><button type="submit" className="secondary"><Flag size={14}/> Invia segnalazione</button></form>}
        </article>
      })}</div>}
    <div className="experiences-bottom-note"><ShieldCheck size={15}/><span>Le esperienze sono contributi degli utenti e non rappresentano comunicazioni ufficiali degli atenei o dei docenti. Verifica sempre le informazioni con il programma e gli avvisi del tuo corso.</span></div>
  </section>
}
