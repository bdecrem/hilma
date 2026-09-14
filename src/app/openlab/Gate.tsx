'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Gate() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/openlab/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: code }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(await res.text());
  }

  return (
    <main
      style={{
        minHeight: '100dvh', background: '#fff6ea', color: '#1a1714',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 18px', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.18em', color: '#b8552c' }}>OPENLAB</span>
        <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 6px' }}>
          Passcode?
        </p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            fontSize: 18, padding: '12px 14px', border: '1px solid #e6d9c8', borderRadius: 12,
            background: '#fff', color: '#1a1714', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          style={{
            background: busy || !code.trim() ? '#c9bcae' : '#b8552c', color: '#fff6ea', border: 'none',
            borderRadius: 12, padding: '12px 16px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Come in
        </button>
        {error && <div style={{ color: '#b8552c', fontSize: 14 }}>{error}</div>}
      </form>
    </main>
  );
}
