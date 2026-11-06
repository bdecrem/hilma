import { NextResponse } from 'next/server'
import { articlePattern, find, getDoc, phrasePattern } from '@/lib/mrd/text'

// Search inside one law: ?q= a phrase (case and accents ignored) or ?article= a number,
// matched against "Article 12", "Artículo 12", "§ 12", "s. 12", "第12条" and friends.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sp = new URL(req.url).searchParams
  const article = sp.get('article')
  const re = article ? articlePattern(article) : phrasePattern(sp.get('q') ?? '')
  if (!re) return NextResponse.json({ total: 0, hits: [] })
  const doc = await getDoc(id)
  if (!doc) return NextResponse.json({ error: 'no text stored for this law' }, { status: 404 })
  const res = find(doc, re)
  if (!article) res.best = 0 // a phrase starts at its first match; an article at its heading
  return NextResponse.json(res, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
}
