import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

const font = localFont({
  src: [
    { path: '../../fonts/instrument-serif/InstrumentSerif-400.woff2', weight: '400' },
    { path: '../../fonts/instrument-serif/InstrumentSerif-400-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Hi Tim',
  description: 'A hello world page for Tim.',
  metadataBase: new URL('https://ola.cx'),
  openGraph: { title: 'Hi Tim', description: 'A hello world page for Tim.', url: 'https://ola.cx/tim' },
}

export const viewport: Viewport = { themeColor: '#f4efe6' }

// Two words on warm paper and nothing else. The block sits a little above
// centre, where the eye rests, and fades in once.
const css = `
.tim {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  background: #f4efe6;
  color: #26221d;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) calc(env(safe-area-inset-bottom) + 8dvh) env(safe-area-inset-left);
  font-family: var(--font-instrument-serif), Georgia, serif;
}
.tim h1 {
  margin: 0;
  font-size: clamp(4rem, 9vw, 7.5rem);
  font-weight: 400;
  line-height: 1;
  letter-spacing: -.01em;
  animation: tim-in 1.4s ease-out both;
}
.tim em { font-style: italic; }
@keyframes tim-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .tim h1 { animation: none; }
}
`

export default function TimPage() {
  return (
    <main className={`tim ${font.variable}`}>
      <style>{css}</style>
      <h1>
        Hi <em>Tim</em>
      </h1>
    </main>
  )
}
