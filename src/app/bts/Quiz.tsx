'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BtsImage, BtsMember } from './page';

type PlayerStats = { best: number; plays: number };
type Store = { current: string | null; players: Record<string, PlayerStats> };

const COOKIE = 'bts_quiz';
const EMPTY: Store = { current: null, players: {} };

// candy palette — one color per member, used on chips + answer buttons
const MEMBER_COLORS: Record<string, string> = {
  rm: '#7dd3fc',
  jin: '#f9a8d4',
  suga: '#a7f3d0',
  jhope: '#fdba74',
  jimin: '#fde047',
  v: '#c4b5fd',
  jungkook: '#fca5a5',
};

const PRAISE = ['정답!', 'Yes!', 'Borahae! 💜', 'You purple them!', 'ARMY brain!', 'Sharp eyes!'];

function readStore(): Store {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  if (!m) return EMPTY;
  try {
    const s = JSON.parse(decodeURIComponent(m[1]));
    if (s && typeof s === 'object' && s.players) return s as Store;
  } catch {}
  return EMPTY;
}

function writeStore(s: Store) {
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(s))}; max-age=31536000; path=/; samesite=lax`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Confetti({ burst }: { burst: number }) {
  if (!burst) return null;
  const pieces = Array.from({ length: 24 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.2;
    const dur = 1.1 + Math.random() * 0.8;
    const emoji = ['💜', '✨', '💖', '⭐', '🎉'][i % 5];
    const size = 14 + Math.random() * 14;
    return (
      <span
        key={`${burst}-${i}`}
        style={{
          position: 'absolute',
          left: `${left}%`,
          top: -30,
          fontSize: size,
          animation: `bts-fall ${dur}s ${delay}s ease-in forwards`,
          pointerEvents: 'none',
        }}
      >
        {emoji}
      </span>
    );
  });
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 50 }}>
      {pieces}
    </div>
  );
}

export default function Quiz({ members, images }: { members: BtsMember[]; images: BtsImage[] }) {
  const [store, setStore] = useState<Store>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [picking, setPicking] = useState(false);
  const [deck, setDeck] = useState<BtsImage[]>([]);
  const [pos, setPos] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [praise, setPraise] = useState('');
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nameOf = useMemo(() => Object.fromEntries(members.map((m) => [m.slug, m.name])), [members]);

  useEffect(() => {
    setStore(readStore());
    let bad: string[] = [];
    try {
      bad = JSON.parse(localStorage.getItem('bts_bad_pics') || '[]');
    } catch {}
    setFlagged(new Set(bad));
    setDeck(shuffle(images.filter((im) => !bad.includes(im.file))));
    setLoaded(true);
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [images]);

  const current = deck.length ? deck[pos % deck.length] : undefined;
  const next = deck.length ? deck[(pos + 1) % deck.length] : undefined;

  useEffect(() => {
    if (next) {
      const img = new Image();
      img.src = next.file;
    }
  }, [next]);

  function save(s: Store) {
    setStore(s);
    writeStore(s);
  }

  function startAs(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const players = { ...store.players };
    if (!players[trimmed]) players[trimmed] = { best: 0, plays: 0 };
    save({ current: trimmed, players });
    setPicking(false);
    setNameInput('');
    setStreak(0);
    setWrong(null);
  }

  function guess(slug: string) {
    if (wrong || flash || !current || !store.current) return;
    const me = store.players[store.current] ?? { best: 0, plays: 0 };
    const correct = slug === current.member;
    const newStreak = correct ? streak + 1 : streak;
    const isNewBest = correct && newStreak > me.best;
    const updated: PlayerStats = { best: Math.max(me.best, newStreak), plays: me.plays + 1 };
    save({ ...store, players: { ...store.players, [store.current]: updated } });
    if (correct) {
      setStreak(newStreak);
      setPraise(
        newStreak === 7
          ? 'OT7!! Seven in a row! 💜'
          : newStreak > 0 && newStreak % 10 === 0
            ? `${newStreak} STREAK — ARMY LEGEND!`
            : PRAISE[Math.floor(Math.random() * PRAISE.length)]
      );
      setNewBest(isNewBest);
      setFlash(true);
      if (newStreak >= 3) setBurst((b) => b + 1);
      advanceTimer.current = setTimeout(
        () => {
          setFlash(false);
          setNewBest(false);
          setPos((p) => p + 1);
        },
        newStreak === 7 || newStreak % 10 === 0 ? 1300 : 800
      );
    } else {
      setWrong(nameOf[current.member]);
    }
  }

  function nextRound() {
    setWrong(null);
    setStreak(0);
    setPos((p) => p + 1);
  }

  function flagBadPic() {
    if (!current || flash) return;
    const bad = new Set(flagged).add(current.file);
    setFlagged(bad);
    try {
      localStorage.setItem('bts_bad_pics', JSON.stringify([...bad]));
    } catch {}
    setDeck((d) => d.filter((im) => im.file !== current.file));
    setWrong(null);
    // streak untouched — a bad photo isn't the player's fault
  }

  const scoreboard = Object.entries(store.players).sort((a, b) => b[1].best - a[1].best);

  if (!loaded) return <main style={{ minHeight: '100dvh', background: '#1a0b2e' }} />;

  const needName = !store.current || picking;
  const streakHot = streak >= 3;

  return (
    <main
      style={{
        minHeight: '100dvh',
        background:
          'radial-gradient(1200px 600px at 80% -10%, rgba(236,72,153,0.25), transparent 60%), radial-gradient(900px 500px at -10% 110%, rgba(56,189,248,0.18), transparent 60%), linear-gradient(180deg, #1a0b2e 0%, #2b1157 60%, #3b1470 100%)',
        color: '#fdf4ff',
        padding:
          'calc(env(safe-area-inset-top) + 14px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 24px) calc(env(safe-area-inset-left) + 16px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes bts-fall { to { transform: translateY(110vh) rotate(320deg); opacity: 0.9; } }
        @keyframes bts-pop { 0% { transform: scale(0.6); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes bts-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); } }
        @keyframes bts-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes bts-glow { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        .bts-btn { transition: transform 120ms, box-shadow 120ms; }
        .bts-btn:active { transform: scale(0.94); }
        @media (hover: hover) { .bts-btn:hover { transform: translateY(-2px); } }
      `}</style>

      {/* floating background sparkles */}
      {['✨', '💜', '⭐', '💜', '✨'].map((e, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            position: 'absolute',
            left: `${8 + i * 20}%`,
            top: `${10 + (i % 3) * 28}%`,
            fontSize: 18 + (i % 3) * 6,
            opacity: 0.35,
            animation: `bts-float ${4 + i}s ease-in-out ${i * 0.7}s infinite`,
            pointerEvents: 'none',
          }}
        >
          {e}
        </span>
      ))}

      <Confetti burst={burst} />

      <div style={{ width: '100%', maxWidth: 560, position: 'relative' }}>
        <header style={{ textAlign: 'center', margin: '6px 0 18px' }}>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: 0.5,
              background: 'linear-gradient(90deg, #f0abfc, #a78bfa, #7dd3fc, #f9a8d4)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            BTS Bias Check
          </h1>
          <p style={{ fontSize: 15, color: '#d8b4fe', marginTop: 2 }}>Who is it? Build your streak 💜</p>
        </header>

        {needName ? (
          <section
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(216,180,254,0.25)',
              borderRadius: 24,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {members.map((m) => (
                <span
                  key={m.slug}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 999,
                    background: MEMBER_COLORS[m.slug],
                    color: '#1a0b2e',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {m.name}
                </span>
              ))}
            </div>
            <label style={{ fontSize: 16, fontWeight: 600, textAlign: 'center' }}>
              What&apos;s your name, ARMY?
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startAs(nameInput)}
                autoFocus
                maxLength={20}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 10,
                  padding: '13px 16px',
                  borderRadius: 14,
                  border: '2px solid #a78bfa',
                  background: 'rgba(26,11,46,0.8)',
                  color: '#fdf4ff',
                  fontSize: 18,
                  outline: 'none',
                  textAlign: 'center',
                  fontFamily: 'inherit',
                }}
              />
            </label>
            <button
              className="bts-btn"
              onClick={() => startAs(nameInput)}
              disabled={!nameInput.trim()}
              style={{
                padding: '14px 16px',
                borderRadius: 16,
                border: 'none',
                background: nameInput.trim()
                  ? 'linear-gradient(90deg, #a855f7, #ec4899)'
                  : 'rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: 18,
                fontWeight: 700,
                cursor: nameInput.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
                boxShadow: nameInput.trim() ? '0 6px 20px rgba(236,72,153,0.4)' : 'none',
              }}
            >
              Let&apos;s play! 🎤
            </button>
            {scoreboard.length > 0 && (
              <div>
                <p style={{ fontSize: 13, color: '#d8b4fe', marginBottom: 8, textAlign: 'center' }}>
                  or jump back in:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {scoreboard.map(([n, st]) => (
                    <button
                      key={n}
                      className="bts-btn"
                      onClick={() => startAs(n)}
                      style={{
                        padding: '9px 16px',
                        borderRadius: 999,
                        border: '2px solid #a78bfa',
                        background: 'rgba(167,139,250,0.15)',
                        color: '#ede9fe',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {n} 🔥{st.best}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : images.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#d8b4fe', padding: 40 }}>
            Photos are still downloading — refresh in a few minutes. 💜
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 15,
                color: '#d8b4fe',
                marginBottom: 10,
              }}
            >
              <span>
                <strong style={{ color: '#fdf4ff' }}>{store.current}</strong>
                <button
                  onClick={() => setPicking(true)}
                  style={{
                    marginLeft: 8,
                    background: 'none',
                    border: 'none',
                    color: '#c084fc',
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontFamily: 'inherit',
                  }}
                >
                  switch
                </button>
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: streakHot ? 'rgba(251,146,60,0.2)' : 'rgba(255,255,255,0.08)',
                  border: streakHot ? '1px solid rgba(251,146,60,0.6)' : '1px solid rgba(255,255,255,0.15)',
                  animation: streakHot ? 'bts-glow 1.6s ease-in-out infinite' : undefined,
                }}
              >
                <strong style={{ fontSize: 17 }}>
                  {streakHot ? '🔥' : '💜'} {streak}
                </strong>
                <span style={{ fontSize: 13 }}>best {store.players[store.current!]?.best ?? 0}</span>
              </span>
            </div>

            {!current && (
              <div style={{ textAlign: 'center', padding: 40, color: '#d8b4fe' }}>
                <p>All photos hidden! 😅</p>
                <button
                  onClick={() => {
                    localStorage.removeItem('bts_bad_pics');
                    setFlagged(new Set());
                    setDeck(shuffle(images));
                  }}
                  style={{
                    marginTop: 10,
                    background: 'none',
                    border: '1px solid #a78bfa',
                    borderRadius: 10,
                    padding: '8px 16px',
                    color: '#ede9fe',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Bring them back
                </button>
              </div>
            )}
            {current && (
              <div
                key={wrong ? 'wrong' : 'ok'}
                style={{
                  borderRadius: 24,
                  overflow: 'hidden',
                  border: flash
                    ? '4px solid #4ade80'
                    : wrong
                      ? '4px solid #fb7185'
                      : '4px solid rgba(216,180,254,0.35)',
                  transition: 'border-color 150ms',
                  background: '#12071f',
                  boxShadow: '0 14px 44px rgba(0,0,0,0.45)',
                  animation: wrong ? 'bts-shake 0.4s' : undefined,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={current.file}
                  src={current.file}
                  alt="Which BTS member is this?"
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 5',
                    maxHeight: 'min(56dvh, 600px)',
                    objectFit: 'cover',
                    objectPosition: 'center 20%',
                    display: 'block',
                  }}
                />
              </div>
            )}

            <div style={{ minHeight: 120, marginTop: 14 }}>
              {wrong ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 18, marginBottom: 12 }}>
                    Aish! 😅 That was <strong style={{ color: '#f9a8d4' }}>{wrong}</strong>.
                    {streak > 0 && <> Streak of {streak} gone. 💔</>}
                  </p>
                  <button
                    className="bts-btn"
                    onClick={nextRound}
                    style={{
                      padding: '14px 36px',
                      borderRadius: 16,
                      border: 'none',
                      background: 'linear-gradient(90deg, #a855f7, #ec4899)',
                      color: '#fff',
                      fontSize: 18,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 6px 20px rgba(236,72,153,0.4)',
                    }}
                  >
                    Next photo →
                  </button>
                </div>
              ) : flash ? (
                <div style={{ textAlign: 'center', animation: 'bts-pop 0.4s' }}>
                  <p style={{ fontSize: 26, fontWeight: 700, color: '#4ade80' }}>{praise}</p>
                  {newBest && (
                    <p style={{ fontSize: 15, color: '#fde047', marginTop: 4 }}>✨ New personal best!</p>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
                    gap: 9,
                  }}
                >
                  {members.map((m) => (
                    <button
                      key={m.slug}
                      className="bts-btn"
                      onClick={() => guess(m.slug)}
                      style={{
                        padding: '13px 6px',
                        borderRadius: 14,
                        border: 'none',
                        background: MEMBER_COLORS[m.slug],
                        color: '#1a0b2e',
                        fontSize: 17,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!flash && current && (
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <button
                  onClick={flagBadPic}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8b6cb0',
                    fontSize: 12,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontFamily: 'inherit',
                  }}
                >
                  picture no good 🙈
                </button>
              </div>
            )}

            {scoreboard.length > 1 && (
              <div style={{ marginTop: 20, fontSize: 14, color: '#d8b4fe', textAlign: 'center' }}>
                🏆 {scoreboard.map(([n, st]) => `${n}: ${st.best}`).join('  ·  ')}
              </div>
            )}
          </>
        )}

        <footer style={{ marginTop: 26, fontSize: 11, color: '#8b6cb0', textAlign: 'center' }}>
          Photos: Wikimedia Commons (CC-licensed)
        </footer>
      </div>
    </main>
  );
}
