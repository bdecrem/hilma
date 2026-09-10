import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Hello World',
  description: 'For Bart & Reuben.',
};

export const viewport: Viewport = {
  themeColor: '#ff69b4',
};

export default function HelloWorldLayout({ children }: { children: React.ReactNode }) {
  return children;
}
