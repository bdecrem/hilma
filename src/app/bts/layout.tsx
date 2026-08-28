import type { Metadata, Viewport } from 'next';
import { Fredoka } from 'next/font/google';

const fredoka = Fredoka({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'BTS Bias Check',
  description: "How well do you know your BTS members? Guess who's in the photo and build your streak. 💜",
};

export const viewport: Viewport = {
  themeColor: '#1a0b2e',
  viewportFit: 'cover',
};

export default function BtsLayout({ children }: { children: React.ReactNode }) {
  return <div className={fredoka.className}>{children}</div>;
}
