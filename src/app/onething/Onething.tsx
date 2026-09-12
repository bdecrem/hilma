'use client';

import { useCallback, useEffect, useState } from 'react';

type Entry = { id: string; day: string; text: string; streak: number; points: number };
type Level = { name: string; min: number };
type Board = {
  points: number; streak: number; best: number; doneToday: boolean;
  level: Level; next: Level | null; index: number;
};
type Me = {
  user: { phone: string; since: string } | null;
  today?: string;
  board?: Board;
  levels?: Level[];
  entries?: Entry[];
};

const INK = '#1f1a14';
const PAPER = '#f6f1e7';
const MUTE = '#8a7f70';
const EMBER = '#d9541e';
const RULE = '#e4dccd';
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function prettyDay(day: string, today?: string): string {
  if (day === today) return 'Today';
  const [y, m, d] = day.split('-').map(Number);
  const dt = Date.UTC(y, m - 1, d);
  if (today) {
    const [ty, tm, td] = today.split('-').map(Number);
    if (dt === Date.UTC(ty, tm - 1, td - 1)) return 'Yesterday';
  }
  return new Date(dt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function prettyPhone(p: string): string {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
}

export default function Onething() {
  const [me, setMe] = useState<Me | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/onething/me', { cache: 'no-store' });
    setMe((await r.json()) as Me);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function post(url: string, body: unknown) {
    setBusy(true); setErr('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? 'Something went wrong.'); return null; }
      return j;
    } catch {
      setErr('Network hiccup. Try again.'); return null;
    } finally { setBusy(false); }
  }

  async function start() {
    const j = await post('/api/onething/auth/start', { phone });
    if (j) setStage('code');
  }
  async function verify() {
    const j = await post('/api/onething/auth/verify', { phone, code });
    if (j) { setCode(''); setStage('phone'); await load(); }
  }
  async function save() {
    const j = await post('/api/onething/entry', { text });
    if (j) {
      setText('');
      setFlash(j.edited ? 'Updated.' : `Day ${j.streak}${j.streak >= 3 ? ' 🔥' : ''} · +${j.earned} points${j.bonus ? ` · milestone +${j.bonus}` : ''}`);
      await load();
      setTimeout(() => setFlash(''), 5000);
    }
  }
  async function signout() {
    await fetch('/api/onething/auth/signout', { method: 'POST' });
    setMe({ user: null });
  }

  const shell: React.CSSProperties = {
    minHeight: '100dvh',
    background: PAPER,
    color: INK,
    fontFamily: SANS,
    padding: 'calc(env(safe-area-inset-top) + 28px) calc(env(safe-area-inset-right) + 20px) calc(env(safe-area-inset-bottom) + 40px) calc(env(safe-area-inset-left) + 20px)',
  };
  const col: React.CSSProperties = { maxWidth: 560, margin: '0 auto' };
  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', fontSize: 18, padding: '14px 16px',
    border: `1px solid ${RULE}`, borderRadius: 12, background: '#fffdf8', color: INK, outline: 'none',
    fontFamily: SANS,
  };
  const button: React.CSSProperties = {
    marginTop: 12, width: '100%', fontSize: 16, fontWeight: 600, padding: '14px 16px',
    border: 'none', borderRadius: 12, background: INK, color: PAPER, cursor: 'pointer',
    opacity: busy ? 0.6 : 1, fontFamily: SANS, letterSpacing: '0.01em',
  };

  const Word = (
    <div style={{ fontFamily: SERIF, fontSize: 'clamp(2.4rem, 9vw, 3.4rem)', letterSpacing: '-0.03em', lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: 2 }}>
      <span style={{ color: EMBER }}>1</span><span>thing</span>
    </div>
  );

  if (me === null) {
    return <main style={shell}><div style={col}>{Word}</div></main>;
  }

  if (!me.user) {
    return (
      <main style={shell}>
        <div style={col}>
          {Word}
          <p style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.45, marginTop: 24, maxWidth: 440 }}>
            One sentence a day. At 10 each morning you get a text asking what happened. You reply. That&rsquo;s the whole habit.
          </p>
          <p style={{ color: MUTE, fontSize: 15, lineHeight: 1.5, marginTop: 8, maxWidth: 440 }}>
            Miss it and you get one nudge at 10 that night. Answer every day and the streak grows. The sentences stay here.
          </p>
          <div style={{ marginTop: 32 }}>
            {stage === 'phone' ? (
              <form onSubmit={(e) => { e.preventDefault(); start(); }}>
                <label style={{ fontSize: 13, color: MUTE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your number</label>
                <input style={{ ...input, marginTop: 8 }} inputMode="tel" autoComplete="tel" placeholder="(650) 555-0199" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <button style={button} disabled={busy} type="submit">{busy ? 'Texting…' : 'Text me a code'}</button>
                <p style={{ color: MUTE, fontSize: 13, marginTop: 10 }}>We text over iMessage. No password, no email.</p>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
                <label style={{ fontSize: 13, color: MUTE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Code we texted to {prettyPhone(phone.replace(/\D/g, '').length === 10 ? '+1' + phone.replace(/\D/g, '') : phone)}</label>
                <input style={{ ...input, marginTop: 8, letterSpacing: '0.3em', fontSize: 24 }} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
                <button style={button} disabled={busy} type="submit">{busy ? 'Checking…' : 'Sign in'}</button>
                <button type="button" onClick={() => { setStage('phone'); setErr(''); }} style={{ ...button, background: 'transparent', color: MUTE, marginTop: 4 }}>Different number</button>
              </form>
            )}
            {err && <p style={{ color: EMBER, marginTop: 12 }}>{err}</p>}
          </div>
        </div>
      </main>
    );
  }

  const b = me.board!;
  const entries = me.entries ?? [];
  const toNext = b.next ? b.next.min - b.points : 0;
  const span = b.next ? b.next.min - b.level.min : 1;
  const progress = b.next ? Math.min(1, (b.points - b.level.min) / span) : 1;

  return (
    <main style={shell}>
      <div style={col}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          {Word}
          <button onClick={signout} style={{ background: 'none', border: 'none', color: MUTE, fontSize: 13, cursor: 'pointer', fontFamily: SANS }}>sign out</button>
        </div>

        <section style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { k: 'streak', v: `${b.streak}`, s: b.streak >= 3 ? '🔥' : b.streak > 0 ? 'day' + (b.streak === 1 ? '' : 's') : 'start today' },
            { k: 'points', v: `${b.points}`, s: b.best ? `best ${b.best}` : ' ' },
            { k: 'level', v: b.level.name, s: b.next ? `${toNext} to ${b.next.name}` : 'top' },
          ].map((t) => (
            <div key={t.k} style={{ background: '#fffdf8', border: `1px solid ${RULE}`, borderRadius: 14, padding: '14px 14px 12px' }}>
              <div style={{ fontSize: 11, color: MUTE, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t.k}</div>
              <div style={{ fontFamily: SERIF, fontSize: t.k === 'level' ? 22 : 30, marginTop: 4, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{t.v}</div>
              <div style={{ fontSize: 12, color: MUTE, marginTop: 4, minHeight: 15 }}>{t.s}</div>
            </div>
          ))}
        </section>
        <div style={{ height: 4, background: RULE, borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: EMBER, borderRadius: 2, transition: 'width .6s ease' }} />
        </div>

        <section style={{ marginTop: 32 }}>
          {b.doneToday ? (
            <div style={{ fontSize: 13, color: MUTE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Today, done{flash ? ` · ${flash}` : ''}</div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); save(); }}>
              <label style={{ fontFamily: SERIF, fontSize: 20 }}>What&rsquo;s one thing that happened in the last 24 hours?</label>
              <textarea style={{ ...input, marginTop: 12, minHeight: 92, resize: 'vertical', fontFamily: SERIF, fontSize: 19, lineHeight: 1.4 }} value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="One sentence." />
              <button style={button} disabled={busy || text.trim().length < 2} type="submit">{busy ? 'Saving…' : 'Keep it'}</button>
              {err && <p style={{ color: EMBER, marginTop: 10 }}>{err}</p>}
            </form>
          )}
        </section>

        <section style={{ marginTop: 36 }}>
          {entries.length === 0 && (
            <p style={{ color: MUTE, fontSize: 15, lineHeight: 1.5 }}>Nothing yet. Your first sentence lands here, and the next text comes at 10.</p>
          )}
          {entries.map((e) => (
            <article key={e.id} style={{ borderTop: `1px solid ${RULE}`, padding: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                <span>{prettyDay(e.day, me.today)}</span>
                <span>day {e.streak}</span>
              </div>
              <p style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 1.45, margin: '8px 0 0' }}>{e.text}</p>
            </article>
          ))}
        </section>

        <footer style={{ marginTop: 48, color: MUTE, fontSize: 12, lineHeight: 1.6 }}>
          Signed in as {prettyPhone(me.user.phone)}. Texts arrive at 10am and, if you haven&rsquo;t answered, 10pm Pacific.
          Reply to any text, or start a message with <span style={{ fontFamily: 'ui-monospace, monospace' }}>1:</span> to log a sentence any time.
        </footer>
      </div>
    </main>
  );
}
