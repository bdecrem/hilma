// Writes the improv teacher's whole track (src/lib/takt/solo-agent.ts) from a player's latest
// reviewed take over a Stage song, and saves it as their solo of that song, exactly as the app
// does after a review: for a take reviewed before the feature existed, or to redo one.
//
//   set -a; source ./.env.local; set +a
//   npx tsx scripts/takt/solo-from-review.ts <email> [--song song-blue-lantern-white]
//
// The app pulls it on its next launch (ModStore.refresh) and shows it as the song's Solo level.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { f2Supabase } from '../../src/lib/f2/supabase'
import { parseRequest } from '../../src/lib/takt/improv-agent'
import { parseReview, runSoloTrack } from '../../src/lib/takt/solo-agent'
import { type Charting } from '../../src/lib/takt/charting'
import { type SongFile, musicBars } from '../../src/lib/takt/songfile'

const args = process.argv.slice(2)
const email = args.find((a) => !a.startsWith('--'))
const songName = args[args.indexOf('--song') + 1] && args.includes('--song') ? args[args.indexOf('--song') + 1] : 'song-blue-lantern-white'
if (!email) {
  console.error('usage: solo-from-review.ts <email> [--song <name>]')
  process.exit(2)
}

const CONTENT = join(__dirname, '../../apps/takt/Takt/Content')
const charting = JSON.parse(readFileSync(join(CONTENT, 'charting.json'), 'utf8')) as Charting
const song = JSON.parse(readFileSync(join(CONTENT, `${songName}.json`), 'utf8')) as SongFile
const override = charting.songs[songName] ?? null

;(async () => {
  const db = f2Supabase()
  const { data: user, error: ue } = await db.from('takt_users').select('id, email').eq('email', email).maybeSingle()
  if (ue || !user) throw new Error(`no takt user ${email}: ${ue?.message ?? ''}`)
  const { data: rows, error: re } = await db
    .from('takt_improv')
    .select('id, created_at, take, backing, context, review')
    .eq('user_id', user.id)
    .not('review', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)
  if (re) throw new Error(re.message)
  const row = (rows ?? []).find((r) => (r.backing as { title?: string })?.title === song.song.title)
  if (!row) throw new Error(`no reviewed take over ${song.song.title} for ${email}`)
  const r = parseRequest({ take: row.take, backing: row.backing, context: row.context })
  if (typeof r === 'string') throw new Error(`the take does not parse: ${r}`)
  const review = parseReview(row.review)
  if (typeof review === 'string') throw new Error(`the review does not parse: ${review}`)
  console.log(`${email} · take of ${row.created_at} over ${song.song.title}: ${r.take.bars} bars, ${r.take.notes.length} notes`)
  console.log(`review: "${review.headline}" · idea "${review.idea.title}": ${review.idea.why}`)
  const t0 = Date.now()
  const solo = await runSoloTrack(r, review, songName, song.song.title, song, charting, override, user.id, (e) => {
    if (e.type === 'status') console.log(`   ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${e.text}`)
    if (e.type === 'track') console.log(`   saved: ${e.mod?.name} v${e.mod?.version} (${e.mod?.kind}) "${e.title}"`)
  })
  const bars = musicBars(song)
  const tpb = song.ticksPerBeat * song.beatsPerBar
  console.log(`\n${solo.title}\n${solo.line}\n${solo.notes.length} notes, ${(new Set(solo.notes.map((n) => n.t)).size / ((bars * 4 * 60) / song.song.tempo)).toFixed(2)} a second\n`)
  for (let b = 0; b < bars; b++) {
    const inBar = solo.notes.filter((n) => Math.floor(n.t / tpb) === b)
    console.log(`Bar ${String(b + 1).padStart(2)} ${song.form[b].padEnd(4)} ${inBar.map((n) => `${['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][n.n % 12]}${Math.floor(n.n / 12) - 1}@${(n.t % tpb) / 12 + 1}/${n.len}${n.lv === 1 ? '*' : ''}`).join(' ')}`)
  }
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
