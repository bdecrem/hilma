// A picture stuck to a day (2026-10-03). One photo per day at most — like one
// sentence a day. The sentence stays the entry; the photo is marginalia, a
// small snapshot taped to the day's card next to the doodle, never a thumbnail
// grid. Bytes go to the public bucket `onething-photos` as
// <user id>/<day>-<ms>.jpg (long edge 1600px, JPEG, EXIF orientation baked
// in), the public URL and the size land on the day's row (schema 007).
//
// Two ways in: the site (POST /api/onething/photo, the browser already
// downscaled it) and iMessage (an image attachment, downloaded from
// BlueBubbles on the mini). A photo that arrives by text BEFORE the day's
// sentence has nowhere to go yet, so it waits in <user id>/pending/<day>.jpg
// and recordEntry adopts it when the sentence lands.

import sharp from 'sharp'
import { f2Supabase } from '@/lib/f2/supabase'
import type { Entry } from './core'

export const PHOTO_BUCKET = 'onething-photos'
export const PHOTO_MAX_BYTES = 12 * 1024 * 1024
export const PHOTO_EDGE = 1600
export const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'])

export type Fitted = { bytes: Buffer; width: number; height: number }

/// Validation that reads as a sentence for the person (the routes show these
/// as-is and treat anything else as a server fault).
export class PhotoError extends Error {}

function store() {
  return f2Supabase().storage.from(PHOTO_BUCKET)
}
function objectUrl(path: string): string {
  return store().getPublicUrl(path).data.publicUrl
}

/// Long edge to 1600px, orientation applied, JPEG. Anything sharp cannot read
/// (a HEIC that BlueBubbles did not convert, a PDF) is a PhotoError.
export async function fitPhoto(input: Buffer): Promise<Fitted> {
  if (input.length > PHOTO_MAX_BYTES) throw new PhotoError('That picture is too big (12 MB at most).')
  try {
    const { data, info } = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: PHOTO_EDGE, height: PHOTO_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    return { bytes: data, width: info.width, height: info.height }
  } catch (e) {
    throw new PhotoError(`Could not read that picture (${(e as Error).message.split('\n')[0]}).`)
  }
}

async function upload(path: string, fitted: Fitted): Promise<string> {
  const { error } = await store().upload(path, fitted.bytes, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`onething photo: upload failed: ${error.message}`)
  return objectUrl(path)
}

async function removeDayObjects(userId: string, day: string, keep: string | null): Promise<void> {
  const { data, error } = await store().list(userId, { search: `${day}-` })
  if (error) throw new Error(`onething photo: list failed: ${error.message}`)
  const stale = (data ?? []).map((o) => `${userId}/${o.name}`).filter((p) => p !== keep && p.startsWith(`${userId}/${day}-`))
  if (stale.length === 0) return
  const { error: rmErr } = await store().remove(stale)
  if (rmErr) throw new Error(`onething photo: remove failed: ${rmErr.message}`)
}

/// Attach a (raw) picture to the day's entry. The day must already have a
/// sentence — see holdPhoto for the text-first case. Returns the updated row.
export async function setPhoto(userId: string, day: string, raw: Buffer): Promise<Entry> {
  const fitted = await fitPhoto(raw)
  return setFittedPhoto(userId, day, fitted)
}

async function setFittedPhoto(userId: string, day: string, fitted: Fitted): Promise<Entry> {
  const sb = f2Supabase()
  const { data: row, error: e1 } = await sb.from('onething_entries').select('id').eq('user_id', userId).eq('day', day).maybeSingle()
  if (e1) throw new Error(`onething photo: load failed: ${e1.message}`)
  if (!row) throw new PhotoError('Nothing kept on that day yet.')
  const path = `${userId}/${day}-${Date.now()}.jpg`
  const url = await upload(path, fitted)
  const { data, error } = await sb
    .from('onething_entries')
    .update({ photo: url, photo_w: fitted.width, photo_h: fitted.height, photo_at: new Date().toISOString() })
    .eq('id', (row as { id: string }).id)
    .select('*')
    .single()
  if (error) throw new Error(`onething photo: save failed: ${error.message}`)
  await removeDayObjects(userId, day, path)
  return data as Entry
}

/// Take the picture off the day (the row keeps its sentence and doodle).
export async function clearPhoto(userId: string, day: string): Promise<Entry> {
  const sb = f2Supabase()
  const { data, error } = await sb
    .from('onething_entries')
    .update({ photo: null, photo_w: null, photo_h: null, photo_at: null })
    .eq('user_id', userId)
    .eq('day', day)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`onething photo: clear failed: ${error.message}`)
  if (!data) throw new PhotoError('Nothing kept on that day.')
  await removeDayObjects(userId, day, null)
  return data as Entry
}

// ---------- a picture before the sentence (iMessage) ----------

const pendingPath = (userId: string, day: string) => `${userId}/pending/${day}.jpg`

/// Keep a picture for a day that has no sentence yet; the sentence adopts it.
export async function holdPhoto(userId: string, day: string, raw: Buffer): Promise<void> {
  const fitted = await fitPhoto(raw)
  await upload(pendingPath(userId, day), fitted)
}

/// Called when a day's first sentence is saved: if a picture was waiting for
/// that day, move it onto the row. Never throws into the save — a lost
/// picture is logged, the sentence is kept either way.
export async function adoptPendingPhoto(userId: string, day: string): Promise<Entry | null> {
  try {
    const { data, error } = await store().download(pendingPath(userId, day))
    if (error || !data) return null // nothing waiting (the usual case)
    const fitted = await fitPhoto(Buffer.from(await data.arrayBuffer()))
    const entry = await setFittedPhoto(userId, day, fitted)
    await store().remove([pendingPath(userId, day)])
    return entry
  } catch (e) {
    console.error('[onething] adopting the pending photo failed', e)
    return null
  }
}

/// Everything in the bucket for one person (account removal, test cleanup).
export async function removeAllPhotos(userId: string): Promise<void> {
  const s = store()
  const paths: string[] = []
  const { data: top } = await s.list(userId, { limit: 1000 })
  for (const o of top ?? []) if (o.id) paths.push(`${userId}/${o.name}`)
  const { data: pend } = await s.list(`${userId}/pending`, { limit: 1000 })
  for (const o of pend ?? []) if (o.id) paths.push(`${userId}/pending/${o.name}`)
  if (paths.length) await s.remove(paths)
}
