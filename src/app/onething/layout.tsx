import type { Metadata, Viewport } from 'next';
import { Caveat, Courier_Prime } from 'next/font/google';
import './onething.css';

// Two voices: the system types (Courier Prime), the person writes (Caveat).
// preload: false keeps the Link header small; the tunnel's nginx 502s on
// response headers over 4KB.
const mono = Courier_Prime({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono', preload: false });
const hand = Caveat({ weight: ['400', '600'], subsets: ['latin'], variable: '--font-hand', preload: false });

// A ruled page: cream, ink border, the red margin, three lines.
const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" fill="#f7f1e1" stroke="#2a251c" stroke-width="4"/><path d="M18 3v58" stroke="#c9645a" stroke-width="3"/><path d="M24 22h28M24 34h28M24 46h20" stroke="#cdb999" stroke-width="3" stroke-linecap="round"/><path d="M26 33c4-6 8-8 12-6" fill="none" stroke="#2a251c" stroke-width="3.5" stroke-linecap="round"/></svg>'
  );

const DESCRIPTION = 'Every day at ten, a text asks what happened. You answer in one sentence. By December, you have a year.';

export const metadata: Metadata = {
  metadataBase: new URL('https://onething.ink'),
  title: 'onething',
  description: DESCRIPTION,
  icons: { icon: FAVICON },
  openGraph: { title: 'onething', description: DESCRIPTION, url: 'https://onething.ink', siteName: 'onething', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'onething', description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#f7f1e1',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OnethingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ot ${mono.variable} ${hand.variable}`}>{children}</div>;
}
