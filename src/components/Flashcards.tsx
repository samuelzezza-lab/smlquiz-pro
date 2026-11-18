import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CreditCard, RotateCcw, Shuffle, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Subject = { id: string; nome: string; traduzioni?: Record<string, { nome?: string }> }
type Flashcard = { id: string; subject_id: string; question_front: string; answer_back: string; explanation: string | null; order_index: number; quiz_number: number | null; user_rating?: 'difficult'|'medium'|'easy'|null }
type Props = {
  subjects: Subject[]
  user: { id: string } | null
  onBuy: (priceId: string, subjectIds: string[], consentConfirmed: boolean) => void
  notify: (message: string) => void
}
const PRICE_ID = 'price_1UdBxFBCybXKHSfRwLeImDFx'
const FREE_LIMIT = 50

export default function Flashcards({ subjects, user, onBuy, notify }: Props) {
  const [subjectId, setSubjectId] = useState('')
  const [cards, setCards] = useState<Flashcard[]>([])
  const [total, setTotal] = useState(0)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const [loading, setLoading] = useState(false)
  const [consent, setConsent] = useState(false)
  const [ratings, setRatings] = useState<Record<string, 'difficult'|'medium'|'easy'>>({})
  const [deckMode, setDeckMode] = useState<'all'|'difficult'>('all')
  const cardRef = useRef<HTMLDivElement>(null)
  const selectedSubject = useMemo(() => subjects.find(s => s.id === subjectId), [subjects, subjectId])
  const displayedCards = useMemo(() => deckMode === 'difficult'
    ? cards.filter(card => (ratings[card.id] ?? card.user_rating) === 'difficult')
    : cards, [cards, deckMode, ratings])
  const current = displayedCards[index]
  const easyCount = cards.filter(card => (ratings[card.id] ?? card.user_rating) === 'easy').length
  const title = selectedSubject?.traduzioni?.it?.nome || selectedSubject?.nome || 'Flashcard'

  const loadDeck = useCallback(async (id: string) => {
    if (!supabase || !id) return
    setLoading(true); setCards([]); setIndex(0); setFlipped(false); setPaywall(false); setUnlocked(false); setRatings({}); setDeckMode('all')
    try {
      const { data, error } = await supabase.functions.invoke('flashcards-api', { body: { subjectId: id, offset: 0, limit: FREE_LIMIT } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setCards((data?.cards ?? []) as Flashcard[])
      setTotal(Number(data?.total_cards ?? 0))
      setUnlocked(data?.unlocked === true)
      setPaywall(data?.paywall === true && (data?.cards?.length ?? 0) === 0)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossibile caricare le flashcard.')
    } finally { setLoading(false) }
  }, [notify])

  useEffect(() => {
    if (!subjectId && subjects.length) setSubjectId(subjects[0].id)
  }, [subjectId, subjects])
  useEffect(() => { if (subjectId) void loadDeck(subjectId) }, [subjectId, loadDeck])

  const next = async () => {
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
      } catch (err) { notify(err instanceof Error ? err.message : 'Errore nel caricamento delle altre carte.') }
      finally { setLoading(false) }
    }
  }

  const rate = async (rating: 'difficult'|'medium'|'easy') => {
    if (!current) return
    setRatings(prev => ({ ...prev, [current.id]: rating }))
    if (user && supabase) {
      const { error } = await supabase.functions.invoke('flashcards-api', { body: { action: 'rate', subjectId, flashcardId: current.id, rating } })
      if (error) notify('Valutazione non sincronizzata: riprova quando sei online.')
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
    setIndex(0); setFlipped(false); setDeckMode('all')
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
  }, [current, flipped, index, paywall, displayedCards.length, unlocked, cards.length, total])

  return <section className="content flashcards-page">
    <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14}/> RIPASSO ATTIVO</div><h1>Flashcard</h1><p>Ripassa una materia alla volta: domanda davanti, risposta corretta e spiegazione dietro.</p></div></div>
    <div className="panel flashcards-toolbar">
      <label htmlFor="flashcards-subject">Materia</label>
      <select id="flashcards-subject" value={subjectId} onChange={e => setSubjectId(e.target.value)}>
        {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.traduzioni?.it?.nome || subject.nome}</option>)}
      </select>
      <span className="flashcards-total">{total.toLocaleString('it-IT')} carte disponibili</span>
    </div>
    {loading && <div className="panel empty">Caricamento flashcard…</div>}
    {!loading && cards.length > 0 && !paywall && current && <>
      <div className="flashcards-progress">
        <div className="flashcards-progress-label"><span>Carta {index + 1} di {unlocked ? total : Math.min(total, FREE_LIMIT)}{!unlocked && total > FREE_LIMIT ? ' · Anteprima gratuita' : ''}</span><span>{easyCount} memorizzate</span></div>
        <div className="flashcards-progress-track"><span style={{width: `${Math.min(100, ((index + 1) / (unlocked ? total : Math.min(total, FREE_LIMIT))) * 100)}%`}}/></div>
      </div>
      <div className="flashcard-stage">
        <div ref={cardRef} className={`flashcard-3d ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(v => !v)} role="button" tabIndex={0} aria-label={flipped ? 'Mostra la domanda' : 'Gira la flashcard'} onKeyDown={e => { if (e.key === 'Enter') setFlipped(v => !v) }}>
          <div className="flashcard-face flashcard-front"><span className="flashcard-kicker">DOMANDA</span><div className="flashcard-copy">{current.question_front}</div><span className="flashcard-hint">Tocca per vedere la risposta · Spazio</span></div>
          <div className="flashcard-face flashcard-back"><span className="flashcard-kicker">RISPOSTA CORRETTA</span><div className="flashcard-copy">{current.answer_back}</div>{current.explanation && <p className="flashcard-explanation">{current.explanation}</p>}<span className="flashcard-hint">Valuta quanto la ricordi qui sotto</span></div>
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
      {unlocked && <div className="flashcards-deck-actions"><button className="secondary" onClick={shuffle}><Shuffle size={15}/> Mescola</button><button className={deckMode==='difficult'?'primary':'secondary'} onClick={() => {setDeckMode(v=>v==='difficult'?'all':'difficult');setIndex(0);setFlipped(false)}}>Solo da ripassare</button></div>}
      <p className="flashcards-footnote">{user ? 'I tuoi progressi vengono salvati sul tuo account.' : 'Puoi provare gratuitamente senza registrazione. Accedi per salvare le valutazioni.'}</p>
    </>}
    {!loading && total===0 && <div className="panel empty">Non ci sono ancora flashcard disponibili per questa materia.</div>}
    {paywall && <div className="flashcards-paywall-backdrop"><div className="flashcards-paywall panel">
      <div className="flashcards-paywall-icon"><CreditCard size={22}/></div><span className="eyebrow">ANTEPRIMA COMPLETATA</span>
      <h2>Hai completato le 50 flashcard gratuite di anteprima!</h2>
      <p>Sblocca tutte le {total.toLocaleString('it-IT')} flashcard e i quiz completi di <strong>{title}</strong> per sempre a soli <strong>1,99 €</strong> (pagamento unico, zero abbonamenti).</p>
      <label className="flashcards-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Acconsento alla fornitura immediata dei contenuti digitali e riconosco la perdita del diritto di recesso nei limiti previsti dalla legge.</label>
      <button className="primary flashcards-unlock" disabled={!consent} onClick={() => onBuy(PRICE_ID,[subjectId],true)}>Sblocca per sempre · 1,99 € <CreditCard size={16}/></button>
      {!user && <p className="flashcards-login-note">Per completare l'acquisto dovrai accedere o creare un account.</p>}
      <button className="simple-link" onClick={() => setPaywall(false)}>Torna alle flashcard</button>
    </div></div>}
  </section>
}
