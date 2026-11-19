import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const port = 4173
const baseUrl = `http://127.0.0.1:${port}`
const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
})
const failures = []
const results = []
const routePaths = ['/quiz', '/semestre-filtro', '/esperienze-esame', '/review', '/progress', '/account', '/compra-quiz', '/settings', '/calculator', '/legal', '/leaderboard', '/come-funziona']
let browser

const viewports = [
  { name: 'iphone-se-small', width: 320, height: 568 },
  { name: 'phone-344', width: 344, height: 720 },
  { name: 'phone-360', width: 360, height: 800 },
  { name: 'iphone-375', width: 375, height: 812 },
  { name: 'iphone-390', width: 390, height: 844 },
  { name: 'phone-393', width: 393, height: 852 },
  { name: 'phone-412', width: 412, height: 915 },
  { name: 'phone-414', width: 414, height: 896 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'landscape-740', width: 740, height: 360 },
  { name: 'landscape-844', width: 844, height: 390 },
  { name: 'landscape-915', width: 915, height: 412 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
]

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Anteprima Vite non raggiungibile sulla porta ' + port)
}

try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  await mkdir('artifacts/mobile-responsive', { recursive: true })

  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.width <= 430,
      hasTouch: viewport.width <= 430,
    })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    const mobileNavExpected = viewport.width <= 800 || (viewport.height <= 500 && viewport.width > viewport.height)
    const catalogHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-allow-methods': 'GET, OPTIONS',
      'content-type': 'application/json'
    }
    await page.route('**/rest/v1/**', async route => {
      const url = route.request().url()
      if (url.includes('/facolta') || url.includes('/materie')) return route.fallback()
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: catalogHeaders })
      return route.fulfill({ status: 200, headers: catalogHeaders, body: '[]' })
    })
    await page.route('**/auth/v1/user**', async route => route.fulfill({
      status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'responsive@example.com', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' })
    }))
    await page.route('**/functions/v1/quiz-api', async route => {
      const request = route.request()
      const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      let payload = {}
      try { payload = request.postDataJSON() || {} } catch {}
      const data = payload.action === 'session-check' ? { sessionOk: true }
        : payload.action === 'wallet' ? { paidCredits: 0, freeUsed: 0, freeRemaining: 5, ledger: [], ownerUnlimited: false }
        : payload.action === 'streaks' ? { streak: { current_streak: 0, longest_streak: 0 }, achievements: [] }
        : payload.action === 'profile' ? { profile: { display_name: 'Studente test', language: 'it', leaderboard_opt_in: false } }
        : {}
      return route.fulfill({ status: 200, headers, body: JSON.stringify(data) })
    })
    await page.route('**/rest/v1/facolta**', async route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: catalogHeaders })
      return route.fulfill({ status: 200, headers: catalogHeaders, body: JSON.stringify([
        { id: 'faculty-test', nome: 'Medicina e Chirurgia', traduzioni: {} }
      ]) })
    })
    await page.route('**/rest/v1/materie**', async route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: catalogHeaders })
      return route.fulfill({ status: 200, headers: catalogHeaders, body: JSON.stringify([
        { id: 'subject-test-1', nome: 'Anatomia I', traduzioni: {}, facolta_id: 'faculty-test', anno_corso: 1, corso_di_laurea: 'Medicina e Chirurgia' },
        { id: 'subject-test-2', nome: 'Fisiologia', traduzioni: {}, facolta_id: 'faculty-test', anno_corso: 1, corso_di_laurea: 'Medicina e Chirurgia' }
      ]) })
    })
    await page.route('**/functions/v1/flashcards-api', async route => {
      const request = route.request()
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
        'access-control-allow-methods': 'POST, OPTIONS',
        'content-type': 'application/json'
      }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      let payload = {}
      try { payload = request.postDataJSON() || {} } catch {}
      if (payload.action === 'rate') return route.fulfill({ status: 200, headers, body: JSON.stringify({ saved: true }) })
      return route.fulfill({
        status: 200, headers,
        body: JSON.stringify({
          subject: 'Materia dimostrativa', subject_id: payload.subjectId || 'test-subject',
          cards: [{
            id: 'responsive-test-card', subject_id: payload.subjectId || 'test-subject',
            question_front: 'Quale principio scientifico spiega il fenomeno descritto nel caso clinico?',
            answer_back: 'Il principio di conservazione dell’energia, applicato al sistema considerato.',
            explanation: 'La spiegazione chiarisce il meccanismo e distingue la risposta corretta dalle alternative.',
            order_index: 1, quiz_number: 1, user_rating: null
          }],
          total_cards: 1, offset: 0, unlocked: false, free_limit: 50, paywall: false, next_offset: 1
        })
      })
    })
    // La dashboard pubblica è /come-funziona; /quiz è invece il catalogo delle esercitazioni.
    await page.goto(`${baseUrl}/come-funziona`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.locator('.mobile-bottom-nav button').first().waitFor({ state: mobileNavExpected ? 'visible' : 'attached', timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)
    const initial = await page.evaluate(() => ({
      width: window.innerWidth,
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
      visualScale: window.visualViewport?.scale ?? 1,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      navVisible: (() => {
        const nav = document.querySelector('.mobile-bottom-nav')
        return !!nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 0
      })(),
      navButtons: document.querySelectorAll('.mobile-bottom-nav button').length,
      homeHeaderVisible: (() => { const header = document.querySelector('.topbar:has(.home-wordmark)'); return !!header && getComputedStyle(header).display !== 'none' && header.getBoundingClientRect().height > 0 })(),
      homeHeaderHeight: Math.round(document.querySelector('.topbar:has(.home-wordmark)')?.getBoundingClientRect().height ?? 0),
      homeBrandVisible: (() => { const brand = document.querySelector('.topbar:has(.home-wordmark) .home-wordmark'); return !!brand && getComputedStyle(brand).display !== 'none' && brand.getBoundingClientRect().width > 0 })(),
      homeMenuVisible: (() => { const button = document.querySelector('.topbar:has(.home-wordmark) .hamb'); return !!button && getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width > 0 })(),
      creditsVisible: (() => { const button = document.querySelector('.home-buy-credits'); return !!button && getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width > 0 })(),
      profileVisible: (() => { const button = document.querySelector('.home-profile-avatar'); return !!button && getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width > 0 })(),
      navTargets: [...document.querySelectorAll('.mobile-bottom-nav button')].map(button => {
        const rect = button.getBoundingClientRect()
        return { width: Math.round(rect.width), height: Math.round(rect.height) }
      }),
    }))

    const pwa = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]')
      if (!link) return { linked: false, status: 0, display: '', icons: 0, iconsValid: false }
      const response = await fetch(link.href)
      if (!response.ok) return { linked: true, status: response.status, display: '', icons: 0 }
      const manifest = await response.json()
      const icons = Array.isArray(manifest.icons) ? manifest.icons : []
      const iconChecks = await Promise.all(icons.map(async icon => {
        const iconResponse = await fetch(new URL(icon.src, location.origin))
        return iconResponse.ok && (iconResponse.headers.get('content-type') || '').includes('image/png')
      }))
      return { linked: true, status: response.status, display: manifest.display || '', icons: icons.length, iconsValid: iconChecks.length >= 2 && iconChecks.every(Boolean) }
    })
    if (!pwa.linked || pwa.status !== 200 || pwa.display !== 'standalone' || pwa.icons < 2 || !pwa.iconsValid) failures.push(`${viewport.name}: manifest PWA mancante o incompleto (${JSON.stringify(pwa)})`)
    if (!initial.viewportMeta.includes('width=device-width') || !initial.viewportMeta.includes('initial-scale=1')) failures.push(`${viewport.name}: meta viewport assente o non corretta`)
    if (Math.abs(initial.visualScale - 1) > 0.01) failures.push(`${viewport.name}: scala iniziale diversa da 100% (${initial.visualScale})`)
    const horizontalOverflow = Math.max(initial.documentWidth, initial.bodyWidth) - initial.width
    if (horizontalOverflow > 1) failures.push(`${viewport.name}: overflow orizzontale di ${horizontalOverflow}px`)
    if (mobileNavExpected && !initial.navVisible) failures.push(`${viewport.name}: navigazione mobile non visibile nella dashboard`)
    if (!mobileNavExpected && initial.navVisible) failures.push(`${viewport.name}: navigazione mobile inattesa su viewport desktop`)
    if (!initial.homeHeaderVisible) failures.push(`${viewport.name}: barra superiore home non visibile`)
    if (initial.homeHeaderHeight > 78) failures.push(`${viewport.name}: barra home su più righe (${initial.homeHeaderHeight}px)`)
    if (mobileNavExpected && !initial.homeMenuVisible) failures.push(`${viewport.name}: pulsante Menu home non visibile`)
    if (!initial.homeBrandVisible) failures.push(`${viewport.name}: marchio SMLQUIZ non visibile in home`)
    if (!initial.creditsVisible) failures.push(`${viewport.name}: acquisto crediti non visibile in home`)
    if (!initial.profileVisible) failures.push(`${viewport.name}: profilo non visibile in home`)
    // Titoli e descrizioni della home devono stare su righe distinte, mai sovrapporsi.
    const homeFeatureText = await page.locator('.home-intro .performance-row').evaluateAll(rows => rows.map(row => {
      const title = row.querySelector('b')
      const description = row.querySelector('small')
      if (!title || !description) return { valid: false }
      const a = title.getBoundingClientRect()
      const b = description.getBoundingClientRect()
      return { valid: true, titleBottom: a.bottom, descriptionTop: b.top, descriptionHeight: b.height }
    }))
    homeFeatureText.forEach((item, index) => {
      if (!item.valid || item.descriptionTop < item.titleBottom - 1 || item.descriptionHeight < 1) {
        failures.push(`${viewport.name}: testo descrittivo della scheda home ${index + 1} sovrapposto o non visibile`)
      }
    })
    if (initial.navButtons !== 5) failures.push(`${viewport.name}: attesi 5 pulsanti di navigazione, trovati ${initial.navButtons}`)
    if (mobileNavExpected) initial.navTargets.forEach((target, index) => {
      if (target.width < 44 || target.height < 40) failures.push(`${viewport.name}: pulsante ${index + 1} troppo piccolo (${target.width}x${target.height}px)`)
    })

    await page.screenshot({ path: `artifacts/mobile-responsive/${viewport.name}-home.png`, fullPage: true })

    // Prima prova il blocco anonimo; poi crea una sessione di test locale per esercitare le funzioni protette.
    await page.goto(`${baseUrl}/review`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.locator('.auth-form').waitFor({ state: 'visible', timeout: 15000 })
    if (new URL(page.url()).pathname !== '/account') failures.push(`${viewport.name}: una rotta protetta non reindirizza all'accesso`)
    if (await page.locator('.flashcards-page').count()) failures.push(`${viewport.name}: flashcard visibili senza autenticazione`)
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJlbWFpbCI6InJlc3BvbnNpdmVAZXhhbXBsZS5jb20iLCJzZXNzaW9uX2lkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyIiwiZXhwIjo0MTAyNDQ0ODAwfQ.signature'
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('sb-fgrwwauwnxvrcgqqpksp-auth-token', JSON.stringify({
        access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'responsive-test-refresh-token', user
      }))
    }, { token: testToken, user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'responsive@example.com', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' } })
    await page.goto(`${baseUrl}/come-funziona`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.getByText('responsive@example.com').first().waitFor({ state: 'visible', timeout: 10000 })

    // Torna alla dashboard prima di ogni prova: le funzioni sono immersive e nascondono la nav globale.
    const expectedPaths = ['/quiz', '/semestre-filtro', '/review', '/account']
    for (let index = 0; index < expectedPaths.length; index++) {
      if (index > 0) await page.goto(`${baseUrl}/come-funziona`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      if (mobileNavExpected) await page.locator('.mobile-bottom-nav button').nth(index).evaluate(element => element.click())
      else await page.goto(`${baseUrl}${expectedPaths[index]}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(250)
      const state = await page.evaluate(() => {
        const offenders = [...document.querySelectorAll('body *')].map(el => {
          const rect = el.getBoundingClientRect()
          const style = getComputedStyle(el)
          return { tag: el.tagName, cls: typeof el.className === 'string' ? el.className.slice(0,90) : '', right: Math.round(rect.right), width: Math.round(rect.width), display: style.display, position: style.position }
        }).filter(x => x.display !== 'none' && x.width > 0 && x.right > window.innerWidth + 1).slice(0,5)
        const homeBack = document.querySelector('.function-home-back')
        const topbar = document.querySelector('.topbar')
        const nav = document.querySelector('.mobile-bottom-nav')
        return {
          documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
          width: window.innerWidth, path: window.location.pathname, offenders,
          homeBackVisible: !!homeBack && getComputedStyle(homeBack).display !== 'none' && homeBack.getBoundingClientRect().width > 0,
          homeBackBottom: homeBack?.getBoundingClientRect().bottom ?? 0,
          firstHeadingTop: document.querySelector('.content h1')?.getBoundingClientRect().top ?? 0,
          topbarVisible: !!topbar && getComputedStyle(topbar).display !== 'none' && topbar.getBoundingClientRect().height > 0,
          navVisible: !!nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 0
        }
      })
      if (state.path !== expectedPaths[index]) failures.push(`${viewport.name}, destinazione ${index + 1}: percorso ${state.path}, atteso ${expectedPaths[index]}`)
      if (!state.homeBackVisible) failures.push(`${viewport.name}, ${state.path}: pulsante Torna alla home non visibile`)
      if (state.firstHeadingTop > 0 && state.firstHeadingTop < state.homeBackBottom + 4) failures.push(`${viewport.name}, ${state.path}: titolo sovrapposto al pulsante Torna alla home`)
      if (state.topbarVisible) failures.push(`${viewport.name}, ${state.path}: barra superiore ancora visibile in modalità immersiva`)
      if (state.navVisible) failures.push(`${viewport.name}, ${state.path}: navigazione globale ancora visibile in modalità immersiva`)
      const overflow = Math.max(state.documentWidth, state.bodyWidth) - state.width
      if (overflow > 1) failures.push(`${viewport.name}, destinazione ${index + 1} ${state.path}: overflow di ${overflow}px; elementi: ${JSON.stringify(state.offenders)}`)
      if (index === 2) {
        const textBackgrounds = await page.evaluate(() => [
          '.flashcards-eyebrow','.flashcards-hero h1','.flashcards-hero p',
          '.flashcards-subject-label','.flashcards-overview-item strong','.flashcards-overview-item small'
        ].map(selector => {
          const el = document.querySelector(selector)
          return { selector, background: el ? getComputedStyle(el).backgroundColor : 'missing' }
        }))
        for (const item of textBackgrounds) {
          if (item.background !== 'rgba(0, 0, 0, 0)' && item.background !== 'transparent') failures.push(`${viewport.name}, flashcard ${item.selector}: sfondo testo inatteso ${item.background}`)
        }
      }
      if (index === 2) {
        await page.waitForFunction(() => {
          const select = document.querySelector('#flashcards-subject')
          return !!select && select.options.length > 1
        }, null, { timeout: 15000 }).catch(() => {})
        await page.locator('.flashcard-stage .flashcard-3d').waitFor({ state: 'visible', timeout: 15000 })
        const cardMetrics = await page.evaluate(() => {
          const card = document.querySelector('.flashcard-3d')
          const copy = document.querySelector('.flashcard-front .flashcard-copy')
          const rect = card?.getBoundingClientRect()
          return { width: rect?.width ?? 0, height: rect?.height ?? 0, fontSize: copy ? Number.parseFloat(getComputedStyle(copy).fontSize) : 0 }
        })
        if (cardMetrics.height < 400 || cardMetrics.width < (viewport.width <= 800 ? viewport.width * 0.72 : 600)) failures.push(`${viewport.name}: flashcard troppo piccola (${JSON.stringify(cardMetrics)})`)
        if (cardMetrics.fontSize < (viewport.width <= 800 ? 22 : 27)) failures.push(`${viewport.name}: testo flashcard troppo piccolo (${cardMetrics.fontSize}px)`)
        if (index === 2 && viewport.name === 'iphone-se-small') await page.screenshot({ path: 'artifacts/mobile-responsive/iphone-se-small-flashcards.png', fullPage: true })
        await page.locator('.flashcard-3d').click()
        await page.locator('.flashcard-ratings').waitFor({ state: 'visible', timeout: 5000 })
        const flippedMetrics = await page.evaluate(() => ({
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
          ratingHeights: [...document.querySelectorAll('.flashcard-ratings button')].map(button => button.getBoundingClientRect().height)
        }))
        if (flippedMetrics.overflow > 1) failures.push(`${viewport.name}: overflow dopo aver girato la flashcard di ${flippedMetrics.overflow}px`)
        if (flippedMetrics.ratingHeights.some(height => height < 44)) failures.push(`${viewport.name}: pulsanti di valutazione flashcard troppo piccoli`)
        if (viewport.name === 'iphone-se-small') await page.screenshot({ path: 'artifacts/mobile-responsive/iphone-se-small-flashcards-back.png', fullPage: true })
        if (!(await page.locator('.flashcard-explanation').isVisible())) failures.push(`${viewport.name}: spiegazione flashcard non visibile sul retro`)
        await page.locator('.rating-easy').click()
        await page.getByText('Ottimo lavoro: hai completato tutte le flashcard.').waitFor({ state: 'visible', timeout: 5000 })
      }
    }

    // Tutte le sezioni su quattro form factor rappresentativi; i 16 viewport coprono comunque le 4 funzioni principali.
    const fullRouteAudit = new Set(['iphone-se-small', 'phone-390', 'tablet-768', 'desktop-1440'])
    if (fullRouteAudit.has(viewport.name)) for (const route of routePaths) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(120)
      const layout = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportScale: window.visualViewport?.scale ?? 1,
      }))
      if (route === '/review' && await page.locator('.flashcards-page').count()) {
        const adSlots = await page.locator('.flashcards-page [data-ad-slot]').count()
        if (adSlots > 2) failures.push(`${viewport.name}, flashcard: troppi spazi pubblicitari, trovati ${adSlots}`)
        if (adSlots > 0 && await page.locator('.flashcards-ad-slot-top').count() !== 1) failures.push(`${viewport.name}, flashcard: spazio pubblicitario superiore mancante`)
      }
      if (viewport.name === 'iphone-se-small' || viewport.name === 'desktop-1440') {
        const shotName = route.slice(1).replaceAll('/', '-') || 'root'
        await page.screenshot({ path: `artifacts/mobile-responsive/${viewport.name}-section-${shotName}.png`, fullPage: true })
      }
      const routeOverflow = Math.max(layout.documentWidth, layout.bodyWidth) - layout.width
      if (routeOverflow > 1) failures.push(`${viewport.name}, sezione ${route}: overflow orizzontale di ${routeOverflow}px`)
      if (Math.abs(layout.viewportScale - 1) > 0.01) failures.push(`${viewport.name}, sezione ${route}: scala viewport diversa da 100%`)
    }

    if (pageErrors.length) failures.push(`${viewport.name}: errori JavaScript: ${pageErrors.join(' | ')}`)
    await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(120)
    await page.screenshot({ path: `artifacts/mobile-responsive/${viewport.name}-account.png`, fullPage: true })
    results.push({ viewport: viewport.name, dimensions: `${viewport.width}x${viewport.height}`, overflow: Math.max(0, horizontalOverflow), nav: initial.navVisible ? 'visibile' : 'non visibile', errors: pageErrors.length })
    await page.close()
  }

  for (const result of results) console.log(`PASS ${result.viewport} ${result.dimensions} overflow=${result.overflow}px nav=${result.nav} jsErrors=${result.errors}`)
  if (failures.length) {
    for (const failure of failures) console.error('FAIL ' + failure)
    process.exitCode = 1
  } else {
    console.log(`TUTTI I ${results.length} VIEWPORT SUPERATI; navigazione testata su 4 sezioni per viewport.`)
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  preview.kill('SIGTERM')
}
