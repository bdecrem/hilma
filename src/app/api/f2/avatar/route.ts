import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png'])
const MAX_BYTES = 1024 * 1024 // 1 MB — also enforced by the bucket itself.

// POST /api/f2/avatar
// Body: multipart/form-data with field `file` = the image.
// Validates type + size, uploads to f2-avatars bucket, persists URL on f2_users.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let file: File
  try {
    const form = await req.formData()
    const f = form.get('file')
    if (!(f instanceof File)) {
      return NextResponse.json({ error: 'file field required' }, { status: 400 })
    }
    file = f
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 })
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: 'only JPG or PNG accepted' },
      { status: 415 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_BYTES} bytes)` },
      { status: 413 },
    )
  }

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  // Cache-bust the URL so old avatars don't stick in clients after an upload.
  const path = `${user.id}/avatar-${Date.now()}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())

  const sb = f2Supabase()
  const { error: upErr } = await sb.storage
    .from('f2-avatars')
    .upload(path, buf, { contentType: file.type, upsert: true })
  if (upErr) {
    console.error('[f2] avatar upload failed:', upErr)
    return NextResponse.json({ error: 'upload failed' }, { status: 500 })
  }

  // Delete any prior avatars in this user's folder so the bucket doesn't grow.
  const { data: existing } = await sb.storage
    .from('f2-avatars')
    .list(user.id)
  const stale = (existing ?? [])
    .map(o => `${user.id}/${o.name}`)
    .filter(p => p !== path)
  if (stale.length > 0) {
    await sb.storage.from('f2-avatars').remove(stale)
  }

  const { data: pub } = sb.storage.from('f2-avatars').getPublicUrl(path)
  const avatar_url = pub.publicUrl

  const { error: updErr } = await sb
    .from('f2_users')
    .update({ avatar_url })
    .eq('id', user.id)
  if (updErr) {
    console.error('[f2] f2_users.avatar_url update failed:', updErr)
    return NextResponse.json({ error: 'persist failed' }, { status: 500 })
  }

  return NextResponse.json({ avatar_url })
}

// DELETE /api/f2/avatar — remove the avatar; user falls back to gradient + initial.
export async function DELETE() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const sb = f2Supabase()
  const { data: existing } = await sb.storage
    .from('f2-avatars')
    .list(user.id)
  if (existing && existing.length > 0) {
    await sb.storage
      .from('f2-avatars')
      .remove(existing.map(o => `${user.id}/${o.name}`))
  }

  const { error } = await sb
    .from('f2_users')
    .update({ avatar_url: null })
    .eq('id', user.id)
  if (error) {
    console.error('[f2] avatar clear failed:', error)
    return NextResponse.json({ error: 'persist failed' }, { status: 500 })
  }

  return NextResponse.json({ avatar_url: null })
}
