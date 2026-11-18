import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const read = path => readFileSync(path, 'utf8')
const fail = message => { console.error('Security contract failed:', message); process.exitCode = 1 }
const app = read('src/App.tsx')
const i18n = read('src/i18n.ts')
const headers = read('public/_headers')

if (!/export type Language = 'it'/.test(i18n)) fail('The application language must remain Italian-only.')
if (!/import it from '\.\/locales\/it\.json'/.test(i18n)) fail('The Italian dictionary must be the only loaded locale.')
if (!app.includes("const strongPasswordPattern=/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,}$/")) fail('The password policy must require 12 characters with mixed character classes.')
const register = app.slice(app.indexOf("authMode!=='reset'&&<>"), app.indexOf("authMode==='register'&&<label className=\"consent\""))
if (!register.includes("minLength={authMode==='register'?12:8}") || !register.includes(".{12,}")) fail('Registration form validation must enforce the 12-character policy.')
const recoveryStart = app.indexOf("<h2>{tr('setNewPassword')}</h2>")
const recoveryEnd = app.indexOf('</form>', recoveryStart)
const recovery = recoveryStart >= 0 && recoveryEnd > recoveryStart ? app.slice(recoveryStart, recoveryEnd) : ''
if (!recovery.includes('minLength={12}') || !recovery.includes('.{12,}')) fail('Password recovery must enforce the same 12-character policy.')
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
if (process.exitCode) process.exit(process.exitCode)
console.log('Security contracts passed: Italian-only UI, password policy, CSP and unsafe-sink scan.')
