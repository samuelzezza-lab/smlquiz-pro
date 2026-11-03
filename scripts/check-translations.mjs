import { readFileSync } from 'node:fs'

const source = readFileSync('src/i18n.ts', 'utf8')
const locales = ['it', 'en', 'fr', 'de', 'es', 'zh']
const dictionaries = new Map()

for (const locale of locales) {
  const marker = 'const ' + locale + ':Record<string,string>={'
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('Dictionary missing: ' + locale)
  const nextLocale = locales[locales.indexOf(locale) + 1]
  const nextMarker = nextLocale ? 'const ' + nextLocale + ':Record<string,string>={' : 'const dictionaries:'
  const end = source.indexOf(nextMarker, start + marker.length)
  if (end < 0) throw new Error('Dictionary end missing: ' + locale)
  const body = source.slice(start + marker.length, end)
  const keys = [...body.matchAll(/(?:^|,|\\n)\\s*([A-Za-z_$][A-Za-z0-9_$]*)\\s*:/g)].map(match => match[1])
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
  if (duplicates.length) throw new Error('Duplicate keys in ' + locale + ': ' + [...new Set(duplicates)].join(', '))
  dictionaries.set(locale, new Set(keys))
}

const base = dictionaries.get('it')
const errors = []
for (const locale of locales) {
  const keys = dictionaries.get(locale)
  for (const key of base) if (!keys.has(key)) errors.push(locale + ': missing ' + key)
  for (const key of keys) if (!base.has(key)) errors.push(locale + ': unexpected ' + key)
}
if (errors.length) {
  console.error(errors.join(String.fromCharCode(10)))
  process.exitCode = 1
} else {
  console.log('Translations OK: ' + locales.length + ' languages, ' + base.size + ' matching keys.')
}
