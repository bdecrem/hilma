import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'A call with Claude',
  description: 'Fifteen minutes of questions before I start a business.',
  openGraph: {
    title: 'A call with Claude',
    description: 'Fifteen minutes of questions before I start a business.',
    url: 'https://ola.cx/venture/interview',
  },
  twitter: { card: 'summary_large_image', title: 'A call with Claude' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
