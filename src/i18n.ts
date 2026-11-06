import it from './locales/it.json'
import en from './locales/en.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import es from './locales/es.json'
import zh from './locales/zh.json'
export type Language='it'|'en'|'fr'|'de'|'es'|'zh'
export const languages:{code:Language;label:string;flag:string}[]=[
 {code:'it',label:'Italiano',flag:'🇮🇹'},{code:'en',label:'English',flag:'🇬🇧'},
 {code:'fr',label:'Français',flag:'🇫🇷'},{code:'de',label:'Deutsch',flag:'🇩🇪'},
 {code:'es',label:'Español',flag:'🇪🇸'},{code:'zh',label:'中文',flag:'🇨🇳'}
]
const dictionaries:Record<Language,Record<string,string>>={it,en,fr,de,es,zh}
export function t(lang:Language,key:string){return dictionaries[lang][key]??dictionaries[lang].translationUnavailable??key}
