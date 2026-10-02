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
