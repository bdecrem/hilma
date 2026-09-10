import { Inter_Tight } from 'next/font/google'

// Same voice as the landing page: one typeface, warm paper, clay for anything you can click.
const tight = Inter_Tight({ subsets: ['latin'], weight: ['400', '600'] })

export const metadata = {
  title: 'Bart Decrem',
  description: 'Decades of building technology for impact, community, and curiosity.',
}

export const viewport = {
  themeColor: '#fff6ea',
  colorScheme: 'light',
}

const css = `
.about-page {
  min-height: 100dvh;
  background: #fff6ea;
  color: #2b2118;
  padding: 92px calc(7% + env(safe-area-inset-right)) calc(72px + env(safe-area-inset-bottom)) calc(7% + env(safe-area-inset-left));
  -webkit-font-smoothing: antialiased;
}

.about-inner {
  max-width: 1110px;
  margin: 0 auto;
}

.about-title {
  margin: 0 0 30px;
  font-size: clamp(34px, 4vw, 52px);
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -.03em;
}

.about-body {
  max-width: 64ch;
}

.about-body p {
  margin: 0 0 20px;
  font-size: 18px;
  line-height: 1.62;
  color: #6f6152;
}

.about-body a {
  color: #d64a22;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1.5px solid #f4633a55;
  transition: border-color .2s;
}

.about-body a:hover {
  border-bottom-color: #d64a22;
}

.about-foot {
  margin-top: 42px;
  font-size: 13px;
  letter-spacing: -.005em;
  color: #857563;
}

.about-foot a {
  color: inherit;
  text-decoration: none;
  padding-bottom: 2px;
  border-bottom: 1.5px solid transparent;
  transition: color .2s, border-color .2s;
}

.about-foot a:hover {
  color: #d64a22;
  border-color: #f4633a55;
}

@media (max-width: 700px) {
  .about-page { padding-top: 64px; }
  .about-body p { font-size: 17px; }
}
`

export default function AboutPage() {
  return (
    <main className={`about-page ${tight.className}`}>
      <style>{css}</style>
      <div className="about-inner">
        <h1 className="about-title">Bart Decrem</h1>
        <div className="about-body">
          <p>
            Bart has spent decades building technology for impact, community, and curiosity. In open
            source, he co-founded Eazel and the GNOME Foundation to make Linux easier to use, and ran
            marketing and business affairs for the Firefox 1.0, helping to preserve the open
            internet and playing a key role in the historic Google search deal that came to fund the
            browser ecosystem.
          </p>
          <p>
            As a Fellow at Echoing Green, the leading social entrepreneurship program, Bart started
            Plugged In, one of the first Digital Divide programs in the nation, bridging East Palo
            Alto and Silicon Valley, and chaired the national Community Technology Centers Network.
            He co-founded Full Circle Fund, a community of entrepreneurs coming together to partner
            with community groups and tackle important local issues. More recently, he co-founded and
            ran Mozilla Builders, supporting 100+ community activists and early-stage founders.
          </p>
          <p>
            Bart also built Tap Tap Revenge, the first App Store smash hit, and has shipped 25 #1 App
            Store hits in total. After The Walt Disney Company acquired Tapulous, he led
            Disney’s smartphone games group as SVP of Mobile Games, shipping Where’s My Water
            and other hits that reached over a billion users.
          </p>
          <p>
            For the past year, Bart has been exploring agentic uses of AI across creativity, science,
            and community, building proofs of concept ranging from an AI research agent running on a
            knowledge graph of 200,000+ papers, to a command-line music studio. During his fellowship
            year, Bart will explore human flourishing after AGI: if superintelligence arrives over
            the next few years, how can it be a supercharged “bicycle for the mind” rather
            than a path to cognitive surrender? He will host conversations with leading thinkers and
            ship app prototypes exploring these issues.
          </p>
          <p>
            Bart earned his JD at Stanford Law School. He is a practitioner fellow at{' '}
            <a href="https://casbs.stanford.edu/" target="_blank" rel="noopener">
              CASBS
            </a>
            .
          </p>
          <p>
            <a href="/bart-decrem-cv.pdf">Full CV (PDF)</a>
          </p>
        </div>
        <div className="about-foot">
          <a href="/hi">← Back</a>
        </div>
      </div>
    </main>
  )
}
