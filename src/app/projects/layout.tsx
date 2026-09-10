import type { Metadata, Viewport } from 'next'
import { Inter_Tight } from 'next/font/google'

// Same face as the bartin16.xyz landing this site now shares a front door with.
const tight = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

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

// Full-bleed: the warm paper of the landing page, so the Safari URL bar blends in.
// Light only — this page has no dark theme.
export const viewport: Viewport = {
  themeColor: '#fff6ea',
  colorScheme: 'light',
}

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          background: #fff6ea;
          color-scheme: light;
          font-family: ${tight.style.fontFamily}, system-ui, -apple-system, sans-serif;
        }
      `}</style>
      {children}
    </>
  )
}
