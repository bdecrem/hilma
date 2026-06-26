import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Dog-Ear',
  description: 'New books worth folding down a corner for — chosen by real critics and booksellers, with a few from Claude based on your own shelf. Available on Kindle now.',
}

export const viewport: Viewport = {
  themeColor: '#f3ead7',
}

export default function BookScoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
