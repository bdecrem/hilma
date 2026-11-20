#!/usr/bin/env node
// Adds a case to the asks (evals/asks/cases.json, OLA-231): the person's sentence, word for word,
// where it is sent, what must be true afterwards, and the failure it came from. Then commit it; the
// next update's run sends it (or try it now on the test server: run.mjs --case <id>).
//
//   node apps/activist-ai/evals/asks/add-case.mjs "<the person's sentence>" --runtime cloud,local \
//        --must "site:Bart" [--must "says:claude"] [--must-not "<regex>"] --ticket OLA-nnn \
//        [--places cloud-web:chat,local-mac:chat] [--id short-name] [--what "what happened"] [--date 2026-11-20] [--minutes 8]
//
// --runtime cloud is every chat place in a cloud project (cloud-web, cloud-mac, cloud-phone), local
// every chat place on the Mac (local-mac, local-phone); --places names them exactly instead. The
// runner sends it in cloud-web:chat and local-mac:chat and lists the others as not run.
//
// --must, any number of them, each one of:
//   site:<words>            Ola's answer gives a https://sites.ola.cx/<name>/ address that answers 200
//                           with a page saying <words>
//   says:<regex>            Ola's answer matches (case-insensitive)
//   file:<path>[:<words>]   the file is in the project afterwards (and says <words>)
// Every case is also held to the never list in lib.mjs (it cannot do it from here; press a button
// or go to another screen yourself; not switched on); --must-not adds patterns to it.
import { readFileSync, writeFileSync } from 'node:fs'
import { PLACES, RUNTIME_PLACES } from './lib.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases.json')
const argv = process.argv.slice(2)
const many = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []))
const one = (name, dflt) => many(name).at(-1) ?? dflt
const flags = new Set(['--places', '--runtime', '--must', '--must-not', '--ticket', '--id', '--what', '--date', '--minutes'])
const say = argv.find((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1]))
const fail = (m) => (console.error(m), process.exit(2))
if (!say) fail('usage: add-case.mjs "<the person\'s sentence>" --runtime cloud,local --must "<outcome>" --ticket OLA-nnn')
const places = one('--places') ? one('--places').split(',').map((x) => x.trim()) : one('--runtime', 'cloud,local').split(',').flatMap((r) => RUNTIME_PLACES[r.trim()] ?? fail('--runtime is cloud, local or cloud,local'))
for (const p of places) if (!PLACES.includes(p)) fail(`--places: ${p} is not a place (${PLACES.join(', ')})`)
const must = many('--must')
if (!must.length) fail('at least one --must: site:<words>, says:<regex> or file:<path>[:<words>]')
for (const m of must) {
  const kind = m.split(':')[0]
  if (!['site', 'says', 'file'].includes(kind) || !m.slice(kind.length + 1)) fail(`--must "${m}": site:<words>, says:<regex> or file:<path>[:<words>]`)
  if (kind === 'says') new RegExp(m.slice(5), 'i')
}
for (const s of many('--must-not')) new RegExp(s, 'i')
const ticket = one('--ticket') ?? fail('--ticket OLA-nnn: the failure this case came from')
if (!/^OLA-\d+$/.test(ticket)) fail('--ticket looks like OLA-231')

const doc = JSON.parse(readFileSync(file, 'utf8'))
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 4).join('-')
let id = one('--id', slug(say) || 'case')
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) fail('--id: lowercase letters, digits and dashes')
if (doc.cases.some((c) => c.say === say && (c.places ?? []).some((p) => places.includes(p)))) fail('that sentence is already a case in that place')
for (let n = 2; doc.cases.some((c) => c.id === id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`
const c = {
  id,
  say,
  places,
  must,
  mustNot: many('--must-not'),
  ...(one('--minutes') ? { limitMin: Number(one('--minutes')) } : {}),
  from: { date: one('--date', new Date().toISOString().slice(0, 10)), ticket, what: one('--what', '') },
}
doc.cases.push(c)
writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
console.log(`added ${id} (${places.join(', ')}): ${must.join('; ')}`)
console.log(`next: commit evals/asks/cases.json with [${ticket}]; to try it now on the test server: node evals/asks/run.mjs --case ${id}`)
