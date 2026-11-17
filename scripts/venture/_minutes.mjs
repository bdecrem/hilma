// The minutes of voice calls and notes (venture_minutes, schema 010; src/lib/venture/minutes.ts
// writes them), for transcript.mjs and the runner. A missing table reads as no minutes.

const missing = (e) => e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|could not find the table/i.test(e?.message ?? '')

export async function readMinutes(db, source, ref) {
  const { data, error } = await db.from('venture_minutes').select('*').eq('source', source).eq('ref', String(ref)).maybeSingle()
  if (error) {
    if (missing(error)) return null
    throw new Error(`venture_minutes: ${error.message}`)
  }
  return data ?? null
}

export async function unseenMinutes(db) {
  const { data, error } = await db.from('venture_minutes').select('*').is('seen_at', null).order('id')
  if (error) {
    if (missing(error)) return []
    throw new Error(`venture_minutes: ${error.message}`)
  }
  return data ?? []
}

export async function markSeen(db, ids) {
  if (!ids.length) return
  const { error } = await db.from('venture_minutes').update({ seen_at: new Date().toISOString() }).in('id', ids)
  if (error && !missing(error)) throw new Error(`venture_minutes: ${error.message}`)
}

export function minutesText(m) {
  const part = (title, xs, quote = false) =>
    xs?.length ? `${title}:\n${xs.map((x) => `- ${x.text}${quote && x.quote ? ` ("${x.quote}")` : ''}${x.by === 'bart' ? ' [set by Bart]' : ''}`).join('\n')}\n` : ''
  const head = `# minutes of ${m.source} ${m.ref}${m.edited_at ? ' (corrected by Bart)' : ''}`
  return [head, m.summary, part('Decided', m.decided, true), part('To be decided', m.to_decide), part('Kit will do', m.kit_will_do), part('Facts', m.facts), part('Removed by Bart', m.removed)].filter(Boolean).join('\n')
}
