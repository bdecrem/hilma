// End-to-end check of Dodo's GLOBAL chat against a running backend, as a
// throwaway guest: two unrelated topics are pasted in, indexed, and the chat
// is asked things only the knowledge layer can get right.
//
//   npx tsx scripts/f2-global-chat-check.ts [--base https://feynd.cc] [--keep]
//
// Checks: both topics get a digest; a detail buried in one topic is found
// (and that topic is cited as a source); a question spanning both topics
// names both; a question the library cannot answer says so; another guest
// sees none of it; "new conversation" empties the chat. The guest rows are
// deleted at the end unless --keep (needs the linked supabase CLI).
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'https://feynd.cc'
const keep = args.includes('--keep')

const LIGHTHOUSE = `Notes on the Bellrock Shoal lighthouse (field notebook)

The Bellrock Shoal light was first lit on 3 February 1811 after four seasons of work under the engineer Marguerite Haldane, who insisted that the lower courses be cut as dovetailed granite blocks so that each stone locked into its neighbours against the sea. The reef is only uncovered for about two hours at low water, so the crew lived on a moored ship, the Pharos Tender, and later in a timber barracks on stilts they called the Beacon House.

The lamp burns colza oil behind a rotating frame of red and white glass, giving the light its signature: one white flash, then one red, every forty seconds. Keepers work in a rota of three, six weeks on the rock and two ashore at the signal tower in Arbrook, where a brass ball is dropped at one o'clock so that ships can set their chronometers.

The worst storm on record, in November 1827, threw spray over the lantern — 115 feet above the reef — and cracked two panes, but the dovetailed courses did not shift. Haldane's own account says the tower "rang like a bell and stood like a tree".`

const FERMENT = `Workshop handout: sourdough and wild fermentation

A sourdough starter is a stable community of wild yeasts and lactic acid bacteria living in flour and water. The bakery's house starter, nicknamed Old Tobias, is fed at a ratio of one part starter to five parts flour and five parts water, twice a day, and is kept at 26 degrees Celsius; cooler than that and the acetic acid bacteria take over and the bread turns sharp.

The key idea is that fermentation is a race between gas production and gluten breakdown. Bulk fermentation ends when the dough has grown by about 75 percent, not when a timer rings. For the house country loaf the hydration is 78 percent and the salt is 2.2 percent of flour weight. Autolyse — resting flour and water for forty minutes before adding starter and salt — lets the gluten organise itself and shortens mixing.

Shaping builds surface tension so the loaf rises up rather than out. Loaves are proofed overnight at 4 degrees in linen-lined baskets called bannetons and baked in a lidded cast-iron pot: twenty minutes covered at 250 degrees to trap steam, then twenty-five uncovered at 230 for colour.`

const results: string[] = []
const check = (name: string, ok: boolean, detail = '') =>
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)

async function guest(): Promise<{ cookie: string; id: string; username: string }> {
  const res = await fetch(`${base}/api/f2/auth/guest`, { method: 'POST' })
  if (!res.ok) throw new Error(`guest sign-up failed (${res.status})`)
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const { user } = (await res.json()) as { user: { id: string; username: string } }
  return { cookie, id: user.id, username: user.username }
}

async function main() {
  const me = await guest()
  console.log('guest', me.username, me.id)
  const call = async (method: string, path: string, body?: unknown, cookie = me.cookie) => {
    const started = Date.now()
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    return { status: res.status, json: json as Record<string, any>, ms: Date.now() - started }
  }

  for (const [title, text] of [['Bellrock lighthouse notes', LIGHTHOUSE], ['Sourdough workshop', FERMENT]]) {
    const r = await call('POST', '/api/f2/topics/ingest', { title, text })
    check(`ingest "${title}"`, r.status === 200, `${r.status} in ${r.ms} ms`)
  }

  // Index: the ingest scheduled it; the index route catches up whatever is left.
  let index = { topics: 0, indexed: 0, pending: 99 }
  for (let i = 0; i < 8 && index.pending > 0; i++) {
    const r = await call('POST', '/api/f2/global-chat/index')
    index = r.json.index ?? index
    console.log(`index pass ${i + 1}: ${JSON.stringify(index)} (${r.ms} ms)`)
  }
  // A guest account starts with Dodo's intro topic, so: at least the two.
  check('library indexed', index.topics >= 2 && index.pending === 0, JSON.stringify(index))

  const opened = await call('GET', '/api/f2/global-chat')
  check('chat opens empty', opened.status === 200 && opened.json.messages?.length === 0)

  const ask = async (text: string) => {
    const r = await call('POST', '/api/f2/global-chat', { text })
    const sources = ((r.json.sources ?? []) as { topic: string }[]).map((s) => s.topic)
    console.log(`\nQ: ${text}\nA (${r.ms} ms, sources: ${sources.join(' | ') || 'none'}): ${String(r.json.reply ?? r.json.error).slice(0, 500)}`)
    return { reply: String(r.json.reply ?? ''), sources, status: r.status }
  }

  const a1 = await ask('What pattern does the light flash, and how often?')
  check('buried detail found', /forty|40/i.test(a1.reply) && /red/i.test(a1.reply))
  check('cites the lighthouse topic', a1.sources.some((s) => /bell|light/i.test(s)), a1.sources.join(' | '))

  const a2 = await ask('What topics do I have saved, and is there any idea that connects them?')
  check('knows the whole library', /light/i.test(a2.reply) && /sourdough|ferment|bread/i.test(a2.reply))
  check('a library overview cites the topics it names', a2.sources.length >= 2, a2.sources.join(' | '))


  const a3 = await ask('What does my library say about the causes of the French Revolution?')
  check('an off-library question cites nothing', a3.sources.length === 0, a3.sources.join(' | '))
  check('admits what the library lacks', /(don.t|do not|doesn.t|does not|nothing|no topic|haven.t|isn.t|not (in|something|covered))/i.test(a3.reply))

  const a4 = await ask('And what temperature is the starter kept at? Just the number.')
  check('follow-up in the other topic', /26/.test(a4.reply))

  const after = await call('GET', '/api/f2/global-chat')
  check('conversation is stored', after.json.messages?.length === 8, `${after.json.messages?.length} messages`)

  // Isolation: a second guest has an empty library and cannot see this one.
  const other = await guest()
  const o = await call('POST', '/api/f2/global-chat', { text: 'What pattern does the Bellrock light flash?' }, other.cookie)
  console.log(`\nOTHER USER: ${String(o.json.reply).slice(0, 300)}`)
  check('another user sees nothing of it', (o.json.sources ?? []).length === 0 && !/forty|40 seconds/i.test(String(o.json.reply)))

  const cleared = await call('DELETE', '/api/f2/global-chat')
  const empty = await call('GET', '/api/f2/global-chat')
  check('new conversation empties it', cleared.status === 200 && empty.json.messages?.length === 0)

  if (!keep) {
    const sql = join(tmpdir(), `global-chat-check-${Date.now()}.sql`)
    writeFileSync(sql, `delete from f2_users where id in ('${me.id}', '${other.id}') and is_guest returning id;`)
    try {
      execFileSync('supabase', ['db', 'query', '--linked', '-f', sql], { stdio: 'pipe' })
      console.log('\nguest accounts deleted')
    } catch {
      console.log(`\nCOULD NOT delete the guests — remove f2_users ${me.id} and ${other.id} by hand`)
    }
  } else {
    console.log(`\nkept guests ${me.id} ${other.id}; cookie: ${me.cookie}`)
  }

  console.log('\n' + results.join('\n'))
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
