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
let browser

const viewports = [
  { name: 'iphone-se-small', width: 320, height: 568 },
  { name: 'phone-360', width: 360, height: 800 },
  { name: 'iphone-375', width: 375, height: 812 },
  { name: 'iphone-390', width: 390, height: 844 },
  { name: 'phone-414', width: 414, height: 896 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
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
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.locator('.mobile-bottom-nav button').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)

    const initial = await page.evaluate(() => ({
      width: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      navVisible: (() => {
        const nav = document.querySelector('.mobile-bottom-nav')
        return !!nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 0
      })(),
      navButtons: document.querySelectorAll('.mobile-bottom-nav button').length,
      homeHeaderVisible: (() => { const header = document.querySelector('.topbar:has(.home-wordmark)'); return !!header && getComputedStyle(header).display !== 'none' && header.getBoundingClientRect().height > 0 })(),
      homeMenuVisible: (() => { const button = document.querySelector('.topbar:has(.home-wordmark) .hamb'); return !!button && getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width > 0 })(),
      creditsVisible: (() => { const button = document.querySelector('.home-buy-credits'); return !!button && getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width > 0 })(),
      profileVisible: (() => { const button = document.querySelector('.home-profile-avatar'); return !!button && getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width > 0 })(),
      navTargets: [...document.querySelectorAll('.mobile-bottom-nav button')].map(button => {
        const rect = button.getBoundingClientRect()
        return { width: Math.round(rect.width), height: Math.round(rect.height) }
      }),
    }))

    const horizontalOverflow = Math.max(initial.documentWidth, initial.bodyWidth) - initial.width
    if (horizontalOverflow > 1) failures.push(`${viewport.name}: overflow orizzontale di ${horizontalOverflow}px`)
    if (!initial.navVisible) failures.push(`${viewport.name}: navigazione mobile non visibile`)
    if (!initial.homeHeaderVisible) failures.push(`${viewport.name}: barra superiore home non visibile`)
    if (!initial.homeMenuVisible) failures.push(`${viewport.name}: pulsante Menu home non visibile`)
    if (!initial.creditsVisible) failures.push(`${viewport.name}: acquisto crediti non visibile in home`)
    if (!initial.profileVisible) failures.push(`${viewport.name}: profilo non visibile in home`)
    if (initial.navButtons !== 5) failures.push(`${viewport.name}: attesi 5 pulsanti di navigazione, trovati ${initial.navButtons}`)
    initial.navTargets.forEach((target, index) => {
      if (target.width < 44 || target.height < 40) failures.push(`${viewport.name}: pulsante ${index + 1} troppo piccolo (${target.width}x${target.height}px)`)
    })

    // Prova le quattro destinazioni principali tramite gli stessi pulsanti usati dagli utenti.
    for (let index = 0; index < 4; index++) {
      await page.locator('.mobile-bottom-nav button').nth(index).evaluate(element => element.click())
      await page.waitForTimeout(180)
      const state = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        width: window.innerWidth,
        path: window.location.pathname,
      }))
      const expectedPaths = ['/quiz', '/semestre-filtro', '/account', '/account']
      if (state.path !== expectedPaths[index]) failures.push(`${viewport.name}, destinazione ${index + 1}: percorso ${state.path}, atteso ${expectedPaths[index]}`)
      const overflow = Math.max(state.documentWidth, state.bodyWidth) - state.width
      if (overflow > 1) failures.push(`${viewport.name}, destinazione ${index + 1}: overflow di ${overflow}px`)
    }

    if (pageErrors.length) failures.push(`${viewport.name}: errori JavaScript: ${pageErrors.join(' | ')}`)
    await page.screenshot({ path: `artifacts/mobile-responsive/${viewport.name}.png`, fullPage: true })
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
