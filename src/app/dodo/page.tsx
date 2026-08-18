import Image from 'next/image'
import DodoTour from './DodoTour'

// The dodogo.cc homepage — an essay-style introduction to Dodo, hybrid of
// the blog post (the idea) and the repo README (the features). The older
// product-style page lives at /dodo/alt.

const GITHUB_URL = 'https://github.com/bdecrem/dodo'
const SUBSTACK_URL = 'https://substack.com/inbox/post/211742287'
const TESTFLIGHT_MAILTO =
  'mailto:bdecrem@gmail.com?subject=Dodo%20TestFlight%20access'

export default function DodoAltPage() {
  return (
    <main className="da">
      <style>{css}</style>

      <header className="da-top">
        <div className="da-mark">
          <Image src="/dodo/appicon.png" alt="" width={30} height={30} className="da-appicon" />
          <span className="da-word">dodo</span>
        </div>
        <nav className="da-nav">
          <a href={GITHUB_URL}>GitHub</a>
          <a href={SUBSTACK_URL}>About</a>
        </nav>
      </header>

      <article className="da-body">
        <h1>
          Dodo is an AI learning companion: an open-source app to help you
          understand, explain back, and remember any book or topic.{' '}
          <em>It&rsquo;s not finished.</em>
        </h1>

        <section>
          <div className="da-label">The idea</div>
          <p>
            I&rsquo;ve always been a self-improver: languages (Spanish: easy;
            Chinese: not so much), music (guitar: my mother still believes;
            synths &amp; Ableton: 🤷), sports (no, but I get yelled at less
            after 10 years of surfing). I&rsquo;ve been through dozens of
            tutors and learning systems.
          </p>
          <p>
            Over the next few years, people will build learning systems that
            change everything — systems that make us twice as smart. Dodo is
            not that. It&rsquo;s me building a draft of a tool to help me
            learn, and along the way learning a bit more about how I learn.
            Maybe it leads to an idea; maybe it&rsquo;s useful to someone else
            too.
          </p>
          <p>
            There&rsquo;s no magic to it. The most important thing is finding
            the books, videos, and other angles into the material you care
            about — you do that, not the AI. The next most important thing is
            truly engaging with it. What the app adds is the reinforcement: a
            tutor to talk things through with, flash cards, a daily quiz over
            iMessage, and the stakes of an oral exam.
          </p>
          <p className="da-more">
            <a href={SUBSTACK_URL}>Read the full story &rarr;</a>
          </p>
        </section>

        <div className="da-tour-slot">
          <DodoTour />
        </div>

        <section>
          <div className="da-label">What it does</div>
          <ul className="da-feat">
            <li>
              <strong>Topics from anything</strong> — send a URL, paste text,
              or name a book; Dodo ingests it (including YouTube transcripts)
              and it becomes a chat-able topic with an AI tutor grounded in
              that material.
            </li>
            <li>
              <strong>Flash cards with real scheduling</strong> — decks
              generated per topic, played as multiple choice, typed answers
              (LLM-graded), mixed rounds, or out-loud voice rounds.
              Thumbs-down buries a card, double-thumbs-up makes it a priority.
            </li>
            <li>
              <strong>Peck</strong> — a Duolingo-style level path across every
              deck you own.
            </li>
            <li>
              <strong>Stars and mastery</strong> — quizzes earn stars per
              topic; a final voice review earns a gold badge, and badges need
              a periodic 3-question refresher to stay gold.
            </li>
            <li>
              <strong>Daily card over iMessage</strong> — one card a day lands
              in Messages; your reply is graded and banked into the next Peck
              round.
            </li>
            <li>
              <strong>Pebbles</strong> — save quotes worth keeping; one
              resurfaces while a round is graded.
            </li>
            <li>
              <strong>Voice</strong> — talk to your tutor, take voice rounds,
              or do a walking review.
            </li>
            <li>
              <strong>Audio summaries</strong> — a narrated summary of a
              topic, playable with the screen locked.
            </li>
            <li>
              <strong>What it doesn&rsquo;t yet do well: the main thing</strong>{' '}
              — you can just chat with Dodo about anything, but the system
              works best if you source the core learning material — a book, a
              lecture series, a YouTube video — and partner with Dodo to
              synthesize it.
            </li>
          </ul>
          <p className="da-more">
            <a href={GITHUB_URL}>More in the repo &rarr;</a>
          </p>
        </section>

        <section className="da-fine">
          <div className="da-label">The fine print</div>
          <p>
            It&rsquo;s a v0.2 — MVP explorations, not a product. A native
            iPhone/Mac app with an open-source backend, on TestFlight. If
            you&rsquo;d like to try it, email me.
          </p>
          <p>
            <a className="da-btn" href={TESTFLIGHT_MAILTO}>
              Request TestFlight access
            </a>
          </p>
        </section>
      </article>
    </main>
  )
}

const css = `
.da {
  --paper: #FBF5E6;
  --surface: #FFFDF7;
  --surface2: #F2EAD6;
  --border: #E3D9C2;
  --ink: #33383E;
  --ink2: #606C75;
  --ink3: #939DA5;
  --marigold: #DD9420;
  --marigold-deep: #B97A14;
  --display: var(--font-fredoka), 'Fredoka', system-ui, sans-serif;
  --serif: Georgia, 'Iowan Old Style', 'Times New Roman', serif;

  background: var(--paper);
  color: var(--ink);
  min-height: 100dvh;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  font-family: var(--serif);
}
.da * { box-sizing: border-box; }
.da a { color: inherit; }

.da-top {
  max-width: 660px; margin: 0 auto; padding: 26px 24px 0;
  display: flex; align-items: center; justify-content: space-between;
}
.da-mark { display: flex; align-items: center; gap: 9px; }
.da-appicon { width: 30px; height: 30px; border-radius: 8px; }
.da-word { font-family: var(--display); font-weight: 600; font-size: 20px; letter-spacing: -0.02em; }
.da-nav { display: flex; gap: 20px; font-family: var(--display); font-weight: 500; font-size: 14.5px; }
.da-nav a { text-decoration: none; border-bottom: 2px solid var(--marigold); padding-bottom: 1px; }

.da-body { max-width: 660px; margin: 0 auto; padding: 52px 24px 80px; }
.da-body h1 {
  font-size: clamp(26px, 4.6vw, 33px); line-height: 1.32; font-weight: 400;
  letter-spacing: -0.01em; margin: 0 0 44px;
}
.da-body h1 em { font-style: italic; color: var(--marigold-deep); }

.da-label {
  font-family: var(--display); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--marigold-deep);
  margin-bottom: 14px;
}
.da-body section { margin-bottom: 46px; }
.da-body p { font-size: 17.5px; line-height: 1.62; color: var(--ink); margin: 0 0 16px; }
.da-more { font-family: var(--display); font-weight: 500; font-size: 15px; }
.da-more a { color: var(--marigold-deep); text-decoration: none; }
.da-more a:hover { text-decoration: underline; }

.da-tour-slot { margin: 0 auto 52px; display: flex; justify-content: center; }

.da-feat { list-style: none; margin: 0 0 18px; padding: 0; }
.da-feat li { font-size: 15.5px; line-height: 1.58; color: var(--ink2); margin-bottom: 12px; }
.da-feat strong { font-family: var(--display); font-weight: 500; font-size: 14.5px; color: var(--ink); }

.da-fine { border-top: 1px solid var(--border); padding-top: 34px; }
.da-fine p { color: var(--ink2); font-size: 16px; }
.da-btn {
  display: inline-block; font-family: var(--display); font-weight: 600; font-size: 15px;
  padding: 11px 20px; border-radius: 999px; text-decoration: none;
  background: var(--marigold); color: #261C06;
}

/* Reuse of the tour component (styles normally provided by /dodo) */
.dd-tour { display: flex; flex-direction: column; align-items: center; }
.dd-tour-phone {
  display: block; position: relative; padding: 0; cursor: pointer;
  width: 268px; aspect-ratio: 1260 / 2736;
  border-radius: 28px; overflow: hidden; background: var(--paper);
  border: 1px solid var(--border); box-shadow: 0 14px 34px rgba(51,56,62,0.10);
}
.dd-tour-phone:focus-visible { outline: 3px solid var(--marigold); outline-offset: 3px; }
.dd-tour-slide {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  opacity: 0; transition: opacity 0.55s ease;
}
.dd-tour-captions { display: grid; max-width: 320px; margin-top: 14px; }
.dd-tour-caption {
  grid-area: 1 / 1; margin: 0; text-align: center;
  font-size: 15px; line-height: 1.5; color: var(--ink2);
  opacity: 0; transition: opacity 0.45s ease;
}
.dd-tour-bar {
  width: 120px; height: 3px; border-radius: 2px; background: var(--surface2);
  margin: 18px auto 0; overflow: hidden;
}
.dd-tour-bar span {
  display: block; height: 100%; background: var(--marigold); border-radius: 2px;
  transform-origin: left; transition: transform 0.45s ease;
}
.dd-tour-on { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .dd-tour-caption, .dd-tour-slide, .dd-tour-bar span { transition: none; }
}
`
