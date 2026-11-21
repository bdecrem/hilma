// Words given as Bart's are looked up (OLA-331, Nov 21). An agent could type `--why "Bart: drop it"`
// and a daily idea was dropped as if he had said so. Now the words must be found in what he really
// typed, texted or said in the last few days: the same messages the grader and the request match read
// (steers.mjs --collect: this machine's sessions, every machine's export, his texts and voice notes,
// the calls). The match is on the words after trimming, case-folding and joining white space, at
// least MIN_CHARS long, inside one of his messages.
//   const r = bartSaid('Bart: drop it, not needed', { days: 3 })   ->  { ok, why, quote }
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MIN_CHARS = 12
export const LOOKBACK_DAYS = 3
const fold = (t) => String(t ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
/** The words themselves: "Bart: <words>" or "dropped: Bart: <words>", quotes around them dropped. */
export const bartWords = (text) => fold(String(text ?? '').replace(/^\s*(dropped:\s*)?bart:\s*/i, '')).replace(/^["']+|["']+$/g, '').trim()
const pacific = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

/** Did Bart type, text or say these words in the last `days` days? messagesOf(day) gives a day's messages. */
export function findIn(words, messages) {
  const w = bartWords(words)
  if (w.length < MIN_CHARS) return { ok: false, why: `"${w}" is under ${MIN_CHARS} characters: quote enough of what he said to find it` }
  const hit = messages.find((m) => fold(m.text).includes(w))
  return hit ? { ok: true, why: '', quote: { at: hit.at, source: hit.source } } : { ok: false, why: `"${w}" is not in anything Bart typed, texted or said in the last ${LOOKBACK_DAYS} days` }
}

export function bartSaid(words, { days = LOOKBACK_DAYS, now = Date.now() } = {}) {
  const steers = process.env.VENTURE_STEERS_SCRIPT || fileURLToPath(new URL('./steers.mjs', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'bartwords-'))
  const all = []
  try {
    for (let i = 0; i < days; i++) {
      const day = pacific(now - i * 86400e3)
      const out = join(dir, `${day}.json`)
      const r = spawnSync(process.execPath, [steers, '--collect', '--json', '--out', out, '--day', day], { encoding: 'utf8', env: process.env, timeout: 300e3 })
      if (r.status !== 0 || !existsSync(out)) return { ok: false, why: `his messages of ${day} could not be read (${(r.stderr || r.stdout || '').trim().split('\n').pop()}), so the words cannot be checked` }
      const j = JSON.parse(readFileSync(out, 'utf8'))
      all.push(...(Array.isArray(j) ? j : j.messages ?? []))
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return findIn(words, all)
}
