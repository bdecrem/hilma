import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, findUserById, verifySession } from '@/lib/onething/core'
import { PhotoError, clearPhoto, setPhoto } from '@/lib/onething/photo'

export const runtime = 'nodejs'

async function me() {
  const userId = verifySession((await cookies()).get(COOKIE)?.value)
  return userId ? findUserById(userId) : null
}
const DAY = /^\d{4}-\d{2}-\d{2}$/

function fail(e: unknown, fallback: string) {
  if (e instanceof PhotoError) return NextResponse.json({ error: e.message }, { status: 400 })
  console.error('[onething] photo route failed', e)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

// POST multipart/form-data { day, file } — stick a picture to that day (one per
// day; a new one replaces it). The browser already scaled it down. Returns { entry }.
export async function POST(req: Request) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  let day: string
  let file: File
  try {
    const form = await req.formData()
    const f = form.get('file')
    day = String(form.get('day') ?? '')
    if (!(f instanceof File)) return NextResponse.json({ error: 'Which picture?' }, { status: 400 })
    file = f
  } catch {
    return NextResponse.json({ error: 'Which picture?' }, { status: 400 })
  }
  if (!DAY.test(day)) return NextResponse.json({ error: 'Which day?' }, { status: 400 })
  try {
    const entry = await setPhoto(user.id, day, Buffer.from(await file.arrayBuffer()))
    return NextResponse.json({ ok: true, entry })
  } catch (e) {
    return fail(e, 'Could not save that picture.')
  }
}

// DELETE ?day=YYYY-MM-DD — take the picture off that day.
export async function DELETE(req: Request) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const day = new URL(req.url).searchParams.get('day') ?? ''
  if (!DAY.test(day)) return NextResponse.json({ error: 'Which day?' }, { status: 400 })
  try {
    const entry = await clearPhoto(user.id, day)
    return NextResponse.json({ ok: true, entry })
  } catch (e) {
    return fail(e, 'Could not remove that picture.')
  }
}
