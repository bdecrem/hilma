// The fingerprint of a stored review (OLA-331): sweep.mjs post records it in venture_state "sweeps_fp"
// (by day); a review whose print differs, or that has none, was or may have been changed outside the
// tool. Keys are sorted at every level, since the database (jsonb) gives an object back in its own
// key order; `ideas.told` is left out, since post sets it after the text to Bart.
import { createHash } from 'node:crypto'

const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => [k, canon(v[k])])) : v)
export const fpOf = (d) => createHash('sha256').update(JSON.stringify(canon({ ...d, ideas: d.ideas ? { ...d.ideas, told: undefined } : undefined }))).digest('hex').slice(0, 16)
