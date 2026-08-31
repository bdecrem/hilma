export const metadata = {
  title: 'Hello!',
  description: 'You found me. Say hi!',
}

export const viewport = {
  themeColor: '#FFF6EA',
}

export default function HiPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        background: '#FFF6EA',
        color: '#2B2118',
        fontFamily: 'system-ui, sans-serif',
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '96px', lineHeight: 1 }}>👋</div>
      <h1 style={{ fontSize: '48px', margin: 0, fontWeight: 800 }}>Hello, world!</h1>
    </main>
  )
}
