import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSessionUser } from '@/lib/f2/auth'
import { f2Supabase } from '@/lib/f2/supabase'
import { createArtifact, PEBBLES_BUCKET } from '@/lib/f2/artifacts'

export const runtime = 'nodejs'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png'])
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — also enforced by the bucket itself.

// POST /api/f2/artifacts/image — save a photo pebble.
// Body: multipart/form-data — `file` (jpeg/png), optional `body` (caption),
// `source`, `thread_id`. Uploads to f2-pebbles/<user>/<uuid>.<ext>, then
// inserts the artifact row with kind = 'image'.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'only JPG or PNG accepted' }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file too large (max ${MAX_BYTES} bytes)` }, { status: 413 })
  }
  const str = (k: string) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  }

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${user.id}/${randomUUID()}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  const sb = f2Supabase()
  const { error: upErr } = await sb.storage
    .from(PEBBLES_BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (upErr) {
    console.error('[f2] pebble image upload failed:', upErr)
    return NextResponse.json({ error: 'upload failed' }, { status: 500 })
  }
  const { data: pub } = sb.storage.from(PEBBLES_BUCKET).getPublicUrl(path)

  const artifact = await createArtifact(user.id, {
    body: str('body') ?? '',
    source: str('source'),
    thread_id: str('thread_id'),
    image_url: pub.publicUrl,
  })
  if (!artifact) {
    await sb.storage.from(PEBBLES_BUCKET).remove([path])
    return NextResponse.json({ error: 'save failed' }, { status: 500 })
  }
  return NextResponse.json({ artifact })
}
