import type { Metadata } from 'next'
import content from './content.json'
import { Sheet, type SheetContent } from '../Sheet'

const description =
  'A step-by-step sheet for building and publishing your own website with Claude Code, written for people who are not technical.'

export const metadata: Metadata = {
  title: content.title,
  description,
  alternates: { canonical: '/seminar/website' },
  openGraph: { title: content.title, description, url: '/seminar/website', type: 'article' },
  twitter: { card: 'summary_large_image', title: content.title, description },
}

export default function WebsitePage() {
  return <Sheet id="website" content={content as SheetContent} />
}
