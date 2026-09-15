import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, findUserById, verifySession } from '@/lib/onething/core'
import { clearAvatar, setAvatar } from '@/lib/onething/avatar'

export const runtime = 'nodejs'

async function me() {
  const userId = verifySession((await cookies()).get(COOKIE)?.value)
  return userId ? findUserById(userId) : null
}

// POST multipart/form-data { file } — a new profile picture. Returns { avatar }.
export async function POST(req: Request) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  let file: File
  try {
    const f = (await req.formData()).get('file')
    if (!(f instanceof File)) return NextResponse.json({ error: 'Which picture?' }, { status: 400 })
    file = f
  } catch {
    return NextResponse.json({ error: 'Which picture?' }, { status: 400 })
  }
  try {
    const avatar = await setAvatar(user.id, Buffer.from(await file.arrayBuffer()), file.type)
    return NextResponse.json({ ok: true, avatar })
  } catch (e) {
    const msg = (e as Error).message
    // Our own validation reads as a sentence for the person; anything else is a server fault.
    const ours = /^(A JPG|That picture)/.test(msg)
    if (!ours) console.error('[onething] avatar upload failed', e)
    return NextResponse.json({ error: ours ? msg : 'Could not save that picture.' }, { status: ours ? 400 : 500 })
  }
}

// DELETE — remove the picture; back to initials.
export async function DELETE() {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  try {
    await clearAvatar(user.id)
    return NextResponse.json({ ok: true, avatar: null })
  } catch (e) {
    console.error('[onething] avatar clear failed', e)
    return NextResponse.json({ error: 'Could not remove that picture.' }, { status: 500 })
  }
}
