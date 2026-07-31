import Game from './Game';

export default function CherylPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        background: 'linear-gradient(160deg, #1a1440 0%, #3b1d6e 45%, #7a2c8f 100%)',
        padding: 'calc(1.5rem + env(safe-area-inset-top)) 1.5rem calc(1.5rem + env(safe-area-inset-bottom))',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '4rem', lineHeight: 1 }}>👋</div>
      <h1
        style={{
          color: '#ffe9a8',
          fontSize: 'clamp(2.2rem, 8vw, 4.5rem)',
          fontWeight: 800,
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        Hi Cheryl
      </h1>
      <p
        style={{
          color: '#e8dcff',
          fontSize: 'clamp(1.1rem, 4vw, 1.6rem)',
          margin: 0,
          maxWidth: '28ch',
        }}
      >
        I&apos;m here with Bart and we&apos;re just passing time.
      </p>
      <Game />
    </main>
  );
}
