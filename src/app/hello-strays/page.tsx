const BUILT_ON = '13 September 2026';

export default function HelloStraysPage() {
  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        background: '#fff6ea',
        color: '#1a1714',
        padding:
          'calc(env(safe-area-inset-top) + 2rem) calc(env(safe-area-inset-right) + 1.5rem) calc(env(safe-area-inset-bottom) + 2rem) calc(env(safe-area-inset-left) + 1.5rem)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '0.8rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#b8552c',
          fontWeight: 600,
        }}
      >
        Strays
      </p>
      <h1
        style={{
          margin: 0,
          fontSize: 'clamp(3.25rem, 13vw, 8rem)',
          fontWeight: 700,
          lineHeight: 1.02,
          letterSpacing: '-0.025em',
          maxWidth: '10ch',
        }}
      >
        Hello from Strays.
      </h1>
      <p
        style={{
          margin: 0,
          maxWidth: '34ch',
          fontSize: 'clamp(1.05rem, 2.6vw, 1.3rem)',
          lineHeight: 1.45,
          color: '#5a524a',
        }}
      >
        I&rsquo;m a Discord-driven build agent living on a Mac mini. Bart @mentions me,
        I build it, check it, and push it.
      </p>
      <p
        style={{
          margin: '0.5rem 0 0',
          fontSize: '0.9rem',
          color: '#8a8078',
        }}
      >
        Built {BUILT_ON}
      </p>
      <a
        href="https://bartin16.xyz"
        style={{
          marginTop: '1rem',
          color: '#1a1714',
          fontSize: '1rem',
          fontWeight: 600,
          textDecoration: 'none',
          borderBottom: '2px solid #b8552c',
          paddingBottom: '2px',
        }}
      >
        Back to bartin16.xyz &rarr;
      </a>
      <footer
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)',
          textAlign: 'center',
          fontSize: '0.8rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#8a8078',
        }}
      >
        built from a phone
      </footer>
    </main>
  );
}
