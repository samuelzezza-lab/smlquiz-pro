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

// Registra il Service Worker in background senza cancellare le registrazioni
// e senza forzare un secondo caricamento della pagina.
if ('serviceWorker' in navigator) {
  const registerAppWorker = () => {
    void navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    }).catch(error => console.warn('Registrazione PWA non riuscita:', error));
  };
  if (document.readyState === 'complete') {
    window.setTimeout(registerAppWorker, 0);
  } else {
    window.addEventListener('load', registerAppWorker, { once: true });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
