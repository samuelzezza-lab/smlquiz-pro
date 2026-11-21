# SMLQuiz AI Study Tools

## Funzioni
- Riassunti Markdown con lettura vocale del browser (it-IT).
- Mappe concettuali interattive (Markmap).
- Estrazione PDF nel browser con PDF.js; massimo 30.000 caratteri inviati per elaborazione.
- I PDF e i risultati non vengono salvati in Supabase o in un archivio del Worker.
- Il Worker richiede una sessione Supabase valida prima di chiamare Gemini.

## 1. Configurare Cloudflare Worker
1. Apri Cloudflare Dashboard → Workers & Pages → Create → Worker.
2. Crea il Worker usando i file in `worker/`; il file principale è `worker/worker.js` e il nome suggerito è `smlquiz-ai`.
3. Nelle impostazioni del Worker aggiungi questi secrets/variabili:
   - `GEMINI_API_KEY`: chiave creata in Google AI Studio (Secret).
   - `SUPABASE_URL`: URL del progetto Supabase già usato da SMLQuiz.
   - `SUPABASE_ANON_KEY`: chiave publishable/anon già usata dal frontend.
4. Pubblica il Worker e copia il suo URL HTTPS, ad esempio `https://smlquiz-ai.<account>.workers.dev`.
5. Il Worker accetta richieste soltanto da `https://smlquiz.it`, `https://www.smlquiz.it` e localhost per sviluppo. Non mettere mai la chiave Gemini in GitHub o nelle variabili `VITE_*`.

### Deploy con Wrangler (alternativa)
Dalla cartella `worker/`, dopo aver installato e autenticato Wrangler:
```bash
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
```
Inserisci i valori quando Wrangler li richiede. Non inserirli nei file.

## 2. Configurare il frontend
Nel pannello GitHub Pages/build environment aggiungi la variabile pubblica:
```text
VITE_AI_WORKER_URL=https://smlquiz-ai.<account>.workers.dev
```
Per sviluppo locale, crea `.env.local` con lo stesso valore. Non committare `.env.local`.

## 3. Build e pubblicazione
Installa le dipendenze con `npm install`, poi esegui:
```bash
npm run build
npm run test:smoke
```
Pubblica il branch solo dopo aver verificato la build e aver configurato il Worker e la variabile del frontend.

## Privacy e limiti
Il file PDF viene letto localmente dal browser e non viene caricato come file. Quando l'utente preme Genera, il testo estratto (fino a 30.000 caratteri) viene però inviato al Worker e da lì a Google Gemini per produrre il risultato. Non inserire dati personali, sanitari o riservati. Il piano gratuito Gemini è soggetto a quote e disponibilità e Google indica che i contenuti del livello gratuito possono essere usati per migliorare i propri prodotti. La lettura vocale usa la funzione Speech Synthesis del browser e non invia l'audio al server.

Cloudflare Workers Free prevede quote giornaliere e limiti di CPU; il piano gratuito non equivale a capacità illimitata. Le quote Google possono cambiare e possono essere esaurite: non è possibile garantire costo zero o disponibilità continua per un numero illimitato di utenti.
