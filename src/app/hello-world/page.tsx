export default function HelloWorldPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        background: '#0b0f14',
        color: '#e7edf3',
        padding:
          'calc(env(safe-area-inset-top) + 2rem) calc(env(safe-area-inset-right) + 1.5rem) calc(env(safe-area-inset-bottom) + 2rem) calc(env(safe-area-inset-left) + 1.5rem)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(2.25rem, 11vw, 8rem)',
          maxWidth: '100%',
          fontWeight: 800,
          margin: 0,
          lineHeight: 1,
          letterSpacing: '-0.04em',
          background: 'linear-gradient(100deg, #7dd3fc 0%, #a78bfa 50%, #fb923c 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        Hello, world
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 'clamp(0.95rem, 3.5vw, 1.15rem)',
          color: '#8ea0b3',
          letterSpacing: '0.01em',
        }}
      >
        Built on the mini, shipped to Vercel.
      </p>
    </main>
  );
}
