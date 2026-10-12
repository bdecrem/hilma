// Flash card sets: ten cards on demand after the day. Half come from the
// learner's own pool (misses first, then the least recently seen), half from
// the grammar chunks of the levels they are on or have climbed; half ask the
// language from the English, half the English from the language; pick and
// type by turns. Right answers pay XP for the first five sets a day.
import {
  deleteOpenFlashSets,
  findOpenFlashSet,
  insertFlashSet,
  listFlashSetsDone,
  listItems,
  localDay,
  scoreItem,
  updateFlashSet,
  type Answer,
  type FlashSet,
  type Item,
  type Question,
  type QuestionDir,
  type User,
} from './core'
import { activeTopLevel, chunkId } from './chunks'
import { canDos } from './curriculum'
import { answerMatches, nativeMatches, type LanguageCode } from './language'
import { award, FLASH_CLEAN_BONUS, FLASH_PAID_SETS_PER_DAY, XP } from './xp'

export const FLASH_SET_SIZE = 10

type Card = {
  target: string
  native: string
  pinyin: string | null
  /** Wrong options, in the language and in English. */
  wrongTargets: string[]
  wrongNatives: string[]
  from: Question['from']
  item_id: string | null
}

function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** "I like (one thing)" → "I like"; a card answered in English shows and
 *  grades the bare meaning. */
export function cleanNative(n: string): string {
  return n.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

/** A meaning that can be typed back: no gaps ("I am … years old"), one idea. */
function typable(n: string): boolean {
  return !n.includes('…') && cleanNative(n).length > 0 && cleanNative(n).length <= 40
}

/** The ten cards. Vocabulary from the pool, grammar from the levels up to
 *  the learner's rung; when one side is short the other fills in. Empty
 *  when there is nothing to practice yet. */
export function buildFlashCards(lang: LanguageCode, rung: number, pool: Item[], size = FLASH_SET_SIZE, hidden: string[] = []): Question[] {
  const grammarAll = canDos(lang).filter((c) => c.level <= rung)
  const hid = new Set(hidden)
  const grammarCards: Card[] = shuffle(
    grammarAll.flatMap((c) =>
      c.items.filter((it) => !hid.has(chunkId(c.id, it.t))).map((it) => ({
        target: it.t,
        native: it.n,
        pinyin: lang === 'zh' ? it.p ?? null : null,
        wrongTargets: c.items.filter((x) => x.t !== it.t).map((x) => x.t),
        wrongNatives: c.items.filter((x) => x.t !== it.t).map((x) => cleanNative(x.n)),
        from: 'grammar' as const,
        item_id: null,
      })),
    ),
  )
  const vocabSorted = pool
    .slice()
    .sort((a, b) => b.misses - b.hits - (a.misses - a.hits) || (a.last_seen ?? '').localeCompare(b.last_seen ?? ''))
  const everyNative = Array.from(new Set([...pool.map((i) => cleanNative(i.native)), ...grammarCards.map((c) => cleanNative(c.native))]))
  const everyTarget = Array.from(new Set([...pool.map((i) => i.target), ...grammarCards.map((c) => c.target)]))
  const vocabCards: Card[] = vocabSorted.map((i) => ({
    target: i.target,
    native: i.native,
    pinyin: i.pinyin,
    wrongTargets: (i.distractors ?? []).filter((d) => d !== i.target),
    wrongNatives: [],
    from: i.day_n > 0 ? i.day_n : 'grammar',
    item_id: i.id,
  }))

  const half = Math.ceil(size / 2)
  let vocab = vocabCards.slice(0, half)
  let grammar = grammarCards.filter((c) => !vocab.some((v) => v.target.toLowerCase() === c.target.toLowerCase())).slice(0, size - vocab.length)
  if (vocab.length + grammar.length < size) vocab = vocabCards.slice(0, size - grammar.length)
  const cards = shuffle([...vocab, ...grammar]).slice(0, size)
  if (cards.length === 0) return []

  // Slots: pick, type, pick, type…; the direction alternates so that both
  // picks and types come both ways (five of each direction in ten).
  const slots = cards.map((_, i) => ({
    kind: i % 2 === 0 ? ('pick' as const) : ('type' as const),
    dir: ((i >> 1) + (i & 1)) % 2 === 0 ? ('to_target' as const) : ('to_native' as const),
  }))
  // Cards whose meaning cannot be typed back take the language-answer slots.
  const toNative = cards.filter((c) => typable(c.native))
  const rest = cards.filter((c) => !typable(c.native))
  const nativeSlots = slots.filter((s) => s.dir === 'to_native').length
  const forNative = toNative.slice(0, nativeSlots)
  const forTarget = [...rest, ...toNative.slice(nativeSlots)]
  const ordered: Card[] = []
  let ni = 0
  let ti = 0
  for (const s of slots) {
    if (s.dir === 'to_native' && ni < forNative.length) ordered.push(forNative[ni++])
    else if (ti < forTarget.length) ordered.push(forTarget[ti++])
    else ordered.push(forNative[ni++])
  }

  const fill = (have: string[], answer: string, from: string[], n = 3): string[] => {
    const out = have.filter((x) => x && x !== answer).slice(0, n)
    for (const x of shuffle(from)) {
      if (out.length >= n) break
      if (x !== answer && !out.includes(x)) out.push(x)
    }
    return out
  }

  return ordered.map((c, i): Question => {
    const dir: QuestionDir = slots[i].dir === 'to_native' && typable(c.native) ? 'to_native' : 'to_target'
    if (dir === 'to_native') {
      const answer = cleanNative(c.native)
      const base = { native: c.target, target: answer, pinyin: c.pinyin, from: c.from, item_id: c.item_id, dir }
      if (slots[i].kind === 'pick') {
        const wrong = fill(c.wrongNatives, answer, everyNative)
        return { kind: 'pick', ...base, options: shuffle([answer, ...wrong]) }
      }
      return { kind: 'type', ...base }
    }
    const base = { native: cleanNative(c.native), target: c.target, pinyin: c.pinyin, from: c.from, item_id: c.item_id, dir }
    if (slots[i].kind === 'pick') {
      const wrong = fill(c.wrongTargets, c.target, everyTarget)
      return { kind: 'pick', ...base, options: shuffle([c.target, ...wrong]) }
    }
    return { kind: 'type', ...base }
  })
}

export type FlashView = {
  id: string
  state: 'open' | 'done'
  questions: Question[]
  answers: Answer[]
  right: number
  total: number
  /** What this set paid (0 while open, or past the day's paid sets). */
  xp: number
  /** Sets finished today, and how many more still pay XP. */
  sets_today: number
  paid_left: number
}

export async function flashView(user: User, set: FlashSet, now = new Date()): Promise<FlashView> {
  const today = localDay(now, user.tz)
  const done = await listFlashSetsDone(user.id, today)
  const others = done.filter((d) => d.id !== set.id).length
  return {
    id: set.id,
    state: set.state,
    questions: set.questions,
    answers: set.answers,
    right: set.answers.filter((a) => a.ok).length,
    total: set.questions.length,
    xp: set.xp,
    sets_today: done.length,
    paid_left: Math.max(0, FLASH_PAID_SETS_PER_DAY - (set.state === 'done' ? done.length : others)),
  }
}

/** Deal a set: an open one is dropped. */
export async function dealFlashSet(user: User, now = new Date()): Promise<FlashSet | { error: string; status: number }> {
  const pool = await listItems(user.id)
  const questions = buildFlashCards(user.language, await activeTopLevel(user), pool, FLASH_SET_SIZE, user.hidden_chunks ?? [])
  if (questions.length === 0) return { error: 'Nothing to practice yet: finish a day first.', status: 409 }
  await deleteOpenFlashSets(user.id)
  return insertFlashSet({ user_id: user.id, language: user.language, day: localDay(now, user.tz), questions })
}

export { findOpenFlashSet }

export type FlashGraded = { set: FlashSet; ok: boolean; target: string; complete: boolean }

/** One card of a set, graded; the tenth finishes it and pays. */
export async function answerFlashCard(user: User, set: FlashSet, q: number, answer: string, now = new Date()): Promise<FlashGraded | { error: string; status: number }> {
  if (set.state !== 'open') return { error: 'That set is finished.', status: 409 }
  const question = set.questions[q]
  if (!question) return { error: 'No such card.', status: 400 }
  if (q !== set.answers.length) return { error: `Answer card ${set.answers.length + 1} next.`, status: 409 }
  const ok =
    question.kind === 'pick'
      ? answer === question.target
      : question.dir === 'to_native'
        ? nativeMatches(answer, question.target)
        : answerMatches(user.language, answer, question)
  const next: Answer[] = [...set.answers, { q, ok, answer: answer.slice(0, 200) }]
  const today = localDay(now, user.tz)
  if (question.item_id) await scoreItem(question.item_id, ok, today)
  const complete = next.length >= set.questions.length
  if (!complete) {
    const updated = await updateFlashSet(set.id, { answers: next })
    return { set: updated, ok, target: question.target, complete }
  }
  const right = next.filter((a) => a.ok).length
  const doneBefore = (await listFlashSetsDone(user.id, today)).filter((d) => d.id !== set.id).length
  const pays = doneBefore < FLASH_PAID_SETS_PER_DAY
  const xp = pays ? right * XP.flash + (right === set.questions.length ? FLASH_CLEAN_BONUS : 0) : 0
  const paid = xp > 0 ? await award(user.id, today, 'flash', set.id, xp) : 0
  const updated = await updateFlashSet(set.id, { answers: next, state: 'done', xp: paid, done_at: now.toISOString() })
  return { set: updated, ok, target: question.target, complete }
}
