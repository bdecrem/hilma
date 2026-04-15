import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'decremental',
  description: 'things i\'m building',
  openGraph: {
    title: 'decremental',
    description: 'things i\'m building',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'decremental',
    description: 'things i\'m building',
  },
}

// Full-bleed: match the default light gradient's warm peach base so the
// Safari URL bar / status bar area blends with the page.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFEEE4' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
}

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: #FFEEE4;
        }
        @media (prefers-color-scheme: dark) {
          html, body { background: #1a1a1a; }
        }
      `}</style>
      {children}
    </>
  )
}
