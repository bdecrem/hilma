import Image from 'next/image'
import FlashCardDemo from './FlashCardDemo'

// Set this to the public TestFlight invite URL when the beta link exists;
// null renders the button as "coming soon".
const TESTFLIGHT_URL: string | null = null
const GITHUB_URL = 'https://github.com/bdecrem/dodo'

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
          {TESTFLIGHT_URL ? (
            <a href={TESTFLIGHT_URL}>TestFlight</a>
          ) : (
            <span className="dd-soon-inline">TestFlight soon</span>
          )}
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
            Dodo is an AI learning companion for iPhone. Feed it a book, a
            video, or an article — talk it through with a tutor, then keep it
            for good with flash cards that know when you&rsquo;re about to
            forget.
          </p>
          <div className="dd-ctas">
            <a className="dd-btn dd-btn-primary" href={GITHUB_URL}>
              Read the code
            </a>
            {TESTFLIGHT_URL ? (
              <a className="dd-btn" href={TESTFLIGHT_URL}>
                Join the beta
              </a>
            ) : (
              <span className="dd-btn dd-btn-soon">Beta invite soon</span>
            )}
          </div>
        </div>
        <FlashCardDemo />
      </section>

      <section className="dd-shots">
        <figure>
          <Image src="/dodo/peck-map.png" alt="Peck — the level path across every deck" width={302} height={655} />
          <figcaption>Peck, the level path</figcaption>
        </figure>
        <figure>
          <Image src="/dodo/flash-hub.png" alt="Flash card rounds — mixed, choice, typed, voice" width={302} height={655} />
          <figcaption>Four ways to play a deck</figcaption>
        </figure>
        <figure>
          <Image src="/dodo/pebbles.png" alt="Pebbles — saved quotes" width={302} height={655} />
          <figcaption>Pebbles, quotes worth keeping</figcaption>
        </figure>
      </section>

      <section className="dd-features">
        <h2>What it does</h2>
        <div className="dd-grid">
          <div>
            <h3>Topics from anything</h3>
            <p>A URL, a YouTube video, a pasted chapter, your own notes — each becomes a topic with a tutor grounded in it.</p>
          </div>
          <div>
            <h3>Cards that schedule themselves</h3>
            <p>Spaced repetition under the hood. Thumbs-down buries a card forever; double-thumbs-up makes it a priority.</p>
          </div>
          <div>
            <h3>A daily card over iMessage</h3>
            <p>One question a day in Messages. Your reply is graded and banked into the next round.</p>
          </div>
          <div>
            <h3>Voice rounds</h3>
            <p>Dodo quizzes you out loud, game-show style, and grades what you said — on a walk, hands free.</p>
          </div>
          <div>
            <h3>Badges that dim</h3>
            <p>Master a topic and the badge goes gold. Ignore it long enough and it dims — a three-question refresher brings it back.</p>
          </div>
          <div>
            <h3>Pebbles</h3>
            <p>Save the lines worth keeping. One comes back to you while your round is being graded.</p>
          </div>
        </div>
      </section>

      <section className="dd-tech">
        <h2>How it&rsquo;s built</h2>
        <p className="dd-tech-line">
          A SwiftUI iPhone app and a Next.js backend sharing one API. Postgres
          on Supabase. Tutoring, grading, and card writing by Claude; voice
          over OpenAI Realtime; the daily card rides on a Mac mini running
          Messages.
        </p>
        <div className="dd-repo">
          <code>ios/</code> <span>the SwiftUI app</span>
          <code>web/</code> <span>Next.js backend + web client</span>
          <code>schema/</code> <span>Supabase migrations</span>
        </div>
        <p className="dd-tech-note">
          The repo is a periodically-synced snapshot of the working codebase —
          MIT licensed, with setup notes for running your own backend, your own
          build of the app, and even your own iMessage rig.
        </p>
      </section>

      <footer className="dd-footer">
        <span>Dodo · MIT © 2026 Bart Decrem</span>
        <a href={GITHUB_URL}>github.com/bdecrem/dodo</a>
      </footer>
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
  --green: #46D18A;
  --red: #E0635A;
  --slate: #14191D;
  --display: var(--font-fredoka), 'Fredoka', system-ui, sans-serif;
  --serif: Georgia, 'Iowan Old Style', 'Times New Roman', serif;

  background: var(--paper);
  color: var(--ink);
  min-height: 100dvh;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
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
.dd-soon-inline { color: var(--ink3); }

/* ── Hero ── */
.dd-hero {
  max-width: 1020px; margin: 0 auto;
  padding: 64px 24px 24px;
  display: grid; grid-template-columns: 1fr 400px; gap: 56px; align-items: center;
}
.dd-hero h1 {
  font-family: var(--display); font-weight: 600;
  font-size: clamp(52px, 8vw, 84px); line-height: 0.98; letter-spacing: -0.03em;
  margin: 0 0 22px;
}
.dd-hero h1 em { font-style: normal; color: var(--marigold-deep); }
.dd-sub { font-size: 19px; line-height: 1.55; color: var(--ink2); max-width: 30em; margin: 0 0 28px; }
.dd-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.dd-btn {
  font-family: var(--display); font-weight: 600; font-size: 15.5px;
  padding: 12px 22px; border-radius: 999px; text-decoration: none;
  border: 1.5px solid var(--border); background: var(--surface);
}
.dd-btn-primary { background: var(--marigold); border-color: var(--marigold); color: #261C06; }
.dd-btn-soon { color: var(--ink3); cursor: default; }

/* ── The card (signature) ── */
.fcd-wrap { width: 100%; }
.fcd-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 24px;
  padding: 26px 26px 24px; box-shadow: 0 10px 30px rgba(51,56,62,0.08);
}
.fcd-eyebrow {
  font-family: var(--display); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--marigold-deep);
  margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
}
.fcd-xp {
  background: rgba(221,148,32,0.16); color: var(--marigold-deep);
  padding: 3px 10px; border-radius: 999px; letter-spacing: 0.04em;
}
.fcd-question { font-size: 21px; line-height: 1.4; margin: 0 0 18px; }
.fcd-choices { display: grid; gap: 9px; }
.fcd-choice {
  font-family: var(--display); font-weight: 500; font-size: 15.5px; text-align: left;
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-radius: 14px; cursor: pointer;
  background: var(--paper); border: 1.5px solid var(--border); color: var(--ink);
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.fcd-choice:hover { border-color: var(--marigold); }
.fcd-choice:focus-visible { outline: 3px solid var(--marigold); outline-offset: 2px; }
.fcd-right { background: rgba(70,209,138,0.16); border-color: var(--green); }
.fcd-wrong { background: rgba(224,99,90,0.12); border-color: var(--red); animation: fcd-shake 0.3s; }
@keyframes fcd-shake {
  0%, 100% { transform: translateX(0); }
  30% { transform: translateX(-5px); }
  60% { transform: translateX(5px); }
}
.fcd-reveal { animation: fcd-in 0.35s ease-out; }
@keyframes fcd-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.fcd-punch { font-size: 16px; line-height: 1.55; color: var(--ink2); font-style: italic; margin: 0 0 18px; }
.fcd-again {
  font-family: var(--display); font-weight: 600; font-size: 14px;
  background: none; border: 1.5px solid var(--border); border-radius: 999px;
  padding: 9px 18px; cursor: pointer; color: var(--ink2);
}
.fcd-again:hover { border-color: var(--marigold); color: var(--ink); }
@media (prefers-reduced-motion: reduce) {
  .fcd-wrong { animation: none; }
  .fcd-reveal { animation: none; }
}

/* ── Screenshots ── */
.dd-shots {
  max-width: 1020px; margin: 0 auto; padding: 56px 24px 8px;
  display: flex; gap: 26px; justify-content: center; flex-wrap: wrap;
}
.dd-shots figure { margin: 0; text-align: center; }
.dd-shots img {
  width: 100%; max-width: 268px; height: auto; border-radius: 28px;
  border: 1px solid var(--border); box-shadow: 0 14px 34px rgba(51,56,62,0.10);
}
.dd-shots figcaption {
  font-family: var(--display); font-weight: 500; font-size: 13.5px;
  color: var(--ink2); margin-top: 12px;
}

/* ── Features ── */
.dd-features { max-width: 1020px; margin: 0 auto; padding: 72px 24px 8px; }
.dd h2 {
  font-family: var(--display); font-weight: 600; font-size: 30px;
  letter-spacing: -0.02em; margin: 0 0 28px;
}
.dd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 30px 44px; }
.dd-grid h3 {
  font-family: var(--display); font-weight: 600; font-size: 17px; margin: 0 0 6px;
}
.dd-grid p { font-size: 15.5px; line-height: 1.55; color: var(--ink2); margin: 0; }

/* ── Tech ── */
.dd-tech { max-width: 1020px; margin: 0 auto; padding: 64px 24px 72px; }
.dd-tech-line { font-size: 17px; line-height: 1.6; color: var(--ink2); max-width: 42em; margin: 0 0 24px; }
.dd-repo {
  display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; align-items: baseline;
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  padding: 18px 22px; max-width: 460px; margin-bottom: 24px;
}
.dd-repo code {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px;
  color: var(--marigold-deep); font-weight: 600;
}
.dd-repo span { font-size: 14.5px; color: var(--ink2); }
.dd-tech-note { font-size: 15.5px; line-height: 1.6; color: var(--ink2); max-width: 42em; margin: 0; }
.dd-tech-note a { color: var(--marigold-deep); }

/* ── Footer ── */
.dd-footer {
  background: var(--slate); color: #A0ACB4;
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 26px 24px calc(26px + env(safe-area-inset-bottom));
  font-family: var(--display); font-weight: 500; font-size: 14px;
}
.dd-footer a { color: #F0A830; text-decoration: none; }

/* ── Mobile ── */
@media (max-width: 860px) {
  .dd-hero { grid-template-columns: 1fr; gap: 40px; padding-top: 44px; }
  .dd-grid { grid-template-columns: 1fr; }
}
`
