import type { Metadata, Viewport } from 'next';
import { Caveat, Fraunces, Karla } from 'next/font/google';
import './onething.css';

// The journal voice: a soft serif with real italics for the sentences and the
// wordmark, a friendly sans for labels, and a handwritten face for the few notes
// someone would pencil in the margin.
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['SOFT', 'opsz'],
  variable: '--font-display',
});
const karla = Karla({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body' });
const caveat = Caveat({ subsets: ['latin'], weight: ['500'], variable: '--font-hand' });

const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f7f0e4"/><path d="M32 54V30" stroke="#2c2420" stroke-width="4" stroke-linecap="round"/><path d="M32 38c-10 0-16-8-16-16 8 0 16 6 16 16z" fill="#4a7c59"/><path d="M32 32c10 0 16-8 16-16-8 0-16 6-16 16z" fill="#8fb996"/></svg>'
  );

export const metadata: Metadata = {
  metadataBase: new URL('https://onething.ink'),
  title: 'onething',
  description: 'Every day at ten, a text asks what happened. You answer in one sentence. By December, you have a year.',
  icons: { icon: FAVICON },
  openGraph: {
    title: 'onething',
    description: 'Every day at ten, a text asks what happened. You answer in one sentence. By December, you have a year.',
    url: 'https://onething.ink',
    siteName: 'onething',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'onething', description: 'Every day at ten, a text asks what happened. You answer in one sentence. By December, you have a year.' },
};

export const viewport: Viewport = {
  themeColor: '#f7f0e4',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OnethingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ot ${fraunces.variable} ${karla.variable} ${caveat.variable}`}>{children}</div>;
}
