# Avvio facile su Windows

## Prima e unica configurazione

1. Scarica il progetto da GitHub usando il pulsante verde **Code** e poi **Download ZIP**.
2. Estrai lo ZIP in una cartella facile da trovare.
3. Apri la cartella `tools`, poi `ollama-worker`.
4. Duplica il file `.env.example` e rinomina la copia in `.env`.
5. Apri `.env` con Blocco note. Inserisci la chiave segreta **service_role** del progetto Supabase al posto di `INCOLLA_QUI...`. Non inviarla a nessuno e non caricarla su GitHub.
6. Salva il file.
7. Assicurati che Ollama sia aperto e che il modello `smlquiz` sia presente.

## Per avviare
Fai doppio clic su `AVVIA_SMLQUIZ.bat`. Non devi scrivere comandi.

La prima volta elabora al massimo un quiz. Se appare un errore, non rilanciare ripetutamente: copia qui il testo dell'errore, oscurando qualsiasi chiave o password.

## Se Windows dice che Python manca
Installa Python da https://www.python.org/downloads/ e durante l'installazione seleziona **Add Python to PATH**. Poi ripeti il doppio clic.

## Sicurezza
Il file `.env` contiene una chiave che permette di modificare il database. Deve restare sul tuo PC. Non fotografarlo, non mandarlo in chat e non inserirlo nel sito.
