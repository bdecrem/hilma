// The trace of one click-through (OLA-515, /api/poke): one plain line in the front desk log each time
// it runs, so anyone can tell whether it ran, on which page, and what it found. Names only: the account,
// the project, the page's file name, counts, seconds, and for each dead thing its kind and the control's
// label. Never the page's text, the request or the answer. (The log line's time is the log's own.)

const clip = (s, n) => {
  const t = String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const deadWord = (d) => (d.what === 'error' ? `script error${d.name ? ` on '${clip(d.name, 24)}'` : ' on load'}` : `${d.what === 'field' ? 'field' : 'button'} '${clip(d.name, 24)}'`)

/** One log line for one click-through: `r` is workspaces.poke's answer ({ failed } or { page, pressed, typed, dead }). */
export function pokeLine({ handle, slug, r, ms, second = false }) {
  const who = `${second ? 'second click-through (after the fix)' : 'click-through'} for ${handle ?? '?'} in ${slug}`
  const took = `${(Math.max(0, ms) / 1000).toFixed(1)} s`
  if (!r || r.failed) return `${who}: the pressing ${r?.failed === 'timed out' ? 'timed out' : 'failed'} after ${took}; nothing sent`
  if (!r.page) return `${who}: no page changed in the turn; nothing pressed (${took})`
  const found = r.dead.length ? `${r.dead.length} dead: ${r.dead.slice(0, 4).map(deadWord).join(', ')}${r.dead.length > 4 ? `, and ${r.dead.length - 4} more` : ''}` : 'nothing dead'
  return `${who}: pressed ${clip(r.page, 60)} (${r.pressed} pressed, ${r.typed} typed, ${took}): ${found}`
}

/**
 * OLA-522: the question after the second pressing and its answer, from the page (POST /api/poke/note).
 * null for a note that is not one of these. The hand-off itself is the hosted run's own log line.
 */
export function pokeNoteLine({ handle, slug, note }) {
  const n = Number.isSafeInteger(note?.dead) && note.dead >= 0 && note.dead < 1000 ? note.dead : null
  const who = `click-through for ${handle ?? '?'} in ${slug}`
  if (note?.event === 'asked' && n !== null) return note.offered === true ? `${who}: still dead after the fix (${n}); told the person and asked whether to give it to the bigger model` : `${who}: still dead after the fix (${n}); told the person (no bigger model offered: none set up here, or this person cannot send it)`
  if (note?.event === 'yes') return `${who}: the person said yes: handed to the bigger model`
  if (note?.event === 'no') return `${who}: the person said no: nothing more`
  return null
}
