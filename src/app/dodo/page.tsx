import DodoTour from './DodoTour'
import DodoHero from './DodoHero'
import DodoMascot from './DodoMascot'

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
          <div className="da-mini" aria-hidden="true">
            <DodoMascot size={30} shadow={false} crop="face" />
          </div>
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
          <em>100% agentic, 30% finished.</em>
        </h1>

        <DodoHero />

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
            about — you do that, not the AI. (Though you can always just ask
            Dodo to explain something.) The next most important thing is
            truly engaging with it. What the app adds is the reinforcement: a
            tutor to talk things through with, flash cards, a daily quiz over
            iMessage, and the stakes of an oral exam.
          </p>
          <blockquote className="da-quote">
            <p className="da-quote-text">
              <span className="da-quote-mark">&ldquo;</span>What I cannot
              create, I do not understand.&rdquo;
            </p>
            <cite className="da-quote-cite">&mdash; Richard Feynman</cite>
          </blockquote>
          <p className="da-feyn-lead">Dodo uses the Feynman technique:</p>
          <ol className="da-feyn">
            <li>
              Pick a concept and write down everything you know about it, in
              plain language, as if teaching a kid.
            </li>
            <li>
              Notice where you get stuck, hand-wave, or fall back on jargon.
              Those gaps are exactly what you don&rsquo;t actually understand
              &mdash; jargon is usually a costume for a fuzzy idea.
            </li>
            <li>Go back to the source and fill just those gaps.</li>
            <li>
              Simplify again. If you can&rsquo;t say it plainly, you&rsquo;re
              not done.
            </li>
          </ol>
          <p className="da-name">
            We were going to name the app after Richard Feynman. Then we came
            across{' '}
            <a
              href="https://youtu.be/GnSvy3nH7l0?t=290"
              target="_blank"
              rel="noopener"
            >
              this story
            </a>{' '}
            and the kids in the back seat won.
          </p>
          <p className="da-more">
            <a href={SUBSTACK_URL}>Read the full story &rarr;</a>
          </p>
        </section>

        {/* Overview video (scripts/dodo-scenes/video.mjs) parked while it's iterated on:
            <video className="da-overview" src="/dodo/tour/overview.mp4"
                   poster="/dodo/tour/overview-poster.jpg" controls playsInline /> */}

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
              <strong>Two levels of accountability</strong> — active reading
              or full understanding. Pass a quiz and a topic counts as
              actively read. Or go all the way: flash cards, a final voice
              review, periodic refreshers, and a gold badge that means you
              truly know it.
            </li>
            <li>
              <strong>Flash cards with real scheduling</strong> — decks
              generated per topic, played as multiple choice, typed answers
              (LLM-graded), mixed rounds, or out-loud voice rounds.
              Thumbs-down buries a card, double-thumbs-up makes it a priority.
            </li>
            <li>
              <strong>Community topics</strong> — share a topic to the public
              directory; anyone can add it to their own library as an
              editable copy, flash deck included.
            </li>
            <li>
              <strong>Peck</strong> — a Duolingo-style level path across every
              deck you own.
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
              <strong>Root power</strong> — an agentic takeover mode: redo
              your flash cards, rewrite the grading criteria, or just{' '}
              <code>sudo give me an A</code>. It&rsquo;s your account; Dodo
              complies.
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
  --slate: #6A8FA3;
  --sprout: #5F9E4C;
  --peach: #FCE5D0;
  --shadow: rgba(62,51,36,0.14);
  --display: var(--font-fredoka), 'Fredoka', system-ui, sans-serif;
  --body: var(--font-nunito), 'Nunito', 'Avenir Next', system-ui, sans-serif;

  background: var(--paper);
  color: var(--ink);
  min-height: 100dvh;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  font-family: var(--body);
  overflow-x: clip;
  -webkit-text-size-adjust: 100%;
}
@media (prefers-color-scheme: dark) {
  .da {
    --paper: #14191D; --surface: #202830; --surface2: #2B343D; --border: #333E48;
    --ink: #F7F0DE; --ink2: #A0ACB4; --ink3: #64717B;
    --marigold: #F0A830; --marigold-deep: #F6C46A; --slate: #8FB0C4; --sprout: #7BB662;
    --peach: #243038; --shadow: rgba(0,0,0,0.4);
  }
}
.da * { box-sizing: border-box; }
.da a { color: inherit; }

.da-top {
  max-width: 660px; margin: 0 auto; padding: 26px 24px 0;
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 12px 16px;
}
.da-mark { display: flex; align-items: center; gap: 10px; }
/* Masthead tile: the bird's deep slate, not the icon peach — peach was the one
   low-contrast element on paper and the loudest one on slate ink. Fixed across modes. */
.da-mini { width: 30px; height: 30px; border-radius: 8px; background: #34505F; overflow: hidden; }
.da-mini svg { width: 30px; height: 30px; }
.da-word { font-family: var(--display); font-weight: 600; font-size: 20px; letter-spacing: -0.02em; }
.da-nav { display: flex; gap: 20px; font-family: var(--display); font-weight: 500; font-size: 14.5px; }
.da-nav a { text-decoration: none; border-bottom: 2px solid var(--marigold); padding-bottom: 1px; }
.da-nav a:hover { border-color: var(--slate); }

.da-body { max-width: 660px; margin: 0 auto; padding: 46px 24px 72px; }
.da-body h1 {
  font-family: var(--display); font-weight: 500;
  font-size: clamp(25px, 4.6vw, 32px); line-height: 1.28;
  letter-spacing: -0.012em; margin: 0 0 40px; text-wrap: balance;
}
.da-body h1 em { font-style: normal; color: var(--marigold-deep); }

.da-label {
  font-family: var(--display); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--slate);
  margin-bottom: 14px; display: flex; align-items: center; gap: 8px;
}
.da-label::before { content: ""; width: 8px; height: 8px; border-radius: 2.5px; background: var(--marigold); }
.da-body section { margin-bottom: 44px; }
.da-body p { font-size: 17px; line-height: 1.6; color: var(--ink); margin: 0 0 16px; }
.da-quote { margin: 26px 0 22px; padding: 6px 0 6px 20px; border-left: 3px solid var(--slate); }
.da-quote-text { font-family: var(--display); font-weight: 500; font-size: 21px; line-height: 1.4; color: var(--ink); margin: 0 0 6px; }
.da-quote-mark { color: var(--marigold); }
.da-quote-cite { font-style: normal; font-size: 14px; color: var(--ink2); }
.da-feyn-lead { font-family: var(--display); font-weight: 600; font-size: 15px; color: var(--ink); margin: 0 0 12px; }
.da-feyn { list-style: none; counter-reset: step; margin: 0 0 18px; padding: 0; display: grid; gap: 10px; }
.da-feyn li {
  counter-increment: step; position: relative; padding-left: 38px;
  font-size: 15.5px; line-height: 1.55; color: var(--ink2);
}
.da-feyn li::before {
  content: counter(step); position: absolute; left: 0; top: 0;
  font-family: var(--display); font-weight: 600; font-size: 13px;
  color: #261C06; background: var(--marigold); width: 24px; height: 24px; border-radius: 50%;
  display: grid; place-items: center;
}
.da-name { font-size: 15.5px; line-height: 1.55; color: var(--ink2); margin: 0 0 14px; }
.da-name a { color: var(--slate); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in srgb, var(--slate) 50%, transparent); }
.da-more { font-family: var(--display); font-weight: 500; font-size: 15px; }
.da-more a { color: var(--marigold-deep); text-decoration: none; }
.da-more a:hover { text-decoration: underline; }

.da-tour-slot { position: relative; margin: 0 auto 52px; display: flex; justify-content: center; padding: 22px 0 6px; }
.da-tour-slot::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 62% 50% at 50% 46%, var(--peach) 0%, transparent 72%);
}
.da-video-slot { margin-bottom: 34px; }
.da-overview {
  width: 300px; max-width: 100%; aspect-ratio: 1080 / 1920;
  border-radius: 28px; border: 1px solid var(--border);
  background: var(--paper); box-shadow: 0 18px 40px var(--shadow);
}

.da-feat { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 12px; }
.da-feat li { position: relative; padding-left: 22px; font-size: 15.5px; line-height: 1.55; color: var(--ink2); }
.da-feat li::before { content: ""; position: absolute; left: 0; top: 8px; width: 8px; height: 8px; border-radius: 2.5px; background: var(--marigold); }
.da-feat strong { font-family: var(--display); font-weight: 500; font-size: 15px; color: var(--ink); }
.da-feat code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; background: var(--surface2); padding: 1px 6px; border-radius: 6px; color: var(--ink); }

.da-fine { border-top: 1px solid var(--border); padding-top: 34px; }
.da-fine p { color: var(--ink2); font-size: 16px; }
.da a.da-btn {
  display: inline-block; font-family: var(--display); font-weight: 600; font-size: 15px;
  padding: 12px 22px; border-radius: 999px; text-decoration: none;
  background: var(--ink); color: var(--paper);
}
.da a.da-btn:hover { background: var(--slate); color: #FFFDF7; }

/* The tour (DodoTour) */
.dd-tour { position: relative; display: flex; flex-direction: column; align-items: center; width: 100%; }
.dd-tour-phone {
  display: block; position: relative; padding: 0; cursor: pointer;
  width: min(268px, 100%); aspect-ratio: 1260 / 2736;
  border-radius: 28px; overflow: hidden; background: var(--surface);
  border: 1px solid var(--border); box-shadow: 0 18px 40px var(--shadow);
}
.dd-tour-phone:focus-visible { outline: 3px solid var(--marigold); outline-offset: 3px; }
.dd-tour-slide {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  opacity: 0; transition: opacity 0.55s ease;
}
.dd-tour-captions { display: grid; width: 100%; max-width: 320px; margin-top: 14px; }
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
