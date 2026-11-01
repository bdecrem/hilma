import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Hi Tim',
  description: 'A hello world page for Tim.',
  metadataBase: new URL('https://ola.cx'),
  openGraph: { title: 'Hi Tim', description: 'A hello world page for Tim.', url: 'https://ola.cx/tim' },
}

export const viewport: Viewport = { themeColor: '#f7efdf' }

export default function TimPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: '#f7efdf',
        color: '#16121c',
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 'clamp(3rem, 12vw, 8rem)', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
        Hi Tim
      </h1>
    </main>
  )
}
