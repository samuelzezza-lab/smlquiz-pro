import { readFileSync } from 'node:fs'

const source = readFileSync('src/i18n.ts', 'utf8')
const locales = ['it', 'en', 'fr', 'de', 'es', 'zh']
const dictionaries = new Map()

function extractKeys(body) {
  const keys = []
  for (let i = 0; i < body.length; i++) {
    if (i !== 0 && body[i - 1] !== ',' && body[i - 1] !== '\n') continue
    let cursor = i
    while (cursor < body.length && /\s/.test(body[cursor])) cursor++
    const start = cursor
    while (cursor < body.length && /[A-Za-z0-9_$]/.test(body[cursor])) cursor++
    if (cursor > start && body[cursor] === ':') keys.push(body.slice(start, cursor))
  }
  return keys
}

for (const locale of locales) {
  const marker = 'const ' + locale + ':Record<string,string>={'
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('Dictionary missing: ' + locale)
  const nextLocale = locales[locales.indexOf(locale) + 1]
  const nextMarker = nextLocale ? 'const ' + nextLocale + ':Record<string,string>={' : 'const dictionaries:'
  const end = source.indexOf(nextMarker, start + marker.length)
  if (end < 0) throw new Error('Dictionary end missing: ' + locale)
  const keys = extractKeys(source.slice(start + marker.length, end))
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
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log('Translations OK: ' + locales.length + ' languages, ' + base.size + ' matching keys.')
}
