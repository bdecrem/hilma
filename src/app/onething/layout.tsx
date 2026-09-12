import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, IBM_Plex_Mono } from 'next/font/google';
import './onething.css';

const serif = Instrument_Serif({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--ot-serif' });
const mono = IBM_Plex_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--ot-mono' });

export const metadata: Metadata = {
  title: '1thing — one sentence a day',
  description: 'A daily ledger. At 10 you get a text asking what happened. You answer in one sentence. The streak does the rest.',
};

export const viewport: Viewport = {
  themeColor: '#f4efe6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OnethingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ot ${serif.variable} ${mono.variable}`}>{children}</div>;
}
