import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Gestisce il pulsante di installazione mostrato nell'interfaccia.
let deferredInstallPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event as typeof deferredInstallPrompt;
});

window.addEventListener('smlquiz-install-request', async () => {
  if (!deferredInstallPrompt) {
    window.dispatchEvent(new Event('smlquiz-install-help'));
    return;
  }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await promptEvent.prompt();
  await promptEvent.userChoice;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
});

// Registra la PWA: consente installazione e schermata offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(registration => registration.update())
      .catch(error => console.error('Registrazione PWA non riuscita:', error))
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
