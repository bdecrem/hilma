export default function HelloCheryl() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        padding: '2rem',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes wave {
          0%   { transform: rotate(0deg); }
          10%  { transform: rotate(-10deg); }
          20%  { transform: rotate(12deg); }
          30%  { transform: rotate(-8deg); }
          40%  { transform: rotate(10deg); }
          50%  { transform: rotate(0deg); }
          100% { transform: rotate(0deg); }
        }
        .wave {
          display: inline-block;
          transform-origin: 70% 80%;
          animation: wave 2.4s ease-in-out infinite;
        }
      `}</style>

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 'clamp(5rem, 18vw, 11rem)',
            lineHeight: 1,
          }}
        >
          <span className="wave">👋🏾</span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(2.5rem, 9vw, 6rem)',
            fontWeight: 800,
            color: '#fafafa',
            margin: '1.5rem 0 0',
            letterSpacing: '-0.05em',
            lineHeight: 1,
          }}
        >
          Hey, Cheryl.
        </h1>
      </div>
    </main>
  );
}
