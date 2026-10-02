import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Nunito, Patrick_Hand } from 'next/font/google';
import './onething.css';

// Three voices: Bricolage Grotesque for what you wrote and the big words,
// Nunito for everything the app says, Patrick Hand for the doodler's notes.
// preload: false keeps the Link header small; the tunnel's nginx 502s on
// response headers over 4KB.
const display = Bricolage_Grotesque({ weight: ['600', '700', '800'], subsets: ['latin'], variable: '--font-display', preload: false });
const body = Nunito({ weight: ['600', '700', '800', '900'], subsets: ['latin'], variable: '--font-body', preload: false });
const hand = Patrick_Hand({ weight: '400', subsets: ['latin'], variable: '--font-hand', preload: false });

// The ink drop: the mark beside the wordmark, and the tab icon.
const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx="36%" cy="40%" r="70%"><stop offset="0" stop-color="#e8dbff"/><stop offset=".5" stop-color="#a77bf2"/><stop offset="1" stop-color="#5a2fb2"/></radialGradient></defs><path d="M50 4 C62 28 86 44 86 66 A36 33 0 0 1 14 66 C14 44 38 28 50 4 Z" fill="url(#g)"/><ellipse cx="35" cy="48" rx="7" ry="13" transform="rotate(30 35 48)" fill="#fff" opacity=".7"/></svg>'
  );

const DESCRIPTION = 'Every day at ten, a text asks what happened. You answer in one sentence, and Opus doodles it. By December, you have a year.';

export const metadata: Metadata = {
  metadataBase: new URL('https://onething.ink'),
  title: 'onething',
  description: DESCRIPTION,
  icons: { icon: FAVICON },
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
