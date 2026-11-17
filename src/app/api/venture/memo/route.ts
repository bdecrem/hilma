import { after, NextResponse } from 'next/server'
import { minutesAfter } from '@/lib/venture/minutes-store'
import { keyOk } from '@/lib/venture/interview'
import { recentMemos, saveMemo, transcribe } from '@/lib/venture/memo'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/venture/memo?k=<key>            his latest voice notes, with when each was read
// POST /api/venture/memo  (multipart: key, audio, [test])   transcribe one note and store it
// The page is src/app/venture/memo; see src/lib/venture/memo.ts.
export async function GET(req: Request) {
  if (!keyOk(new URL(req.url).searchParams.get('k'))) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ memos: await recentMemos() })
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form || !keyOk(form.get('key'))) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const audio = form.get('audio')
  if (!(audio instanceof Blob) || audio.size < 800) return NextResponse.json({ error: 'That was too short to hear. Try again.' }, { status: 400 })
  try {
    const ext = audio.type.includes('mp4') || audio.type.includes('m4a') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : audio.type.includes('wav') ? 'wav' : 'webm'
    const text = await transcribe(audio, `note.${ext}`)
    if (!text) return NextResponse.json({ error: 'I could not make out any words. Try again.' }, { status: 400 })
    const test = form.get('test') === '1'
    const memo = await saveMemo(text, test)
    // Every note gets its minutes (src/lib/venture/minutes.ts); a check's note does not.
    if (!test) after(() => minutesAfter('note', String(memo.id)))
    return NextResponse.json({ memo })
  } catch (e) {
    console.error('[venture/memo] failed:', e)
    return NextResponse.json({ error: 'The note did not go through. It was not saved; record it again.' }, { status: 502 })
  }
}
