import { Baloo_2, Source_Sans_3 } from 'next/font/google'

const baloo = Baloo_2({ subsets: ['latin'], weight: ['500', '700', '800'] })
const sans = Source_Sans_3({ subsets: ['latin'], weight: ['400', '500', '600'] })

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

const footerLinkStyle = {
  color: '#D64A22',
  fontWeight: 600 as const,
  textDecoration: 'none',
}

export default function HiPage() {
  return (
    <main
      className={sans.className}
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
        <h1 className={baloo.className} style={{ fontSize: '44px', lineHeight: 1.1, margin: 0, fontWeight: 800 }}>
          Hey, I&#39;m Bart
        </h1>
        <p style={{ fontSize: '21px', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
          I build (tinker?) with new tech, following my curiosity into projects that are
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
          I&#39;m a practitioner fellow here this year, thinking and prototyping on AI &times;
          human flourishing.
        </p>
        <p style={{ fontSize: '21px', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
          Excited to meet everyone. Swing by anytime, text me at{' '}
          <a href="sms:6508989508" style={linkStyle}>
            650-898-9508
          </a>
          , or email{' '}
          <a href="mailto:bdecrem@gmail.com" style={linkStyle}>
            bdecrem@gmail.com
          </a>{' '}
          &mdash; especially if you want help using AI in your work.
        </p>
        <p style={{ fontSize: '17px', lineHeight: 1.5, margin: 0, marginTop: '10px', fontWeight: 600 }}>
          <a href="/hi/about" style={footerLinkStyle}>
            About Me
          </a>
          <span style={{ color: '#C4A889', margin: '0 10px' }}>&middot;</span>
          <a href="https://linkedin.com/in/bartdecrem" style={footerLinkStyle}>
            LinkedIn
          </a>
          <span style={{ color: '#C4A889', margin: '0 10px' }}>&middot;</span>
          <a href="https://x.com/bartdecrem" style={footerLinkStyle}>
            Twitter
          </a>
          <span style={{ color: '#C4A889', margin: '0 10px' }}>&middot;</span>
          <a href="https://decremental.substack.com" style={footerLinkStyle}>
            Substack
          </a>
        </p>
      </div>
    </main>
  )
}
