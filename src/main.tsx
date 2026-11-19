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

// Aggiorna la PWA quando l'utente torna alla scheda dopo aver usato un'altra app.
// Se arriva un nuovo Service Worker, ricarica una sola volta per montare il bundle aggiornato.
if ('serviceWorker' in navigator) {
  let appRegistration: ServiceWorkerRegistration | null = null;
  let lastUpdateCheck = 0;
  let refreshingForWorkerUpdate = false;
  let hadController = Boolean(navigator.serviceWorker.controller);

  const checkForAppUpdate = () => {
    if (document.visibilityState !== 'visible' || !appRegistration) return;
    const now = Date.now();
    if (now - lastUpdateCheck < 30_000) return;
    lastUpdateCheck = now;
    void appRegistration.update().catch(error => {
      console.warn('Controllo aggiornamenti SMLQUIZ non riuscito:', error);
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (refreshingForWorkerUpdate) return;
    refreshingForWorkerUpdate = true;
    window.location.reload();
  });

  // pageshow copre anche il ripristino dalla BFCache dopo il ritorno da WhatsApp.
  window.addEventListener('pageshow', checkForAppUpdate);
  window.addEventListener('focus', checkForAppUpdate);
  document.addEventListener('visibilitychange', checkForAppUpdate);

  const registerAppWorker = () => {
    void navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    }).then(registration => {
      appRegistration = registration;
      checkForAppUpdate();
    }).catch(error => console.warn('Registrazione PWA non riuscita:', error));
  };

  if (document.readyState === 'complete') {
    window.setTimeout(registerAppWorker, 0);
  } else {
    window.addEventListener('load', registerAppWorker, { once: true });
  }
}

type ErrorBoundaryState = { hasError: boolean }

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Errore inatteso nell’interfaccia SMLQUIZ:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return <main role="alert" style={{minHeight:'100vh',display:'grid',placeContent:'center',padding:24,background:'#050915',color:'#edf1ff',fontFamily:'system-ui,sans-serif',textAlign:'center'}}>
        <div style={{maxWidth:460}}>
          <div style={{fontSize:13,fontWeight:800,letterSpacing:2,color:'#a78bfa'}}>SMLQUIZ PRO</div>
          <h1 style={{fontSize:26,margin:'16px 0 8px'}}>Si è verificato un problema</h1>
          <p style={{color:'#aab4ca',lineHeight:1.6}}>La schermata non è riuscita a caricarsi. I progressi salvati non vengono cancellati. Ricarica la pagina per riprovare.</p>
          <button type="button" onClick={() => window.location.reload()} style={{marginTop:16,padding:'12px 20px',border:0,borderRadius:10,background:'#a78bfa',color:'#100d20',fontWeight:800,cursor:'pointer'}}>Ricarica la pagina</button>
        </div>
      </main>
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <React.StrictMode><App/></React.StrictMode>
  </AppErrorBoundary>
)
