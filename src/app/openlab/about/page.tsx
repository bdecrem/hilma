import { readFileSync } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { isSignedIn } from '@/lib/openlab/auth';

export const dynamic = 'force-dynamic';

// Renders apps/openlab/README.md: the goal, the box, hardware, the log.
export default async function AboutPage() {
  if (!(await isSignedIn())) redirect('/openlab');
  const md = readFileSync(path.join(process.cwd(), 'apps/openlab/README.md'), 'utf8');
  return (
    <main
      style={{
        minHeight: '100dvh', background: '#fff6ea', color: '#1a1714',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="openlab-about" style={{ maxWidth: 680, margin: '0 auto', padding: '20px 18px 60px', fontSize: 17, lineHeight: 1.55 }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.18em', color: '#b8552c' }}>OPENLAB</span>
          <Link href="/openlab" style={{ fontSize: 14, color: '#b8552c' }}>Back to the chat</Link>
        </header>
        <ReactMarkdown>{md}</ReactMarkdown>
      </div>
      <style>{`
        .openlab-about h1 { font-size: 34px; letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 18px; }
        .openlab-about h2 { font-size: 22px; letter-spacing: -0.01em; margin: 34px 0 10px; }
        .openlab-about p, .openlab-about li { margin: 0 0 12px; }
        .openlab-about ul { padding-left: 22px; }
        .openlab-about code { font-size: 0.92em; background: #f6e9d6; padding: 1px 5px; border-radius: 5px; }
        .openlab-about table { border-collapse: collapse; width: 100%; font-size: 15px; display: block; overflow-x: auto; }
        .openlab-about th, .openlab-about td { text-align: left; border-bottom: 1px solid #e6d9c8; padding: 6px 8px 6px 0; vertical-align: top; }
      `}</style>
    </main>
  );
}
