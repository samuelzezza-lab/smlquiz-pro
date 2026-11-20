import { useMemo, useState } from 'react'
import StudyApp from './StudyApp'
import {
  ArrowRight, BookOpen, Brain, Check, ChevronDown, CircleHelp, Clock3,
  GraduationCap, Layers3, LayoutDashboard, Menu, Search,
  Sparkles, Target, X
} from 'lucide-react'

type Section = 'home' | 'quiz' | 'flashcards' | 'semester' | 'path'

const faculties = [
  'Medicina e Chirurgia', 'Odontoiatria e Protesi Dentaria', 'Medicina Veterinaria',
  'Farmacia', 'Biotecnologie', 'Biologia', 'Chimica', 'Fisica', 'Matematica',
  'Informatica', 'Ingegneria', 'Architettura', 'Economia', 'Giurisprudenza',
  'Scienze Politiche', 'Psicologia', 'Scienze della Formazione', 'Lettere',
  'Filosofia', 'Lingue e Letterature', 'Scienze della Comunicazione',
  'Scienze Motorie', 'Agraria', 'Professioni Sanitarie', 'Scienze Naturali'
]

const subjectsByFaculty: Record<string, string[]> = {
  'Medicina e Chirurgia': ['Anatomia I', 'Biologia', 'Chimica e Propedeutica Biochimica', 'Fisica medica', 'Istologia', 'Fisiologia'],
  'Odontoiatria e Protesi Dentaria': ['Anatomia', 'Biologia', 'Chimica', 'Istologia', 'Fisiologia'],
  'Medicina Veterinaria': ['Anatomia', 'Biologia', 'Chimica', 'Istologia', 'Fisiologia'],
  'Ingegneria': ['Analisi matematica I', 'Geometria', 'Fisica I', 'Informatica', 'Chimica'],
  'Economia': ['Microeconomia', 'Matematica generale', 'Economia aziendale', 'Statistica'],
  'Giurisprudenza': ['Diritto privato', 'Diritto costituzionale', 'Filosofia del diritto', 'Diritto romano']
}

const sectionInfo: Record<Exclude<Section, 'home'>, { title: string; subtitle: string; icon: typeof Brain }> = {
  quiz: { title: 'Quiz universitari', subtitle: 'Mettiti alla prova con domande mirate al tuo programma.', icon: Brain },
  flashcards: { title: 'Flashcard', subtitle: 'Ripassa definizioni, concetti e collegamenti in modo attivo.', icon: Layers3 },
  semester: { title: 'Semestre filtro', subtitle: 'Uno spazio dedicato alla preparazione e al ripasso degli argomenti.', icon: Target },
  path: { title: 'Il mio percorso', subtitle: 'Organizza il tuo studio partendo da facoltà, anno e materia.', icon: GraduationCap }
}

function PublicHome() {
 return <div className="public-site">
  <header className="public-header"><a className="public-brand" href="/"><span className="public-mark">S<span>.</span></span>SMLQUIZ <b>PRO</b></a><nav><a href="/come-funziona/">Come funziona</a><a href="/materie/">Materie</a><a href="/guide/">Guide di studio</a></nav><a className="public-login" href="/app/">Entra nella piattaforma <ArrowRight size={15}/></a></header>
  <main>
   <section className="public-hero"><div><div className="public-eyebrow">IL TUO SPAZIO PER LO STUDIO UNIVERSITARIO</div><h1>Preparati agli esami.<br/><em>Con metodo, non a caso.</em></h1><p>SMLQUIZ Pro riunisce strumenti di esercitazione, ripasso e organizzazione dello studio. Scegli la materia, individua ciò che devi migliorare e trasforma ogni sessione in un passo concreto verso l'esame.</p><div className="public-actions"><a className="public-primary" href="/app/">Inizia a studiare <ArrowRight size={17}/></a><a href="/come-funziona/">Scopri come funziona</a></div><div className="public-proof"><span>✓ Percorsi per materia</span><span>✓ Ripasso attivo</span><span>✓ Feedback ragionato</span></div></div><div className="public-art"><div className="public-art-book"><BookOpen size={56}/><b>STUDY<br/>SMARTER</b></div><span className="art-label label-a">Allenamento mirato</span><span className="art-label label-b">Obiettivi chiari</span></div></section>
   <section className="public-intro"><div><small>UN METODO PIÙ CHIARO</small><h2>Non solo domande.<br/>Un percorso per imparare.</h2></div><p>Un quiz può misurare una risposta. Un buon percorso di studio ti aiuta a capire perché hai sbagliato, cosa ripassare e quale argomento affrontare dopo. Per questo SMLQUIZ Pro mette in relazione esercitazioni, spiegazioni e strumenti di ripasso.</p></section>
   <section className="public-tools"><a href="/app/"><span>01 / ESERCITATI</span><Brain/><h3>Quiz universitari</h3><p>Domande a risposta multipla per allenare conoscenze e ragionamento. La revisione finale aiuta a comprendere gli errori.</p><b>Apri la piattaforma →</b></a><a href="/app/"><span>02 / RIPASSA</span><Layers3/><h3>Flashcard</h3><p>Richiama attivamente definizioni e concetti, distingui ciò che ricordi da ciò che richiede un altro ripasso.</p><b>Scopri gli strumenti →</b></a><a href="/preparazione-semestre-filtro/"><span>03 / PREPARATI</span><GraduationCap/><h3>Semestre filtro</h3><p>Un'area dedicata a Biologia, Chimica e Fisica, con simulazioni e revisione dei risultati.</p><b>Vai alla preparazione →</b></a></section>
   <section className="public-guides"><div className="public-guides-head"><div><small>RISORSE PER STUDIARE MEGLIO</small><h2>Guide, metodo e approfondimenti</h2></div><a href="/guide/">Tutte le guide →</a></div><div className="public-guide-grid"><a href="/guide/metodo-di-studio-universitario/"><small>METODO DI STUDIO</small><h3>Come costruire un metodo di studio universitario sostenibile</h3><p>Pianificazione, richiamo attivo, ripetizione dilazionata e verifica.</p>Leggi la guida →</a><a href="/guide/come-preparare-un-esame-universitario/"><small>PREPARAZIONE ESAMI</small><h3>Come preparare un esame universitario</h3><p>Un piano concreto dalla prima lettura alla simulazione.</p>Leggi la guida →</a><a href="/guide/anatomia-1/"><small>MEDICINA · ANATOMIA</small><h3>Come affrontare Anatomia I</h3><p>Orientarsi tra strutture, sistemi e rapporti anatomici.</p>Leggi la guida →</a></div></section>
   <section className="public-cta"><div><small>IL PROSSIMO PASSO È TUO</small><h2>Organizza il tuo studio.<br/><em>Inizia dalla tua materia.</em></h2><p>Accedi alla piattaforma e seleziona facoltà, anno e insegnamento.</p></div><a className="public-primary" href="/app/">Apri SMLQUIZ Pro <ArrowRight size={17}/></a></section>
  </main>
  <footer className="public-footer"><div><a className="public-brand" href="/">SMLQUIZ <b>PRO</b></a><p>Strumenti e risorse per organizzare lo studio universitario con metodo.</p></div><div><b>Esplora</b><a href="/come-funziona/">Come funziona</a><a href="/materie/">Materie</a><a href="/guide/">Guide di studio</a><a href="/app/">Piattaforma</a></div><div><b>Informazioni</b><a href="/chi-siamo/">Chi siamo</a><a href="/contatti/">Contatti</a><a href="/privacy/">Privacy Policy</a><a href="/cookie/">Cookie Policy</a><a href="/termini/">Termini d'uso</a></div><small>© 2026 SMLQUIZ Pro · Progetto indipendente per lo studio universitario.</small></footer>
 </div>
}
export default function App() {
 if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) return <StudyApp/>
 return <PublicHome/>
}
