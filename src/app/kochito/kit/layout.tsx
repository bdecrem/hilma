import localFont from 'next/font/local'

// The board's text face (OLA-170, the Lamp look): Instrument Sans. Loaded here, not in the company
// layout, so the public pages of kochitolabs.com do not carry it.
const instrument = localFont({ src: '../../../fonts/instrument-sans/InstrumentSans.woff2', weight: '400 700', variable: '--bd-instrument', display: 'swap' })

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={instrument.variable} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
