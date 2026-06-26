import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Book Scout',
  description: 'Monthly book recommendations curated by human critics, booksellers and librarians — never by AI. Only titles available on Kindle now.',
}

export const viewport: Viewport = {
  themeColor: '#faf6ec',
}

export default function BookScoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
