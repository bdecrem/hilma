'use client';

import { useCallback, useEffect, useState } from 'react';

type Entry = { id: string; day: string; text: string; streak: number; points: number };
type Level = { name: string; min: number };
type Board = { points: number; streak: number; best: number; doneToday: boolean; level: Level; next: Level | null; index: number };
type Me = { user: { phone: string; since: string } | null; today?: string; board?: Board; entries?: Entry[] };

const EXAMPLES = [
  'Saw a heron stand perfectly still for ten minutes.',
  'Deleted the feature instead of fixing it. Felt great.',
  'Mom called. We talked about the fig tree.',
  'Found the coffee place with the good window.',
  'Got the last loaf before the fog rolled in.',
  'Said no to a meeting and read on the steps instead.',
];

const SPARKS = [
  'Something you noticed and nobody else did.',
  'Something small that worked.',
  'Something you would tell a friend at dinner.',
  'A thing you changed your mind about.',
  'The best ten minutes.',
  'Something that made you laugh, even a little.',
  'A thing you finished. Or started.',
  'Who you talked to, and one line they said.',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
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
  const [ex, setEx] = useState(0);
  const [spark, setSpark] = useState(() => Math.floor(Math.random() * SPARKS.length));

  const load = useCallback(async () => {
    const r = await fetch('/api/onething/me', { cache: 'no-store' });
    setMe((await r.json()) as Me);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setEx((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(t);
  }, []);

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
  async function start() { if (await post('/api/onething/auth/start', { phone })) setStage('code'); }
  async function verify() {
    if (await post('/api/onething/auth/verify', { phone, code })) { setCode(''); setStage('phone'); await load(); }
  }
  async function save() {
    const j = await post('/api/onething/entry', { text });
    if (j) {
      setText('');
      setFlash(j.edited ? 'Updated.' : `+${j.earned} points${j.bonus ? ` · milestone +${j.bonus}` : ''}`);
      await load();
      setTimeout(() => setFlash(''), 6000);
    }
  }
  async function signout() { await fetch('/api/onething/auth/signout', { method: 'POST' }); setMe({ user: null }); }

  const Word = (
    <h1 className="ot-word"><em>1</em>thing</h1>
  );

  if (me === null) {
    return <main className="ot-main"><div className="ot-mono"><span className="ot-dot" />a daily ledger</div>{Word}</main>;
  }

  if (!me.user) {
    return (
      <main className="ot-main">
        <div className="ot-mono"><span className="ot-dot" />a daily ledger · one line, kept</div>
        {Word}
        <h2 className="ot-hero">
          Every day at ten, a text: <em>what&rsquo;s <span className="mark">one thing</span> that happened?</em>
        </h2>
        <div className="ot-cycle" aria-live="polite">
          <span className="q" key={ex}>&ldquo;{EXAMPLES[ex]}&rdquo;</span>
        </div>
        <p className="ot-lede">
          You reply with a sentence. That&rsquo;s the whole habit. Miss it and you get one nudge at ten that night.
          Keep going and the streak grows. Every line stays here, in order, for as long as you want it.
        </p>
        <div className="ot-form">
          {stage === 'phone' ? (
            <form onSubmit={(e) => { e.preventDefault(); start(); }}>
              <div className="ot-mono">your number</div>
              <input className="ot-field" inputMode="tel" autoComplete="tel" placeholder="(650) 555 0199" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button className="ot-btn" disabled={busy} type="submit">{busy ? 'texting…' : 'text me a code →'}</button>
              <p className="ot-lede" style={{ marginTop: 14 }}>iMessage only. No password, no email, nothing to install.</p>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
              <div className="ot-mono">code, texted to {phone}</div>
              <input className="ot-field code" inputMode="numeric" autoComplete="one-time-code" placeholder="······" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="ot-btn" disabled={busy} type="submit">{busy ? 'checking…' : 'sign in →'}</button>
                <button type="button" className="ot-btn ghost" onClick={() => { setStage('phone'); setErr(''); }}>different number</button>
              </div>
            </form>
          )}
          {err && <p className="ot-err">{err}</p>}
        </div>
      </main>
    );
  }

  const b = me.board!;
  const entries = me.entries ?? [];
  const today = me.today ?? '';
  const have = new Set(entries.map((e) => e.day));
  const strip = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const span = b.next ? b.next.min - b.level.min : 1;
  const progress = b.next ? Math.min(1, (b.points - b.level.min) / span) : 1;

  return (
    <main className="ot-main">
      <div className="ot-top">
        <div>
          <div className="ot-mono"><span className="ot-dot" />{prettyPhone(me.user.phone)}</div>
          {Word}
        </div>
        <button className="ot-link" onClick={signout}>sign out</button>
      </div>

      <section className="ot-streak" aria-label="streak">
        <p className={`n${b.streak === 0 ? ' zero' : ''}`}>{b.streak === 0 ? '0' : b.streak}</p>
        <div className="side">
          <div className="ot-mono">{b.streak === 1 ? 'day in a row' : 'days in a row'}{b.streak >= 3 ? ' 🔥' : ''}</div>
          <p className="big">
            {b.streak === 0 ? <em>Today is day one.</em> : b.doneToday ? <em>Done for today.</em> : <em>Still open today.</em>}
          </p>
        </div>
      </section>

      <div className="ot-strip" aria-label="last two weeks">
        {strip.map((d) => (
          <span key={d} className={`d${have.has(d) ? ' on' : ''}${d === today ? ' today' : ''}`} title={shortDay(d)} />
        ))}
      </div>
      <div className="ot-meta ot-mono">
        <span>{b.points} pts · {b.level.name}</span>
        <span>{b.next ? `${b.next.min - b.points} to ${b.next.name}` : 'old growth'}{b.best > 1 ? ` · best ${b.best}` : ''}</span>
      </div>
      <div className="ot-bar"><i style={{ width: `${progress * 100}%` }} /></div>

      <section className="ot-card">
        {b.doneToday && <div className="ot-stamp">kept<br />today</div>}
        <div className="ot-mono">{shortDay(today)} · today</div>
        {b.doneToday ? (
          <>
            <p className="ot-done"><em>&ldquo;{entries.find((e) => e.day === today)?.text}&rdquo;</em></p>
            {flash && <div className="ot-flash ot-mono" style={{ color: 'var(--ember)' }}>{flash}</div>}
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <p className="q">What&rsquo;s one thing that happened in the last 24 hours?</p>
            <p className="spark">
              {SPARKS[spark]}
              <button type="button" onClick={() => setSpark((s) => (s + 1) % SPARKS.length)}>another spark ↻</button>
            </p>
            <textarea className="ot-area" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="One sentence." rows={2} />
            <button className="ot-btn" disabled={busy || text.trim().length < 2} type="submit">{busy ? 'keeping…' : 'keep it →'}</button>
            {err && <p className="ot-err">{err}</p>}
          </form>
        )}
      </section>

      <section className="ot-ledger">
        <div className="ot-mono">the ledger · {entries.length} {entries.length === 1 ? 'line' : 'lines'}</div>
        {entries.length === 0 ? (
          <p className="ot-empty">Nothing yet. Your first line lands here. The next text comes at ten.</p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {entries.map((e) => (
              <div className="row" key={e.id}>
                <span className="ot-mono">{e.day === today ? 'today' : shortDay(e.day)}</span>
                <p className="s">{e.text}</p>
                <span className="ot-mono">d{e.streak}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="ot-foot">
        Texts at 10:05am and, if the day is still open, 10:05pm Pacific.<br />
        Reply to any of them — or start a text with <code>1:</code> to log a line any time.
      </footer>
    </main>
  );
}
