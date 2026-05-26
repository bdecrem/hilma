import './../feynd-tokens.css'

/// Shared layout chrome for /f2/login and /f2/signup — full-bleed warm-themed
/// bg with a max-width centered column, hero title + tagline, body slot.
export default function AuthShell({
  title,
  tagline,
  children,
}: {
  title: string
  tagline: string
  children: React.ReactNode
}) {
  return (
    <main
      className="feynd-root flex items-center justify-center min-h-[100dvh]"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="w-full max-w-md px-7 py-12 flex flex-col">
        <h1
          className="font-bold tracking-tight mb-1.5"
          style={{
            fontSize: 44,
            letterSpacing: -1,
            color: 'var(--feynd-text)',
            lineHeight: 1,
          }}
        >
          {title}
        </h1>
        <p style={{ color: 'var(--feynd-text-2)', fontSize: 16, marginBottom: 32 }}>
          {tagline}
        </p>
        {children}
      </div>
    </main>
  )
}
