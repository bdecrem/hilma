import { Baloo_2 } from 'next/font/google'

const baloo = Baloo_2({ subsets: ['latin'], weight: ['500', '700', '800'] })

export const metadata = {
  title: "Hi, I'm Bart",
  description: 'AI & human flourishing at CASBS. Swing by my desk anytime.',
}

export const viewport = {
  themeColor: '#FFF6EA',
}

const linkStyle = {
  color: '#D64A22',
  fontWeight: 700 as const,
  textDecoration: 'none',
  borderBottom: '2px solid #F4633A',
}

export default function HiPage() {
  return (
    <main
      className={baloo.className}
      style={{
        minHeight: '100dvh',
        background: '#FFF6EA',
        color: '#2B2118',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding:
          'calc(32px + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left))',
      }}
    >
      <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
        <div style={{ fontSize: '72px', lineHeight: 1 }}>👋</div>
        <h1 style={{ fontSize: '44px', lineHeight: 1.1, margin: 0, fontWeight: 800 }}>
          Hey, I&#39;m Bart
        </h1>
        <p style={{ fontSize: '21px', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
          I build (tinker?) with new tech, following my curiosity towards projects that are
          interesting, fun, and make a positive dent. Currently working on{' '}
          <a href="https://dodo.foo" style={linkStyle}>
            dodo.foo
          </a>{' '}
          and fixing up my{' '}
          <a href="https://decremental.com/#macinclaude" style={linkStyle}>
            Mac Plus
          </a>
          . More about me at{' '}
          <a href="https://decremental.com" style={linkStyle}>
            decremental.com
          </a>
          .
        </p>
        <p style={{ fontSize: '21px', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
          I&#39;m a practitioner fellow here this year, making prototypes around AI &amp; human
          flourishing.
        </p>
        <p style={{ fontSize: '21px', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
          I&#39;m excited to get to know everyone, and happy to be a resource if you want to use
          AI in your own work. Swing by my desk anytime, text me at{' '}
          <a href="sms:6508989508" style={linkStyle}>
            650-898-9508
          </a>
          , or email{' '}
          <a href="mailto:bdecrem@gmail.com" style={linkStyle}>
            bdecrem@gmail.com
          </a>
          .
        </p>
        <p style={{ fontSize: '21px', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
          <a href="/hi/about" style={linkStyle}>
            About Me
          </a>
        </p>
      </div>
    </main>
  )
}
