import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Rimuove una tantum eventuali Service Worker e cache lasciati dalle vecchie versioni PWA.
if ('serviceWorker' in navigator) {
  void (async () => {
    try {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith('smlquiz-')).map(key => caches.delete(key)));
      }
      if (hadController && !sessionStorage.getItem('smlquiz-legacy-pwa-cleared')) {
        sessionStorage.setItem('smlquiz-legacy-pwa-cleared', '1');
        window.location.reload();
      }
    } catch (error) {
      console.warn('Pulizia della vecchia cache PWA non riuscita:', error);
    }
  })();
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
