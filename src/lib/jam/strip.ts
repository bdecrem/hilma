// A track's rhythm as a 16-step strip: kick / snare-clap / hats, one char
// per step ('1' hit, '0' rest). Read from the saved session (JT90 first,
// then JB01) so cards and the transport can show the beat without rendering.

export type Strip = { k: string; s: string; h: string }

// Live patterns are dense ([{ velocity }] per step); JT90 serializes sparse
// hits ([{ i, v }]). Both collapse to 16 booleans (multi-bar patterns fold
// onto the first bar's grid).
type Step = { velocity?: number; i?: number; v?: number } | null | undefined
type DrumPattern = Record<string, Step[]>

function hits(steps: Step[] | undefined): boolean[] {
  const out = new Array<boolean>(16).fill(false)
  if (!Array.isArray(steps)) return out
  steps.forEach((s, idx) => {
    if (!s) return
    if (typeof s.i === 'number') { if ((s.v ?? 0) > 0) out[s.i % 16] = true }
    else if ((s.velocity ?? 0) > 0) out[idx % 16] = true
  })
  return out
}

function row(p: DrumPattern | undefined, voices: string[]): string {
  const rows = voices.map((v) => hits(p?.[v]))
  let out = ''
  for (let i = 0; i < 16; i++) out += rows.some((r) => r[i]) ? '1' : '0'
  return out
}

export function stripFromSession(session: unknown): Strip | null {
  const nodes = (session as { params?: { nodes?: Record<string, { pattern?: unknown }> } } | null)?.params?.nodes
  if (!nodes) return null
  for (const id of ['jt90', 'jb01']) {
    const p = nodes[id]?.pattern as DrumPattern | undefined
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue
    const k = row(p, ['kick'])
    const s = row(p, ['snare', 'clap', 'rimshot'])
    const h = row(p, ['ch', 'oh', 'ride', 'crash', 'cymbal'])
    if (k.includes('1') || s.includes('1') || h.includes('1')) return { k, s, h }
  }
  // No drums: show the first mono synth's gates on the middle row.
  for (const id of ['jb202', 'jt30', 'jt10']) {
    const p = nodes[id]?.pattern as ({ gate?: boolean } | null)[] | undefined
    if (!Array.isArray(p)) continue
    let s = ''
    for (let i = 0; i < 16; i++) s += p[i]?.gate ? '1' : '0'
    if (s.includes('1')) return { k: '0'.repeat(16), s, h: '0'.repeat(16) }
  }
  return null
}
