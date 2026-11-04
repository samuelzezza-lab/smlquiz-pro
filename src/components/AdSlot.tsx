import { useEffect } from 'react'

declare global {
  interface Window {
    infolinks_pid?: number
    infolinks_wsid?: number
  }
}

export default function AdSlot() {
  const publisherId = import.meta.env.VITE_INFOLINKS_PID as string | undefined
  const websiteId = import.meta.env.VITE_INFOLINKS_WSID as string | undefined

  useEffect(() => {
    if (!publisherId || !websiteId) return
    const pid = Number(publisherId)
    const wsid = Number(websiteId)
    if (!Number.isFinite(pid) || !Number.isFinite(wsid) || pid <= 0 || wsid <= 0) return

    window.infolinks_pid = pid
    window.infolinks_wsid = wsid

    const existing = document.querySelector('script[data-sml-infolinks]') as HTMLScriptElement | null
    if (existing) return () => { existing.remove(); delete window.infolinks_pid; delete window.infolinks_wsid }
    const script = document.createElement('script')
    script.async = true
    script.dataset.smlInfolinks = 'true'
    script.src = 'https://resources.infolinks.com/js/infolinks_main.js'
    document.body.appendChild(script)
    return () => { script.remove(); delete window.infolinks_pid; delete window.infolinks_wsid }
  }, [publisherId, websiteId])

  if (!publisherId || !websiteId || Number(publisherId) <= 0 || Number(websiteId) <= 0) return null
  return <div className="ad-slot" aria-label="Pubblicità Infolinks"><small>Pubblicità</small></div>
}
