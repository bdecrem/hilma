#!/usr/bin/env node
// Measures what a deploy costs the people using Ola (OLA-94): asks an address every 200 ms, each
// time on a new connection (as a new visitor would), for as long as it runs; on Ctrl-C (or after
// --for seconds) prints the failed requests and the longest gap with no good answer.
//
//   node ops/probe.mjs [https://app.ola.cx/] [--every 200] [--for 900] [--out probe.jsonl]
//   node ops/probe.mjs <url> --stream --token-file <file> [--for 900]
//
// A request counts as good when it answers 2xx/3xx/401 within 10 s. Several run at once when one
// is slow, so a stall shows as slow answers, not as missing ones.
//
// --stream holds one event stream open instead (a device's, `Authorization: Bearer` read from the
// file, never printed) and reconnects at once when it ends, as the web app does; it reports each
// cut and how long the stream was gone.
import { createWriteStream, readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'

const args = process.argv.slice(2)
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? args[i + 1] : d
}
const url = new URL(args.find((a) => /^https?:\/\//.test(a)) || 'https://app.ola.cx/')
const every = Number(opt('every', 200))
const forS = Number(opt('for', 0))
const out = opt('out') ? createWriteStream(opt('out')) : null
const lib = url.protocol === 'https:' ? https : http
const rows = []
let n = 0

function ask(headers = {}) {
  return new Promise((resolve) => {
    const r = lib.get(url, { agent: false, headers: { 'cache-control': 'no-store', ...headers }, timeout: 10_000 }, (res) => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode }))
      res.on('error', (e) => resolve({ status: res.statusCode, error: e.code || 'error' }))
    })
    r.on('timeout', () => r.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })))
    r.on('error', (e) => resolve({ status: 0, error: e.code || e.message }))
  })
}

async function once() {
  const i = n++
  const t0 = Date.now()
  const { status, error } = await ask()
  const row = { i, t: new Date(t0).toISOString(), ms: Date.now() - t0, status, ...(error ? { error } : {}) }
  row.ok = !error && ((status >= 200 && status < 400) || status === 401)
  rows.push(row)
  out?.write(JSON.stringify(row) + '\n')
  if (!row.ok || row.ms > 2000) console.log(`${row.t} ${row.ok ? 'slow' : 'FAIL'} ${status || '-'} ${error ?? ''} ${row.ms} ms`)
}

function report() {
  const done = rows.sort((a, b) => a.i - b.i)
  const bad = done.filter((r) => !r.ok)
  // The longest stretch between two good answers' arrival times.
  let gap = 0
  let gapAt = null
  let last = null
  for (const end of done.filter((r) => r.ok).map((r) => Date.parse(r.t) + r.ms).sort((a, b) => a - b)) {
    if (last !== null && end - last > gap) (gap = end - last), (gapAt = new Date(last).toISOString())
    last = end
  }
  const slowest = done.reduce((m, r) => (r.ms > m.ms ? r : m), { ms: 0 })
  console.log(`${done.length} requests to ${url} every ${every} ms, each on a new connection: ${bad.length} failed; longest gap between good answers ${gap} ms${gapAt ? ` (from ${gapAt})` : ''}; slowest ${slowest.ms} ms`)
  for (const r of bad.slice(0, 20)) console.log(`  failed ${r.t} ${r.status || '-'} ${r.error ?? ''} ${r.ms} ms`)
  out?.end()
  process.exit(bad.length ? 1 : 0)
}

// ---------------------------------------------------------------- one event stream, held open
async function stream() {
  const token = readFileSync(opt('token-file'), 'utf8').trim()
  const cuts = []
  let stop = false
  const end = () => {
    stop = true
    console.log(`stream ${url.pathname}: ${cuts.length} cut(s)${cuts.length ? `; back after ${cuts.map((c) => `${c.goneMs} ms`).join(', ')}` : ''}`)
    for (const c of cuts) console.log(`  cut ${c.at} (${c.why}), open again ${c.goneMs} ms later`)
    out?.end()
    process.exit(0)
  }
  process.on('SIGINT', end)
  process.on('SIGTERM', end)
  if (forS) setTimeout(end, forS * 1000)
  console.log(`holding ${url.pathname} open${forS ? ` for ${forS} s` : ' (Ctrl-C to stop)'}`)
  let cutAt = null
  let why = null
  while (!stop) {
    await new Promise((resolve) => {
      const r = lib.get(url, { agent: false, headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' } }, (res) => {
        if (res.statusCode !== 200) {
          why = `status ${res.statusCode}`
          res.resume()
          return res.on('end', resolve)
        }
        let first = true
        res.on('data', () => {
          if (!first) return
          first = false
          if (cutAt) {
            cuts.push({ at: new Date(cutAt).toISOString(), why, goneMs: Date.now() - cutAt })
            console.log(`${new Date().toISOString()} stream open again after ${Date.now() - cutAt} ms (${why})`)
          } else console.log(`${new Date().toISOString()} stream open`)
          cutAt = null
        })
        res.on('end', () => ((why = 'ended'), resolve()))
        res.on('error', (e) => ((why = e.code || 'error'), resolve()))
      })
      r.on('error', (e) => ((why = e.code || e.message), resolve()))
    })
    if (stop) break
    if (!cutAt) (cutAt = Date.now()), console.log(`${new Date().toISOString()} stream cut (${why})`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

if (args.includes('--stream')) await stream()
else {
  const timer = setInterval(once, every)
  const finish = () => (clearInterval(timer), setTimeout(report, 11_000))
  process.on('SIGINT', finish)
  process.on('SIGTERM', finish)
  if (forS) setTimeout(finish, forS * 1000)
  console.log(`asking ${url} every ${every} ms${forS ? ` for ${forS} s` : ' (Ctrl-C to stop)'}`)
}
