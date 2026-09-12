import type { Metadata, Viewport } from 'next';
import { Gaegu } from 'next/font/google';
import './onething.css';

// One handwriting face for everything. preload: false keeps the Link header
// small; the tunnel's nginx 502s on response headers over 4KB.
const gaegu = Gaegu({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-hand', preload: false });

const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#faf8f3"/><g fill="none" stroke="#35332f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 46 L26 30 L42 14 L50 22 L34 38 Z"/><path d="M42 14 L50 22"/><path d="M22 46 L26 42"/></g><path d="M26 30 L34 38 L30 41 L23 34 Z" fill="#f3c64b"/></svg>'
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
  themeColor: '#faf8f3',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OnethingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ot ${gaegu.variable}`}>{children}</div>;
}
