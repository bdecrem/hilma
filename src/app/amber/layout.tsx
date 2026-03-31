import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'amber',
  description: 'things amber made',
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
