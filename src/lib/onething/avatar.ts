// Profile pictures. The bucket is the record: each person has a folder named
// by their id holding one object, named by upload time, and the newest object
// in the folder is the picture. Nothing is stored on onething_users — the
// picture is found by listing the folder (one call), and because a new upload
// gets a new name, its URL is never served stale from a cache.
//
// The browser sends a square JPEG it has already scaled down (Onething.tsx),
// so the limits here are a backstop, not the normal path.

import { f2Supabase } from '@/lib/f2/supabase'

export const AVATAR_BUCKET = 'onething-avatars'
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function objectUrl(path: string): string {
  return f2Supabase().storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

/// The picture's public URL, or null when there is none.
export async function avatarUrlFor(userId: string): Promise<string | null> {
  // Names are Date.now() (13 digits until 2286), so the lexical sort is the time sort.
  const { data, error } = await f2Supabase().storage.from(AVATAR_BUCKET).list(userId, { limit: 1, sortBy: { column: 'name', order: 'desc' } })
  if (error) throw new Error(`onething: avatar list failed: ${error.message}`)
  const f = data?.[0]
  return f ? objectUrl(`${userId}/${f.name}`) : null
}

/// Store a new picture and drop the old one. Returns the new URL.
export async function setAvatar(userId: string, bytes: Buffer, contentType: string): Promise<string> {
  const ext = AVATAR_TYPES[contentType]
  if (!ext) throw new Error('A JPG, PNG or WebP image.')
  if (bytes.length > AVATAR_MAX_BYTES) throw new Error('That picture is too big (2 MB at most).')
  const store = f2Supabase().storage.from(AVATAR_BUCKET)
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await store.upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(`onething: avatar upload failed: ${error.message}`)
  await removeAllBut(userId, path)
  return objectUrl(path)
}

/// Remove the picture; the circle goes back to initials.
export async function clearAvatar(userId: string): Promise<void> {
  await removeAllBut(userId, null)
}

async function removeAllBut(userId: string, keep: string | null): Promise<void> {
  const store = f2Supabase().storage.from(AVATAR_BUCKET)
  const { data, error } = await store.list(userId)
  if (error) throw new Error(`onething: avatar list failed: ${error.message}`)
  const stale = (data ?? []).map((o) => `${userId}/${o.name}`).filter((p) => p !== keep)
  if (stale.length === 0) return
  const { error: rmErr } = await store.remove(stale)
  if (rmErr) throw new Error(`onething: avatar remove failed: ${rmErr.message}`)
}
