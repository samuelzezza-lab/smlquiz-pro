import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, CreditCard, Layers3, Shuffle, Sparkles } from 'lucide-react'
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
  const displayedCards = useMemo(() => deckMode === 'difficult'
    ? cards.filter(card => (ratings[card.id] ?? card.user_rating) === 'difficult')
    : cards, [cards, deckMode, ratings])
  const current = displayedCards[index]
  const progressTotal = deckMode === 'difficult' ? displayedCards.length : (unlocked ? total : Math.min(total, FREE_LIMIT))
  const easyCount = cards.filter(card => (ratings[card.id] ?? card.user_rating) === 'easy').length
  const difficultCount = cards.filter(card => (ratings[card.id] ?? card.user_rating) === 'difficult').length
  const ratedCount = cards.filter(card => ratings[card.id] || card.user_rating).length
  const title = selectedSubject?.traduzioni?.it?.nome || selectedSubject?.nome || 'Flashcard'

  const loadDeck = useCallback(async (id: string) => {
    if (!supabase || !id) return
    setLoading(true); setCards([]); setIndex(0); setFlipped(false); setPaywall(false); setDeckCompleted(false); setUnlocked(false); setRatings({}); setDeckMode('all')
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
      setCards(loaded)
      setTotal(cardTotal)
      setUnlocked(hasUnlock)
      setPaywall(data?.paywall === true && loaded.length === 0)
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

  const rate = async (rating: 'difficult'|'medium'|'easy') => {
    if (!current) return
    setRatings(prev => ({ ...prev, [current.id]: rating }))
    if (user && supabase) {
      const { error } = await supabase.functions.invoke('flashcards-api', { body: { action: 'rate', subjectId, flashcardId: current.id, rating } })
      if (error) notify('Valutazione non sincronizzata: riprova quando sei online.')
    }
    if (deckMode === 'difficult' && rating !== 'difficult') {
      setIndex(Math.min(index, Math.max(0, displayedCards.length - 2))); setFlipped(false); return
    }
    if (rating === 'difficult') {
      const nextIndex = displayedCards.findIndex((card, i) => i > index && (ratings[card.id] ?? card.user_rating) !== 'difficult')
      if (nextIndex >= 0) { setIndex(nextIndex); setFlipped(false); return }
    }
    if (index < displayedCards.length - 1) { setIndex(v => v + 1); setFlipped(false) }
    else if (!unlocked && total > FREE_LIMIT) setPaywall(true)
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

  return <section className="content flashcards-page">
    <header className="flashcards-hero">
      <div className="flashcards-hero-copy">
        <div className="flashcards-eyebrow"><Sparkles size={14}/> METODO DI STUDIO ATTIVO</div>
        <h1>Flashcard</h1>
        <p>Memorizza i concetti chiave, verifica ciò che ricordi e concentra il ripasso sugli argomenti più difficili.</p>
      </div>
      <div className="flashcards-hero-mark" aria-hidden="true"><Layers3 size={30}/></div>
    </header>
    <div className="flashcards-subject-panel panel">
      <div className="flashcards-subject-label"><BookOpen size={16}/><span>La tua materia</span></div>
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
        <span className="flashcards-subject-results">{filteredSubjects.length} materie trovate</span>
      </div>
      <div className="flashcards-subject-count"><strong>{total.toLocaleString('it-IT')}</strong><span>carte disponibili</span></div>
    </div>
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
        <div className="flashcards-progress-label"><span>Carta {Math.min(index + 1, progressTotal)} di {progressTotal}{!unlocked && total > FREE_LIMIT ? ' · Anteprima gratuita' : ''}</span><span>{easyCount} memorizzate</span></div>
        <div className="flashcards-progress-track"><span style={{width: `${Math.min(100, ((index + 1) / Math.max(1, progressTotal)) * 100)}%`}}/></div>
      </div>
      <div className="flashcard-stage">
        <div ref={cardRef} className={`flashcard-3d ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(v => !v)} role="button" tabIndex={0} aria-label={flipped ? 'Mostra la domanda' : 'Gira la flashcard'} onKeyDown={e => { if (e.key === 'Enter') setFlipped(v => !v) }}>
          <div className="flashcard-face flashcard-front"><span className="flashcard-kicker">DOMANDA</span><div className="flashcard-copy">{current.question_front}</div><span className="flashcard-hint">Tocca la carta per rivelare la risposta · SPAZIO</span></div>
          <div className="flashcard-face flashcard-back"><span className="flashcard-kicker">RISPOSTA CORRETTA</span><div className="flashcard-copy">{current.answer_back}</div>{current.explanation && <p className="flashcard-explanation">{current.explanation}</p>}<span className="flashcard-hint">Come hai ricordato questo concetto?</span></div>
        </div>
      </div>
      {flipped && <div className="flashcard-ratings">
        <button className="rating-difficult" onClick={() => void rate('difficult')}>Difficile</button>
        <button className="rating-medium" onClick={() => void rate('medium')}>Media</button>
        <button className="rating-easy" onClick={() => void rate('easy')}><Check size={15}/> Facile</button>
      </div>}
      <div className="flashcards-controls">
        <button className="secondary" disabled={index===0} onClick={() => {setIndex(v=>v-1);setFlipped(false)}}><ArrowLeft size={15}/> Precedente</button>
        <button className="primary" onClick={() => void next()} disabled={loading}>{flipped ? 'Prossima carta' : 'Gira la carta'} <ArrowRight size={15}/></button>
      </div>
      {unlocked && <div className="flashcards-deck-actions"><button className="secondary" onClick={shuffle}><Shuffle size={15}/> Mescola</button><button className={deckMode==='difficult'?'primary':'secondary'} onClick={() => {setDeckMode(v=>v==='difficult'?'all':'difficult');setIndex(0);setFlipped(false);setDeckCompleted(false)}}>Solo da ripassare</button></div>}
      {showAds && <div className="flashcards-ad-slot flashcards-ad-slot-bottom" data-sml-ad-slot="flashcards-bottom" aria-label="Spazio pubblicitario" />}
      <p className="flashcards-footnote">{user ? 'I tuoi progressi vengono salvati sul tuo account.' : 'Puoi provare gratuitamente senza registrazione. Accedi per salvare le valutazioni.'}</p>
    </>}
    {!loading && deckCompleted && !paywall && <StudyCompletion
      eyebrow={deckMode === 'difficult' ? 'RIPASSO COMPLETATO' : 'SESSIONE COMPLETATA'}
      title={deckMode === 'difficult' ? 'Hai ripassato tutte le carte difficili.' : 'Ottimo lavoro: hai completato tutte le flashcard.'}
      description={deckMode === 'difficult' ? 'Non restano altre carte contrassegnate come difficili in questa sessione. Puoi tornare al mazzo completo oppure continuare con un quiz.' : 'Hai terminato il materiale disponibile per questa materia. I tuoi progressi e le valutazioni restano salvati.'}
      meta={`${total.toLocaleString('it-IT')} carte disponibili · ${easyCount} facili · ${difficultCount} da ripassare`}
      primaryLabel={deckMode === 'difficult' ? 'Torna a tutte le flashcard' : 'Ricomincia le flashcard'}
      onPrimary={() => { if (deckMode === 'difficult') setDeckMode('all'); setIndex(0); setFlipped(false); setDeckCompleted(false) }}
      secondaryLabel="Fai un quiz su questa materia"
      onSecondary={() => { if (selectedSubject) onStartQuiz?.(selectedSubject.id) }}
    />}
    {!loading && total===0 && <div className="panel empty">Non ci sono ancora flashcard disponibili per questa materia.</div>}
    {!loading && total>0 && deckMode==='difficult' && displayedCards.length===0 && !paywall && <div className="panel empty">Non hai carte difficili da ripassare. <button className="simple-link" onClick={()=>setDeckMode('all')}>Torna a tutte le flashcard</button></div>}
    {paywall && <div className="flashcards-paywall-backdrop"><div className="flashcards-paywall panel">
      <div className="flashcards-paywall-icon"><CreditCard size={22}/></div><span className="eyebrow">ANTEPRIMA COMPLETATA</span>
      <h2>Hai completato le 50 flashcard gratuite di anteprima!</h2>
      <p>Sblocca tutte le {total.toLocaleString('it-IT')} flashcard e tutti i quiz disponibili di <strong>{title}</strong>, comprese le nuove aggiunte in futuro, per sempre a soli <strong>1,99 €</strong> (pagamento unico, zero abbonamenti).</p>
      <label className="flashcards-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Acconsento alla fornitura immediata dei contenuti digitali e riconosco la perdita del diritto di recesso nei limiti previsti dalla legge.</label>
      <button className="primary flashcards-unlock" disabled={!consent} onClick={() => onBuy(PRICE_ID,[subjectId],true)}>Sblocca per sempre · 1,99 € <CreditCard size={16}/></button>
      {!user && <p className="flashcards-login-note">Per completare l'acquisto dovrai accedere o creare un account.</p>}
      <button className="simple-link" onClick={() => setPaywall(false)}>Torna alle flashcard</button>
    </div></div>}
  </section>
}
