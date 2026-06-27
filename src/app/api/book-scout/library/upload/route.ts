import { NextResponse, after } from 'next/server'
import { bookScoutDb } from '@/lib/book-scout/db'
import { getSessionUser } from '@/lib/book-scout/auth'
import { parseLibrary } from '@/lib/book-scout/parse-library'
import { normTitle } from '@/lib/book-scout/normalize'
import { getUserLibrary } from '@/lib/book-scout/library'
import { generateTasteProfile } from '@/lib/book-scout/research'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/book-scout/library/upload — replace the signed-in user's library
// from an uploaded .csv or .md. Body: { text: string, filename?: string }
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'sign in first' }, { status: 401 })

  let body: { text?: string; filename?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const text = body.text || ''
  if (!text.trim()) return NextResponse.json({ error: 'empty file' }, { status: 400 })

  const parsed = parseLibrary(text, body.filename || '')
  if (parsed.length === 0) {
    return NextResponse.json({ error: "Couldn't find any books — expected a CSV/Markdown with Title (and ideally Author) columns." }, { status: 400 })
  }

  const db = bookScoutDb()
  // Replace this user's library.
  await db.from('book_scout_library').delete().eq('user_id', user.id)
  const rows = parsed.map((b) => ({
    user_id: user.id,
    title: b.title,
    author: b.author || null,
    type: b.type || null,
    is_fiction: true, // user uploads aren't classified; the picks prompt handles taste
    norm_title: normTitle(b.title),
  }))
  // insert in chunks to stay within payload limits
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from('book_scout_library').insert(rows.slice(i, i + 200))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Regenerate the one-time taste profile from the new library (reused for picks).
  after(async () => {
    try {
      const profile = await generateTasteProfile(await getUserLibrary(user.id))
      await db.from('book_scout_users').update({ taste_profile: profile, profile_updated_at: new Date().toISOString() }).eq('id', user.id)
    } catch { /* my-picks will lazily build it if this fails */ }
  })

  return NextResponse.json({ ok: true, count: rows.length })
}
