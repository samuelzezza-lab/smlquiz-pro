# Worker locale Ollama per SMLQuiz

Questo programma gira sul PC Windows e trasferisce i quiz generati da Ollama nel database Supabase. Non usa Gemini, Anthropic o altri servizi AI cloud.

## Avvio rapido (Windows)

1. Installa Python 3.11 o successivo.
2. Verifica che Ollama sia avviato e che il modello sia disponibile: `ollama list`.
3. Nella cartella del worker copia `.env.example` in `.env`.
4. Nel pannello Supabase del progetto, copia la chiave **service_role / secret** e inseriscila solo in `.env`. Non inviarla in chat e non caricarla su GitHub.
5. Apri il terminale in questa cartella ed esegui:
   `python ollama_worker.py`

Il valore iniziale `MAX_JOBS=1` limita l'esecuzione a un solo quiz. Verifica sul sito che il quiz sia visibile prima di aumentare il numero. Per una sessione più lunga modifica MAX_JOBS nel file .env.

## Importante
- Non attiva il vecchio worker cloud e non sblocca il controllo generale.
- Usa la coda Supabase esistente; non crea una seconda coda.
- I quiz già pronti non vengono sovrascritti.
- La chiave segreta resta sul PC. Non inserirla mai in variabili VITE_ o nel frontend.
- L'IA può sbagliare contenuti: il controllo automatico verifica formato e duplicati, non certifica la correttezza accademica. I programmi sono orientativi e richiedono revisione.
