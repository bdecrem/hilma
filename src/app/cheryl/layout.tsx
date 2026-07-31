import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Hi Cheryl',
  description: "I'm here with Bart and we're just passing time.",
};

export const viewport: Viewport = {
  themeColor: '#023436',
};

export default function CherylLayout({ children }: { children: React.ReactNode }) {
  return children;
}
