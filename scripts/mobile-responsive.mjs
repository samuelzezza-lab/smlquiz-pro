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
    // La dashboard pubblica è /come-funziona; /quiz è invece il catalogo delle esercitazioni.
    await page.goto(`${baseUrl}/come-funziona`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.locator('.mobile-bottom-nav button').first().waitFor({ state: 'visible', timeout: 20000 })
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
    const mobileNavExpected = viewport.width <= 800 || (viewport.height <= 500 && viewport.width > viewport.height)
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
    initial.navTargets.forEach((target, index) => {
      if (target.width < 44 || target.height < 40) failures.push(`${viewport.name}: pulsante ${index + 1} troppo piccolo (${target.width}x${target.height}px)`)
    })

    await page.screenshot({ path: `artifacts/mobile-responsive/${viewport.name}-home.png`, fullPage: true })

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
          topbarVisible: !!topbar && getComputedStyle(topbar).display !== 'none' && topbar.getBoundingClientRect().height > 0,
          navVisible: !!nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 0
        }
      })
      if (state.path !== expectedPaths[index]) failures.push(`${viewport.name}, destinazione ${index + 1}: percorso ${state.path}, atteso ${expectedPaths[index]}`)
      if (!state.homeBackVisible) failures.push(`${viewport.name}, ${state.path}: pulsante Torna alla home non visibile`)
      if (state.topbarVisible) failures.push(`${viewport.name}, ${state.path}: barra superiore ancora visibile in modalità immersiva`)
      if (state.navVisible) failures.push(`${viewport.name}, ${state.path}: navigazione globale ancora visibile in modalità immersiva`)
      const overflow = Math.max(state.documentWidth, state.bodyWidth) - state.width
      if (overflow > 1) failures.push(`${viewport.name}, destinazione ${index + 1} ${state.path}: overflow di ${overflow}px; elementi: ${JSON.stringify(state.offenders)}`)
      if (index === 2 && viewport.name === 'iphone-se-small') await page.screenshot({ path: 'artifacts/mobile-responsive/iphone-se-small-flashcards.png', fullPage: true })
    }

    // Verifica che tutte le sezioni principali si adattino allo stesso schermo senza zoom o scroll laterale.
    for (const route of routePaths) {
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
        if (adSlots !== 2) failures.push(`${viewport.name}, flashcard: attesi 2 spazi pubblicitari, trovati ${adSlots}`)
      }
      const routeOverflow = Math.max(layout.documentWidth, layout.bodyWidth) - layout.width
      if (routeOverflow > 1) failures.push(`${viewport.name}, sezione ${route}: overflow orizzontale di ${routeOverflow}px`)
      if (Math.abs(layout.viewportScale - 1) > 0.01) failures.push(`${viewport.name}, sezione ${route}: scala viewport diversa da 100%`)
    }

    if (pageErrors.length) failures.push(`${viewport.name}: errori JavaScript: ${pageErrors.join(' | ')}`)
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
