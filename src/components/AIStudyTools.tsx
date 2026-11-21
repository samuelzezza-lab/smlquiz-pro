import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { ArrowLeft, FileText, GitBranch, Headphones, LoaderCircle, Pause, Play, Sparkles, Upload, Volume2 } from 'lucide-react'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type Mode = 'riassunto' | 'mappa' | 'quiz'
const MAX_TEXT = 30_000
const workerUrl = (import.meta.env.VITE_AI_WORKER_URL as string | undefined)?.trim() || ''

export default function AIStudyTools() {
  const [mode, setMode] = useState<Mode>('riassunto')
  const [source, setSource] = useState('')
  const [fileName, setFileName] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const mapSvg = useRef<SVGSVGElement>(null)
  const markmapInstance = useRef<ReturnType<typeof Markmap.create> | null>(null)

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()
      markmapInstance.current?.destroy()
    }
  }, [])

  useEffect(() => {
    if (mode !== 'mappa' || !output || !mapSvg.current) return
    let cancelled = false
    const render = async () => {
      try {
        const transformer = new Transformer()
        const { root } = transformer.transform(output)
        markmapInstance.current?.destroy()
        if (cancelled || !mapSvg.current) return
        markmapInstance.current = Markmap.create(mapSvg.current, { autoFit: true, duration: 300 }, root)
        await markmapInstance.current.fit()
      } catch {
        setError('Non è stato possibile visualizzare la mappa. Riprova a generarla.')
      }
    }
    void render()
    return () => { cancelled = true; markmapInstance.current?.destroy(); markmapInstance.current = null }
  }, [mode, output])

  function stopSpeech() {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }

  function readAloud() {
    if (!output || !('speechSynthesis' in window)) {
      setError('La lettura vocale non è supportata da questo browser.')
      return
    }
    stopSpeech()
    const plain = output.replace(/^#{1,6}\s+/gm, '').replace(/[*_~`#>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    const utterance = new SpeechSynthesisUtterance(plain.slice(0, 24_000))
    utterance.lang = 'it-IT'
    utterance.rate = 1
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  async function extractPdf(file: File) {
    if (file.size > 20 * 1024 * 1024) throw new Error('Il PDF supera il limite di 20 MB.')
    const data = new Uint8Array(await file.arrayBuffer())
    const pdf = await getDocument({ data }).promise
    let text = ''
    for (let pageNo = 1; pageNo <= pdf.numPages && text.length < MAX_TEXT; pageNo++) {
      const page = await pdf.getPage(pageNo)
      const content = await page.getTextContent()
      const pageText = content.items.map(item => ('str' in item ? item.str : '')).join(' ')
      text += pageText + '\n\n'
    }
    const extracted = text.trim().slice(0, MAX_TEXT)
    if (!extracted) throw new Error('Non ho trovato testo selezionabile nel PDF. Potrebbe essere una scansione: serve prima un OCR.')
    setSource(extracted)
    setFileName(file.name)
    setOutput('')
    setError(text.length > MAX_TEXT ? 'Testo estratto: sono stati utilizzati al massimo i primi 30.000 caratteri.' : '')
  }

  async function onPdfChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Seleziona un file PDF.')
      return
    }
    setError('')
    setBusy(true)
    try { await extractPdf(file) }
    catch (e) { setError(e instanceof Error ? e.message : 'Errore durante la lettura del PDF.') }
    finally { setBusy(false) }
  }

  async function generate() {
    if (!source.trim()) { setError('Inserisci un testo oppure carica un PDF.'); return }
    if (!workerUrl) { setError('Configurazione incompleta: manca VITE_AI_WORKER_URL nelle variabili del sito.'); return }
    setBusy(true)
    setError('')
    setOutput('')
    stopSpeech()
    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testoInput: source.slice(0, MAX_TEXT), tipo: mode }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || (response.status === 429 ? 'Limite temporaneo raggiunto. Riprova più tardi.' : 'Servizio AI momentaneamente non disponibile.'))
      if (typeof payload.result !== 'string' || !payload.result.trim()) throw new Error('Il servizio AI ha restituito una risposta vuota.')
      setOutput(payload.result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di connessione al servizio AI.')
    } finally { setBusy(false) }
  }

  const rendered = mode !== 'mappa' && output
    ? DOMPurify.sanitize(marked.parse(output) as string)
    : ''

  return <section className="inner-content ai-tools-page">
    <div className="inner-heading">
      <div className="inner-icon"><Sparkles size={25}/></div>
      <div><span className="section-kicker">STRUMENTI INTELLIGENTI</span><h1>Studio assistito</h1><p>Trasforma i tuoi appunti in strumenti di ripasso. I PDF vengono letti sul dispositivo.</p></div>
    </div>
    <div className="ai-tools-shell">
      <div className="ai-tools-tabs" role="tablist" aria-label="Strumenti AI">
        <button type="button" role="tab" aria-selected={mode==='riassunto'} className={mode==='riassunto'?'active':''} onClick={()=>{setMode('riassunto');setOutput('');stopSpeech()}}><FileText size={16}/> Riassunti</button>
        <button type="button" role="tab" aria-selected={mode==='mappa'} className={mode==='mappa'?'active':''} onClick={()=>{setMode('mappa');setOutput('');stopSpeech()}}><GitBranch size={16}/> Mappe concettuali</button>
        <button type="button" role="tab" aria-selected={mode==='quiz'} className={mode==='quiz'?'active':''} onClick={()=>{setMode('quiz');setOutput('');stopSpeech()}}><Sparkles size={16}/> Quiz dagli appunti</button>
      </div>
      <div className="ai-tools-input">
        <div className="ai-tools-section-title"><div><span className="section-kicker">01 / MATERIALE DI STUDIO</span><h2>{mode==='riassunto'?'Crea un riassunto':mode==='mappa'?'Costruisci una mappa concettuale':'Genera domande di ripasso'}</h2></div><span className="ai-char-count">{source.length.toLocaleString('it-IT')} / {MAX_TEXT.toLocaleString('it-IT')}</span></div>
        <label className="ai-upload-button"><Upload size={16}/><span>{busy && !output ? 'Elaborazione…' : 'Carica un PDF'}</span><input type="file" accept="application/pdf,.pdf" onChange={e=>void onPdfChange(e)} disabled={busy}/></label>
        {fileName && <div className="ai-file-chip"><FileText size={15}/><span>{fileName}</span><button type="button" onClick={()=>{setFileName('');setSource('')}} aria-label="Rimuovi PDF">×</button></div>}
        <textarea value={source} maxLength={MAX_TEXT} onChange={e=>{setSource(e.target.value);setFileName('')}} placeholder="Incolla qui gli appunti o il testo da elaborare…" aria-label="Testo da elaborare"/>
        <div className="ai-tools-footer"><span>Il contenuto non viene salvato su SMLQuiz né su Supabase.</span><button className="confirm-button" type="button" onClick={()=>void generate()} disabled={busy||!source.trim()}>{busy?<><LoaderCircle className="ai-spin" size={16}/> Elaborazione…</>:<><Sparkles size={16}/> Genera</>}</button></div>
      </div>
      {error && <p className="ai-tools-error" role="alert">{error}</p>}
      {output && <section className="ai-output">
        <div className="ai-output-head"><div><span className="section-kicker">02 / RISULTATO</span><h2>{mode==='riassunto'?'Il tuo riassunto':mode==='mappa'?'Mappa concettuale':'Quiz di ripasso'}</h2></div>{mode!=='mappa'&&<button type="button" className="ai-speech-button" onClick={speaking?stopSpeech:readAloud}>{speaking?<Pause size={16}/>:<Volume2 size={16}/>} {speaking?'Ferma audio':'Ascolta'}</button>}</div>
        {mode==='mappa'?<div className="ai-markmap-wrap"><svg ref={mapSvg} className="ai-markmap" aria-label="Mappa concettuale interattiva"/></div>:<article className="ai-markdown" dangerouslySetInnerHTML={{__html:rendered}}/>}
        {mode==='mappa'&&<p className="ai-map-hint">Suggerimento: seleziona un nodo per espandere o comprimere i suoi argomenti.</p>}
      </section>}
    </div>
  </section>
}
