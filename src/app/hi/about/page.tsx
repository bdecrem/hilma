import { Baloo_2, Source_Serif_4 } from 'next/font/google'

const baloo = Baloo_2({ subsets: ['latin'], weight: ['500', '700', '800'] })
const serif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '600'], style: ['normal'] })

export const metadata = {
  title: 'Bart Decrem',
  description: 'Decades of building technology for impact, community, and curiosity.',
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

const pStyle = {
  fontSize: '19px',
  lineHeight: 1.6,
  margin: 0,
  fontWeight: 400 as const,
}

export default function AboutPage() {
  return (
    <main
      className={serif.className}
      style={{
        minHeight: '100dvh',
        background: '#FFF6EA',
        color: '#2B2118',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding:
          'calc(48px + env(safe-area-inset-top)) calc(24px + env(safe-area-inset-right)) calc(64px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left))',
      }}
    >
      <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
        <h1 className={baloo.className} style={{ fontSize: '40px', lineHeight: 1.1, margin: 0, fontWeight: 800 }}>
          Bart Decrem
        </h1>
        <p style={pStyle}>
          Bart has spent decades building technology for impact, community, and curiosity. In open
          source, he co-founded Eazel and the GNOME Foundation to make Linux easier to use, and ran
          marketing and business affairs for the Firefox 1.0, helping to preserve the open
          internet.
        </p>
        <p style={pStyle}>
          As a Fellow at Echoing Green, the leading social entrepreneurship program, Bart started
          Plugged In, one of the first Digital Divide programs in the nation, bridging East Palo
          Alto and Silicon Valley, and chaired the national Community Technology Centers Network.
          He co-founded Full Circle Fund, a community of entrepreneurs coming together to partner
          with community groups and tackle important local issues. More recently, he co-founded and
          ran Mozilla Builders, supporting 100+ community activists and early-stage founders.
        </p>
        <p style={pStyle}>
          Bart also built Tap Tap Revenge, the first App Store smash hit, and has shipped 25 #1 App
          Store hits in total. After The Walt Disney Company acquired Tapulous, he led
          Disney&#39;s smartphone games group as SVP of Mobile Games, shipping Where&#39;s My Water
          and other hits that reached over a billion users.
        </p>
        <p style={pStyle}>
          For the past year, Bart has been exploring agentic uses of AI across creativity, science,
          and community, building proofs of concept ranging from an AI research agent running on a
          knowledge graph of 200,000+ papers, to a command-line music studio. During his fellowship
          year, Bart will explore human flourishing after AGI: if superintelligence arrives over
          the next few years, how can it be a supercharged &quot;bicycle for the mind&quot; rather
          than a path to cognitive surrender? He will host conversations with leading thinkers and
          ship app prototypes exploring these issues.
        </p>
        <p style={pStyle}>
          Bart earned his JD at Stanford Law School. He is a practitioner fellow at CASBS.
        </p>
        <p style={{ ...pStyle, marginTop: '10px' }}>
          <a href="/bart-decrem-cv.pdf" style={linkStyle}>
            Full CV (PDF)
          </a>
        </p>
        <p style={pStyle}>
          <a href="/hi" style={linkStyle}>
            ← Back
          </a>
        </p>
      </div>
    </main>
  )
}
