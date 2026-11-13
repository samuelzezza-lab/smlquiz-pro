# SMLQuiz Generator (Windows)

Programma locale per generare quiz e salvarli nel database Supabase del progetto SMLQuiz.

## Avvio
1. Scarica questa cartella sul PC.
2. Copia `.env.example` in un file chiamato `.env`.
3. Inserisci nel file `.env` le tue chiavi private: OPENAI_API_KEY e SUPABASE_SERVICE_ROLE_KEY.
4. Non caricare mai `.env` su GitHub e non inviare le chiavi in chat.
5. Avvia `AVVIA.bat`. La prima schermata è una semplice anteprima.
6. Solo scrivendo GENERA parte la generazione e il salvataggio.

## Importante
- Legge regole, programmi pronti, materie, capitoli e microargomenti verificati da Supabase.
- Non usa la chiave privata nel sito: le chiavi restano sul PC.
- Obiettivo massimo configurato: 300 domande per materia.
- Non sovrascrive quiz con numero già esistente.
- Il controllo automatico dei duplicati è preliminare: non garantisce di riconoscere ogni duplicato concettuale. È necessaria una revisione delle domande prima della pubblicazione.
- Genera quiz da 10 domande e si ferma in caso di errore.
