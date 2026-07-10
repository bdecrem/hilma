export type OmniLanguage = {
  code: string
  /** English name shown in the picker. */
  name: string
  /** Name in the language itself. */
  nativeName: string
  flag: string
  /** Non-Latin scripts get a romanization line on cards and dialogue. */
  needsRomanization: boolean
  /** What the romanization is called, for prompts ("pinyin", "romaji"...). */
  romanizationName?: string
}

export const LANGUAGES: OmniLanguage[] = [
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', needsRomanization: false },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', needsRomanization: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', needsRomanization: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', needsRomanization: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', needsRomanization: false },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', needsRomanization: false },
  { code: 'zh', name: 'Mandarin', nativeName: '中文', flag: '🇨🇳', needsRomanization: true, romanizationName: 'pinyin' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', needsRomanization: true, romanizationName: 'romaji' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', needsRomanization: true, romanizationName: 'romanization' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', needsRomanization: true, romanizationName: 'transliteration' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇪🇬', needsRomanization: true, romanizationName: 'transliteration' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', needsRomanization: true, romanizationName: 'transliteration' },
]

export function languageByCode(code: string): OmniLanguage | null {
  return LANGUAGES.find((l) => l.code === code) ?? null
}

export function isLanguageCode(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code)
}

/** ChinesePod-style level names. */
export const LEVELS = [
  { level: 1, name: 'Newbie' },
  { level: 2, name: 'Elementary' },
  { level: 3, name: 'Intermediate' },
  { level: 4, name: 'Upper Intermediate' },
  { level: 5, name: 'Advanced' },
  { level: 6, name: 'Master' },
] as const

export const MAX_LEVEL = 6

export function levelName(level: number): string {
  return LEVELS.find((l) => l.level === level)?.name ?? `Level ${level}`
}

export function isValidLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL
}
