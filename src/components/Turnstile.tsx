import { useEffect, useRef } from 'react'
import { t, type Language } from '../i18n'

type TurnstileOptions = {
  sitekey: string
  callback: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  theme?: 'dark' | 'light' | 'auto'
}
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string
      remove: (widgetId: string) => void
    }
  }
}
type Props = { siteKey: string; onVerify: (token: string) => void; resetKey: number; language: Language }
export default function Turnstile({ siteKey, onVerify, resetKey, language }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onVerify)
  callback.current = onVerify
  useEffect(() => {
    if (!siteKey || !container.current) return
    let widgetId: string | undefined
    let cancelled = false
    const render = () => {
      if (cancelled || !container.current || !window.turnstile || widgetId) return
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: token => callback.current(token),
        'expired-callback': () => callback.current(''),
        'error-callback': () => callback.current(''),
      })
    }
    if (window.turnstile) render()
    else {
      let script = document.querySelector<HTMLScriptElement>('script[data-sml-turnstile]')
      if (!script) {
        script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.defer = true
        script.dataset.smlTurnstile = 'true'
        document.head.appendChild(script)
      }
      script.addEventListener('load', render)
    }
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [siteKey, resetKey])
  if (!siteKey) return <div className="turnstile-warning">{t(language, 'captchaSetupWarning')}</div>
  return <div className="turnstile-wrap"><div ref={container}/></div>
}
