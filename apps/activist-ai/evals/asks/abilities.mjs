#!/usr/bin/env node
// Everything Ola can be asked to do, by place (OLA-232): abilities.json is the one list; this
// writes what Ola is told about its abilities from it, and says the status of every line.
//
//   node evals/asks/abilities.mjs            every line: ability, place, passing / failing / not run / not offered
//   node evals/asks/abilities.mjs write      writes the block in workspace/AGENTS.md and OlaKit's Abilities.swift
//   node evals/asks/abilities.mjs check      exit 1 when those differ from the list, or a line names no case
//
// A line is one ability at one place (cloud-web, cloud-mac, cloud-phone, local-mac, local-phone,
// each in chat; and the screens an ability lists). Its status is its case's result at that place in
// ~/ola-staging/asks-latest.json: a case is the one in cases.json whose ability is this one and
// whose places name the place. A line with no case, or whose case has not run there, is "not run":
// counted, never passed. A not-offered line has a case too, and passes when Ola says it is not
// offered instead of claiming or attempting it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AI, HERE, readCases } from './lib.mjs'

export const CHAT = { cloud: ['cloud-web:chat', 'cloud-mac:chat', 'cloud-phone:chat'], local: ['local-mac:chat', 'local-phone:chat'] }
const LATEST = process.env.OLA_ASKS_LATEST || path.join(homedir(), 'ola-staging/asks-latest.json')
export const AGENTS = path.join(AI, 'workspace/AGENTS.md')
export const SWIFT = path.join(AI, 'apple/OlaKit/Sources/OlaKit/Abilities.swift')
const BEGIN = '<!-- abilities: written by evals/asks/abilities.mjs from abilities.json; do not edit here -->'
const END = '<!-- /abilities -->'

export const readAbilities = (file = path.join(HERE, 'abilities.json')) => JSON.parse(readFileSync(file, 'utf8')).abilities

/** What Ola is told in one runtime, from the list: what it can do and how, then what it cannot and the sentence. */
export function instructions(abilities, runtime) {
  const can = abilities.filter((a) => a[runtime]?.tell)
  const cannot = abilities.filter((a) => a[runtime]?.notOffered)
  const where = runtime === 'cloud' ? "in a project on Ola's server" : "on the person's own Mac"
  return [
    `# What you can be asked to do here`,
    ``,
    `You are working ${where}. This is the whole list of what people ask Ola for, and how you do each one here. Everything in the first list you can do from here: never say you cannot, never blame having no network, and never send the person to a button or another screen for it. Do it.`,
    ``,
    ...can.map((a) => `- ${a.what}: ${a[runtime].tell}.`),
    ``,
    `Not offered here. When asked for one of these, say the sentence given, in your own language if the person writes in another, and do the part you can (write the message, the post, the plan). Never say or imply that you did it:`,
    ``,
    ...cannot.map((a) => `- ${a.what}: "${a[runtime].notOffered}"`),
    ``,
    `For anything not on either list, try it; if it truly cannot be done here, say what stopped you, in one sentence, and what you did instead.`,
  ].join('\n')
}

function agentsWith(text, block) {
  const i = text.indexOf(BEGIN)
  const j = text.indexOf(END)
  const body = `${BEGIN}\n${block}\n${END}`
  if (i < 0 || j < 0) return text.replace(/\n*$/, '\n\n') + body + '\n'
  return text.slice(0, i) + body + text.slice(j + END.length)
}
function swiftOf(block) {
  const lit = block.replace(/\\/g, '\\\\').replace(/"""/g, '\\"""')
  return `// Written by evals/asks/abilities.mjs from evals/asks/abilities.json (OLA-232); do not edit here.
// What the agent on this Mac (the local runtime) is told about what it can be asked to do.
extension AgentNotes {
  public static let abilities = """
${lit}
"""
}
`
}

export function written(abilities = readAbilities()) {
  return {
    agents: agentsWith(readFileSync(AGENTS, 'utf8'), instructions(abilities, 'cloud')),
    swift: swiftOf(instructions(abilities, 'local')),
  }
}

/** Every line and its status. */
export function lines({ abilities = readAbilities(), cases = readCases(), latest = null } = {}) {
  if (!latest) {
    try {
      latest = JSON.parse(readFileSync(LATEST, 'utf8'))
    } catch {
      latest = { cases: {} }
    }
  }
  const out = []
  for (const a of abilities) {
    for (const runtime of ['cloud', 'local']) {
      const offer = a[runtime] ?? {}
      for (const place of CHAT[runtime]) {
        const c = cases.find((x) => x.ability === a.id && (x.places ?? []).includes(place))
        const r = c ? latest.cases?.[`${c.id}@${place}`] : null
        const ran = r && r.status && r.status !== 'not run'
        out.push({ ability: a.id, what: a.what, place, offered: !offer.notOffered, case: c?.id ?? null, status: ran ? (r.status === 'passing' ? 'passing' : 'failing') : 'not run', at: ran ? r.at : null })
      }
    }
    for (const place of a.screens ?? []) out.push({ ability: a.id, what: a.what, place, offered: true, case: null, status: 'not run', at: null })
  }
  return out
}

/** The counts the board shows (the Learning page, through ops/watch.mjs). */
export function summary(opts) {
  const L = lines(opts)
  const n = (f) => L.filter(f).length
  return { lines: L.length, passing: n((l) => l.status === 'passing'), failing: n((l) => l.status === 'failing'), notRun: n((l) => l.status === 'not run'), notOffered: n((l) => !l.offered), noCase: n((l) => !l.case) }
}

/** What check finds wrong: instructions out of step with the list, an ability with no case in a runtime. */
export function problems({ abilities = readAbilities(), cases = readCases() } = {}) {
  const p = []
  const w = written(abilities)
  if (readFileSync(AGENTS, 'utf8') !== w.agents) p.push('workspace/AGENTS.md is not what abilities.json says: run node evals/asks/abilities.mjs write')
  if (!existsSync(SWIFT) || readFileSync(SWIFT, 'utf8') !== w.swift) p.push('OlaKit Abilities.swift is not what abilities.json says: run node evals/asks/abilities.mjs write')
  for (const a of abilities) {
    for (const runtime of ['cloud', 'local']) {
      const o = a[runtime]
      if (!o || (!o.tell && !o.notOffered)) p.push(`${a.id}: nothing said for the ${runtime} runtime (tell or notOffered)`)
      if (o?.tell && o?.notOffered) p.push(`${a.id}: both tell and notOffered for ${runtime}`)
      for (const c of cases.filter((x) => x.ability === a.id && (x.places ?? []).some((pl) => CHAT[runtime].includes(pl)))) {
        if (!!c.notOffered !== !!o?.notOffered) p.push(`case ${c.id}: says ${c.notOffered ? 'not offered' : 'offered'} in ${runtime}, the list says the opposite`)
      }
    }
  }
  for (const c of cases) if (c.ability && !abilities.some((a) => a.id === c.ability)) p.push(`case ${c.id}: ability ${c.ability} is not in abilities.json`)
  return p
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cmd = process.argv[2] ?? 'lines'
  if (cmd === 'write') {
    const w = written()
    writeFileSync(AGENTS, w.agents)
    writeFileSync(SWIFT, w.swift)
    console.log(`wrote ${path.relative(AI, AGENTS)} and ${path.relative(AI, SWIFT)}`)
  } else if (cmd === 'check') {
    const p = problems()
    for (const x of p) console.log(`FAIL  ${x}`)
    if (!p.length) console.log('abilities: the instructions say what the list says')
    process.exit(p.length ? 1 : 0)
  } else {
    for (const l of lines()) console.log(`${l.status.padEnd(8)} ${l.offered ? '' : '(not offered) '}${l.what} @ ${l.place}${l.case ? `  case ${l.case}` : '  no case'}`)
    const s = summary()
    console.log(`\n${s.lines} lines: ${s.passing} passing, ${s.failing} failing, ${s.notRun} nobody has run (${s.noCase} with no case yet); ${s.notOffered} not offered, each with its sentence.`)
  }
}
