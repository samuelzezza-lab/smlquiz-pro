import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const read = path => readFileSync(path, 'utf8')
const fail = message => { console.error('Security contract failed:', message); process.exitCode = 1 }
const app = read('src/App.tsx')
const i18n = read('src/i18n.ts')
const headers = read('public/_headers')
const styles = read('src/styles.css')
const checkout = read('supabase/functions/stripe-checkout/index.ts')
const flashcardsApi = read('supabase/functions/flashcards-api/index.ts')
const webhook = read('supabase/functions/stripe-webhook/index.ts')
const manifest = read('public/manifest.webmanifest')
const html = read('index.html')
const envProduction = read('.env.production')

if (!/^VITE_SUPABASE_URL=https:\/\//m.test(envProduction) || !/^VITE_SUPABASE_ANON_KEY=\S+/m.test(envProduction) || /INSERISCI|YOUR_|CHANGE_ME|placeholder/i.test(envProduction)) fail('Production build must include valid public Supabase URL and anon key.')
if (/SERVICE_ROLE|SECRET_KEY|SUPABASE_SERVICE_ROLE/i.test(envProduction)) fail('A Supabase service-role or secret key must never be shipped to the browser.')
if (!/export type Language = 'it'/.test(i18n)) fail('The application language must remain Italian-only.')
if (!/import it from '\.\/locales\/it\.json'/.test(i18n)) fail('The Italian dictionary must be the only loaded locale.')
if (!app.includes("const strongPasswordPattern=/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,}$/")) fail('The password policy must require 12 characters with mixed character classes.')
const register = app.slice(app.indexOf("authMode!=='reset'&&<>"), app.indexOf("authMode==='register'&&<label className=\"consent\""))
if (!register.includes("minLength={authMode==='register'?12:8}") || !register.includes(".{12,}")) fail('Registration form validation must enforce the 12-character policy.')
const recoveryStart = app.indexOf("<h2>{tr('setNewPassword')}</h2>")
const recoveryEnd = app.indexOf('</form>', recoveryStart)
const recovery = recoveryStart >= 0 && recoveryEnd > recoveryStart ? app.slice(recoveryStart, recoveryEnd) : ''
if (!recovery.includes('minLength={12}') || !recovery.includes('.{12,}')) fail('Password recovery must enforce the same 12-character policy.')
const cookieBannerIndex = app.indexOf('{!cookieChoice&&<div className="cookie-banner">')
const mainContentIndex = app.indexOf('<main className="main" id="main-content"')
if (cookieBannerIndex < 0 || mainContentIndex < 0 || cookieBannerIndex > mainContentIndex) fail('Cookie consent must be placed before the main content in document flow.')
if (!styles.includes('.cookie-banner{position:relative;') || styles.includes('.cookie-banner{position:fixed')) fail('Cookie consent must never overlay page content.')
if (!styles.includes('@media(max-width:800px){.cookie-banner{margin:12px;')) fail('Cookie consent must use safe mobile spacing.')
if (!styles.includes('.sidebar{transform:translate3d(-100%,0,0)') || !styles.includes('.hamb{display:inline-grid')) fail('Mobile navigation must start with a closed sidebar and expose the menu button.')
if (!styles.includes('.mobile-bottom-nav{\n    position:fixed')) fail('Mobile bottom navigation must be present.')
for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "upgrade-insecure-requests", "default-src 'self'"]) {
  if (!headers.includes(directive)) fail('Missing CSP directive: ' + directive)
}
const forbidden = [/dangerouslySetInnerHTML/, /\.innerHTML\s*=/, /document\.write\s*\(/, /\beval\s*\(/, /new\s+Function\s*\(/]
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (['.ts','.tsx','.js','.jsx'].includes(extname(path))) files.push(path)
  }
}
walk('src')
for (const path of files) {
  const source = read(path)
  for (const pattern of forbidden) if (pattern.test(source)) fail('Unsafe DOM/code execution sink detected in ' + path + ': ' + pattern)
}

if (!html.includes('<link rel="manifest" href="/manifest.webmanifest"/>')) fail('The installable PWA manifest must be linked from index.html.')
if (!manifest.includes('"display": "standalone"') || !manifest.includes('/icon-192.png') || !manifest.includes('/icon-512.png')) fail('The PWA manifest must define standalone display and both app icons.')
if (!app.includes("single:'price_1Uc9w5BCybXKHSfRCFwx5NAT'") || !checkout.includes('price_1Uc9w5BCybXKHSfRCFwx5NAT') || !webhook.includes('price_1Uc9w5BCybXKHSfRCFwx5NAT')) fail('Single-subject purchase must use the same Stripe product in frontend, checkout and webhook.')
const accountGate = app.slice(app.indexOf('const accountRequiredPages:'), app.indexOf('const pricing ='))
for (const page of ["'home'","'semestre'","'experiences'","'review'","'progress'","'result'","'buy'","'settings'","'calculator'","'leaderboard'"]) {
  if (!accountGate.includes(page)) fail('Study and paid page must require an account: ' + page)
}
if (!app.includes('if(!user&&accountRequiredPages.includes(p))')) fail('Client navigation must block unauthenticated access to every study and paid page.')
if (!app.includes('if(!user&&accountRequiredPages.includes(next))')) fail('Direct URL and browser-history navigation must block unauthenticated access.')
if (!app.includes('if(!authReady)return <div role="status"')) fail('The app must wait for Supabase session restoration before showing protected content.')
if (!app.includes("if(!user&&accountRequiredPages.includes(page))return")) fail('Protected routes must not render their contents to unauthenticated visitors.')
if (!app.includes('Accesso richiesto per proteggere account, progressi e contenuti.') && !app.includes('L\'accesso è richiesto per proteggere account, progressi e contenuti.')) fail('The account gate must explain why login is required.')
if (!flashcardsApi.includes('if (!token) return reply({ error: "Accesso richiesto.') || !flashcardsApi.includes('if (authError || !authData.user) return reply({ error: "Sessione non valida.')) fail('Flashcard API must reject anonymous and invalid sessions before returning card content.')
if (!styles.includes('.shell.mode-fullscreen .mobile-bottom-nav{display:none!important}')) fail('Immersive mobile pages must hide global navigation.')

if (process.exitCode) process.exit(process.exitCode)
console.log('Security contracts passed: Italian UI, password policy, CSP, PWA install metadata, Stripe price mapping and unsafe-sink scan.')
