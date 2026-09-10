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
        background: '#ff69b4',
        color: '#2b0a1e',
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
          color: '#2b0a1e',
        }}
      >
        Hello World
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 'clamp(0.95rem, 3.5vw, 1.15rem)',
          color: '#7a0f3f',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        For Bart &amp; Reuben
      </p>
    </main>
  );
}
