import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

const font = localFont({ src: '../../fonts/bricolage-grotesque/BricolageGrotesque.woff2', weight: '200 800', variable: '--font-bricolage-grotesque', display: 'swap' })

export const metadata: Metadata = {
  title: 'Hi Tim',
  description: 'A hello world page for Tim.',
  metadataBase: new URL('https://ola.cx'),
  openGraph: { title: 'Hi Tim', description: 'A hello world page for Tim.', url: 'https://ola.cx/tim' },
}

export const viewport: Viewport = { themeColor: '#ff4b1f' }

// A two-ink riso print: the ultramarine plate sits a few px off the cream type
// and slides into place on load.
// Size math: the corners of "Tim" must stay inside the sun. Half the word is about
// .86em across and its ink ends about .72em below centre, so the corner sits 1.12em
// out. At 33dvh that is 37dvh, inside the 45dvh radius; at 36vw it is 40vw, inside 48vw.
const css = `
.tim {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #ff4b1f;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  font-family: var(--font-bricolage-grotesque), system-ui, sans-serif;
}
.tim-sun {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(96vw, 90dvh);
  aspect-ratio: 1;
  border-radius: 50%;
  background: #ffc31f;
  transform: translate(-50%, -50%);
}
.tim h1 {
  position: relative;
  margin: 0;
  font-size: min(36vw, 33dvh);
  font-weight: 800;
  font-variation-settings: 'opsz' 96;
  line-height: .84;
  letter-spacing: .012em;
  text-align: center;
  color: #16121c;
  text-shadow: .022em .022em 0 #3d3bff;
  animation: tim-print .7s cubic-bezier(.2, .9, .2, 1) both;
}
.tim h1 span { display: block; }
@keyframes tim-print {
  from { text-shadow: .12em .1em 0 #3d3bff; }
  to { text-shadow: .022em .022em 0 #3d3bff; }
}
@media (prefers-reduced-motion: reduce) {
  .tim h1 { animation: none; }
}
`

export default function TimPage() {
  return (
    <main className={`tim ${font.variable}`}>
      <style>{css}</style>
      <div className="tim-sun" aria-hidden="true" />
      <h1>
        <span>Hi</span>
        <span>Tim</span>
      </h1>
    </main>
  )
}
