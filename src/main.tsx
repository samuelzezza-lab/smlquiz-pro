import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Remove the old offline shell so it cannot keep serving an outdated interface.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistrations().then(registrations =>
      Promise.all(registrations.map(registration => registration.unregister()))
    )
    if ('caches' in window) {
      void caches.keys().then(keys =>
        Promise.all(keys.filter(key => key.startsWith('smlquiz-')).map(key => caches.delete(key)))
      )
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
