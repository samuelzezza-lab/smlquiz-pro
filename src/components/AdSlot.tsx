import { useEffect } from 'react'

declare global {
  interface Window { adsbygoogle?: unknown[] }
}
export default function AdSlot() {
  const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined
  const slot = import.meta.env.VITE_ADSENSE_SLOT as string | undefined
  useEffect(() => {
    if (!client || !slot) return
    if (!document.querySelector('script[data-sml-adsense]')) {
      const script = document.createElement('script')
      script.async = true
      script.crossOrigin = 'anonymous'
      script.dataset.smlAdsense = 'true'
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client)
      document.head.appendChild(script)
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch { /* AdSense may not be approved or available yet. */ }
  }, [client, slot])
  if (!client || !slot) return null
  return <div className="ad-slot" aria-label="Spazio pubblicitario"><small>SPAZIO PUBBLICITARIO</small><ins className="adsbygoogle" style={{ display: 'block', minHeight: 90 }} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true"/></div>
}
