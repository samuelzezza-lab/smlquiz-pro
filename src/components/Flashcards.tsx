import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, Shuffle, Lock, Heart } from 'lucide-react'
import StudyCompletion from './StudyCompletion'
import { supabase } from '../lib/supabase'

type Subject = { id: string; nome: string; traduzioni?: Record<string, { nome?: string }> }
type Rating = 'impossible'|'difficult'|'easy'|'very_easy'
type Flashcard = { id: string; subject_id: string; question_front: string; answer_back: string; explanation: string | null; order_index: number; quiz_number: number | null; user_rating?: Rating|null; user_due_at?: string|null }
type Props = {
  subjects: Subject[]
  selectedSubjectId: string
  onBackToPath: () => void
  user: { id: string } | null
  onBuy: (priceId: string, subjectIds: string[], consentConfirmed: boolean) => void
  notify: (message: string) => void
  showAds?: boolean
  onStartQuiz?: (subjectId: string) => void
}
const PRICE_ID = 'price_1UdBxFBCybXKHSfRwLeImDFx'
const FREE_LIMIT = 50

export default function Flashcards({ subjects, selectedSubjectId, onBackToPath, user, onBuy, notify, showAds = true, onStartQuiz }: Props) {
  const [subjectId, setSubjectId] = useState(selectedSubjectId)
  const [cards, setCards] = useState<Flashcard[]>([])
  const [total, setTotal] = useState(0)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const [deckCompleted, setDeckCompleted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [consent, setConsent] = useState(false)
  const [ratings, setRatings] = useState<Record<string, Rating>>({})
  const [dueDates, setDueDates] = useState<Record<string, string>>({})
  const [deckMode, setDeckMode] = useState<'all'|'difficult'|'new'>('all')
  const [sessionStarted, setSessionStarted] = useState(false)
  const [sessionChoice, setSessionChoice] = useState<'all'|'new'|'difficult'>('all')
  const [sessionCardIds, setSessionCardIds] = useState<string[]>([])
  const [sessionRatings, setSessionRatings] = useState<Record<Rating, number>>({ impossible: 0, difficult: 0, easy: 0, very_easy: 0 })
  const touchStartX = useRef<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const notifyRef = useRef(notify)
  useEffect(() => { notifyRef.current = notify }, [notify])
  const selectedSubject = useMemo(() => subjects.find(s => s.id === subjectId), [subjects, subjectId])
  const availableCards = useMemo(() => {
    const now = Date.now()
    return cards.filter(card => {
      const rating = ratings[card.id] ?? card.user_rating
      const dueAt = dueDates[card.id] ?? card.user_due_at ?? null
      const due = !rating || !dueAt || new Date(dueAt).getTime() <= now
      if (deckMode === 'new') return !rating
      if (deckMode === 'difficult') return (rating === 'impossible' || rating === 'difficult') && due
      return due
    })
  }, [cards, deckMode, ratings, dueDates])
  const sessionCards = useMemo(() => sessionCardIds.map(id => cards.find(card => card.id === id)).filter((card): card is Flashcard => Boolean(card)), [sessionCardIds, cards])
  const current = sessionCards[index]
  const progressTotal = sessionCardIds.length
  const completedInDeck = cards.filter(card => Boolean(ratings[card.id] ?? card.user_rating)).length
  const easyCount = cards.filter(card => ['easy','very_easy'].includes(ratings[card.id] ?? card.user_rating ?? '')).length
  const difficultCount = cards.filter(card => ['impossible','difficult'].includes(ratings[card.id] ?? card.user_rating ?? '')).length
  const ratedCount = cards.filter(card => ratings[card.id] || card.user_rating).length
  const title = selectedSubject?.traduzioni?.it?.nome || selectedSubject?.nome || 'Flashcard'

  const loadDeck = useCallback(async (id: string) => {
    if (!supabase || !id) return
    setLoading(true); setCards([]); setIndex(0); setFlipped(false); setPaywall(false); setDeckCompleted(false); setUnlocked(false); setRatings({}); setDueDates({}); setDeckMode('all'); setSessionStarted(false); setSessionCardIds([]); setSessionRatings({ impossible: 0, difficult: 0, easy: 0, very_easy: 0 })
    try {
      const { data, error } = await supabase.functions.invoke('flashcards-api', { body: { subjectId: id, offset: 0, limit: FREE_LIMIT } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      let loaded = (data?.cards ?? []) as Flashcard[]
      const cardTotal = Number(data?.total_cards ?? 0)
      const hasUnlock = data?.unlocked === true
      if (hasUnlock && loaded.length < cardTotal) {
        while (loaded.length < cardTotal) {
          const { data: page, error: pageError } = await supabase.functions.invoke('flashcards-api', {
            body: { subjectId: id, offset: loaded.length, limit: FREE_LIMIT }
          })
          if (pageError) throw pageError
          const batch = (page?.cards ?? []) as Flashcard[]
          if (!batch.length) break
          loaded = [...loaded, ...batch]
        }
      }
      // Ripristina le valutazioni locali (anche per ospiti/offline) e uniscile
      // a quelle sincronizzate sul server. Così una carta già fatta non ricompare
      // quando si cambia scheda o si riapre l'app.
      let localRatings: Record<string, Rating> = {}
      let localDue: Record<string, string> = {}
      try {
        const saved = JSON.parse(localStorage.getItem(`smlquiz.flashcards.progress.v1:${user?.id || 'guest'}`) || '{}')
        if (saved && typeof saved === 'object' && saved[id] && typeof saved[id] === 'object') {
          localRatings = Object.fromEntries(Object.entries(saved[id]).map(([cardId, value]) => {
            const normalized = value === 'medium' ? 'difficult' : value === 'difficult' ? 'difficult' : value === 'easy' ? 'easy' : value
            return [cardId, normalized]
          })) as Record<string, Rating>
        }
        const dueSaved = JSON.parse(localStorage.getItem(`smlquiz.flashcards.due.v1:${user?.id || 'guest'}`) || '{}')
        if (dueSaved && typeof dueSaved === 'object' && dueSaved[id]) localDue = dueSaved[id]
      } catch { /* cache locale non disponibile: si usano i progressi cloud */ }
      const mergedRatings: Record<string, Rating> = { ...localRatings }
      const mergedDue: Record<string, string> = { ...localDue }
      loaded = loaded.map(card => {
        const rating = localRatings[card.id] ?? card.user_rating ?? null
        const dueAt = localDue[card.id] ?? card.user_due_at ?? null
        if (rating) mergedRatings[card.id] = rating
        if (dueAt) mergedDue[card.id] = dueAt
        return { ...card, user_rating: rating, user_due_at: dueAt }
      })
      setCards(loaded)
      setRatings(mergedRatings)
      setDueDates(mergedDue)
      setTotal(cardTotal)
      setUnlocked(hasUnlock)
      setPaywall(false)
      setDeckCompleted(false)
      setSessionStarted(false)
      setSessionCardIds([])
      setSessionRatings({ impossible: 0, difficult: 0, easy: 0, very_easy: 0 })
    } catch (err) {
      notifyRef.current(err instanceof Error ? err.message : 'Impossibile caricare le flashcard.')
    } finally { setLoading(false) }
  }, [user?.id])

  useEffect(() => {
    setSubjectId(selectedSubjectId)
  }, [selectedSubjectId])
  useEffect(() => { if (subjectId) void loadDeck(subjectId) }, [subjectId, loadDeck])

  const startSession = (mode: 'all'|'new'|'difficult' = 'all') => {
    const now = Date.now()
    const chosen = cards.filter(card => {
      const rating = ratings[card.id] ?? card.user_rating
      const dueAt = dueDates[card.id] ?? card.user_due_at ?? null
      const due = !rating || !dueAt || new Date(dueAt).getTime() <= now
      if (mode === 'new') return !rating
      if (mode === 'difficult') return (rating === 'impossible' || rating === 'difficult') && due
      return due
    })
    setDeckMode(mode)
    setSessionCardIds(chosen.map(card => card.id))
    setSessionRatings({ impossible: 0, difficult: 0, easy: 0, very_easy: 0 })
    setIndex(0); setFlipped(false); setDeckCompleted(chosen.length === 0); setSessionStarted(true)
  }

  const rate = async (rating: Rating) => {
    if (!current || loading) return
    const now = new Date()
    const due = new Date(now)
    if (rating === 'impossible') due.setMinutes(due.getMinutes() + 10)
    else if (rating === 'difficult') due.setDate(due.getDate() + 1)
    else if (rating === 'easy') due.setDate(due.getDate() + 3)
    else due.setDate(due.getDate() + 7)
    let dueAt = due.toISOString()
    if (user && supabase) {
      const { data, error } = await supabase.functions.invoke('flashcards-api', { body: { action: 'rate', subjectId, flashcardId: current.id, rating } })
      if (error || data?.error) notify('Valutazione salvata sul dispositivo; sincronizzazione cloud da riprovare.')
      else if (data?.due_at) dueAt = data.due_at
    }
    setRatings(prev => ({ ...prev, [current.id]: rating }))
    setDueDates(prev => {
      const updated = { ...prev, [current.id]: dueAt }
      try {
        const key = `smlquiz.flashcards.due.v1:${user?.id || 'guest'}`
        const saved = JSON.parse(localStorage.getItem(key) || '{}')
        localStorage.setItem(key, JSON.stringify({ ...saved, [subjectId]: updated }))
      } catch { /* cache locale non disponibile */ }
      return updated
    })
    try {
      const key = `smlquiz.flashcards.progress.v1:${user?.id || 'guest'}`
      const saved = JSON.parse(localStorage.getItem(key) || '{}')
      const subjectRatings = { ...(saved?.[subjectId] || {}), [current.id]: rating }
      localStorage.setItem(key, JSON.stringify({ ...saved, [subjectId]: subjectRatings }))
    } catch { /* cache locale non disponibile */ }
    setSessionRatings(prev => ({ ...prev, [rating]: prev[rating] + 1 }))
    setFlipped(false)
    if (index < sessionCards.length - 1) setIndex(index + 1)
    else if (!unlocked && total > FREE_LIMIT) setPaywall(true)
    else setDeckCompleted(true)
  }

  const shuffle = () => {
    setCards(prev => {
      const copy = [...prev]
      for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] }
      return copy
    })
    setIndex(0); setFlipped(false); setDeckMode('all'); setDeckCompleted(false); setSessionStarted(false); setSessionCardIds([])
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !paywall && current && !(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) {
        event.preventDefault(); setFlipped(v => !v)
      }
      if (event.code === 'Escape' && sessionStarted && !paywall) { setSessionStarted(false); setFlipped(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [current, flipped, index, paywall, sessionStarted])

  return <section className="flashcards-page flashcards-redesign">
    <header className="fc-study-header">
      <button type="button" className="fc-back-link" onClick={onBackToPath}><ArrowLeft size={16}/> Percorso</button>
      <div className="fc-heading"><span>MODALITÀ DI STUDIO</span><h1>Flashcard</h1></div>
      <div className="fc-subject-pill"><BookOpen size={15}/><strong>{selectedSubject?.traduzioni?.it?.nome || selectedSubject?.nome || 'Seleziona materia'}</strong></div>
      <div className="fc-total-pill"><strong>{total.toLocaleString('it-IT')}</strong><span>carte</span></div>
    </header>
    {!selectedSubjectId && <StudyCompletion eyebrow="PERCORSO NON SELEZIONATO" title="Scegli prima la materia da studiare." description="Torna al tuo percorso universitario, seleziona facoltà, anno e materia, poi apri di nuovo le Flashcard. La scelta verrà mantenuta automaticamente." primaryLabel="Torna al percorso" onPrimary={onBackToPath} />}
    <div className="fc-mini-stats">
      <span><b>{ratedCount}</b> valutate</span><span><b>{easyCount}</b> ricordate</span><span><b>{difficultCount}</b> da ripassare</span>
      {unlocked && <button type="button" onClick={shuffle}><Shuffle size={14}/> Mescola</button>}

    </div>
    {showAds && <div className="flashcards-ad-slot" data-sml-ad-slot="flashcards-top" aria-label="Spazio pubblicitario" />}
    {loading && <div className="panel empty">Caricamento flashcard…</div>}
    {!loading && cards.length > 0 && !sessionStarted && !deckCompleted && !paywall && <div className="fc-session-setup">
      <div className="fc-setup-kicker">RIPASSO INTELLIGENTE</div>
      <h2>Come vuoi studiare oggi?</h2>
      <p>Prova a rispondere a memoria, gira la scheda e valuta quanto era facile ricordare. Le prossime ripetizioni saranno programmate in base alla tua valutazione.</p>
      <div className="fc-setup-options">
        <button type="button" className={`fc-setup-option ${sessionChoice==='all'?'selected':''}`} onClick={() => setSessionChoice('all')}><span className="fc-option-icon"><BookOpen size={20}/></span><strong>Tutto il mazzo</strong><small>{availableCards.length} carte nuove o in scadenza</small><span className="fc-option-check">✓</span></button>
        <button type="button" className={`fc-setup-option ${sessionChoice==='new'?'selected':''}`} onClick={() => setSessionChoice('new')}><span className="fc-option-icon"><Shuffle size={20}/></span><strong>Solo nuove</strong><small>{cards.filter(card => !(ratings[card.id] ?? card.user_rating)).length} mai studiate</small><span className="fc-option-check">✓</span></button>
        <button type="button" className={`fc-setup-option ${sessionChoice==='difficult'?'selected':''}`} onClick={() => setSessionChoice('difficult')}><span className="fc-option-icon"><Heart size={20}/></span><strong>Da ripassare</strong><small>{cards.filter(card => { const r=ratings[card.id]??card.user_rating; const d=dueDates[card.id]??card.user_due_at; return (r==='impossible'||r==='difficult')&&(!d||new Date(d).getTime()<=Date.now()) }).length} difficili in scadenza</small><span className="fc-option-check">✓</span></button>
      </div>
      <div className="fc-setup-footer"><span>Ripetizione dilazionata · Progressi salvati automaticamente</span><button type="button" className="primary" onClick={() => startSession(sessionChoice)}>Avvia ripasso <ArrowRight size={17}/></button></div>
    </div>}
    {!loading && sessionStarted && sessionCards.length === 0 && deckCompleted && !paywall && <StudyCompletion eyebrow="TUTTO IN PARI" title="Non hai carte da ripassare adesso." description="Le carte nuove o quelle in scadenza compariranno qui quando sarà il momento." primaryLabel="Torna alle opzioni" onPrimary={() => {setSessionStarted(false);setDeckCompleted(false)}} />}
    {!loading && sessionStarted && cards.length > 0 && !paywall && !deckCompleted && current && <>
      <div className="fc-session-toolbar"><button type="button" onClick={() => {setSessionStarted(false);setFlipped(false)}}><ArrowLeft size={15}/> Esci dal ripasso</button><span>{index + 1} <i>/</i> {sessionCards.length}</span><span className="fc-key-hint">SPAZIO per girare</span></div>
      <div className="flashcards-progress">
        <div className="flashcards-progress-label"><span>Carta {index + 1} di {progressTotal}{!unlocked && total > FREE_LIMIT ? ' · Anteprima gratuita' : ''}</span><span>{completedInDeck} già valutate</span></div>
        <div className="flashcards-progress-track"><span style={{width: `${Math.min(100, ((index + 1) / Math.max(1, progressTotal)) * 100)}%`}}/></div>
      </div>
      <div className="flashcard-stage">
        <div ref={cardRef} className={`flashcard-3d ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(v => !v)} onTouchStart={e => { touchStartX.current = e.changedTouches[0]?.clientX ?? null }} onTouchEnd={e => { const start=touchStartX.current; const end=e.changedTouches[0]?.clientX; if(flipped&&start!==null&&typeof end==='number'&&Math.abs(end-start)>55) void rate(end<start?'difficult':'easy'); touchStartX.current=null }} role="button" tabIndex={0} aria-label={flipped ? 'Mostra la domanda' : 'Gira la flashcard'} onKeyDown={e => { if (e.key === 'Enter') setFlipped(v => !v) }}>
          <div className="flashcard-face flashcard-front"><span className="flashcard-kicker">DOMANDA</span><div className="flashcard-copy">{current.question_front}</div><span className="flashcard-hint">Tocca la carta per rivelare la risposta · SPAZIO</span></div>
          <div className="flashcard-face flashcard-back"><span className="flashcard-kicker">RISPOSTA CORRETTA</span><div className="flashcard-copy">{current.answer_back}</div><section className="flashcard-explanation-section" aria-label="Spiegazione"><h3 className="flashcard-explanation-title">SPIEGAZIONE</h3>{current.explanation?.trim() ? <p className="flashcard-explanation">{current.explanation}</p> : <p className="flashcard-explanation flashcard-explanation-missing">Spiegazione non ancora disponibile per questa carta.</p>}</section><span className="flashcard-hint">Come hai ricordato questo concetto?</span></div>
        </div>
      </div>
      {flipped && <div className="flashcards-ratings">
        <p className="fc-rating-prompt">Quanto facilmente hai ricordato la risposta?</p>
        <button className="rating-again" onClick={() => void rate('impossible')}><span>Impossibile</span><small>La rifarai presto</small></button>
        <button className="rating-hard" onClick={() => void rate('difficult')}><span>Difficile</span><small>Da consolidare</small></button>
        <button className="rating-good" onClick={() => void rate('easy')}><span>Facile</span><small>La sai abbastanza bene</small></button>
        <button className="rating-easy" onClick={() => void rate('very_easy')}><span>Molto facile</span><small>La sai con sicurezza</small></button>
      </div>}
      {!flipped && <div className="fc-flip-action"><button type="button" className="primary" onClick={() => setFlipped(true)}>Mostra la risposta <ArrowRight size={16}/></button></div>}

      {showAds && <div className="flashcards-ad-slot flashcards-ad-slot-bottom" data-sml-ad-slot="flashcards-bottom" aria-label="Spazio pubblicitario" />}
      <p className="flashcards-footnote">{user ? 'I tuoi progressi vengono salvati sul tuo account.' : 'Puoi provare gratuitamente senza registrazione. Accedi per salvare le valutazioni.'}</p>
    </>}
    {!loading && deckCompleted && sessionCardIds.length > 0 && !paywall && <StudyCompletion
      eyebrow={deckMode === 'difficult' ? 'RIPASSO MIRATO COMPLETATO' : 'RIPASSO DI OGGI COMPLETATO'}
      title={deckMode === 'difficult' ? 'Hai ripassato tutte le carte difficili.' : 'Ottimo lavoro: hai completato tutte le flashcard.'}
      description={deckMode === 'difficult' ? 'Non restano carte difficili o impossibili in scadenza. Puoi tornare al ripasso programmato oppure continuare con un quiz.' : 'La sessione è terminata. Le carte che hai valutato torneranno in base alla difficoltà che hai indicato.'}
      meta={`${sessionCardIds.length} carte nella sessione · ${sessionRatings.easy + sessionRatings.very_easy} facili · ${sessionRatings.impossible + sessionRatings.difficult} da ripassare`}
      primaryLabel={deckMode === 'difficult' ? 'Torna al ripasso programmato' : difficultCount > 0 ? 'Ripassa le carte difficili' : 'Hai completato il ripasso di oggi'}
      onPrimary={() => {setDeckCompleted(false);setSessionStarted(false);setIndex(0);setFlipped(false)}}
      secondaryLabel="Fai un quiz su questa materia"
      onSecondary={() => { if (selectedSubject) onStartQuiz?.(selectedSubject.id) }}
    />}
    {!loading && subjectId && total===0 && <StudyCompletion eyebrow="CATALOGO IN CRESCITA" title="Le flashcard di questa materia stanno arrivando." description="Al momento non ci sono ancora carte disponibili per questa materia. SMLQUIZ è in continua crescita: il catalogo verrà ampliato progressivamente con nuove flashcard e contenuti di studio." primaryLabel="Torna alla selezione materia" onPrimary={onBackToPath} secondaryLabel="Allenati con un quiz" onSecondary={()=>{if(selectedSubject)onStartQuiz?.(selectedSubject.id)}}/>}

    {paywall && <div className="flashcards-paywall-backdrop"><div className="flashcards-paywall panel flashcards-tinder-paywall">
      <div className="flashcards-paywall-top"><span><Heart size={15} fill="currentColor"/> SMLQUIZ PREMIUM</span><span className="flashcards-free-tag">50 / 50 COMPLETATE</span></div>
      <div className="flashcards-paywall-art" aria-hidden="true">
        <div className="flashcards-preview-card preview-card-back"><span>FLASHCARD {Math.min(total,53)}</span><Lock size={19}/></div>
        <div className="flashcards-preview-card preview-card-mid"><span>FLASHCARD 52</span><Lock size={19}/></div>
        <div className="flashcards-preview-card preview-card-front"><small>IL TUO PROSSIMO LIVELLO</small><strong>51–{Math.max(300,total).toLocaleString('it-IT')}+</strong><span>FLASHCARD BLOCCATE</span><div><Lock size={15}/> CONTENUTI PREMIUM</div></div>
        <div className="flashcards-preview-spark">✦</div>
      </div>
      <span className="flashcards-paywall-kicker">HAI SBLOCCATO IL GUSTO DI STUDIARE</span>
      <h2>Non fermarti proprio adesso.</h2>
      <p className="flashcards-paywall-lead">Hai completato le tue <strong>50 flashcard gratuite</strong> di <strong>{title}</strong>. Le successive, dalla <strong>51ª alla {Math.max(300,total).toLocaleString('it-IT')}ª e oltre</strong>, ti aspettano: sblocca l'intero mazzo e continua senza interruzioni.</p>
      <div className="flashcards-premium-perks"><span><Check size={14}/> Tutte le {total.toLocaleString('it-IT')}+ flashcard</span><span><Check size={14}/> Nuove carte future incluse</span><span><Check size={14}/> Paghi una volta, senza abbonamento</span></div>
      <div className="flashcards-paywall-price"><strong>1,99 €</strong><span>una tantum · accesso per sempre</span></div>
      <label className="flashcards-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Acconsento alla fornitura immediata dei contenuti digitali e riconosco la perdita del diritto di recesso nei limiti previsti dalla legge.</label>
      <button className="primary flashcards-unlock" disabled={!consent} onClick={() => onBuy(PRICE_ID,[subjectId],true)}>Sblocca tutte le flashcard <ArrowRight size={17}/></button>
      {!user && <p className="flashcards-login-note">Per completare l'acquisto dovrai accedere o creare un account.</p>}
      <button className="simple-link" onClick={() => {setPaywall(false);setSessionStarted(false)}}>Magari più tardi</button>
    </div></div>}
  </section>
}
