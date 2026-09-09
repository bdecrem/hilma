export default function HelloPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff7ed',
        color: '#1c1917',
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 'clamp(3rem, 12vw, 8rem)', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
        Hello World
      </h1>
    </main>
  );
}
