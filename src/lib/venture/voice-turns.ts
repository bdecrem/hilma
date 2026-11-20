// What a few more words from Bart mean on a voice call (OLA-204). No imports: the phone route
// (phone.ts), the talk page (Talk.tsx, in the browser) and the voice writer on the Mac mini
// (scripts/venture/voice-server.ts) all use it, and scripts/venture/voice-turns-test.ts tests it.
//
// The check-in of 2026-11-19 (the phone): three replies in a row were thrown away because he was
// still talking, each restart cost the four to six seconds a reply takes to begin, and he asked
// "Are you still there?". What he had added each time was a few words ("Okay.", "Test round.",
// "Yeah, this looks good."). So:
// - a reply in progress is carried over to his longer turn when he only added a few words that do
//   not turn it (no "no", "but", "wait", no new question): mayCarryOver;
// - his earlier words that the engine sends again at the front of a new turn are not his new
//   line: withoutRepeat;
// - a "yeah" under Kit's voice is not an interruption: isBackchannel.

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
export const words = (s: string) => (norm(s) ? norm(s).split(' ') : [])

/// The length of the longest common subsequence of two word lists.
function common(a: string[], b: string[]): number {
  const a2 = a.slice(0, 400), b2 = b.slice(0, 400)
  let prev = new Array(b2.length + 1).fill(0)
  for (const x of a2) {
    const row = [0]
    for (let j = 0; j < b2.length; j++) row.push(x === b2[j] ? prev[j] + 1 : Math.max(prev[j + 1], row[j]))
    prev = row
  }
  return prev[b2.length]
}

const startsWithWords = (long: string[], short: string[]) => short.length <= long.length && short.every((w, i) => long[i] === w)

/// The same spoken turn, heard again: one is the other with more words, or the same words fixed up
/// (a stutter heard twice: "I, I, I'm clear" and "I, I, I, I'm clear").
export function isRevision(before: string, after: string): boolean {
  const aw = words(before), bw = words(after)
  if (!aw.length || !bw.length) return false
  if (startsWithWords(bw, aw) || startsWithWords(aw, bw)) return true
  const n = Math.min(aw.length, bw.length)
  if (n < 4) return false
  return common(aw, bw) / n >= 0.8
}

/// At most this many new words still count as "a few".
export const CARRY_MAX_WORDS = 8
// Words that turn what he said: a reply written to the earlier words could be wrong.
const TURNERS = new Set(
  "no not nope don't dont doesn't isn't can't won't didn't never but except wait actually instead stop skip cancel rather unless without hold scratch sorry change".split(' '),
)
const PRESENCE = /\b(still there|you there|hear me|hello)\b/

/// A reply written to `before` still answers `after`: the same turn with at most a few more words,
/// none of which turns it, and no new question (other than "are you still there?").
export function mayCarryOver(before: string, after: string): boolean {
  const aw = words(before), bw = words(after)
  if (!aw.length || !bw.length) return false
  let added: string[]
  if (startsWithWords(bw, aw)) added = bw.slice(aw.length)
  else if (isRevision(before, after)) {
    const left = [...aw]
    added = bw.filter((w) => {
      const i = left.indexOf(w)
      if (i < 0) return true
      left.splice(i, 1)
      return false
    })
  } else return false
  if (added.length > CARRY_MAX_WORDS) return false
  if (added.some((w) => TURNERS.has(w))) return false
  const questions = (s: string) => (s.match(/\?/g) ?? []).length
  if (questions(after) > questions(before) && !PRESENCE.test(added.join(' '))) return false
  return true
}

/// `said` without his own earlier lines at its front. ElevenLabs keeps adding to his turn while
/// Kit's answer to it has not been heard, so a new turn can start with words already stored
/// (2026-11-19: "Excellent. I'm looking at it now." came back at the front of three turns).
/// `earlier` is his stored lines, oldest first; the longest run of the last ones that the new
/// turn starts with (three words or more) is cut off.
export function withoutRepeat(said: string, earlier: string[]): string {
  const sw = words(said)
  for (let k = Math.min(earlier.length, 4); k >= 1; k--) {
    const pw = words(earlier.slice(-k).join(' '))
    if (pw.length < 3 || pw.length >= sw.length || !startsWithWords(sw, pw)) continue
    // Find where in the raw text those words end.
    const tokens = said.trim().split(/\s+/)
    let n = 0
    for (let i = 0; i < tokens.length; i++) {
      n += words(tokens[i]).length
      if (n === pw.length) return tokens.slice(i + 1).join(' ').trim()
      if (n > pw.length) break // a token spans the boundary ("now.Uh"): leave it whole
    }
  }
  return said
}

const BACKCHANNEL = new Set(
  'yeah yes yep yup ok okay mm mhm mmhmm hmm hm uh huh um ah oh right sure cool great nice good alright gotcha got it i see sounds totally exactly true'.split(' '),
)

/// A word or two under Kit's voice that is listening, not taking the floor: "yeah", "mm-hmm",
/// "okay", "right", "got it".
export function isBackchannel(text: string): boolean {
  const w = words(text)
  return w.length > 0 && w.length <= 3 && w.every((x) => BACKCHANNEL.has(x))
}
