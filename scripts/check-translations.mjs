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
if (errors.length) { console.error(errors.join('\\n')); process.exitCode = 1 }
else console.log('Translations OK: ' + locales.length + ' languages, ' + base.size + ' matching keys.')
