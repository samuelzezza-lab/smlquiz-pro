# SMLQUIZ Pro

Piattaforma di quiz universitari realizzata con React, TypeScript e Vite, collegata al progetto Supabase esistente **SML QUIZ**.

## Avvio locale

1. Usa Node.js 22 o successivo.
2. Copia `.env.example` in `.env.local`.
3. Inserisci l'URL Supabase e la chiave pubblica (publishable/anon).
4. Esegui `npm install` e `npm run dev`.

Non inserire mai nel frontend o in variabili `VITE_*` la service-role key di Supabase, la chiave segreta Stripe o il segreto del webhook.

## Dati del catalogo verificati

Nel database collegato risultano:
- 25 facoltà
- 551 materie
- 541 quiz pronti da 10 domande
- 5.410 domande

## Funzioni presenti

- Interfaccia responsive scura, navigazione laterale e barra superiore.
- PWA con manifest, icone e service worker per la shell offline.
- Supabase Auth: registrazione, accesso, uscita e recupero password.
- Filtro facoltà, anno di corso e ricerca materie; caricamento progressivo dell'elenco.
- Quiz a quattro opzioni, timer, spiegazioni e punteggio +1 / −0,25.
- Generazione dinamica dei quiz mancanti tramite Anthropic, usando la Edge Function esistente `quiz-cache` (non modificata), con controllo qualità, duplicati e salvataggio nel catalogo.
- Salvataggio delle risposte lato server, storico, report TXT e condivisione WhatsApp/Telegram.
- Limite di 5 quiz gratuiti al giorno e utilizzo crediti gestiti sul backend.
- Portafoglio crediti, coupon, profilo, classifica, streak, badge e ripasso degli errori.
- Segnalazione domande, cancellazione account e storico transazioni.
- Calcolatore media ponderata con salvataggio locale.
- Impostazioni accessibilità, ingrandimento testo, audio, fullscreen e debugger locale.
- Dizionari di interfaccia per italiano, inglese, francese, tedesco, spagnolo e cinese; alcune stringhe delle schermate devono ancora essere tradotte integralmente.
- Pagine informative legali, informative cookie e pannello preferenze.

## Funzioni Supabase attive

Il progetto esistente è `fgrwwauwnxvrcgqqpksp` nella regione `eu-west-2`.

Edge Functions attive:
- `quiz-cache` v12 — lasciata invariata.
- `quiz-api` v8 — autenticazione, profilo, wallet, avvio/risposte/fine quiz, storico, streak, badge, coupon, report e classifica.
- `stripe-checkout` v5 — creazione Checkout protetta da flag server e consenso digitale verificato.
- `stripe-webhook` v6 — verifica firma Stripe, pacchetto/importo/valuta e consenso prima dell'accredito idempotente dei crediti.

Lo storico calcola il punteggio effettivo dalle risposte registrate, senza usare il solo numero di risposte corrette.

## Configurazione Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Progetto Pages: `smlquiz-pro`

Il workflow GitHub Actions `Deploy SMLQUIZ Pro to Cloudflare Pages` richiede questi GitHub Actions secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TURNSTILE_SITE_KEY` (quando configurato)
- `VITE_ADSENSE_CLIENT` e `VITE_ADSENSE_SLOT` (solo dopo approvazione e consenso)

È presente il workflow CI per compilare il progetto ad ogni push e un controllo Deno dedicato per verificare il codice delle tre Edge Functions. Il deploy Cloudflare è manuale e non va considerato completato finché i secrets non sono configurati e il workflow non termina con successo.

## Pagamenti Stripe

I pacchetti configurati sono 5 quiz a 1 €, 10 quiz a 2 € e 15 quiz a 3 €.

I pagamenti live restano disattivati finché non viene abilitato esplicitamente il flag server `STRIPE_LIVE_ENABLED=true`. Per la configurazione servono, nei Supabase secrets:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SIGNING_SECRET`
- `APP_URL`
- `APP_ORIGIN` (origine autorizzata per le richieste browser)

Il frontend mantiene `VITE_STRIPE_CHECKOUT_ENABLED=false`. Non sono stati effettuati addebiti reali.

## Prima della pubblicazione al pubblico

- Completare i dati del titolare nei documenti legali: nome/ragione sociale, P. IVA, indirizzo, PEC ed email di supporto.
- Far verificare informativa privacy, cookie, condizioni, recesso e contenuti digitali.
- Attivare e verificare Turnstile lato Supabase Auth.
- Configurare la protezione delle password compromesse in Supabase Auth.
- Verificare le impostazioni di consenso pubblicitario prima di caricare AdSense.
- Configurare i secrets Cloudflare e completare un deploy verificato.
- Eseguire test end-to-end con account dedicati e test pagamenti Stripe in modalità test prima di valutare l'attivazione live.

## Sicurezza e dati esistenti

Le tabelle esistenti restano nel progetto originale. Le operazioni che gestiscono risposte, crediti e acquisti passano dal backend autenticato. La funzione `quiz-cache` non viene modificata. Non sono state create nuove tabelle né è stato creato un nuovo progetto Supabase.
