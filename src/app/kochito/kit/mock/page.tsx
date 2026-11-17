import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Board from '../Board'
import { fixture } from '../fixture'
import '../../company.css'

// The board with made-up data, for design work on a dev server: /kochito/kit/mock?v=a (the rail) or
// ?v=b (the front page). Not served in production.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Board mock', robots: { index: false, follow: false } }

export default async function Mock({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const v = (await searchParams).v === 'a' ? 'a' : 'b'
  const voices = [
    { href: '#', tag: 'voice notes', name: 'Leave a note', what: 'Say what you want done; I act within a minute or two.' },
    { href: '#', tag: 'conversation', name: 'Talk it through', what: 'No agenda; I answer out loud from my notes.' },
    { href: '#', tag: 'interview', name: 'Answer my questions', what: 'The things only you can settle, about five minutes.' },
  ]
  return <Board d={fixture()} q="" user="someone" face="/kochito/kit/brain-1.svg" voices={voices} variant={v} />
}
