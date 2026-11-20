import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, Layers3, Shuffle, Sparkles, Lock, Heart } from 'lucide-react'
import StudyCompletion from './StudyCompletion'
import { supabase } from '../lib/supabase'

type Subject = { id: string; nome: string; traduzioni?: Record<string, { nome?: string }> }
type Rating = 'again'|'hard'|'good'|'easy'
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
  const [deckMode, setDeckMode] = useState<'all'|'difficult'>('all')
  const cardRef = useRef<HTMLDivElement>(null)
  const notifyRef = useRef(notify)
  useEffect(() => { notifyRef.current = notify }, [notify])
  const selectedSubject = useMemo(() => subjects.find(s => s.id === subjectId), [subjects, subjectId])
  // Nel mazzo principale restano soltanto le carte non ancora valutate.
  // Le carte difficili restano accessibili separatamente nel ripasso dedicato.
  const displayedCards = useMemo(() => {
    const now = Date.now()
    return cards.filter(card => {
      const rating = ratings[card.id] ?? card.user_rating
      const dueAt = dueDates[card.id] ?? card.user_due_at ?? null
      const due = !rating || !dueAt || new Date(dueAt).getTime() <= now
      return deckMode === 'difficult' ? (rating === 'again' || rating === 'hard' || rating === 'again' || rating === 'again' || rating === 'hard' || rating === 'impossible' || rating === 'difficult') && due : due
    })
  }, [cards, deckMode, ratings, dueDates])
  const current = displayedCards[index]
  const progressTotal = deckMode === 'difficult' ? displayedCards.length : (unlocked ? total : Math.min(total, FREE_LIMIT))
  const completedInDeck = cards.filter(card => Boolean(ratings[card.id] ?? card.user_rating)).length
  const easyCount = cards.filter(card => ['good','easy','very_easy'].includes(ratings[card.id] ?? card.user_rating ?? '')).length
  const difficultCount = cards.filter(card => ['again','hard','impossible','difficult'].includes(ratings[card.id] ?? card.user_rating ?? '')).length
  const ratedCount = cards.filter(card => ratings[card.id] || card.user_rating).length
  const title = selectedSubject?.traduzioni?.it?.nome || selectedSubject?.nome || 'Flashcard'

  const loadDeck = useCallback(async (id: string) => {
    if (!supabase || !id) return
    setLoading(true); setCards([]); setIndex(0); setFlipped(false); setPaywall(false); setDeckCompleted(false); setUnlocked(false); setRatings({}); setDueDates({}); setDeckMode('all')
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
      const dueRemaining = loaded.filter(card => {
        const rating = card.user_rating
        const dueAt = card.user_due_at
        return !rating || !dueAt || new Date(dueAt).getTime() <= Date.now()
      }).length
      setPaywall(false)
      setDeckCompleted(loaded.length > 0 && dueRemaining === 0)
    } catch (err) {
      notifyRef.current(err instanceof Error ? err.message : 'Impossibile caricare le flashcard.')
    } finally { setLoading(false) }
  }, [user?.id])

  useEffect(() => {
    setSubjectId(selectedSubjectId)
  }, [selectedSubjectId])
  useEffect(() => { if (subjectId) void loadDeck(subjectId) }, [subjectId, loadDeck])

  const next = useCallback(async () => {
    if (!flipped) { setFlipped(true); return }
    if (index < displayedCards.length - 1) { setIndex(v => v + 1); setFlipped(false); return }
    if (!unlocked && total > FREE_LIMIT) { setPaywall(true); return }
    if (unlocked && cards.length < total) {
      setLoading(true)
      try {
        const { data, error } = await supabase!.functions.invoke('flashcards-api', { body: { subjectId, offset: cards.length, limit: FREE_LIMIT } })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        const more = (data?.cards ?? []) as Flashcard[]
        setCards(prev => [...prev, ...more]); setIndex(v => v + 1); setFlipped(false)
      } catch (err) { notifyRef.current(err instanceof Error ? err.message : 'Errore nel caricamento delle altre carte.') }
      finally { setLoading(false) }
      return
    }
    setDeckCompleted(true)
  }, [flipped, index, displayedCards.length, unlocked, total, cards.length, subjectId, loading])

  const rate = async (rating: Rating) => {
    if (!current) return
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
      } catch { /* progressi cloud disponibili per gli utenti autenticati */ }
      return updated
    })
    try {
      const key = `smlquiz.flashcards.progress.v1:${user?.id || 'guest'}`
      const saved = JSON.parse(localStorage.getItem(key) || '{}')
      const subjectRatings = { ...(saved?.[subjectId] || {}), [current.id]: rating }
      localStorage.setItem(key, JSON.stringify({ ...saved, [subjectId]: subjectRatings }))
    } catch { /* cache locale non disponibile */ }
    setFlipped(false)
    if (deckMode === 'difficult' && rating !== 'again' && rating !== 'hard' && rating !== 'impossible' && rating !== 'difficult') {
      setIndex(Math.min(index, Math.max(0, displayedCards.length - 2)))
      return
    }
    if (displayedCards.length <= 1) {
      setDeckCompleted(true)
    } else if (index >= displayedCards.length - 1) setIndex(0)
  }

  const shuffle = () => {
    setCards(prev => {
      const copy = [...prev]
      for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] }
      return copy
    })
    setIndex(0); setFlipped(false); setDeckMode('all'); setDeckCompleted(false)
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !paywall && current && !(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) {
        event.preventDefault(); setFlipped(v => !v)
      }
      if (event.code === 'ArrowRight' && flipped && !paywall) void next()
      if (event.code === 'ArrowLeft' && index > 0 && !paywall) { setIndex(v => v - 1); setFlipped(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [current, flipped, index, paywall, displayedCards.length, unlocked, cards.length, total, next])

  return <section className="flashcards-page">
    <header className="flashcards-hero">
      <div className="flashcards-hero-copy">
        <div className="flashcards-eyebrow"><Sparkles size={14}/> METODO DI STUDIO ATTIVO</div>
        <h1>Flashcard</h1>
        <p>Ripasso attivo, progressi e ripetizione programmata: tutto il mazzo della materia che hai già selezionato.</p>
      </div>
      <div className="flashcards-hero-mark" aria-hidden="true"><Layers3 size={30}/></div>
    </header>
    {selectedSubject && <div className="flashcards-subject-context">
      <div className="flashcards-subject-context-icon"><BookOpen size={18}/></div>
      <div className="flashcards-subject-context-copy"><span>MATERIA SELEZIONATA</span><strong>{selectedSubject.traduzioni?.it?.nome || selectedSubject.nome}</strong></div>
      <div className="flashcards-subject-context-total"><strong>{total.toLocaleString('it-IT')}</strong><span>carte disponibili</span></div>
    </div>}
    {!selectedSubjectId && <StudyCompletion eyebrow="PERCORSO NON SELEZIONATO" title="Scegli prima la materia da studiare." description="Torna al tuo percorso universitario, seleziona facoltà, anno e materia, poi apri di nuovo le Flashcard. La scelta verrà mantenuta automaticamente." primaryLabel="Torna al percorso" onPrimary={onBackToPath} />}
    <div className="flashcards-overview">
      <div className="flashcards-overview-item"><span className="flashcards-overview-icon"><BookOpen size={17}/></span><div><strong>{total.toLocaleString('it-IT')}</strong><small>Carte disponibili</small></div></div>
      <div className="flashcards-overview-item"><span className="flashcards-overview-icon is-success"><Check size={17}/></span><div><strong>{easyCount}</strong><small>Facili</small></div></div>
      <div className="flashcards-overview-item"><span className="flashcards-overview-icon is-review"><Sparkles size={17}/></span><div><strong>{difficultCount}</strong><small>Da ripassare</small></div></div>
      <div className="flashcards-overview-item"><span className="flashcards-overview-icon is-progress"><Layers3 size={17}/></span><div><strong>{ratedCount}</strong><small>Valutate</small></div></div>
    </div>
    {showAds && <div className="flashcards-ad-slot" data-sml-ad-slot="flashcards-top" aria-label="Spazio pubblicitario" />}
    {loading && <div className="panel empty">Caricamento flashcard…</div>}
    {!loading && cards.length > 0 && !paywall && !deckCompleted && current && <>
      <div className="flashcards-progress">
        <div className="flashcards-progress-label"><span>Restano {displayedCards.length} di {progressTotal}{!unlocked && total > FREE_LIMIT ? ' · Anteprima gratuita' : ''}</span><span>{completedInDeck} già valutate</span></div>
        <div className="flashcards-progress-track"><span style={{width: `${Math.min(100, ((index + 1) / Math.max(1, progressTotal)) * 100)}%`}}/></div>
      </div>
      <div className="flashcard-stage">
        <div ref={cardRef} className={`flashcard-3d ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(v => !v)} role="button" tabIndex={0} aria-label={flipped ? 'Mostra la domanda' : 'Gira la flashcard'} onKeyDown={e => { if (e.key === 'Enter') setFlipped(v => !v) }}>
          <div className="flashcard-face flashcard-front"><span className="flashcard-kicker">DOMANDA</span><div className="flashcard-copy">{current.question_front}</div><span className="flashcard-hint">Tocca la carta per rivelare la risposta · SPAZIO</span></div>
          <div className="flashcard-face flashcard-back"><span className="flashcard-kicker">RISPOSTA CORRETTA</span><div className="flashcard-copy">{current.answer_back}</div><section className="flashcard-explanation-section" aria-label="Spiegazione"><h3 className="flashcard-explanation-title">SPIEGAZIONE</h3>{current.explanation?.trim() ? <p className="flashcard-explanation">{current.explanation}</p> : <p className="flashcard-explanation flashcard-explanation-missing">Spiegazione non ancora disponibile per questa carta.</p>}</section><span className="flashcard-hint">Come hai ricordato questo concetto?</span></div>
        </div>
      </div>
      {flipped && <div className="flashcards-ratings">
        <button className="rating-again" onClick={() => void rate('again')}><span>Non ricordata</span><small>Ripeti tra 10 min</small></button>
        <button className="rating-hard" onClick={() => void rate('hard')}><span>Con difficoltà</span><small>Ripeti domani</small></button>
        <button className="rating-good" onClick={() => void rate('good')}><span>Ricordata</span><small>Ripeti tra 3 giorni</small></button>
        <button className="rating-easy" onClick={() => void rate('easy')}><span>Molto bene</span><small>Ripeti tra 7 giorni</small></button>
      </div>}
      <div className="flashcards-controls">
        <button className="secondary" disabled={index===0} onClick={() => {setIndex(v=>v-1);setFlipped(false)}}><ArrowLeft size={15}/> Precedente</button>
        <button className="primary" onClick={() => void next()} disabled={loading}>{flipped ? (index === displayedCards.length - 1 ? (!unlocked && total > FREE_LIMIT ? 'Sblocca le altre carte' : cards.length >= total ? 'Completa sessione' : 'Carica altre carte') : 'Prossima carta') : 'Gira la carta'} <ArrowRight size={15}/></button>
      </div>
      {unlocked && <div className="flashcards-deck-actions"><button className="secondary" onClick={shuffle}><Shuffle size={15}/> Mescola</button><button className={deckMode==='difficult'?'primary':'secondary'} onClick={() => {setDeckMode(v=>v==='difficult'?'all':'difficult');setIndex(0);setFlipped(false);setDeckCompleted(false)}}>Solo difficili</button></div>}
      {showAds && <div className="flashcards-ad-slot flashcards-ad-slot-bottom" data-sml-ad-slot="flashcards-bottom" aria-label="Spazio pubblicitario" />}
      <p className="flashcards-footnote">{user ? 'I tuoi progressi vengono salvati sul tuo account.' : 'Puoi provare gratuitamente senza registrazione. Accedi per salvare le valutazioni.'}</p>
    </>}
    {!loading && deckCompleted && !paywall && <StudyCompletion
      eyebrow={deckMode === 'difficult' ? 'RIPASSO MIRATO COMPLETATO' : 'RIPASSO DI OGGI COMPLETATO'}
      title={deckMode === 'difficult' ? 'Hai ripassato tutte le carte difficili.' : 'Ottimo lavoro: hai completato tutte le flashcard.'}
      description={deckMode === 'difficult' ? 'Non restano carte difficili o impossibili in scadenza. Puoi tornare al ripasso programmato oppure continuare con un quiz.' : 'Hai completato tutte le carte nuove e quelle in scadenza per oggi. Le prossime schede torneranno automaticamente quando sarà il momento di ripassarle.'}
      meta={`${total.toLocaleString('it-IT')} carte disponibili · ${easyCount} facili · ${difficultCount} da ripassare`}
      primaryLabel={deckMode === 'difficult' ? 'Torna al ripasso programmato' : difficultCount > 0 ? 'Ripassa le carte difficili' : 'Hai completato il ripasso di oggi'}
      onPrimary={() => {
        if (deckMode === 'difficult') { setDeckMode('all'); setIndex(0); setFlipped(false); setDeckCompleted(false); return }
        if (difficultCount > 0) { setDeckMode('difficult'); setIndex(0); setFlipped(false); setDeckCompleted(false) }
      }}
      secondaryLabel="Fai un quiz su questa materia"
      onSecondary={() => { if (selectedSubject) onStartQuiz?.(selectedSubject.id) }}
    />}
    {!loading && subjectId && total===0 && <StudyCompletion eyebrow="CATALOGO IN CRESCITA" title="Le flashcard di questa materia stanno arrivando." description="Al momento non ci sono ancora carte disponibili per questa materia. SMLQUIZ è in continua crescita: il catalogo verrà ampliato progressivamente con nuove flashcard e contenuti di studio." primaryLabel="Torna alla selezione materia" onPrimary={onBackToPath} secondaryLabel="Allenati con un quiz" onSecondary={()=>{if(selectedSubject)onStartQuiz?.(selectedSubject.id)}}/>}
    {!loading && total>0 && deckMode==='difficult' && displayedCards.length===0 && !paywall && <div className="panel empty">Non hai carte difficili da ripassare. <button className="simple-link" onClick={()=>setDeckMode('all')}>Torna a tutte le flashcard</button></div>}
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
      <button className="simple-link" onClick={() => setPaywall(false)}>Magari più tardi</button>
    </div></div>}
  </section>
}
