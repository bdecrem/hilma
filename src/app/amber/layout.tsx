import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber — generative art',
  description: 'generative art, interactive toys, bitmap cartoons. by @intheamber.',
  openGraph: {
    title: 'amber',
    description: 'generative art, interactive toys, bitmap cartoons.',
    siteName: 'amber',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'amber',
    description: 'generative art, interactive toys, bitmap cartoons.',
    creator: '@intheamber',
  },
}

export const viewport: Viewport = {
  themeColor: '#FFECD2',
}

export default function AmberLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: #FFECD2;
        }
      `}</style>
      {children}
    </>
  )
}
