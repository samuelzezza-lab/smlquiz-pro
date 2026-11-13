@echo off
cd /d "%~dp0"
py -m pip install -r requirements.txt
if not exist .env (
  copy .env.example .env
  notepad .env
  echo.
  echo Inserisci le due chiavi nel file .env, salva e poi riavvia AVVIA.bat.
  pause
  exit /b
)
py generatore.py
pause
