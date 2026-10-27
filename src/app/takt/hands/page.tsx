'use client';

import { useEffect, useState } from 'react';
import { C, HANDS, type Pose } from './hands';

// The scale the app teaches: A minor up, thumb under after the middle finger.
const RUN = [1, 2, 3, 1, 2, 3, 4, 5];

export default function TaktHandsPage() {
  const [i, setI] = useState(2); // start on the middle finger, so the tuck shows
  const [playing, setPlaying] = useState(true);
  const [hold, setHold] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setI((k) => (k + 1) % (RUN.length + 1)), 1000);
    return () => clearInterval(t);
  }, [playing]);

  const resting = i === RUN.length;
  const down = resting ? null : RUN[i];
  const next = RUN[(i + 1) % RUN.length];
  const pose: Pose = {
    down: hold ? null : down,
    next: hold ? null : next,
    tuck: !hold && !resting && down === 3 && next === 1,
    lit: hold ? [1, 2, 3, 4, 5] : undefined,
  };

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <div style={styles.kicker}>TAKT · HANDS</div>
        <h1 style={styles.h1}>Five hands</h1>
        <p style={styles.lede}>
          Concepts for the hand under the scale lessons. Each is one SVG in the app’s 240 × 200 box: five addressable fingers,
          a thumb group that rotates about its base. The finger that is down fills orange, the next one outlines blue, and the thumb
          tucks under before the fourth note, exactly as the lesson drives it today. Pick one to ship, keep the rest as unlockables.
        </p>
        <div style={styles.controls}>
          <button style={styles.button(playing)} onClick={() => setPlaying((v) => !v)}>
            {playing ? 'Pause the scale' : 'Play the scale'}
          </button>
          <div style={styles.fingers}>
            {RUN.map((f, k) => (
              <button
                key={k}
                style={styles.step(k === i && !hold)}
                onClick={() => {
                  setPlaying(false);
                  setHold(false);
                  setI(k);
                }}
                aria-label={`Note ${k + 1}, finger ${f}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            style={styles.button(hold)}
            onClick={() => {
              setPlaying(false);
              setHold((v) => !v);
            }}
          >
            Intro pose
          </button>
        </div>
      </header>

      <section style={styles.grid}>
        {HANDS.map(({ key, name, tag, blurb, unlock, Hand }, n) => (
          <article key={key} style={styles.card}>
            <div style={styles.canvas}>
              <Hand p={pose} />
            </div>
            <div style={styles.meta}>
              <div style={styles.index}>{String(n + 1).padStart(2, '0')}</div>
              <h2 style={styles.name}>{name}</h2>
              <div style={styles.tag}>{tag}</div>
              <p style={styles.blurb}>{blurb}</p>
              <div style={styles.unlock}>{unlock}</div>
            </div>
          </article>
        ))}
      </section>

      <footer style={styles.footer}>
        Same contract for all five: <code style={styles.code}>down</code>, <code style={styles.code}>next</code>,{' '}
        <code style={styles.code}>tuck</code>, plus <code style={styles.code}>lit</code> for the intro’s whole-hand pose. Mirror the
        group for the left hand.
      </footer>
    </main>
  );
}

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const styles = {
  main: {
    minHeight: '100dvh',
    background: C.ground,
    color: C.ink,
    padding: 'max(24px, env(safe-area-inset-top)) 20px max(40px, env(safe-area-inset-bottom))',
    fontFamily: 'system-ui, -apple-system, "Helvetica Neue", sans-serif',
    maxWidth: 1180,
    margin: '0 auto',
  } as React.CSSProperties,
  header: { maxWidth: 760, marginBottom: 28 } as React.CSSProperties,
  kicker: { fontFamily: mono, fontSize: 12, letterSpacing: '0.18em', color: C.muted } as React.CSSProperties,
  h1: { fontSize: 'clamp(44px, 8vw, 84px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 0.95, margin: '10px 0 16px' } as React.CSSProperties,
  lede: { fontSize: 17, lineHeight: 1.5, color: '#bdb8ae', margin: 0 } as React.CSSProperties,
  controls: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 20 } as React.CSSProperties,
  button: (on: boolean): React.CSSProperties => ({
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '10px 16px',
    borderRadius: 6,
    border: `1px solid ${on ? C.signal : C.line}`,
    background: on ? C.signal : C.panel,
    color: on ? C.ground : C.ink,
    cursor: 'pointer',
  }),
  fingers: { display: 'flex', gap: 4 } as React.CSSProperties,
  step: (on: boolean): React.CSSProperties => ({
    width: 34,
    height: 38,
    borderRadius: 6,
    border: `1.5px solid ${on ? C.signal : C.line}`,
    background: on ? C.signal : C.panel,
    color: on ? C.ground : C.cue,
    fontFamily: mono,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  }),
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))',
    gap: 16,
  } as React.CSSProperties,
  card: {
    background: C.panel,
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
  canvas: { padding: '18px 22px 6px', background: C.ground } as React.CSSProperties,
  meta: { padding: '16px 20px 20px' } as React.CSSProperties,
  index: { fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: C.muted } as React.CSSProperties,
  name: { fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', margin: '4px 0 2px', textTransform: 'uppercase' } as React.CSSProperties,
  tag: { fontFamily: mono, fontSize: 12, letterSpacing: '0.08em', color: C.cue, textTransform: 'uppercase' } as React.CSSProperties,
  blurb: { fontSize: 15, lineHeight: 1.5, color: '#bdb8ae', margin: '12px 0 14px' } as React.CSSProperties,
  unlock: { fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' } as React.CSSProperties,
  footer: { marginTop: 36, fontSize: 14, color: C.muted, lineHeight: 1.6 } as React.CSSProperties,
  code: { fontFamily: mono, color: C.ink, background: C.panel, padding: '1px 6px', borderRadius: 4 } as React.CSSProperties,
};
