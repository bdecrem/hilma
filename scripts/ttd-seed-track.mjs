#!/usr/bin/env node
// scripts/ttd-seed-track.mjs — publish Tap Tap Dodo track packs to the
// ttd_tracks table. Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from
// hilma/.env.local. Idempotent (upsert on id).
//
//   node scripts/ttd-seed-track.mjs                       # publish every pack in scripts/ttd-tracks/
//   node scripts/ttd-seed-track.mjs scripts/ttd-tracks/ttd07.json   # publish one
//
// Packs are track-pack format v1 (see apps/taptapdodo TrackPack.swift):
// a JSON musical skeleton (bpm/bars/sections/patternBank) referencing a
// built-in synthesis family (backingStyle) and skin (skinRef). No audio —
// the app synthesizes everything on-device.

import { readFileSync, readdirSync } from 'node:fs'
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

function payloadPaths() {
  const args = process.argv.slice(2)
  if (args.length > 0) return args
  const dir = join(__dirname, 'ttd-tracks')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(dir, f))
}

async function main() {
  const env = loadEnv()
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing in .env.local')

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  for (const path of payloadPaths()) {
    const payload = JSON.parse(readFileSync(path, 'utf8'))
    for (const field of ['id', 'name', 'bpm', 'bars', 'sections', 'patternBank', 'backingStyle', 'skinRef']) {
      if (payload[field] === undefined) throw new Error(`${path}: missing ${field}`)
    }
    const { error } = await supabase
      .from('ttd_tracks')
      .upsert({ id: payload.id, name: payload.name, payload }, { onConflict: 'id' })
    if (error) throw new Error(`${payload.id} upsert failed: ${error.message}`)

    const { data, error: readErr } = await supabase
      .from('ttd_tracks')
      .select('id, name, created_at')
      .eq('id', payload.id)
      .single()
    if (readErr) throw readErr
    console.log('seeded:', JSON.stringify(data))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
