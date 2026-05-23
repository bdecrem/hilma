#!/usr/bin/env node
// F2 iMessage bridge — polls BlueBubbles and forwards new messages to Vercel.
//
// BlueBubbles' own webhook delivery is unreliable (silent drops). This
// daemon polls the BB REST API every few seconds and POSTs the same
// payload shape BB would have sent to /api/f2/clients/imessage/webhook.
// The server-side dedup table (f2_processed_webhooks) eats duplicates,
// so it's safe to also leave BB's native webhook enabled.

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const ENV_FILE = path.join(ROOT, '.env.local')

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`[bridge] .env.local not found at ${ENV_FILE}`)
    process.exit(1)
  }
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
}

loadEnv()

const BB_URL = process.env.BB_LOCAL_URL || 'http://localhost:1234'
const BB_PASSWORD = process.env.BLUEBUBBLES_PASSWORD
const VERCEL_URL = process.env.F2_PUBLIC_URL || 'https://hilma-nine.vercel.app'
const WEBHOOK_SECRET = process.env.BLUEBUBBLES_WEBHOOK_SECRET
const POLL_MS = Number(process.env.F2_BRIDGE_POLL_MS || 3000)
const QUERY_LIMIT = Number(process.env.F2_BRIDGE_QUERY_LIMIT || 10)

if (!BB_PASSWORD) {
  console.error('[bridge] BLUEBUBBLES_PASSWORD not set')
  process.exit(1)
}
if (!WEBHOOK_SECRET) {
  console.error('[bridge] BLUEBUBBLES_WEBHOOK_SECRET not set')
  process.exit(1)
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

async function fetchRecent() {
  const res = await fetch(
    `${BB_URL}/api/v1/message/query?password=${encodeURIComponent(BB_PASSWORD)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        limit: QUERY_LIMIT,
        sort: 'DESC',
        with: ['handle', 'chat'],
      }),
      signal: AbortSignal.timeout(10000),
    },
  )
  if (!res.ok) throw new Error(`BB query ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return Array.isArray(json.data) ? json.data : []
}

async function forward(m) {
  if (m.isFromMe) return
  const text = (m.text || '').trim()
  const handle = m.handle?.address
  const chatGuid = m.chats?.[0]?.guid
  if (!text || !handle || !chatGuid || !m.guid) return

  const payload = {
    type: 'new-message',
    data: {
      guid: m.guid,
      text: m.text,
      isFromMe: false,
      handle: { address: handle, service: m.handle?.service },
      chats: m.chats.map((c) => ({ guid: c.guid })),
    },
  }

  const url = `${VERCEL_URL}/api/f2/clients/imessage/webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    log(`forward ${m.guid.slice(0, 8)} FAIL ${res.status}`, body)
    return
  }
  if (body.skipped === 'duplicate') return
  log(`forward ${m.guid.slice(0, 8)} from ${handle}: ${text.slice(0, 60)} → ${JSON.stringify(body)}`)
}

async function loop() {
  log(`bridge starting: poll=${POLL_MS}ms limit=${QUERY_LIMIT}`)
  log(`  BB: ${BB_URL}`)
  log(`  Vercel: ${VERCEL_URL}`)

  // Bootstrap: skip everything that already exists. We only forward
  // messages that arrive AFTER the bridge starts. Server-side dedup
  // still defends against double-firing during normal operation.
  let highWaterROWID = 0
  try {
    const initial = await fetchRecent()
    for (const m of initial) {
      if (typeof m.originalROWID === 'number' && m.originalROWID > highWaterROWID) {
        highWaterROWID = m.originalROWID
      }
    }
    log(`bootstrap: ignoring everything ≤ ROWID ${highWaterROWID}`)
  } catch (err) {
    log('bootstrap failed, starting from 0:', err.message)
  }

  while (true) {
    try {
      const msgs = await fetchRecent()
      // Process oldest-first so replies fire in conversation order.
      for (const m of msgs.reverse()) {
        if (typeof m.originalROWID === 'number' && m.originalROWID <= highWaterROWID) continue
        await forward(m).catch((e) => log('forward error', e.message))
        if (typeof m.originalROWID === 'number') {
          highWaterROWID = Math.max(highWaterROWID, m.originalROWID)
        }
      }
    } catch (err) {
      log('poll error', err.message)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

loop()
