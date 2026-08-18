import Image from 'next/image'
import DodoTour from '../DodoTour'

const GITHUB_URL = 'https://github.com/bdecrem/dodo'
const SUBSTACK_URL = 'https://substack.com/inbox/post/211742287'
const TESTFLIGHT_MAILTO =
  'mailto:bdecrem@gmail.com?subject=Dodo%20TestFlight%20access'

export default function DodoPage() {
  return (
    <main className="dd">
      <style>{css}</style>

      <header className="dd-top">
        <div className="dd-mark">
          <Image src="/dodo/appicon.png" alt="" width={34} height={34} className="dd-appicon" />
          <span className="dd-word">dodo</span>
        </div>
        <nav className="dd-nav">
          <a href={GITHUB_URL}>GitHub</a>
          <a href={SUBSTACK_URL}>About</a>
        </nav>
      </header>

      <section className="dd-hero">
        <div className="dd-hero-copy">
          <h1>
            Learn it.
            <br />
            <em>Keep it.</em>
          </h1>
          <p className="dd-sub">
            Feed Dodo a book, an article, a YouTube video, or your own notes.
            It becomes a topic you can chat with, get quizzed on, and keep
            remembering, through spaced-repetition flash cards, voice quizzes,
            a daily card over iMessage, and mastery badges that dim unless you
            refresh them.
          </p>
          <p className="dd-sub">
            Dodo is a native iPhone/MacOS app. It&rsquo;s open source (have
            your agent spin up your own backend if you&rsquo;d like).
            It&rsquo;s just a v.0.2 and we&rsquo;d love your feedback &amp;
            patches.
          </p>
          <div className="dd-ctas">
            <a className="dd-btn dd-btn-primary" href={TESTFLIGHT_MAILTO}>
              Request TestFlight access
            </a>
            <a className="dd-btn" href={GITHUB_URL}>
              GitHub
            </a>
            <a className="dd-btn" href={SUBSTACK_URL}>
              About
            </a>
          </div>
          <ul className="dd-feat">
            <li>
              <strong>Topics from anything</strong> — send a URL, paste text,
              or name a book; Dodo ingests it (including YouTube transcripts)
              and it becomes a chat-able topic with an AI tutor grounded in
              that material.
            </li>
            <li>
              <strong>Flash cards with real scheduling</strong> — decks
              generated per topic, played as multiple choice, typed answers
              (LLM-graded), mixed rounds, or out-loud voice rounds. SM-2
              scheduling under the hood; thumbs-down buries a card,
              double-thumbs-up makes it a priority.
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
              or do a walking review, over OpenAI Realtime.
            </li>
            <li>
              <strong>Audio summaries</strong> — a narrated summary of a
              topic, playable with the screen locked.
            </li>
          </ul>
        </div>
        <DodoTour />
      </section>
    </main>
  )
}

const css = `
.dd {
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
.dd * { box-sizing: border-box; }
.dd a { color: inherit; }

/* ── Top bar ── */
.dd-top {
  max-width: 1020px; margin: 0 auto; padding: 26px 24px 0;
  display: flex; align-items: center; justify-content: space-between;
}
.dd-mark { display: flex; align-items: center; gap: 10px; }
.dd-appicon { width: 34px; height: 34px; border-radius: 9px; }
.dd-word { font-family: var(--display); font-weight: 600; font-size: 22px; letter-spacing: -0.02em; }
.dd-nav { display: flex; gap: 22px; font-family: var(--display); font-weight: 500; font-size: 15px; }
.dd-nav a { text-decoration: none; border-bottom: 2px solid var(--marigold); padding-bottom: 1px; }

/* ── Hero ── */
.dd-hero {
  max-width: 1020px; margin: 0 auto;
  padding: 64px 24px 72px;
  display: grid; grid-template-columns: 1fr 340px; gap: 64px; align-items: center;
}
.dd-hero h1 {
  font-family: var(--display); font-weight: 600;
  font-size: clamp(52px, 8vw, 84px); line-height: 0.98; letter-spacing: -0.03em;
  margin: 0 0 22px;
}
.dd-hero h1 em { font-style: normal; color: var(--marigold-deep); }
.dd-sub { font-size: 18px; line-height: 1.55; color: var(--ink2); max-width: 32em; margin: 0 0 18px; }
.dd-ctas { margin: 28px 0 34px; }
.dd-feat {
  list-style: none; margin: 0; padding: 0; max-width: 34em;
}
.dd-feat li {
  font-size: 15px; line-height: 1.55; color: var(--ink2);
  margin-bottom: 11px;
}
.dd-feat strong {
  font-family: var(--display); font-weight: 500; font-size: 14.5px; color: var(--ink);
}
.dd-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.dd-btn {
  font-family: var(--display); font-weight: 600; font-size: 15.5px;
  padding: 12px 22px; border-radius: 999px; text-decoration: none;
  border: 1.5px solid var(--border); background: var(--surface);
}
.dd-btn-primary { background: var(--marigold); border-color: var(--marigold); color: #261C06; }

/* ── The tour (slideshow) ── */
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
  margin-top: 18px; overflow: hidden;
}
.dd-tour-bar span {
  display: block; height: 100%; background: var(--marigold); border-radius: 2px;
  transform-origin: left; transition: transform 0.45s ease;
}
.dd-tour-on { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .dd-tour-caption, .dd-tour-slide, .dd-tour-bar span { transition: none; }
}

/* ── Mobile ── */
@media (max-width: 860px) {
  .dd-hero { grid-template-columns: 1fr; gap: 44px; padding-top: 44px; }
  .dd-ctas { justify-content: flex-start; }
}
`
