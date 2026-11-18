import it from './locales/it.json'

export type Language = 'it'

const italianDictionary = it as Record<string, string>

export function t(_language: Language, key: string) {
  return italianDictionary[key] ?? italianDictionary.translationUnavailable ?? key
}
