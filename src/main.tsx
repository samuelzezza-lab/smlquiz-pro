import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Pulsante di installazione: il browser mostra il prompt solo dopo un tocco dell'utente.
let deferredInstallPrompt: Event | null = null;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (document.getElementById('pwa-install-button')) return;

  const button = document.createElement('button');
  button.id = 'pwa-install-button';
  button.type = 'button';
  button.textContent = '＋ Installa SMLQUIZ';
  button.setAttribute('aria-label', 'Installa SMLQUIZ sul dispositivo');
  Object.assign(button.style, {
    position: 'fixed',
    right: '16px',
    bottom: 'max(16px, env(safe-area-inset-bottom))',
    zIndex: '9999',
    border: '1px solid #b6a4ff',
    borderRadius: '999px',
    padding: '13px 18px',
    background: '#8b73e4',
    color: '#ffffff',
    font: '700 14px system-ui, sans-serif',
    boxShadow: '0 8px 28px rgba(0,0,0,.35)',
    cursor: 'pointer'
  });
  button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    const promptEvent = deferredInstallPrompt as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    await promptEvent.prompt();
    await promptEvent.userChoice;
    deferredInstallPrompt = null;
    button.remove();
  });
  document.body.appendChild(button);
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('pwa-install-button')?.remove();
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
