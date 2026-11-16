#!/usr/bin/env node
// Records what opencode sends for one request, through the dev server's door, the way the page
// sees it. Run it after every opencode upgrade and compare with the last recording: the page's
// mapping from events to plain-word steps (src/lib/steps.ts) depends on these shapes.
//
//   node scripts/record-events.mjs <dev server url> <out.jsonl> [ask|go] [request text]
//
// Under "ask", every permission request is answered "once" and recorded.
import fs from 'node:fs'
import { OpenCode } from '@opencode/client'

const [base, out, autonomy = 'ask', text = 'How many rows does survey.csv have? Count them by running a short program, then write the number to rows.md.'] = process.argv.slice(2)
if (!base || !out) {
  console.error('usage: record-events.mjs <dev url> <out.jsonl> [ask|go] [text]')
  process.exit(2)
}
const client = OpenCode.make({ baseUrl: new URL('/oc', base).href })
const sink = fs.createWriteStream(out)
const t0 = Date.now()
let sessionID = null
let finished = null
const done = new Promise((r) => (finished = r))
;(async () => {
  for await (const ev of client.event.subscribe()) {
    sink.write(JSON.stringify({ t: Date.now() - t0, ...ev }) + '\n')
    if (ev.data?.sessionID && ev.data.sessionID !== sessionID) continue
    if (ev.type === 'permission.asked') {
      console.log(`permission asked: ${ev.data.action} ${JSON.stringify(ev.data.resources)}`)
      await client.permission.reply({ sessionID, requestID: ev.data.id, decision: 'once' })
    }
    if (ev.type === 'session.tool.input.started') console.log(`tool: ${ev.data.name}`)
    if (['session.execution.succeeded', 'session.execution.failed', 'session.execution.interrupted'].includes(ev.type)) {
      console.log(`${ev.type} after ${((Date.now() - t0) / 1000).toFixed(1)} s`)
      finished()
    }
  }
})().catch((e) => {
  console.log(`stream ended: ${e?.message ?? e}`)
  finished()
})
const session = await client.session.create({ title: 'recording', metadata: { autonomy } })
sessionID = session.id
await client.session.prompt({ sessionID, text })
const limit = setTimeout(() => finished(), 240_000)
await done
clearTimeout(limit)
const messages = await client.message.list({ sessionID })
sink.write(JSON.stringify({ t: Date.now() - t0, type: '(message.list)', data: messages }) + '\n')
sink.end()
console.log(`wrote ${out}`)
process.exit(0)
