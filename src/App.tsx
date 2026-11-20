import { useEffect } from 'react'
import StudyApp from './StudyApp'
import { supabase } from './lib/supabase'
import { ArrowRight, BookOpen, Brain, GraduationCap, Layers3 } from 'lucide-react'

function platformUrl(mode?: 'quiz'|'flashcards'|'semester') {
 const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
 params.set('app', '1')
 if (mode) params.set('mode', mode)
 return '/?' + params.toString()
}

function PublicHome() {
 useEffect(() => {
  let active = true
  if (!supabase) return
  supabase.auth.getSession().then(({ data }) => {
   if (active && data.session) window.location.replace(platformUrl())
  }).catch(() => {})
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
   if (active && session) window.location.replace(platformUrl())
  })
  return () => { active = false; data.subscription.unsubscribe() }
 }, [])
 return <div className="public-site">
  <header className="public-header"><a className="public-brand" href="/"><span className="public-mark">S<span>.</span></span>SMLQUIZ <b>PRO</b></a><nav><a href="/come-funziona/">Come funziona</a><a href="/materie/">Materie</a><a href="/guide/">Guide di studio</a></nav><a className="public-login" href={platformUrl()}>Accedi <ArrowRight size={15}/></a></header>
  <main>
   <section className="public-hero"><div><div className="public-eyebrow">IL TUO SPAZIO PER LO STUDIO UNIVERSITARIO</div><h1>Preparati agli esami.<br/><em>Con metodo, non a caso.</em></h1><p>SMLQUIZ Pro riunisce strumenti di esercitazione, ripasso e organizzazione dello studio. Scegli la materia, individua ciò che devi migliorare e trasforma ogni sessione in un passo concreto verso l'esame.</p><div className="public-actions"><a className="public-primary" href={platformUrl()}>Inizia a studiare <ArrowRight size={17}/></a><a href="/come-funziona/">Scopri come funziona</a></div><div className="public-proof"><span>✓ Percorsi per materia</span><span>✓ Ripasso attivo</span><span>✓ Feedback ragionato</span></div></div><div className="public-art"><div className="public-art-book"><BookOpen size={56}/><b>STUDY<br/>SMARTER</b></div><span className="art-label label-a">Allenamento mirato</span><span className="art-label label-b">Obiettivi chiari</span></div></section>
   <section className="public-intro"><div><small>UN METODO PIÙ CHIARO</small><h2>Non solo domande.<br/>Un percorso per imparare.</h2></div><p>Un quiz può misurare una risposta. Un buon percorso di studio ti aiuta a capire perché hai sbagliato, cosa ripassare e quale argomento affrontare dopo. Per questo SMLQUIZ Pro mette in relazione esercitazioni, spiegazioni e strumenti di ripasso.</p></section>
   <section className="public-tools"><a href={platformUrl('quiz')}><span>01 / ESERCITATI</span><Brain/><h3>Quiz universitari</h3><p>Domande a risposta multipla per allenare conoscenze e ragionamento. La revisione finale aiuta a comprendere gli errori.</p><b>Apri SMLQUIZ Pro →</b></a><a href={platformUrl('flashcards')}><span>02 / RIPASSA</span><Layers3/><h3>Flashcard</h3><p>Richiama attivamente definizioni e concetti, distingui ciò che ricordi da ciò che richiede un altro ripasso.</p><b>Scopri gli strumenti →</b></a><a href={platformUrl('semester')}><span>03 / PREPARATI</span><GraduationCap/><h3>Semestre filtro</h3><p>Un'area dedicata a Biologia, Chimica e Fisica, con simulazioni e revisione dei risultati.</p><b>Vai alla preparazione →</b></a></section>
   <section className="public-guides"><div className="public-guides-head"><div><small>RISORSE PER STUDIARE MEGLIO</small><h2>Guide, metodo e approfondimenti</h2></div><a href="/guide/">Tutte le guide →</a></div><div className="public-guide-grid"><a href="/guide/metodo-di-studio-universitario/"><small>METODO DI STUDIO</small><h3>Come costruire un metodo di studio universitario sostenibile</h3><p>Pianificazione, richiamo attivo, ripetizione dilazionata e verifica.</p>Leggi la guida →</a><a href="/guide/come-preparare-un-esame-universitario/"><small>PREPARAZIONE ESAMI</small><h3>Come preparare un esame universitario</h3><p>Un piano concreto dalla prima lettura alla simulazione.</p>Leggi la guida →</a><a href="/guide/anatomia-1/"><small>MEDICINA · ANATOMIA</small><h3>Come affrontare Anatomia I</h3><p>Orientarsi tra strutture, sistemi e rapporti anatomici.</p>Leggi la guida →</a></div></section>
   <section className="public-cta"><div><small>IL PROSSIMO PASSO È TUO</small><h2>Organizza il tuo studio.<br/><em>Inizia dalla tua materia.</em></h2><p>Accedi a SMLQUIZ Pro e seleziona facoltà, anno e insegnamento.</p></div><a className="public-primary" href={platformUrl()}>Apri SMLQUIZ Pro <ArrowRight size={17}/></a></section>
  </main>
  <footer className="public-footer"><div><a className="public-brand" href="/">SMLQUIZ <b>PRO</b></a><p>Strumenti e risorse per organizzare lo studio universitario con metodo.</p></div><div><b>Esplora</b><a href="/come-funziona/">Come funziona</a><a href="/materie/">Materie</a><a href="/guide/">Guide di studio</a><a href={platformUrl()}>Accedi</a></div><div><b>Informazioni</b><a href="/chi-siamo/">Chi siamo</a><a href="/contatti/">Contatti</a><a href="/privacy/">Privacy Policy</a><a href="/cookie/">Cookie Policy</a><a href="/termini/">Termini d'uso</a></div><small>© 2026 SMLQUIZ Pro · Tutti i diritti riservati. Quiz, domande, risposte, spiegazioni e flashcard non possono essere copiati, estratti o redistribuiti senza autorizzazione. <a href="/termini/">Termini d’uso</a>.</small></footer>
 </div>
}
export default function App() {
 useEffect(() => {
  const previousRestoration = window.history.scrollRestoration
  const scrollToPageTop = () => {
   window.scrollTo(0, 0)
   document.querySelector('.app-shell .content')?.scrollTo(0, 0)
   window.requestAnimationFrame(() => {
    window.scrollTo(0, 0)
    document.querySelector('.app-shell .content')?.scrollTo(0, 0)
   })
  }
  window.history.scrollRestoration = 'manual'
  scrollToPageTop()
  window.addEventListener('pageshow', scrollToPageTop)
  window.addEventListener('popstate', scrollToPageTop)
  return () => {
   window.history.scrollRestoration = previousRestoration
   window.removeEventListener('pageshow', scrollToPageTop)
   window.removeEventListener('popstate', scrollToPageTop)
  }
 }, [])
 if (typeof window !== 'undefined' && (window.location.pathname.startsWith('/app') || new URLSearchParams(window.location.search).get('app') === '1')) return <StudyApp/>
 return <PublicHome/>
}
