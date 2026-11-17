import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Board from '../Board'
import { fixture } from '../fixture'
import '../../company.css'

// The board with made-up data, for design work on a dev server: /kochito/kit/mock?v=a (the
// project at the top of the page, health and links in the sidebar) or ?v=b (the project in the
// sidebar too). Not served in production.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Board mock', robots: { index: false, follow: false } }

export default async function Mock({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const v = (await searchParams).v === 'b' ? 'b' : 'a'
  return <Board d={fixture()} q="" user="someone" face="/kochito/kit/brain-1.svg" base="/kochito/kit" variant={v} />
}
