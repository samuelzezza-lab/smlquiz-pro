import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Gestisce il pulsante di installazione mostrato nell'interfaccia.
let deferredInstallPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event as typeof deferredInstallPrompt;
  window.dispatchEvent(new Event('smlquiz-install-available'));
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

// Ripulisce una sola volta i vecchi Service Worker che possono mostrare
// una versione obsoleta della schermata iniziale anche dopo la pubblicazione.
if ('serviceWorker' in navigator) {
  const resetKey = 'smlquiz.sw-reset-v17';
  if (sessionStorage.getItem(resetKey) !== 'done') {
    sessionStorage.setItem(resetKey, 'done');
    void navigator.serviceWorker.getRegistrations().then(async registrations => {
      if (registrations.length) {
        await Promise.all(registrations.map(registration => registration.unregister()));
        window.location.replace(window.location.pathname + window.location.search + window.location.hash);
      } else {
        await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      }
    }).catch(error => console.warn('Aggiornamento cache PWA:', error));
  } else {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      })
        .then(registration => registration.update())
        .catch(error => console.error('Registrazione PWA non riuscita:', error))
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
