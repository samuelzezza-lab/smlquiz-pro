import { ArrowUpRight, BookOpen, Layers3, Sparkles } from 'lucide-react'

export default function App() {
  return (
    <main className="page">
      <header className="topbar">
        <a className="brand" href="/" aria-label="SMLQUIZ Pro home">
          <span className="brand-mark">S<span>.</span></span>
          <span>SMLQUIZ <b>PRO</b></span>
        </a>
        <span className="status"><i /> NUOVO PROGETTO</span>
      </header>

      <section className="hero">
        <div className="eyebrow"><Sparkles size={15} /> UNA NUOVA ESPERIENZA UNIVERSITARIA</div>
        <h1>Il prossimo modo<br />di <em>studiare</em> inizia qui.</h1>
        <p className="intro">Stiamo costruendo SMLQUIZ Pro da zero. Un ambiente chiaro e intuitivo, con strumenti potenti per accompagnare ogni percorso universitario.</p>
        <div className="principle">SEMPLICITÀ FUORI <span>·</span> POTENZA DENTRO</div>
        <div className="preview-grid" aria-label="Aree del nuovo progetto">
          <article><div className="tile-icon"><BookOpen size={20}/></div><h2>Il tuo percorso</h2><p>Un punto di partenza semplice, organizzato intorno al tuo corso di studi.</p></article>
          <article><div className="tile-icon"><Layers3 size={20}/></div><h2>Strumenti di studio</h2><p>Funzioni progettate per essere immediate, senza rinunciare alla profondità.</p></article>
          <article><div className="tile-icon"><Sparkles size={20}/></div><h2>Un progetto nuovo</h2><p>Ogni schermata verrà definita e costruita con una nuova identità.</p></article>
        </div>
        <div className="footnote">LA NUOVA PIATTAFORMA È IN FASE DI PROGETTAZIONE <ArrowUpRight size={14}/></div>
      </section>
      <footer>© {new Date().getFullYear()} SMLQUIZ Pro</footer>
    </main>
  )
}
