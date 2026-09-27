import type { Metadata } from 'next'
import Drum from './Drum'

type Props = { searchParams: Promise<{ s?: string }> }

// A shared master gets a card printed from that master.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { s } = await searchParams
  const image = s ? `/drum/og?s=${encodeURIComponent(s)}` : '/drum/og'
  const title = s ? 'DRUM — a master, shared' : 'DRUM'
  const description = 'A four-color risograph you play. Every sheet it prints is the score of what it played.'
  return {
    title,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }], type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function Page({ searchParams }: Props) {
  const { s } = await searchParams
  return <Drum code={s ?? null} />
}
