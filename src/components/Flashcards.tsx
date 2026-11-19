import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, CreditCard, Layers3, Shuffle, Sparkles, Lock, Heart } from 'lucide-react'
import StudyCompletion from './StudyCompletion'
import { supabase } from '../lib/supabase'

type Subject = { id: string; nome: string; traduzioni?: Record<string, { nome?: string }> }
type Flashcard = { id: string; subject_id: string; question_front: string; answer_back: string; explanation: string | null; order_index: number; quiz_number: number | null; user_rating?: 'difficult'|'medium'|'easy'|null }
type Props = {
  subjects: Subject[]
  user: { id: string } | null
  onBuy: (priceId: string, subjectIds: string[], consentConfirmed: boolean) => void
  notify: (message: string) => void
  showAds?: boolean
  onStartQuiz?: (subjectId: string) => void
}
const PRICE_ID = 'price_1UdBxFBCybXKHSfRwLeImDFx'
const FREE_LIMIT = 50

export default function Flashcards({ subjects, user, onBuy, notify, showAds = true, onStartQuiz }: Props) {
  const [subjectId, setSubjectId] = useState('')
  const [subjectSearch, setSubjectSearch] = useState('')
  const [cards, setCards] = useState<Flashcard[]>([])
  const [total, setTotal] = useState(0)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const [deckCompleted, setDeckCompleted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [consent, setConsent] = useState(false)
  const [ratings, setRatings] = useState<Record<string, 'difficult'|'medium'|'easy'>>({})
  const [sessionRatings, setSessionRatings] = useState<Record<string, 'difficult'|'medium'|'easy'>>({})
  const [sessionQueue, setSessionQueue] = useState<string[]>([])
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>({})
  const [deckMode, setDeckMode] = useState<'all'|'difficult'>('all')
  const cardRef = useRef<HTMLDivElement>(null)
  const notifyRef = useRef(notify)
  useEffect(() => { notifyRef.current = notify }, [notify])
  const selectedSubject = useMemo(() => subjects.find(s => s.id === subjectId), [subjects, subjectId])
  const filteredSubjects = useMemo(() => {
    const query = subjectSearch.trim().toLocaleLowerCase('it')
    if (!query) return subjects
    return subjects.filter(subject => (subject.traduzioni?.it?.nome || subject.nome).toLocaleLowerCase('it').includes(query))
  }, [subjects, subjectSearch])
  const displayedCards = useMemo(() => sessionQueue
    .map(id => cards.find(card => card.id === id))
    .filter((card): card is Flashcard => Boolean(card))
    .filter(card => deckMode === 'all' || (sessionRatings[card.id] ?? ratings[card.id] ?? card.user_rating) === 'difficult'),
    [sessionQueue, cards, deckMode, sessionRatings, ratings])
  const current = displayedCards[index]
  const accessibleTotal = unlocked ? Math.min(total, 300) : Math.min(total, FREE_LIMIT)
  const reviewedCount = Object.keys(sessionRatings).length
  const easyCount = Object.values(sessionRatings).filter(value => value === 'easy').length
  const difficultCount = Object.values(sessionRatings).filter(value => value === 'difficult').length
  const mediumCount = Object.values(sessionRatings).filter(value => value === 'medium').length
  const title = selectedSubject?.traduzioni?.it?.nome || selectedSubject?.nome || 'Flashcard'

  const loadDeck = useCallback(async (id: string) => {
    if (!supabase || !id) return
    setLoading(true); setCards([]); setIndex(0); setFlipped(false); setPaywall(false); setDeckCompleted(false); setUnlocked(false); setRatings({}); setSessionRatings({}); setSessionQueue([]); setRepeatCounts({}); setDeckMode('all')
    try {
      const { data, error } = await supabase.functions.invoke('flashcards-api', { body: { subjectId: id, offset: 0, limit: FREE_LIMIT } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      let loaded = (data?.cards ?? []) as Flashcard[]
      const cardTotal = Math.min(300, Number(data?.total_cards ?? 0))
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
      let localRatings: Record<string, 'difficult'|'medium'|'easy'> = {}
      try {
        const saved = JSON.parse(localStorage.getItem(`smlquiz.flashcards.progress.v1:${user?.id || 'guest'}`) || '{}')
        if (saved && typeof saved === 'object' && saved[id] && typeof saved[id] === 'object') localRatings = saved[id]
      } catch { /* cache locale non disponibile: si usano i progressi cloud */ }
      const mergedRatings: Record<string, 'difficult'|'medium'|'easy'> = { ...localRatings }
      loaded = loaded.map(card => {
        const rating = localRatings[card.id] ?? card.user_rating ?? null
        if (rating) mergedRatings[card.id] = rating
        return { ...card, user_rating: rating }
      })
      setCards(loaded)
      setRatings(mergedRatings)
      setSessionRatings({})
      setSessionQueue(loaded.map(card => card.id))
      setRepeatCounts({})
      setTotal(cardTotal)
      setUnlocked(hasUnlock)
      setPaywall(false)
      setDeckCompleted(loaded.length === 0 && cardTotal === 0)
    } catch (err) {
      notifyRef.current(err instanceof Error ? err.message : 'Impossibile caricare le flashcard.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!subjectId && subjects.length) setSubjectId(subjects[0].id)
  }, [subjectId, subjects])
  useEffect(() => { if (subjectId) void loadDeck(subjectId) }, [subjectId, loadDeck])

  const next = useCallback(async () => {
    if (!flipped) { setFlipped(true); return }
    if (displayedCards.length > 1 && current) {
      setSessionQueue(prev => {
        const rest = prev.filter((id, i) => !(i === index && id === current.id))
        return [...rest, current.id]
      })
      setIndex(0)
      setFlipped(false)
      return
    }
    setFlipped(false)
  }, [flipped, displayedCards.length, current, index])

  const rate = async (rating: 'difficult'|'medium'|'easy') => {
    if (!current) return
    const cardId = current.id
    const queueWithoutCurrent = sessionQueue.filter((id, i) => !(i === index && id === cardId))
    const timesRepeated = repeatCounts[cardId] ?? 0
    let nextQueue = queueWithoutCurrent
    if (rating === 'difficult' && timesRepeated < 1) {
      const insertAt = Math.min(3, queueWithoutCurrent.length)
      nextQueue = [...queueWithoutCurrent.slice(0, insertAt), cardId, ...queueWithoutCurrent.slice(insertAt)]
    } else if (rating === 'medium' && timesRepeated < 1) {
      nextQueue = [...queueWithoutCurrent, cardId]
    }
    setSessionRatings(prev => ({ ...prev, [cardId]: rating }))
    setRatings(prev => ({ ...prev, [cardId]: rating }))
    setRepeatCounts(prev => ({ ...prev, [cardId]: timesRepeated + 1 }))
    setSessionQueue(nextQueue)
    setIndex(0)
    setFlipped(false)
    try {
      const key = `smlquiz.flashcards.progress.v1:${user?.id || 'guest'}`
      const saved = JSON.parse(localStorage.getItem(key) || '{}')
      const subjectRatings = { ...(saved?.[subjectId] || {}), [cardId]: rating }
      localStorage.setItem(key, JSON.stringify({ ...saved, [subjectId]: subjectRatings }))
    } catch { /* il salvataggio cloud resta disponibile per gli utenti autenticati */ }
    if (user && supabase) {
      const { error } = await supabase.functions.invoke('flashcards-api', { body: { action: 'rate', subjectId, flashcardId: cardId, rating } })
      if (error) notify('Valutazione salvata su questo dispositivo; sincronizzazione cloud da riprovare.')
    }
    if (nextQueue.length === 0) {
      if (!unlocked && total > FREE_LIMIT) setPaywall(true)
      else setDeckCompleted(true)
    }
  }

  const shuffle = () => {
    setSessionQueue(prev => {
      const copy = [...prev]
      for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] }
      return copy
    })
    setIndex(0); setFlipped(false); setDeckMode('all'); setDeckCompleted(false)
  }
  const changeDeckMode = (mode: 'all'|'difficult') => {
    setDeckMode(mode)
    const eligible = cards.filter(card => mode === 'all'
      ? sessionRatings[card.id] !== 'easy'
      : (sessionRatings[card.id] ?? ratings[card.id] ?? card.user_rating) === 'difficult')
    setSessionQueue(eligible.map(card => card.id))
    setIndex(0); setFlipped(false); setDeckCompleted(mode === 'all' && eligible.length === 0); setPaywall(false)
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

  return <section className="content flashcards-page">
    <header className="flashcards-hero">
      <div className="flashcards-hero-copy">
        <div className="flashcards-eyebrow"><Sparkles size={14}/> RIPASSO SEMPLICE</div>
        <h1>Flashcard</h1>
        <p>Scegli una materia, leggi la domanda e tocca la carta per vedere la risposta.</p>
      </div>
      <div className="flashcards-hero-mark" aria-hidden="true"><Layers3 size={30}/></div>
    </header>
    <div className="flashcards-subject-panel panel">
      <div className="flashcards-subject-label"><BookOpen size={16}/><span>Scegli una materia</span></div>
      <div className="flashcards-subject-picker">
        <input
          id="flashcards-subject-search"
          type="search"
          value={subjectSearch}
          onChange={e => setSubjectSearch(e.target.value)}
          placeholder="Cerca una materia…"
          aria-label="Cerca una materia"
          autoComplete="off"
        />
        <select id="flashcards-subject" aria-label="Seleziona materia" value={subjectId} onChange={e => setSubjectId(e.target.value)}>
          {selectedSubject && !filteredSubjects.some(subject => subject.id === selectedSubject.id) && <option value={selectedSubject.id}>{selectedSubject.traduzioni?.it?.nome || selectedSubject.nome} · selezionata</option>}
          {filteredSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.traduzioni?.it?.nome || subject.nome}</option>)}
          {filteredSubjects.length === 0 && <option value={subjectId} disabled>Nessuna materia trovata</option>}
        </select>
        <span className="flashcards-subject-results">{filteredSubjects.length} materie disponibili</span>
      </div>
       
    </div>
    <div className="flashcards-overview">
      <div className="flashcards-overview-item"><span className="flashcards-overview-icon"><BookOpen size={17}/></span><div><strong>{total.toLocaleString('it-IT')}</strong><small>Carte disponibili</small></div></div>
      <div className="flashcards-overview-item"><span className="flashcards-overview-icon is-success"><Check size={17}/></span><div><strong>{easyCount}</strong><small>Imparate · Facili</small></div></div>
      <div className="flashcards-overview-item"><span className="flashcards-overview-icon is-review"><Sparkles size={17}/></span><div><strong>{difficultCount}</strong><small>Difficili</small></div></div>
      <div className="flashcards-overview-item"><span className="flashcards-overview-icon is-progress"><Layers3 size={17}/></span><div><strong>{mediumCount}</strong><small>Medie</small></div></div>
    </div>
    {loading && <div className="panel empty">Caricamento flashcard…</div>}
    {!loading && cards.length > 0 && !paywall && !deckCompleted && current && <>
      <div className="flashcards-progress">
        <div className="flashcards-progress-label"><span>Studiate {reviewedCount} / {accessibleTotal}{!unlocked && total > FREE_LIMIT ? ' · Gratis' : ''}</span><span>{displayedCards.length} da fare in questo giro</span></div>
        <div className="flashcards-progress-track"><span style={{width: `${Math.min(100, (reviewedCount / Math.max(1, accessibleTotal)) * 100)}%`}}/></div>
      </div>
      <div className="flashcard-stage">
        <div ref={cardRef} className={`flashcard-3d ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(v => !v)} role="button" tabIndex={0} aria-label={flipped ? 'Mostra la domanda' : 'Gira la flashcard'} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(v => !v) } }}>
          <div className="flashcard-face flashcard-front"><span className="flashcard-kicker">DOMANDA</span><div className="flashcard-copy">{current.question_front}</div><span className="flashcard-hint">Tocca qui per vedere la risposta</span></div>
          <div className="flashcard-face flashcard-back"><span className="flashcard-kicker">RISPOSTA CORRETTA</span><div className="flashcard-copy">{current.answer_back}</div><section className="flashcard-explanation-section" aria-label="Spiegazione"><h3 className="flashcard-explanation-title">SPIEGAZIONE</h3>{current.explanation?.trim() ? <p className="flashcard-explanation">{current.explanation}</p> : <p className="flashcard-explanation flashcard-explanation-missing">Spiegazione non ancora disponibile per questa carta.</p>}</section><span className="flashcard-hint">Quanto è stato facile ricordarlo?</span></div>
        </div>
      </div>
      {flipped && <div className="flashcard-ratings">
        <button className="rating-difficult" onClick={() => void rate('difficult')}>Difficile</button>
        <button className="rating-medium" onClick={() => void rate('medium')}>Medio</button>
        <button className="rating-easy" onClick={() => void rate('easy')}><Check size={15}/> Facile</button>
      </div>}
      <div className="flashcards-controls">
        <button className="secondary" disabled={index===0} onClick={() => {setIndex(v=>v-1);setFlipped(false)}}><ArrowLeft size={15}/> Precedente</button>
        <button className="primary" onClick={() => void next()} disabled={loading}>{flipped ? (index === displayedCards.length - 1 ? (!unlocked && total > FREE_LIMIT ? 'Sblocca le altre carte' : cards.length >= total ? 'Completa sessione' : 'Carica altre carte') : 'Prossima carta') : 'Mostra la risposta'} <ArrowRight size={15}/></button>
      </div>
      <div className="flashcards-deck-actions">
        <button className={deckMode==='all'?'primary':'secondary'} onClick={() => changeDeckMode('all')}>Tutte le carte</button>
        <button className={deckMode==='difficult'?'primary':'secondary'} onClick={() => changeDeckMode('difficult')}>Solo difficili ({cards.filter(card => (sessionRatings[card.id] ?? ratings[card.id] ?? card.user_rating) === 'difficult').length})</button>
        <button className="secondary" onClick={shuffle}><Shuffle size={15}/> Mescola</button>
      </div>
      <p className="flashcards-footnote">{user ? 'I tuoi progressi vengono salvati sul tuo account.' : 'Puoi provare gratuitamente senza registrazione. Accedi per salvare le valutazioni.'}</p>
    </>}
    {!loading && deckCompleted && !paywall && <StudyCompletion
      eyebrow={deckMode === 'difficult' ? 'RIPASSO COMPLETATO' : 'SESSIONE COMPLETATA'}
      title={deckMode === 'difficult' ? 'Hai ripassato tutte le carte difficili.' : 'Ottimo lavoro: hai completato tutte le flashcard.'}
      description={deckMode === 'difficult' ? 'Non restano altre carte contrassegnate come difficili in questa sessione. Puoi tornare al mazzo completo oppure continuare con un quiz.' : 'Hai terminato il materiale disponibile per questa materia. I tuoi progressi e le valutazioni restano salvati.'}
      meta={`${total.toLocaleString('it-IT')} carte disponibili · ${easyCount} facili · ${difficultCount} da ripassare`}
      primaryLabel={deckMode === 'difficult' ? 'Torna alle flashcard da fare' : difficultCount > 0 ? 'Ripassa le carte difficili' : 'Hai completato il mazzo'}
      onPrimary={() => {
        if (deckMode === 'difficult') { setDeckMode('all'); setIndex(0); setFlipped(false); setDeckCompleted(false); return }
        if (difficultCount > 0) { setDeckMode('difficult'); setIndex(0); setFlipped(false); setDeckCompleted(false) }
      }}
      secondaryLabel="Fai un quiz su questa materia"
      onSecondary={() => { if (selectedSubject) onStartQuiz?.(selectedSubject.id) }}
    />}
    {!loading && total===0 && <StudyCompletion eyebrow="CATALOGO IN CRESCITA" title="Le flashcard di questa materia stanno arrivando." description="Al momento non ci sono ancora carte disponibili per questa materia. SMLQUIZ è in continua crescita: il catalogo verrà ampliato progressivamente con nuove flashcard e contenuti di studio." primaryLabel="Prova un'altra materia" onPrimary={()=>{const nextSubject=subjects.find(s=>s.id!==subjectId);if(nextSubject){setSubjectSearch('');setSubjectId(nextSubject.id)}else setSubjectSearch('')}} secondaryLabel="Allenati con un quiz" onSecondary={()=>{if(selectedSubject)onStartQuiz?.(selectedSubject.id)}}/>}
    {!loading && total>0 && deckMode==='difficult' && displayedCards.length===0 && !paywall && !deckCompleted && <div className="panel empty">Non hai carte difficili da ripassare. <button className="simple-link" onClick={()=>changeDeckMode('all')}>Torna a tutte le flashcard</button></div>}
    {paywall && <div className="flashcards-paywall-backdrop"><div className="flashcards-paywall panel flashcards-tinder-paywall">
      <div className="flashcards-paywall-top"><span><Heart size={15} fill="currentColor"/> SMLQUIZ PREMIUM</span><span className="flashcards-free-tag">50 / 50 COMPLETATE</span></div>
      <div className="flashcards-paywall-art" aria-hidden="true">
        <div className="flashcards-preview-card preview-card-back"><span>FLASHCARD 53</span><Lock size={19}/></div>
        <div className="flashcards-preview-card preview-card-mid"><span>FLASHCARD 52</span><Lock size={19}/></div>
        <div className="flashcards-preview-card preview-card-front"><small>IL TUO PROSSIMO LIVELLO</small><strong>51–300</strong><span>FLASHCARD BLOCCATE</span><div><Lock size={15}/> CONTENUTI PREMIUM</div></div>
        <div className="flashcards-preview-spark">✦</div>
      </div>
      <span className="flashcards-paywall-kicker">HAI SBLOCCATO IL GUSTO DI STUDIARE</span>
      <h2>Non fermarti proprio adesso.</h2>
      <p className="flashcards-paywall-lead">Hai completato le tue <strong>50 flashcard gratuite</strong> di <strong>{title}</strong>. Le successive, dalla <strong>51ª alla 300ª</strong>, ti aspettano: sblocca l'intero mazzo e continua senza interruzioni.</p>
      <div className="flashcards-premium-perks"><span><Check size={14}/> Tutte le flashcard fino alla 300ª</span><span><Check size={14}/> Nuove carte future incluse</span><span><Check size={14}/> Paghi una volta, senza abbonamento</span></div>
      <div className="flashcards-paywall-price"><strong>1,99 €</strong><span>una tantum · accesso per sempre</span></div>
      <label className="flashcards-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Acconsento alla fornitura immediata dei contenuti digitali e riconosco la perdita del diritto di recesso nei limiti previsti dalla legge.</label>
      <button className="primary flashcards-unlock" disabled={!consent} onClick={() => onBuy(PRICE_ID,[subjectId],true)}>Sblocca tutte le flashcard <ArrowRight size={17}/></button>
      {!user && <p className="flashcards-login-note">Per completare l'acquisto dovrai accedere o creare un account.</p>}
      <button className="simple-link" onClick={() => setPaywall(false)}>Magari più tardi</button>
    </div></div>}
  </section>
}
