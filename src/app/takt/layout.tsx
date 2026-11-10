import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

// The landing page at takt.pizza (and ola.cx/takt). This layout also wraps
// /takt/hands, so it only carries the font variables; the page styles itself.
// Display: Barlow Condensed (the app's compressed heavy). Blues reads in a
// serif (Fraunces, the liner notes); Electronic and the labels in JetBrains Mono.
const display = localFont({
  src: [
    { path: '../../fonts/barlow-condensed/BarlowCondensed-600.woff2', weight: '600' },
    { path: '../../fonts/barlow-condensed/BarlowCondensed-700.woff2', weight: '700' },
  ],
  variable: '--font-takt-display',
  display: 'swap',
});
const serif = localFont({
  src: [
    { path: '../../fonts/fraunces/Fraunces.woff2', style: 'normal' },
    { path: '../../fonts/fraunces/Fraunces-Italic.woff2', style: 'italic' },
  ],
  weight: '100 900',
  variable: '--font-takt-serif',
  display: 'swap',
});
const mono = localFont({
  src: '../../fonts/jetbrains-mono/JetBrainsMono.woff2',
  weight: '100 800',
  variable: '--font-takt-mono',
  display: 'swap',
});

const DESCRIPTION = 'Learn piano with the band already playing. Blues or electronic, on Mac and iPhone.';

export const metadata: Metadata = {
  metadataBase: new URL('https://takt.pizza'),
  title: 'Takt',
  description: DESCRIPTION,
  openGraph: { title: 'Takt', description: DESCRIPTION, url: 'https://takt.pizza', siteName: 'Takt', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Takt', description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#F0E8D6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function TaktLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${serif.variable} ${mono.variable}`}>{children}</div>;
}
