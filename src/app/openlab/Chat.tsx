'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'Explain simply what a transformer is.',
  'Is it a good idea to keep all my savings in an index fund? Yes or no.',
  'What are you, and where are you running?',
];

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setInput('');
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setBusy(true);
    try {
      const res = await fetch('/api/openlab/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        setError(await res.text());
        setMessages(next);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setMessages([...next, { role: 'assistant', content: snapshot }]);
      }
      if (!acc.trim()) { setError('Empty reply from the mini.'); setMessages(next); }
    } catch (e) {
      setError((e as Error).message);
      setMessages(next);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#fff6ea',
        color: '#1a1714',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 680, margin: '0 auto', padding: '20px 18px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.18em', color: '#b8552c' }}>OPENLAB</span>
          <span style={{ fontSize: 13, color: '#8a7d72', flex: 1 }}>qwen3.5 9B on a Mac mini at Stanford, on our own rules</span>
          <Link href="/openlab/about" style={{ fontSize: 13, color: '#b8552c', whiteSpace: 'nowrap' }}>What is this?</Link>
        </header>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 16 }}>
          {messages.length === 0 && (
            <div style={{ marginTop: '12vh' }}>
              <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 22px' }}>
                Ask the mini something.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    style={{
                      textAlign: 'left', background: '#fff', border: '1px solid #e6d9c8', borderRadius: 10,
                      padding: '10px 12px', fontSize: 15, color: '#1a1714', cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                background: m.role === 'user' ? '#1a1714' : '#fff',
                color: m.role === 'user' ? '#fff6ea' : '#1a1714',
                border: m.role === 'user' ? 'none' : '1px solid #e6d9c8',
                borderRadius: 14,
                padding: '10px 14px',
                fontSize: 16,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {m.content || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          ))}
          {error && <div style={{ color: '#b8552c', fontSize: 14 }}>{error}</div>}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); void send(input); }}
          style={{ position: 'sticky', bottom: 0, background: '#fff6ea', padding: '10px 0 16px', display: 'flex', gap: 8 }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Say something"
            style={{
              flex: 1, resize: 'none', fontSize: 16, lineHeight: 1.4, padding: '11px 12px',
              border: '1px solid #e6d9c8', borderRadius: 12, background: '#fff', color: '#1a1714', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            style={{
              background: busy || !input.trim() ? '#c9bcae' : '#b8552c', color: '#fff6ea', border: 'none', borderRadius: 12,
              padding: '0 16px', fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            }}
          >
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
