// F3 spaced-repetition scheduler — pure functions, no I/O.
//
// Simplified SM-2 with three grades instead of four:
//   0 = forgot   (couldn't recall the idea)
//   1 = shaky    (got the gist, missed substance)
//   2 = solid    (recalled it in their own words)
//
// Solid path graduates fast: 1d -> 3d -> 3d*ease -> ... (ease starts at 2.5,
// so roughly 1, 3, 7.5, 19, 47 days). A lapse drops the card back into
// learning and shaves the ease so that idea comes around more often.

export type CardState = 'new' | 'learning' | 'review'

export type SchedulerCard = {
  state: CardState
  interval_days: number
  ease: number
  reps: number
  lapses: number
  due_at: string
  last_reviewed_at: string | null
}

export type ScheduleResult = {
  state: CardState
  interval_days: number
  ease: number
  reps: number
  lapses: number
  due_at: string
  last_reviewed_at: string
  last_grade: number
}

const MIN_EASE = 1.3
const MAX_EASE = 2.8
const LAPSE_RETRY_MINUTES = 10

export function schedule(
  card: SchedulerCard,
  grade: 0 | 1 | 2,
  now: Date = new Date(),
): ScheduleResult {
  const base = {
    reps: card.reps + 1,
    lapses: card.lapses,
    last_reviewed_at: now.toISOString(),
    last_grade: grade,
  }

  if (grade === 0) {
    // Forgot — back to learning, retry within the same session if possible.
    return {
      ...base,
      state: 'learning',
      lapses: card.lapses + 1,
      interval_days: 0,
      ease: Math.max(MIN_EASE, card.ease - 0.2),
      due_at: addMinutes(now, LAPSE_RETRY_MINUTES).toISOString(),
    }
  }

  const learning = card.state !== 'review'

  if (grade === 1) {
    if (learning) {
      // Gist but shaky — see it again tomorrow, don't graduate yet.
      return {
        ...base,
        state: 'learning',
        interval_days: 1,
        ease: card.ease,
        due_at: addDays(now, 1).toISOString(),
      }
    }
    // Shaky on a graduated card: small interval bump, ease takes a hit.
    const interval = Math.max(1, card.interval_days * 1.2)
    return {
      ...base,
      state: 'review',
      interval_days: interval,
      ease: Math.max(MIN_EASE, card.ease - 0.15),
      due_at: addDays(now, interval).toISOString(),
    }
  }

  // grade === 2, solid.
  let interval: number
  if (learning || card.interval_days < 1) {
    interval = 1
  } else if (card.interval_days < 3) {
    interval = 3
  } else {
    interval = card.interval_days * card.ease
  }
  return {
    ...base,
    state: 'review',
    interval_days: interval,
    ease: Math.min(MAX_EASE, card.ease + 0.05),
    due_at: addDays(now, interval).toISOString(),
  }
}

// How likely the user still remembers this card right now, 0..1.
// R = 0.9 ^ (elapsed / interval): exactly 0.9 when the card comes due, decaying
// past that. Unreviewed cards are 0 (nothing in memory yet); lapsed cards
// sitting in learning are nearly nothing.
export function retrievability(
  card: Pick<SchedulerCard, 'state' | 'interval_days' | 'last_reviewed_at'>,
  now: Date = new Date(),
): number {
  if (!card.last_reviewed_at || card.state === 'new') return 0
  if (card.interval_days <= 0) return 0.1
  const elapsedDays =
    (now.getTime() - new Date(card.last_reviewed_at).getTime()) / 86_400_000
  if (elapsedDays <= 0) return 1
  const r = Math.pow(0.9, elapsedDays / card.interval_days)
  return Math.max(0, Math.min(1, r))
}

// A topic's memory strength is the mean retrievability of its active cards.
// Null when the topic has no cards yet (nothing to be strong about).
export function topicStrength(
  cards: Pick<SchedulerCard, 'state' | 'interval_days' | 'last_reviewed_at'>[],
  now: Date = new Date(),
): number | null {
  if (cards.length === 0) return null
  const sum = cards.reduce((acc, c) => acc + retrievability(c, now), 0)
  return sum / cards.length
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000)
}
