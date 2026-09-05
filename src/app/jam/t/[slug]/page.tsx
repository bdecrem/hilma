import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { jamDb } from '@/lib/jam/db'
import PublicTrack from './PublicTrack'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

async function isPublished(slug: string): Promise<boolean> {
  if (!/^[a-z0-9]{4,16}$/.test(slug)) return false
  const { data } = await jamDb().from('jam_tracks').select('id').eq('slug', slug).not('published_at', 'is', null).maybeSingle()
  return !!data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!/^[a-z0-9]{4,16}$/.test(slug)) return { title: 'Jam' }
  try {
    const { data } = await jamDb()
      .from('jam_tracks')
      .select('title, bpm, bars, jam_users(username)')
      .eq('slug', slug)
      .not('published_at', 'is', null)
      .maybeSingle()
    if (!data) return { title: 'Jam' }
    const u = data.jam_users as unknown as { username: string } | { username: string }[] | null
    const username = (Array.isArray(u) ? u[0]?.username : u?.username) ?? 'someone'
    const title = `${data.title} — ${username} on Jam`
    const description = `${data.bpm} BPM, ${data.bars} bars. Play it, then remix it with the groovebox.`
    return { title, description, openGraph: { title, description }, twitter: { card: 'summary_large_image', title, description } }
  } catch {
    return { title: 'Jam' }
  }
}

export default async function PublicTrackPage({ params }: Props) {
  const { slug } = await params
  if (!(await isPublished(slug))) notFound()
  return <PublicTrack slug={slug} />
}
