import it from './locales/it.json'

export type Language = 'it'

export function t(_language: Language, key: string) {
  return it[key] ?? it.translationUnavailable ?? key
}
