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
            <DodoMascot size={36} shadow={false} crop="face" />
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
  /* The jelly palette (apps/feynd/branding/BRANDING.md): lavender paper,
     sky as the accent, grape and lemon in support, the icon's sunrise peach
     behind the hero. Nothing pure black or pure white. */
  --paper: #F8F2F8;
  --surface: #FFFCFF;
  --surface2: #F1E8F5;
  --surface3: #E4D8EA;
  --border: #E6DBEC;
  --ink: #2D2537;
  --ink2: #6A5F73;
  --ink3: #9A8FA4;
  --accent: #2689BD;
  --accent-bright: #5EC6EC;
  --accent-light: #DCF6FF;
  --grape: #7A4FD6;
  --gold: #E0A100;
  --gold-bright: #FFD43A;
  --gold-light: #FFF8C8;
  --blush: #FF9FC8;
  --peach: #FFE2C8;
  --peach2: #FFC9A6;
  --shadow: rgba(80,50,90,0.16);
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
    --paper: #17131D; --surface: #271F31; --surface2: #332A3F; --surface3: #3F354C; --border: #3D3349;
    --ink: #F3EBF6; --ink2: #B3A8BC; --ink3: #7A6F85;
    --accent: #5EC6EC; --accent-bright: #5EC6EC; --accent-light: #1C4A63;
    --grape: #B994FF; --gold: #FFD43A; --gold-bright: #FFD43A; --gold-light: #5A4710;
    --peach: #4A3468; --peach2: #2E2246; --shadow: rgba(0,0,0,0.45);
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
/* Masthead: the jelly dodo itself, no icon tile behind it. */
.da-mini { width: 36px; height: 36px; overflow: visible; }
.da-mini svg { width: 36px; height: 36px; }
.da-word { font-family: var(--display); font-weight: 600; font-size: 21px; letter-spacing: -0.015em; }
.da-nav { display: flex; gap: 20px; font-family: var(--display); font-weight: 500; font-size: 14.5px; }
.da-nav a { text-decoration: none; border-bottom: 2px solid var(--accent-bright); padding-bottom: 1px; }
.da-nav a:hover { border-color: var(--grape); }

.da-body { max-width: 660px; margin: 0 auto; padding: 46px 24px 72px; }
.da-body h1 {
  font-family: var(--display); font-weight: 600;
  font-size: clamp(25px, 4.6vw, 32px); line-height: 1.26;
  letter-spacing: -0.012em; margin: 0 0 40px; text-wrap: balance;
}
.da-body h1 em { font-style: normal; color: var(--accent); }

.da-label {
  font-family: var(--display); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--grape);
  margin-bottom: 18px; display: flex; align-items: center; gap: 9px;
}
/* A little jelly ball marks every section. */
.da-label::before { content: ""; width: 11px; height: 11px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #DCF6FF 0%, #5EC6EC 45%, #2689BD 100%);
  box-shadow: inset -1px -1.5px 2px rgba(8,75,120,0.35); }
.da-body section { margin: 56px 0 0; padding-top: 44px; border-top: 1px solid var(--border); }
.da-body section:last-child { padding-bottom: 8px; }
/* The hero is the statement's demonstration, so its break sits closer than a chapter gap. */
.da-body section.dh { margin-top: 38px; padding-top: 36px; }
.da-body p { font-size: 17px; line-height: 1.6; color: var(--ink); margin: 0 0 16px; }
.da-quote { margin: 26px 0 22px; padding: 6px 0 6px 20px; border-left: 3px solid var(--grape); }
.da-quote-text { font-family: var(--display); font-weight: 500; font-size: 21px; line-height: 1.4; color: var(--ink); margin: 0 0 6px; }
.da-quote-mark { color: var(--accent); }
.da-quote-cite { font-style: normal; font-size: 14px; color: var(--ink2); }
.da-feyn-lead { font-family: var(--display); font-weight: 600; font-size: 15px; color: var(--ink); margin: 0 0 12px; }
.da-feyn { list-style: none; counter-reset: step; margin: 0 0 18px; padding: 0; display: grid; gap: 10px; }
.da-feyn li {
  counter-increment: step; position: relative; padding-left: 38px;
  font-size: 15.5px; line-height: 1.55; color: var(--ink2);
}
/* Steps on lemon jelly balls, the map's numeral style. */
.da-feyn li::before {
  content: counter(step); position: absolute; left: 0; top: 0;
  font-family: var(--display); font-weight: 600; font-size: 13px;
  color: #2D2537; width: 25px; height: 25px; border-radius: 50%;
  background: radial-gradient(circle at 35% 28%, #FFF8C8 0%, #FFD43A 50%, #E0A100 100%);
  box-shadow: inset -1px -2px 3px rgba(140,85,0,0.3), 0 1px 2px rgba(80,50,90,0.14);
  display: grid; place-items: center;
}
.da-name { font-size: 15.5px; line-height: 1.55; color: var(--ink2); margin: 0 0 14px; }
.da-name a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in srgb, var(--accent) 50%, transparent); }
.da-more { font-family: var(--display); font-weight: 500; font-size: 15px; margin: 4px 0 0; }
.da-more a { color: var(--accent); text-decoration: none; }
.da-more a:hover { text-decoration: underline; }

.da-feat { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 12px; }
.da-feat li { position: relative; padding-left: 24px; font-size: 15.5px; line-height: 1.55; color: var(--ink2); }
/* Jelly dots in the eight colourways, one per feature. */
.da-feat li::before { content: ""; position: absolute; left: 0; top: 6px; width: 12px; height: 12px; border-radius: 50%;
  --j1: #DCF6FF; --j2: #5EC6EC; --j3: #2689BD;
  background: radial-gradient(circle at 35% 30%, var(--j1) 0%, var(--j2) 48%, var(--j3) 100%);
  box-shadow: inset -1px -1.5px 2px rgba(45,37,55,0.22); }
.da-feat li:nth-child(8n+2)::before { --j1: #FFE0EF; --j2: #FF9FC8; --j3: #E9649D; }
.da-feat li:nth-child(8n+3)::before { --j1: #FFF8C8; --j2: #FFD43A; --j3: #E0A100; }
.da-feat li:nth-child(8n+4)::before { --j1: #E2FFF4; --j2: #91E9CC; --j3: #4DC5A2; }
.da-feat li:nth-child(8n+5)::before { --j1: #EFE2FF; --j2: #A77BF2; --j3: #6A3FC4; }
.da-feat li:nth-child(8n+6)::before { --j1: #FFE6CF; --j2: #FFAA82; --j3: #F06C55; }
.da-feat li:nth-child(8n+7)::before { --j1: #EFFFD0; --j2: #A3E45C; --j3: #4C9F2A; }
.da-feat li:nth-child(8n+8)::before { --j1: #FF9A96; --j2: #FF2B36; --j3: #BF0D1C; }
.da-feat strong { font-family: var(--display); font-weight: 600; font-size: 15px; color: var(--ink); }
.da-feat code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; background: var(--surface2); padding: 1px 6px; border-radius: 6px; color: var(--ink); }

.da-fine p { color: var(--ink2); font-size: 16px; }
/* The button is a sky jelly key, like the app's talk key. */
.da a.da-btn {
  display: inline-block; font-family: var(--display); font-weight: 600; font-size: 15px;
  padding: 12px 22px; border-radius: 999px; text-decoration: none;
  background: linear-gradient(180deg, #5EC6EC 0%, #2689BD 100%); color: #FFFFFF;
  box-shadow: inset 0 1.5px 1px rgba(255,255,255,0.55), inset 0 -2px 3px rgba(8,75,120,0.35), 0 6px 14px rgba(38,137,189,0.28);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.da a.da-btn:hover { transform: translateY(-1px); box-shadow: inset 0 1.5px 1px rgba(255,255,255,0.6), inset 0 -2px 3px rgba(8,75,120,0.35), 0 9px 18px rgba(38,137,189,0.32); }
.da a.da-btn:active { transform: translateY(1px) scale(0.98); }
`
