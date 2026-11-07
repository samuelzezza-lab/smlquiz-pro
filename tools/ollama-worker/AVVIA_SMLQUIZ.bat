@echo off
chcp 65001 >nul
title SMLQuiz - Avvio generatore Ollama
cd /d "%~dp0"
echo ==========================================
echo        SMLQUIZ - GENERATORE LOCALE
echo ==========================================
echo.
if not exist ".env" (
  echo ERRORE: manca il file .env.
  echo Rinomina .env.example in .env e inserisci la chiave Supabase.
  echo.
  pause
  exit /b 1
)
where python >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Python non risulta installato.
  echo Installa Python da https://www.python.org/downloads/
  echo Durante l'installazione seleziona "Add Python to PATH".
  pause
  exit /b 1
)
echo Controllo Ollama...
curl -s http://127.0.0.1:11434/api/tags >nul
if errorlevel 1 (
  echo ERRORE: Ollama non risponde.
  echo Apri Ollama dal menu Start e riprova.
  pause
  exit /b 1
)
echo Avvio: verra elaborato al massimo un quiz di prova.
python ollama_worker.py
echo.
echo Operazione terminata. Leggi il messaggio qui sopra.
pause
