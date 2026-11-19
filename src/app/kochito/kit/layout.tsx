import localFont from 'next/font/local'

// The board's own faces for the looks of looks.css (OLA-170): Instrument Sans for "lamp", DM Sans
// and DM Mono for "desk". Loaded here, not in the company layout, so the public pages of
// kochitolabs.com do not carry them; not preloaded, so a look only fetches the face it uses.
const instrument = localFont({ src: '../../../fonts/instrument-sans/InstrumentSans.woff2', weight: '400 700', variable: '--bd-instrument', display: 'swap', preload: false })
const dm = localFont({
  src: [
    { path: '../../../fonts/dm-sans/DMSans.woff2', style: 'normal' },
    { path: '../../../fonts/dm-sans/DMSans-Italic.woff2', style: 'italic' },
  ],
  weight: '100 1000',
  variable: '--bd-dm',
  display: 'swap',
  preload: false,
})
const dmMono = localFont({
  src: [
    { path: '../../../fonts/dm-mono/DMMono-400.woff2', weight: '400' },
    { path: '../../../fonts/dm-mono/DMMono-500.woff2', weight: '500' },
  ],
  variable: '--bd-dm-mono',
  display: 'swap',
  preload: false,
})

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${instrument.variable} ${dm.variable} ${dmMono.variable}`} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
