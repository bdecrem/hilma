import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './motion.css';

// Bundled fonts (src/fonts), so this page never fetches a font at build time.
const bricolage = localFont({
  src: '../../fonts/bricolage-grotesque/BricolageGrotesque.woff2',
  weight: '200 800',
  variable: '--font-bricolage',
  display: 'swap',
});
const jbmono = localFont({
  src: '../../fonts/jetbrains-mono/JetBrainsMono.woff2',
  weight: '100 800',
  variable: '--font-jbmono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ola.cx'),
  title: 'Dodo motion — explainer videos the Claude Motion way',
  description:
    'How we make short code-drawn explainer videos: a storyboard first, every word, number and timing in one script, a drawing file that only draws, a frame-per-second check loop, an MP4 and a web player.',
  openGraph: {
    title: 'Dodo motion — explainer videos the Claude Motion way',
    description:
      'Storyboard first. One script holds every word, number and timing. Check one frame per second. Render the MP4, build the player.',
    url: 'https://ola.cx/dodo-motion',
    type: 'article',
  },
};

export const viewport: Viewport = {
  themeColor: '#f7efdf',
};

export default function DodoMotionLayout({ children }: { children: React.ReactNode }) {
  return <div className={`dm ${bricolage.variable} ${jbmono.variable}`}>{children}</div>;
}
