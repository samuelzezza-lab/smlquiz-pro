import { readFileSync } from 'node:fs'

const i18n = readFileSync('src/i18n.ts', 'utf8')
const app = readFileSync('src/App.tsx', 'utf8')
const locales = ['it', 'en', 'fr', 'de', 'es', 'zh']
const dictionaries = new Map()

for (const locale of locales) {
  const marker = `const ${locale}:Record<string,string>={`
  const start = i18n.indexOf(marker)
  if (start < 0) throw new Error(`Dictionary missing: ${locale}`)
  const end = i18n.indexOf('\\n}', start)
  if (end < 0) throw new Error(`Dictionary not closed: ${locale}`)
  const body = i18n.slice(start + marker.length, end)
  const keys = [...body.matchAll(/^\\s*([A-Za-z_$][\\w$]*)\\s*:/gm)].map(match => match[1])
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
  if (duplicates.length) throw new Error(`Duplicate keys in ${locale}: ${[...new Set(duplicates)].join(', ')}`)
  dictionaries.set(locale, new Set(keys))
}

const referenceKeys = new Set([...app.matchAll(/tr\\(['"]([^'"]+)['"]\\)/g)].map(match => match[1]))
const baseKeys = dictionaries.get('it')
const errors = []

for (const locale of locales) {
  const keys = dictionaries.get(locale)
  for (const key of referenceKeys) if (!keys.has(key)) errors.push(`${locale}: missing UI key "${key}"`)
  for (const key of baseKeys) if (!keys.has(key)) errors.push(`${locale}: missing translation for "${key}"`)
  for (const key of keys) if (!baseKeys.has(key)) errors.push(`${locale}: extra translation key "${key}"`)
}

if (errors.length) {
  console.error(errors.join('\\n'))
  process.exit(1)
}

console.log(`Translations OK: ${locales.length} languages, ${baseKeys.size} keys, ${referenceKeys.size} UI references.`)
