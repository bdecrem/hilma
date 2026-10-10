// The languages Dolly teaches. Spanish is the one with content behind it;
// Mandarin is offered in onboarding and runs through the same prompts, with
// pinyin on every item so a typed card can be answered either way.

export type LanguageCode = 'es' | 'zh'

export type Language = {
  code: LanguageCode
  /** As the UI says it: "Spanish". */
  name: string
  /** In itself: "Español". */
  endonym: string
  /** How the prompts name it. */
  speak: string
  /** Under a type-it card. */
  typeHint: string
  placeholder: string
}

export const LANGUAGES: Record<LanguageCode, Language> = {
  es: {
    code: 'es',
    name: 'Spanish',
    endonym: 'Español',
    speak: 'Spanish',
    typeHint: 'Accents and el/la are optional.',
    placeholder: 'Type it in Spanish',
  },
  zh: {
    code: 'zh',
    name: 'Mandarin',
    endonym: '中文',
    speak: 'Mandarin Chinese',
    typeHint: 'Characters or pinyin; tones are optional.',
    placeholder: 'Type it in Mandarin or pinyin',
  },
}

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[]

export function isLanguage(x: unknown): x is LanguageCode {
  return typeof x === 'string' && x in LANGUAGES
}

export type Level = 'new' | 'some' | 'conversational'
export const LEVELS: Level[] = ['new', 'some', 'conversational']
export function isLevel(x: unknown): x is Level {
  return typeof x === 'string' && (LEVELS as string[]).includes(x)
}

/** The level in the tutor's own words, for the prompts. */
export function levelLine(level: Level, speak: string): string {
  switch (level) {
    case 'new':
      return `They are brand new to ${speak}: very simple words, short sentences, slowly, and English the moment they are lost. Mostly yes-or-no and one-word questions, and give them the words to answer with.`
    case 'some':
      return `They know some ${speak}: present and simple past, everyday vocabulary. Stay in ${speak}; use English only to explain a word, then go back.`
    case 'conversational':
      return `They can hold a conversation: speak ${speak} naturally, at normal speed, with no English unless they ask for it.`
  }
}

/** Strip accents, case, punctuation, doubled spaces and, in Spanish, a
 *  leading article, so "El atasco" and "el atasco" and "atasco" all match. */
export function normalizeAnswer(lang: LanguageCode, v: string): string {
  if (lang === 'zh') {
    const t = v.trim()
    // Characters: drop spaces and punctuation. Pinyin: lowercase, no tone
    // marks or tone digits, no spaces.
    if (/[㐀-鿿]/.test(t)) return t.replace(/[\s\p{P}]/gu, '')
    return t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ü/g, 'v')
      .replace(/[^a-z]/g, '')
  }
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zñ\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(el|la|los|las|un|una) /, '')
}

/** Does a typed answer count? Loose on purpose: this is a drill, not an exam. */
export function answerMatches(lang: LanguageCode, typed: string, item: { target: string; pinyin?: string | null }): boolean {
  const a = normalizeAnswer(lang, typed)
  if (!a) return false
  if (a === normalizeAnswer(lang, item.target)) return true
  if (lang === 'zh' && item.pinyin && a === normalizeAnswer(lang, item.pinyin)) return true
  return false
}
