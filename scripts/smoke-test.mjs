import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const redirects = await readFile(new URL('../dist/_redirects', import.meta.url), 'utf8')
assert.match(redirects, /\/app\/ \/index\.html 200/)
assert.match(redirects, /\/app \/index\.html 200/)

const routes = JSON.parse(await readFile(new URL('../dist/_routes.json', import.meta.url), 'utf8'))
assert.ok(routes.include.includes('/*'), 'Cloudflare middleware must cover document routes')
assert.ok(routes.exclude.includes('/assets/*'), 'Static assets should bypass middleware')

const { onRequest } = await import('../functions/_middleware.js')
const redirectResponse = await onRequest({
  request: new Request('https://www.smlquiz.it/guide/anatomia/?source=test'),
  next: async () => new Response('next was unexpectedly called'),
})
assert.equal(redirectResponse.status, 301)
assert.equal(redirectResponse.headers.get('location'), 'https://smlquiz.it/guide/anatomia/?source=test')

let nextCalled = false
const apexResponse = await onRequest({
  request: new Request('https://smlquiz.it/'),
  next: async () => { nextCalled = true; return new Response('ok') },
})
assert.equal(apexResponse.status, 200)
assert.equal(nextCalled, true)

const port = 4179
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('../', import.meta.url),
  stdio: 'ignore',
})
const base = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(base)
      if (response.ok) { ready = true; break }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, 'Vite preview did not become ready')

  const pages = [
    ['/', 'SMLQUIZ Pro'],
    ['/app/', 'SMLQUIZ Pro'],
    ['/?app=1', 'SMLQUIZ Pro'],
    ['/privacy/', 'Privacy Policy'],
    ['/cookie/', 'Cookie Policy'],
    ['/termini/', "Termini d'uso"],
    ['/contatti/', 'Contatti'],
  ]
  for (const [path, expected] of pages) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`)
    const html = await response.text()
    assert.match(html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${path} did not contain expected page text`)
  }
  process.stdout.write('Smoke tests passed: SPA entry routes, legal/contact pages, Cloudflare redirects config, www canonical redirect middleware.\\n')
} finally {
  server.kill('SIGTERM')
}
