#!/usr/bin/env node
// scripts/ttd-seed-track.mjs — upsert the Tap Tap Dodo test track (ttd06
// "warehouse") into the ttd_tracks table. Reads SUPABASE_URL and
// SUPABASE_SERVICE_KEY from hilma/.env.local. Idempotent (upsert on id).
//
//   node scripts/ttd-seed-track.mjs
//
// The payload is track-pack format v1 (see apps/taptapdodo TrackPack.swift):
// an afters-family (minimal-flavoured) track, ttd02 skin, 127 bpm, 36 bars.
// Pattern density mirrors ttd02: intro 4 (offbeats), groove 4, build 6,
// breakdown 2, peak 7, outro 4 notes/bar.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Minimal .env.local loader (no dotenv dependency).
function loadEnv() {
  const path = join(__dirname, '..', '.env.local')
  const text = readFileSync(path, 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const payload = {
  id: 'ttd06',
  name: 'warehouse',
  genreLine: 'minimal techno · concrete floor · 127',
  bpm: 127,
  bars: 36,
  travel: 1.7,
  swing: 0.5,
  melodic: false,
  scaleTones: [],
  backingStyle: 'afters',
  skinRef: 'ttd02',
  sections: [
    { kind: 'intro', start: 0, end: 4 },
    { kind: 'groove', start: 4, end: 14 },
    { kind: 'build', start: 14, end: 18 },
    { kind: 'breakdown', start: 18, end: 22 },
    { kind: 'peak', start: 22, end: 32 },
    { kind: 'outro', start: 32, end: 36 },
  ],
  // pattern = array of [offsetEighth (0..7), lane (0..2)] pairs.
  patternBank: {
    // intro: 4 offbeat ticks, single lane — like ttd02's intro.
    intro: [[[1, 1], [3, 1], [5, 1], [7, 1]]],
    // groove: 4 notes/bar, anchor on beat 1 lane 0.
    groove: [
      [[0, 0], [3, 1], [4, 0], [7, 2]],
      [[0, 0], [2, 1], [4, 0], [6, 2]],
      [[0, 0], [3, 2], [4, 0], [7, 1]],
    ],
    // build: 6 notes/bar, tightening.
    build: [
      [[0, 0], [2, 2], [3, 1], [4, 0], [6, 2], [7, 1]],
      [[0, 0], [1, 2], [3, 1], [4, 0], [5, 2], [7, 1]],
    ],
    // breakdown: 2 sparse anchors.
    breakdown: [[[0, 0], [4, 0]], [[0, 0], [6, 0]]],
    // peak: 7 notes/bar, the busiest.
    peak: [
      [[0, 0], [1, 2], [3, 1], [4, 0], [5, 2], [6, 1], [7, 2]],
      [[0, 0], [2, 2], [3, 1], [4, 0], [5, 1], [6, 2], [7, 1]],
    ],
    // outro: back to 4, resolving.
    outro: [[[0, 0], [3, 1], [4, 0], [7, 1]]],
  },
}

async function main() {
  const env = loadEnv()
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing in .env.local')

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await supabase
    .from('ttd_tracks')
    .upsert({ id: payload.id, name: payload.name, payload }, { onConflict: 'id' })

  if (error) {
    console.error('upsert failed:', error.message)
    process.exit(1)
  }

  const { data, error: readErr } = await supabase
    .from('ttd_tracks')
    .select('id, name, created_at')
    .eq('id', payload.id)
    .single()
  if (readErr) throw readErr
  console.log('seeded:', JSON.stringify(data))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
