// Pictures and links on a day (2026-10-03): the pure parts (a URL in a
// sentence shows as its domain; the iMessage replies read as ours when they
// echo), then the storage round trip on a throwaway account — a picture on a
// kept day, a picture held before the sentence and adopted by it, a new one
// replacing the old, taking it off. Creates the bucket if it is missing.
//   set -a; . .env.local; set +a; npx tsx scripts/onething/photo-check.ts
import sharp from 'sharp'
import { f2Supabase } from '../../src/lib/f2/supabase'
import { addDays, localDay, looksLikeOurs, photoText, recordEntry, type Entry, type User } from '../../src/lib/onething/core'
import { linkLabel, plainText, splitLinks } from '../../src/lib/onething/links'
import { PHOTO_BUCKET, PhotoError, clearPhoto, fitPhoto, holdPhoto, removeAllPhotos, setPhoto } from '../../src/lib/onething/photo'

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail && !ok ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// ---------- links ----------
check(linkLabel('https://www.example.com/a/b?c=1') === 'example.com', 'label: host without www')
check(linkLabel('www.nytimes.com/2026/x.html.') === 'nytimes.com', 'label: bare www with trailing period')
check(plainText('Read this https://ola.cx/onething, then slept.') === 'Read this ola.cx, then slept.', 'plainText keeps the sentence around the link')
const parts = splitLinks('Found it at https://ola.cx/osai. Good day.')
check(parts.length === 3 && 'href' in parts[1] && parts[1].href === 'https://ola.cx/osai' && parts[1].tail === '.' && parts[1].label === 'ola.cx', 'splitLinks: text / link (punctuation stays outside) / text', JSON.stringify(parts))
check(splitLinks('No link here').length === 1 && !('href' in splitLinks('No link here')[0]), 'splitLinks: plain sentence stays one piece')
const bare = splitLinks('see www.bbc.co.uk tonight')
check(bare.length === 3 && 'href' in bare[1] && bare[1].href === 'https://www.bbc.co.uk' && bare[1].label === 'bbc.co.uk', 'splitLinks: www. without a scheme gets one')

// ---------- the replies are ours when they echo ----------
for (const t of [photoText({}), photoText({ waiting: true }), photoText({ failed: 'it did not come through' })]) check(looksLikeOurs(t), `echo guard: "${t.slice(0, 40)}"`)
check(!looksLikeOurs('Pictures of the kids at the beach all day.'), 'echo guard: a sentence about pictures is a thought')

// ---------- storage round trip ----------
const sb = f2Supabase()
const PHONE = '+19990000021'
const png = (w: number, h: number, color: { r: number; g: number; b: number }) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer()

async function main() {
  const { data: buckets } = await sb.storage.listBuckets()
  if (!buckets?.find((b) => b.name === PHOTO_BUCKET)) {
    const r = await sb.storage.createBucket(PHOTO_BUCKET, { public: true, fileSizeLimit: 12 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] })
    check(!r.error, 'bucket created', r.error?.message)
  } else console.log(`bucket ${PHOTO_BUCKET} exists`)

  // fit: orientation + long edge + jpeg
  const big = await png(3000, 2000, { r: 200, g: 40, b: 90 })
  const f = await fitPhoto(big)
  check(f.width === 1600 && f.height === 1067, 'fit: 3000×2000 → 1600×1067', `${f.width}×${f.height}`)
  const small = await fitPhoto(await png(300, 500, { r: 10, g: 90, b: 200 }))
  check(small.width === 300 && small.height === 500, 'fit: a small picture is not enlarged')
  let threw = ''
  try { await fitPhoto(Buffer.from('not a picture at all')) } catch (e) { threw = e instanceof PhotoError ? e.message : 'other' }
  check(threw.startsWith('Could not read that picture'), 'fit: junk is a PhotoError', threw)

  // a throwaway account
  await sb.from('onething_users').delete().eq('phone', PHONE)
  const { data: u, error } = await sb.from('onething_users').insert({ phone: PHONE, tz: 'America/Los_Angeles', name: 'Pix' }).select('*').single()
  if (error) throw new Error(error.message)
  const user = u as User
  try {
    const today = localDay(new Date(), 'America/Los_Angeles')
    const yesterday = addDays(today, -1)
    // no sentence yet → setPhoto refuses, holdPhoto keeps it
    let refused = ''
    try { await setPhoto(user.id, today, big) } catch (e) { refused = e instanceof PhotoError ? e.message : 'other' }
    check(refused === 'Nothing kept on that day yet.', 'setPhoto on an empty day is refused', refused)
    await holdPhoto(user.id, today, big)
    const { data: held } = await sb.storage.from(PHOTO_BUCKET).list(`${user.id}/pending`)
    check((held ?? []).some((o) => o.name === `${today}.jpg`), 'holdPhoto: waits under pending/')
    // the sentence adopts it
    const r = await recordEntry(user, today, 'A red wall, mostly. https://ola.cx/onething')
    check(!!r.entry.photo && r.entry.photo_w === 1600 && r.entry.photo_h === 1067, 'recordEntry adopts the pending picture', JSON.stringify({ photo: r.entry.photo, w: r.entry.photo_w, h: r.entry.photo_h }))
    const { data: held2 } = await sb.storage.from(PHOTO_BUCKET).list(`${user.id}/pending`)
    check(!(held2 ?? []).some((o) => o.name === `${today}.jpg`), 'pending object removed after adoption')
    const url1 = r.entry.photo!
    const got = await fetch(url1)
    check(got.ok && got.headers.get('content-type') === 'image/jpeg', 'the public URL serves a JPEG', `${got.status} ${got.headers.get('content-type')}`)
    // a second picture replaces the first (one per day)
    const e2 = await setPhoto(user.id, today, await png(600, 900, { r: 30, g: 160, b: 80 }))
    check(e2.photo !== url1 && e2.photo_w === 600 && e2.photo_h === 900, 'a new picture replaces the old one')
    const { data: objs } = await sb.storage.from(PHOTO_BUCKET).list(user.id)
    const dayObjs = (objs ?? []).filter((o) => o.name.startsWith(`${today}-`))
    check(dayObjs.length === 1, 'only one object kept for the day', String(dayObjs.length))
    // a picture on a past day with a sentence
    await sb.from('onething_entries').insert({ user_id: user.id, day: yesterday, text: 'Yesterday.', streak: 0, points: 0 })
    const e3 = await setPhoto(user.id, yesterday, await png(800, 800, { r: 240, g: 200, b: 40 }))
    check(e3.day === yesterday && !!e3.photo, 'a past day takes a picture')
    // off again
    const e4 = await clearPhoto(user.id, today)
    check(e4.photo === null && e4.text.startsWith('A red wall'), 'clearPhoto keeps the sentence, drops the picture')
    const { data: objs2 } = await sb.storage.from(PHOTO_BUCKET).list(user.id)
    check(!(objs2 ?? []).some((o) => o.name.startsWith(`${today}-`)), 'clearPhoto removes the object')
    const e5 = await sb.from('onething_entries').select('*').eq('user_id', user.id).eq('day', today).single()
    check(((e5.data as Entry).doodle ?? null) !== undefined, 'row still there')
  } finally {
    await removeAllPhotos(user.id)
    const { data: left } = await sb.storage.from(PHOTO_BUCKET).list(user.id)
    check((left ?? []).filter((o) => o.id).length === 0, 'cleanup: bucket folder empty')
    await sb.from('onething_entries').delete().eq('user_id', user.id)
    await sb.from('onething_users').delete().eq('id', user.id)
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed')
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
