import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber — spec 001',
  description: 'signal on night. generative work by @intheamber.',
  openGraph: {
    title: 'amber',
    description: 'signal on night.',
    siteName: 'amber',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'amber',
    description: 'signal on night.',
    creator: '@intheamber',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
}

export default function AmberV3Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: #0A0A0A !important;
        }
      `}</style>
      {children}
    </>
  )
}
