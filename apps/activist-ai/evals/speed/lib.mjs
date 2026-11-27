// The speed check's rules (OLA-456), pure so test.mjs can prove them without a model or a VM.

// What counts as "Ola's instructions, skills or tools": everything that reaches the model besides
// the person's words. The project image (workspace/: AGENTS.md, the ola-* tools, the plugins), the
// skills, the gateway (it adds instructions, routes models, hands out examples), the front desk's
// kept examples, and this check itself.
export const TRIGGERS = ['workspace/', 'skills/', 'gateway/', 'frontdesk/examples.mjs', 'evals/speed/']

/** Run after an update? `changed` is the update's list of changed files, or null when it cannot tell. */
export function shouldRun(changed) {
  if (!changed) return { run: true, why: 'the update could not say what changed' }
  const hit = changed.filter((f) => TRIGGERS.some((t) => (t.endsWith('/') ? f.startsWith(t) : f === t)))
  return hit.length
    ? { run: true, why: `${hit.length} file(s) of Ola's instructions, skills or tools changed: ${hit.slice(0, 4).join(', ')}${hit.length > 4 ? ', …' : ''}` }
    : { run: false, why: "nothing of Ola's instructions, skills or tools changed" }
}

export const FACTOR = 2

/** One request's verdict. plain: { seconds, made } or null; ola: { seconds, status, page }. */
export function judge(plain, ola) {
  if (!plain || !plain.made) return { pass: null, why: 'no baseline: plain OpenCode made nothing, so there is nothing to compare with' }
  const limit = FACTOR * plain.seconds
  const ratio = ola?.seconds ? +(ola.seconds / plain.seconds).toFixed(2) : null
  if (!ola || ola.status !== 'done') return { pass: false, ratio, why: `Ola did not finish (${ola?.status ?? ola?.error ?? 'no result'})` }
  if (!ola.page) return { pass: false, ratio, why: 'Ola finished without a page to open' }
  if (ola.seconds > limit) return { pass: false, ratio, why: `Ola took ${fmt(ola.seconds)}, over twice plain OpenCode's ${fmt(plain.seconds)}` }
  return { pass: true, ratio, why: `Ola ${fmt(ola.seconds)} against plain OpenCode's ${fmt(plain.seconds)}` }
}

/** The whole run: passes only when every request passed. */
export function overall(rows) {
  if (!rows.length) return false
  return rows.every((r) => r.verdict.pass === true)
}

/** A plain baseline is reused for a week, while the model and OpenCode's version stay the same. */
export const BASELINE_DAYS = 7
export function baselineKey(model, ocVersion, ask) {
  return `${model}|${ocVersion}|${ask}`
}
export function freshBaseline(entry, now = Date.now()) {
  return !!entry && entry.made && now - Date.parse(entry.at) < BASELINE_DAYS * 86400_000
}

/** How long Ola may run before the walk stops it: past the limit it fails anyway, but its real time is worth having. */
export function olaLimit(plainSeconds) {
  return Math.min(1800, Math.max(600, Math.ceil(3 * plainSeconds)))
}

/** The model the gateway sends "general" to, read from its settings text (no secrets are in these two lines). */
export function upstreamFrom(envText) {
  const get = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
  const models = get('GATEWAY_MODELS')
  const general = models.split(',').map((p) => p.split('=')).find(([k]) => k === 'general')?.[1]
  return { baseURL: get('UPSTREAM_BASE_URL'), model: general || null }
}

export const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`)
