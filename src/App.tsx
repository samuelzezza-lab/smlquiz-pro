import { useMemo, useState } from 'react'
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

export default function App() {
  const [section, setSection] = useState<Section>('home')
  const [faculty, setFaculty] = useState('Medicina e Chirurgia')
  const [year, setYear] = useState('1')
  const [subject, setSubject] = useState('Anatomia I')
  const [confirmed, setConfirmed] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [notice, setNotice] = useState('')

  const subjects = useMemo(() => subjectsByFaculty[faculty] ?? [], [faculty])

  function chooseFaculty(value: string) {
    setFaculty(value)
    setSubject(subjectsByFaculty[value]?.[0] ?? '')
    setConfirmed(false)
  }

  function openSection(next: Section) {
    setSection(next)
    setMobileMenu(false)
    setNotice('')
  }

  function startTool(next: Section) {
    if (!confirmed) {
      setNotice('Conferma prima il tuo percorso di studio.')
      return
    }
    openSection(next)
  }

  const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'home', label: 'Panoramica', icon: LayoutDashboard },
    { id: 'quiz', label: 'Quiz', icon: Brain },
    { id: 'flashcards', label: 'Flashcard', icon: Layers3 },
    { id: 'semester', label: 'Semestre filtro', icon: Target },
    { id: 'path', label: 'Il mio percorso', icon: GraduationCap }
  ]

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <a className="brand" href="/" onClick={e => { e.preventDefault(); openSection('home') }}>
          <span className="brand-symbol">S<span>.</span></span>
          <span className="brand-name">SMLQUIZ <b>PRO</b></span>
        </a>
        <div className="side-caption">IL TUO SPAZIO UNIVERSITARIO</div>
        <nav className="side-nav" aria-label="Navigazione principale">
          {navItems.map(item => {
            const Icon = item.icon
            return <button key={item.id} className={`nav-link ${section === item.id ? 'active' : ''}`} onClick={() => openSection(item.id)}>
              <Icon size={18} strokeWidth={1.8}/><span>{item.label}</span>{section === item.id && <span className="active-mark"/>}
            </button>
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><Sparkles size={17}/><strong>Studia con metodo.</strong><p>Un percorso chiaro, strumenti mirati, un passo alla volta.</p></div>
          <div className="sidebar-foot">© 2026 SMLQUIZ Pro</div>
        </div>
      </aside>

      {mobileMenu && <button className="mobile-scrim" aria-label="Chiudi menu" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label={mobileMenu ? 'Chiudi menu' : 'Apri menu'}>{mobileMenu ? <X size={21}/> : <Menu size={21}/>}</button>
          <div className="breadcrumb"><span>Area universitaria</span><b>/</b><strong>{navItems.find(n => n.id === section)?.label}</strong></div>
          <div className="topbar-right"><span className="status-dot"/><span>Il tuo spazio di studio</span><div className="avatar">S</div></div>
        </header>

        {section === 'home' ? (
          <div className="content home-content">
            <section className="welcome-row">
              <div><div className="eyebrow"><Sparkles size={14}/> BENVENUTO IN SMLQUIZ PRO</div><h1>Studiare meglio,<br/><em>partendo da qui.</em></h1><p className="welcome-copy">Tutto quello che ti serve per preparare il tuo percorso universitario, in un unico spazio semplice da usare.</p></div>
              <div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-core"><BookOpen size={43}/><Sparkles className="art-spark" size={18}/></div><span className="art-dot dot-a"/><span className="art-dot dot-b"/></div>
            </section>

            <section className="path-panel">
              <div className="panel-heading"><div><span className="section-kicker">01 / IL TUO PERCORSO</span><h2>Da dove vuoi iniziare?</h2><p>Seleziona il tuo corso di studi e la materia da preparare.</p></div><div className="panel-icon"><GraduationCap size={21}/></div></div>
              <div className="selection-grid">
                <label className="field"><span>Facoltà</span><div className="select-wrap"><select value={faculty} onChange={e => chooseFaculty(e.target.value)}>{faculties.map(f => <option key={f}>{f}</option>)}</select><ChevronDown size={16}/></div></label>
                <label className="field"><span>Anno</span><div className="select-wrap"><select value={year} onChange={e => {setYear(e.target.value);setConfirmed(false)}}>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}° anno</option>)}</select><ChevronDown size={16}/></div></label>
                <label className="field subject-field"><span>Materia</span><div className="select-wrap subject-wrap"><input list="subject-options" value={subject} onChange={e => {setSubject(e.target.value);setConfirmed(false)}} placeholder="Scrivi o cerca una materia"/><datalist id="subject-options">{subjects.map(s => <option key={s} value={s}/>)}</datalist><Search size={16}/></div></label>
                <button className={`confirm-button ${confirmed ? 'confirmed' : ''}`} onClick={() => {if (!subject.trim()) {setNotice('Inserisci una materia per continuare.');return}setConfirmed(true);setNotice('Percorso confermato. Ora scegli lo strumento con cui vuoi studiare.')}}>{confirmed ? <><Check size={17}/> Percorso confermato</> : <>Conferma scelta <ArrowRight size={17}/></>}</button>
              </div>
              {notice && <div className={`notice ${confirmed ? 'notice-success' : ''}`}>{notice}</div>}
              {confirmed && <div className="confirmed-summary"><Check size={15}/><span>{faculty}</span><b>·</b><span>{year}° anno</span><b>·</b><strong>{subject}</strong></div>}
            </section>

            <section className="tools-section">
              <div className="tools-heading"><div><span className="section-kicker">02 / SCEGLI IL TUO STRUMENTO</span><h2>Come vuoi studiare?</h2></div><span className="tools-hint">Tre modi per prepararti</span></div>
              <div className="tool-grid">
                <button className="tool-card" onClick={() => startTool('quiz')}><div className="tool-top"><span className="tool-icon quiz-icon"><Brain size={21}/></span><span className="tool-number">01</span></div><h3>Quiz</h3><p>Allenati con domande a risposta multipla e verifica la tua preparazione.</p><span className="tool-action">Vai ai quiz <ArrowRight size={16}/></span></button>
                <button className="tool-card" onClick={() => startTool('flashcards')}><div className="tool-top"><span className="tool-icon cards-icon"><Layers3 size={21}/></span><span className="tool-number">02</span></div><h3>Flashcard</h3><p>Memorizza i concetti chiave con un ripasso attivo e organizzato.</p><span className="tool-action">Apri flashcard <ArrowRight size={16}/></span></button>
                <button className="tool-card" onClick={() => startTool('semester')}><div className="tool-top"><span className="tool-icon target-icon"><Target size={21}/></span><span className="tool-number">03</span></div><h3>Semestre filtro</h3><p>Concentrati sugli argomenti e sugli obiettivi della preparazione.</p><span className="tool-action">Entra nell'area <ArrowRight size={16}/></span></button>
              </div>
            </section>
            <div className="bottom-note"><CircleHelp size={15}/><span>Puoi cambiare facoltà, anno e materia in qualsiasi momento.</span><button onClick={() => openSection('path')}>Gestisci percorso <ArrowRight size={14}/></button></div>
          </div>
        ) : (
          <div className="content inner-content">
            <div className="inner-heading"><div className="inner-icon">{(() => {const Icon = sectionInfo[section].icon;return <Icon size={25}/>})()}</div><div><span className="section-kicker">AREA DI STUDIO</span><h1>{sectionInfo[section].title}</h1><p>{sectionInfo[section].subtitle}</p></div></div>
            <div className="workspace-card">
              <div className="workspace-label"><span className="status-dot"/> IL TUO PERCORSO SELEZIONATO</div>
              {confirmed ? <div className="workspace-path"><strong>{faculty}</strong><span>{year}° anno</span><span>{subject}</span></div> : <div className="empty-path"><p>Non hai ancora confermato un percorso di studio.</p><button onClick={() => openSection('home')}>Scegli il percorso <ArrowRight size={16}/></button></div>}
              <div className="workspace-divider"/>
              <h2>{sectionInfo[section].title}: area in preparazione</h2>
              <p>La nuova interfaccia è pronta per questa sezione. Stiamo collegando la banca dati e le funzioni di studio, così da offrirti contenuti reali e coerenti con la materia selezionata.</p>
              <button className="back-button" onClick={() => openSection('home')}>Torna alla panoramica</button>
            </div>
            <div className="quality-note"><Clock3 size={17}/><span>Stiamo costruendo questa funzione con attenzione alla qualità dei contenuti. Non mostreremo quiz vuoti o domande casuali fuori programma.</span></div>
          </div>
        )}
      </main>
    </div>
  )
}
