import type { Metadata } from 'next'
import content from './content.json'
import { Sheet, type SheetContent } from '../Sheet'

const description =
  'A step-by-step sheet for building a searchable library of papers on your own laptop with Claude Code, and how it sits next to Consensus, Scite and Zotero.'

export const metadata: Metadata = {
  title: content.title,
  description,
  alternates: { canonical: '/seminar/library' },
  openGraph: { title: content.title, description, url: '/seminar/library', type: 'article' },
  twitter: { card: 'summary_large_image', title: content.title, description },
}

export default function LibraryPage() {
  return <Sheet id="library" content={content as SheetContent} />
}
