import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'now what?',
  description: 'superintelligence is here. what about us?',
  openGraph: {
    title: 'now what?',
    description: 'superintelligence is here. what about us?',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'now what?',
    description: 'superintelligence is here. what about us?',
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
}

export default function NowWhatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: #000;
        }
      `}</style>
      {children}
    </>
  )
}
