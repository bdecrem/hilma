import type { Metadata } from 'next'
import content from './content.json'
import { Sheet, type SheetContent } from '../Sheet'

const description =
  'Working on your book? A skill by CASBS alum John Markoff that turns Claude into your fact checker: every claim looked up, each with a verdict and a source.'

export const metadata: Metadata = {
  title: content.title,
  description,
  alternates: { canonical: '/seminar/fact-checker' },
  openGraph: { title: content.title, description, url: '/seminar/fact-checker', type: 'article' },
  twitter: { card: 'summary_large_image', title: content.title, description },
}

export default function FactCheckerPage() {
  return <Sheet id="fact-checker" content={content as SheetContent} />
}
