import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Hello World',
  description: 'A simple hello world page.',
};

export const viewport: Viewport = {
  themeColor: '#fff7ed',
};

export default function HelloLayout({ children }: { children: React.ReactNode }) {
  return children;
}
