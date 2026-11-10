import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Registra la PWA: consente installazione e schermata offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(registration => registration.update())
      .catch(error => console.error('Registrazione PWA non riuscita:', error))
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
