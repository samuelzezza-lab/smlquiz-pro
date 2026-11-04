import { readFileSync } from 'node:fs'

const locales = ['it', 'en', 'fr', 'de', 'es', 'zh']
const dictionaries = new Map()
for (const locale of locales) {
  const dictionary = JSON.parse(readFileSync('src/locales/' + locale + '.json', 'utf8'))
  const keys = Object.keys(dictionary)
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
  if (duplicates.length) throw new Error('Duplicate keys in ' + locale + ': ' + duplicates.join(', '))
  dictionaries.set(locale, new Set(keys))
}
const base = dictionaries.get('it')
const errors = []
for (const locale of locales) {
  const keys = dictionaries.get(locale)
  for (const key of base) if (!keys.has(key)) errors.push(locale + ': missing ' + key)
  for (const key of keys) if (!base.has(key)) errors.push(locale + ': unexpected ' + key)
}

const sourceFiles = ['src/App.tsx', 'src/components/Turnstile.tsx']
const usedKeys = new Set()
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\b(?:tr|t)\(['"]([^'"]+)['"]\)/g)) usedKeys.add(match[1])
}
for (const locale of locales) {
  const keys = dictionaries.get(locale)
  for (const key of usedKeys) {
    if (!keys.has(key)) errors.push(locale + ': used translation key is missing: ' + key)
  }
}

if (errors.length) { console.error(errors.join('\\n')); process.exitCode = 1 }
else console.log('Translations OK: ' + locales.length + ' languages, ' + base.size + ' matching keys.')
