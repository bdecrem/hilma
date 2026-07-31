'use client';

import { useEffect, useRef, useState } from 'react';

const EMOJIS = ['🌟', '🍋', '🦋', '🍩', '🎈', '🐙'];
const GAME_SECONDS = 20;
const CELLS = 9;

export default function Game() {
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [best, setBest] = useState(0);
  const [active, setActive] = useState<{ cell: number; emoji: string } | null>(null);
  const [played, setPlayed] = useState(false);
  const hopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setRunning(false);
          setActive(null);
          setPlayed(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [running]);

  useEffect(() => {
    if (!running) {
      if (hopTimer.current) clearTimeout(hopTimer.current);
      return;
    }
    let cancelled = false;
    const hop = () => {
      if (cancelled) return;
      setActive((prev) => {
        let cell = Math.floor(Math.random() * CELLS);
        if (prev && cell === prev.cell) cell = (cell + 1) % CELLS;
        return { cell, emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)] };
      });
      hopTimer.current = setTimeout(hop, 550 + Math.random() * 350);
    };
    hop();
    return () => {
      cancelled = true;
      if (hopTimer.current) clearTimeout(hopTimer.current);
    };
  }, [running]);

  useEffect(() => {
    if (!running && played) setBest((b) => Math.max(b, score));
  }, [running, played, score]);

  const start = () => {
    setScore(0);
    setTimeLeft(GAME_SECONDS);
    setRunning(true);
  };

  const tap = (cell: number) => {
    if (!running || !active || active.cell !== cell) return;
    setScore((s) => s + 1);
    setActive(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem' }}>
      <div style={{ color: '#d8f3f0', fontSize: '1rem', display: 'flex', gap: '1.5rem' }}>
        <span>⏱ {timeLeft}s</span>
        <span>⭐ {score}</span>
        {best > 0 && <span>🏆 {best}</span>}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.6rem',
          width: 'min(78vw, 20rem)',
        }}
      >
        {Array.from({ length: CELLS }, (_, i) => (
          <button
            key={i}
            onPointerDown={() => tap(i)}
            aria-label={active?.cell === i ? 'catch it!' : 'empty'}
            style={{
              aspectRatio: '1',
              fontSize: '2.2rem',
              borderRadius: '1rem',
              border: '2px solid rgba(232, 220, 255, 0.25)',
              background: 'rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {active?.cell === i ? active.emoji : ''}
          </button>
        ))}
      </div>
      {!running && (
        <button
          onClick={start}
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            color: '#023436',
            background: '#ffd166',
            border: 'none',
            borderRadius: '999px',
            padding: '0.7rem 1.8rem',
            cursor: 'pointer',
          }}
        >
          {played ? `Nice! ${score} caught — play again` : 'Catch the critters — tap to start'}
        </button>
      )}
    </div>
  );
}
