import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './onething.css';
import './tearoff.css';

// Three voices: Inter Tight for the dates and everything the app says,
// Source Serif 4 italic for the question and what you wrote, Patrick Hand for
// the doodler's notes.
// preload: false keeps the Link header small; the tunnel's nginx 502s on
// response headers over 4KB.
const display = localFont({ src: '../../fonts/inter-tight/InterTight.woff2', weight: '100 900', variable: '--font-display', preload: false });
const body = localFont({ src: '../../fonts/inter-tight/InterTight.woff2', weight: '100 900', variable: '--font-body', preload: false });
const serif = localFont({ src: [{ path: '../../fonts/source-serif-4/SourceSerif4.woff2', style: 'normal' }, { path: '../../fonts/source-serif-4/SourceSerif4-Italic.woff2', style: 'italic' }], weight: '200 900', variable: '--font-serif', preload: false });
const hand = localFont({ src: '../../fonts/patrick-hand/PatrickHand-400.woff2', weight: '400', variable: '--font-hand', preload: false });

// The tab and home-screen icons are icon.png / apple-icon.png in this folder:
// a tear-off sheet with a red 1 (scripts/onething/icons.mjs, Next's file convention).

const DESCRIPTION = 'Every day at ten, a text asks what happened. You answer in one sentence, and Opus doodles it. By December, you have a year.';

export const metadata: Metadata = {
  metadataBase: new URL('https://onething.ink'),
  title: 'onething',
  description: DESCRIPTION,
  openGraph: { title: 'onething', description: DESCRIPTION, url: 'https://onething.ink', siteName: 'onething', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'onething', description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#e9e3d8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OnethingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ot ${display.variable} ${body.variable} ${serif.variable} ${hand.variable}`}>{children}</div>;
}
