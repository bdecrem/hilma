#!/usr/bin/env node
// Seed the Dodo demo account — the "set dressing" behind every showcase
// capture (scripts/dodo-scenes). Idempotent: re-running fills in whatever is
// missing and re-applies the progress state; `--fresh` wipes the account's
// content first and rebuilds it.
//
// Content (topics, flash cards, pebbles, avatar) goes through the real
// /api/f2 endpoints on feynd.cc so it looks exactly like a user made it.
// Progress state (stars, badge dates, streak, XP, past rounds, the staged
// chat) is written straight to Supabase — there is no honest API for
// "pretend this account passed an oral exam twelve days ago".
//
// Needs in .env.local: SUPABASE_URL, SUPABASE_SERVICE_KEY, DODO_DEMO_PASS.
// Writes seed-state.json (user + topic ids) for capture.mjs.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const FRESH = process.argv.includes('--fresh')
const BASE = process.env.DODO_SEED_BASE || 'https://feynd.cc'

// ---- env ------------------------------------------------------------------
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const need = (k) => {
  if (!process.env[k]) throw new Error(`${k} is not set in .env.local`)
  return process.env[k]
}
const sb = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_KEY'), {
  auth: { persistSession: false },
})
const PASS = need('DODO_DEMO_PASS')

// ---- the demo learner -----------------------------------------------------
const EMAIL = 'demo@dodogo.cc'
const USERNAME = 'demo'

const day = 24 * 60 * 60 * 1000
const ago = (days, extraMs = 0) => new Date(Date.now() - days * day + extraMs).toISOString()
const ahead = (days) => new Date(Date.now() + days * day).toISOString()

// Five topics. Titles are part of the brand — they show in every screenshot.
const TOPICS = [
  {
    key: 'ODYSSEY',
    age: 1,
    url: 'https://en.wikipedia.org/wiki/Odyssey',
    title: 'The Odyssey',
    kind: 'book',
    // Gold, current: passed the final review 12 days ago, refresher in 18.
    state: { stars: 3, quiz_count: 3, last_quizzed_at: ago(12), hard_quiz_completed_at: ago(12), recert_stage: 0, recert_due_at: ahead(18) },
  },
  {
    key: 'NATIONS',
    age: 12,
    url: 'https://en.wikipedia.org/wiki/Why_Nations_Fail',
    title: 'Why Nations Fail',
    kind: 'book',
    // Gold, lapsed: the 30-day refresher came due two days ago — the badge dims.
    state: { stars: 3, quiz_count: 3, last_quizzed_at: ago(40), hard_quiz_completed_at: ago(40), recert_stage: 0, recert_due_at: ago(2) },
  },
  {
    key: 'EINSTEIN',
    age: 5,
    url: 'https://en.wikipedia.org/wiki/Einstein:_His_Life_and_Universe',
    title: 'Einstein by Walter Isaacson',
    kind: 'book',
    state: { stars: 2, quiz_count: 2, last_quizzed_at: ago(5), hard_quiz_completed_at: null, recert_stage: 0, recert_due_at: null },
  },
  {
    key: 'IMMUNE',
    age: 3,
    url: 'https://en.wikipedia.org/wiki/Immune_system',
    title: 'How the Immune System Works',
    kind: 'web',
    state: { stars: 1, quiz_count: 1, last_quizzed_at: ago(3), hard_quiz_completed_at: null, recert_stage: 0, recert_due_at: null },
  },
  {
    key: 'NEURAL',
    age: 2,
    url: 'https://www.youtube.com/watch?v=aircAruvnKk',
    title: 'What is a neural network?',
    kind: 'video',
    state: { stars: 0, quiz_count: 0, last_quizzed_at: null, hard_quiz_completed_at: null, recert_stage: 0, recert_due_at: null },
  },
]

// The staged chat on The Odyssey: short enough to read at hero size.
const CHAT = [
  { role: 'user', text: 'Why does Odysseus tell the Cyclops his name is Nobody?', created_at: ago(1) },
  {
    role: 'assistant',
    text:
      "So the trick works twice. When Polyphemus screams that Nobody is hurting him, the other Cyclopes shrug and go home.\n\n" +
      "Then, once the ship is clear, Odysseus can't resist shouting his real name across the water. That's the whole poem in one moment: cleverness saves him, pride costs him ten years, because now Poseidon knows exactly who blinded his son.",
    created_at: ago(1, 25_000),
  },
]

// Pebbles — saved lines, one per book.
const PEBBLES = [
  { key: 'ODYSSEY', body: 'Tell me about a complicated man.', source: 'The Odyssey, Book 1 (Emily Wilson)' },
  { key: 'NATIONS', body: 'Nations fail because their extractive economic institutions do not create the incentives needed for people to save, invest, and innovate.', source: 'Why Nations Fail' },
  { key: 'EINSTEIN', body: 'Imagination is more important than knowledge.', source: 'Albert Einstein, 1929' },
]

// Past rounds on The Odyssey (the flash hub's history list).
const ROUNDS = [
  { mode: 'choice', score: 10, total: 10, xp: 170, created_at: ago(13) },
  { mode: 'text', score: 9, total: 10, xp: 110, created_at: ago(14) },
  { mode: 'voice', score: 8, total: 10, xp: 100, created_at: ago(15) },
]
// Peck levels 1–4 played; 5 is the START node. 10 → 3 stars, 9 → 2, 7-8 → 1.
const PECK = [
  { jumbo_level: 1, mode: 'choice', score: 10, total: 10, xp: 200, created_at: ago(9) },
  { jumbo_level: 2, mode: 'text', score: 9, total: 10, xp: 180, created_at: ago(7) },
  { jumbo_level: 3, mode: 'choice', score: 8, total: 10, xp: 160, created_at: ago(4) },
  { jumbo_level: 4, mode: 'text', score: 7, total: 10, xp: 140, created_at: ago(2) },
]
const USER_STATE = { xp: 2860, daily_streak: 7 }

// ---- api client (cookie session) -----------------------------------------
let cookie = ''
async function api(method, p, body, extra = {}) {
  const headers = { ...(extra.headers || {}) }
  if (cookie) headers.cookie = cookie
  let payload = extra.form
  if (!payload && body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(BASE + p, { method, headers, body: payload })
  const sc = res.headers.get('set-cookie')
  if (sc) cookie = sc.split(';')[0]
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${text.slice(0, 300)}`)
  return json
}
const log = (...a) => console.log('[seed]', ...a)

// ---- 1. account -----------------------------------------------------------
async function ensureAccount() {
  try {
    const me = await api('POST', '/api/f2/auth/login', { username: USERNAME, password: PASS })
    log('signed in as', me.user.username)
    return me.user.id
  } catch (e) {
    if (!/401/.test(String(e))) throw e
  }
  log('creating the demo account')
  const r = await api('POST', '/api/f2/auth/signup', { email: EMAIL, password: PASS })
  const { error } = await sb.from('f2_users').update({ username: USERNAME }).eq('id', r.user.id)
  if (error) throw new Error('rename failed: ' + error.message)
  log('created', r.user.id)
  return r.user.id
}

async function wipe(userId) {
  log('--fresh: wiping the account content')
  for (const t of ['f2_flash_sets', 'f2_flash_cards', 'f2_artifacts', 'f2_community_topics', 'f2_threads']) {
    const { error } = await sb.from(t).delete().eq('user_id', userId)
    if (error) throw new Error(`wipe ${t}: ${error.message}`)
  }
}

// ---- 2. topics ------------------------------------------------------------
async function ensureTopics() {
  const ids = {}
  let existing = (await api('GET', '/api/f2/topics')).topics
  for (const t of TOPICS) {
    let row = existing.find((x) => x.url === t.url || (t.title && x.topic === t.title))
    if (!row) {
      log('ingesting', t.title || t.url)
      const r = await api('POST', '/api/f2/topics', { topic: t.url, kind: t.kind })
      if (!r.ingested) log('  WARNING: no source body was fetched for', t.url)
      row = { id: r.thread.id, topic: r.thread.topic }
      log('  →', row.topic)
    }
    ids[t.key] = row.id
    // Staggered activity dates so the list never reads "20 min. ago" six
    // times over; The Odyssey is the freshest (its chat is a day old).
    const patch = { ...t.state, kind: t.kind, created_at: ago(t.age + 2), updated_at: ago(t.age) }
    if (t.title) patch.topic = t.title
    const { error } = await sb.from('f2_threads').update(patch).eq('id', row.id)
    if (error) throw new Error(`state ${t.key}: ${error.message}`)
  }
  return ids
}

// ---- 3. flash cards -------------------------------------------------------
async function ensureCards(ids) {
  for (const t of TOPICS) {
    const id = ids[t.key]
    const { cards } = await api('GET', `/api/f2/topics/${id}/flash`)
    if (cards.length >= 8) { log(t.key, 'deck has', cards.length, 'cards'); continue }
    log('generating 16 cards for', t.key)
    try {
      const r = await api('POST', `/api/f2/topics/${id}/flash`, { count: 16 })
      log('  →', r.cards.length, 'cards')
    } catch (e) {
      log('  WARNING: card generation failed for', t.key, String(e).slice(0, 200))
    }
  }
}

// ---- 4. progress state ----------------------------------------------------
async function applyState(userId, ids) {
  // Staged chat on The Odyssey.
  let { error } = await sb.from('f2_threads').update({ messages: CHAT, updated_at: ago(1, 25_000) }).eq('id', ids.ODYSSEY)
  if (error) throw new Error('chat: ' + error.message)

  // Rounds + Peck levels: rebuilt from scratch each run.
  ;({ error } = await sb.from('f2_flash_sets').delete().eq('user_id', userId))
  if (error) throw new Error('sets wipe: ' + error.message)
  const rows = [
    ...ROUNDS.map((r) => ({ ...r, user_id: userId, thread_id: ids.ODYSSEY, jumbo_level: null, results: [] })),
    ...PECK.map((r) => ({ ...r, user_id: userId, thread_id: null, results: [] })),
  ]
  ;({ error } = await sb.from('f2_flash_sets').insert(rows))
  if (error) throw new Error('sets: ' + error.message)

  // Streak + XP.
  const ptToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  ;({ error } = await sb.from('f2_users').update({ ...USER_STATE, daily_streak_date: ptToday }).eq('id', userId))
  if (error) throw new Error('user: ' + error.message)
  log('state applied: chat, rounds, peck levels, streak', USER_STATE.daily_streak, 'xp', USER_STATE.xp)
}

// ---- 5. pebbles -----------------------------------------------------------
async function ensurePebbles(ids) {
  const { artifacts } = await api('GET', '/api/f2/artifacts')
  for (const p of PEBBLES) {
    if (artifacts.some((a) => a.body === p.body)) continue
    await api('POST', '/api/f2/artifacts', { body: p.body, source: p.source, thread_id: ids[p.key] })
    log('pebble:', p.body.slice(0, 40))
  }
}

// ---- 6. avatar ------------------------------------------------------------
async function ensureAvatar() {
  const me = await api('GET', '/api/f2/auth/me')
  if (me.user?.avatar_url) return
  // A quiet geometric learner: slate ground, cream head and shoulders, a
  // marigold dot. No font dependency, so it renders identically anywhere.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="#6A8FA3"/>
    <circle cx="128" cy="104" r="44" fill="#F9EFDA"/>
    <path d="M40 232c8-52 46-76 88-76s80 24 88 76z" fill="#F9EFDA"/>
    <circle cx="176" cy="72" r="14" fill="#F0A830"/>
  </svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), 'avatar.png')
  await api('POST', '/api/f2/avatar', undefined, { form })
  log('avatar uploaded')
}

// ---- run ------------------------------------------------------------------
const userId = await ensureAccount()
if (FRESH) await wipe(userId)
const ids = await ensureTopics()
await ensureCards(ids)
await applyState(userId, ids)
await ensurePebbles(ids)
await ensureAvatar()

const state = { user_id: userId, username: USERNAME, base: BASE, topics: ids, seeded_at: new Date().toISOString() }
fs.writeFileSync(path.join(HERE, 'seed-state.json'), JSON.stringify(state, null, 2) + '\n')
log('wrote seed-state.json')
for (const [k, v] of Object.entries(ids)) log(' ', k, v)
