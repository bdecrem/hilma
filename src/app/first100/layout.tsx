import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'first100 — find your first 100 users',
  description: 'The agentic service that helps indie developers find their first 100 users. Describe your app, set your goals, get a plan.',
  openGraph: {
    title: 'first100',
    description: 'Find your first 100 users.',
    siteName: 'first100',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'first100',
    description: 'Find your first 100 users.',
  },
}

export const viewport: Viewport = {
  themeColor: '#fafafa',
}

export default function First100Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: #fafafa;
        }
      `}</style>
      {children}
    </>
  )
}
