import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './onething.css';
import './journal.css';

// Three voices: Bricolage Grotesque for what you wrote and the big words,
// Nunito for everything the app says, Patrick Hand for the doodler's notes.
// preload: false keeps the Link header small; the tunnel's nginx 502s on
// response headers over 4KB.
const display = localFont({ src: '../../fonts/bricolage-grotesque/BricolageGrotesque.woff2', weight: '200 800', variable: '--font-display', preload: false });
const body = localFont({ src: '../../fonts/nunito/Nunito.woff2', weight: '200 1000', variable: '--font-body', preload: false });
const hand = localFont({ src: '../../fonts/patrick-hand/PatrickHand-400.woff2', weight: '400', variable: '--font-hand', preload: false });

// The tab and home-screen icons are icon.png / apple-icon.png in this folder:
// a doodled flower with petals in the six day colours (Next's file convention).

const DESCRIPTION = 'Every day at ten, a text asks what happened. You answer in one sentence, and Opus doodles it. By December, you have a year.';

export const metadata: Metadata = {
  metadataBase: new URL('https://onething.ink'),
  title: 'onething',
  description: DESCRIPTION,
  openGraph: { title: 'onething', description: DESCRIPTION, url: 'https://onething.ink', siteName: 'onething', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'onething', description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#fbf7f0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OnethingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ot ${display.variable} ${body.variable} ${hand.variable}`}>{children}</div>;
}
