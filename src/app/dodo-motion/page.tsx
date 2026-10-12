// Dodo motion — how we make short code-drawn explainer videos, written up as
// a page (2026-10-12) from the first piece, apps/dodo-motion/unit-distance/,
// its commit (c4f1965f, 2026-10-09) and the method it followed: Claude Motion's
// "every word, number and timing is code" idea, done by hand with HyperFrames
// inside Claude Code. The /motion skill that drives it lives on the M4 iMac at
// ~/.claude/skills/motion/SKILL.md.

const SCENES = [
  { id: 'ask', name: 'The question', d: 5 },
  { id: 'circles', name: 'Circles', d: 7 },
  { id: 'grid', name: 'The rescaled grid', d: 8 },
  { id: 'ceiling', name: 'The ceiling', d: 7 },
  { id: 'exact', name: 'Exact values', d: 6 },
  { id: 'result', name: 'May 2026', d: 8, blue: true },
  { id: 'gap', name: 'The gap', d: 4 },
];
const TOTAL = SCENES.reduce((a, s) => a + s.d, 0);

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}

export default function DodoMotionPage() {
  return (
    <main className="wrap">
      <header className="mast">
        <p className="kicker">Dodo motion · the method</p>
        <h1>Explainer videos, the Claude Motion way.</h1>
        <p className="lede">
          A storyboard first. One script holds every word, number and timing. A drawing file that only draws. Check one
          frame per second, then render the MP4 and build the player.
        </p>
        <div className="meta">
          <span>First piece 2026-10-09</span>
          <span>HyperFrames 0.8.143 + GSAP</span>
          <span>1920 × 1080 · 30 fps · 30–60 s</span>
        </div>
      </header>

      <section>
        <a className="player" href="/dodo-motion/one-unit-apart.html">
          <div className="frame">
            <div className="k">The unit distance problem</div>
            <div className="t">
              n points in the plane. How many pairs can be exactly one unit apart?
            </div>
            <svg className="dots" viewBox="0 0 100 100" aria-hidden="true">
              <g transform="rotate(17 50 50)" stroke="#16121c" strokeWidth="1.2" fill="none">
                <circle cx="35" cy="30" r="20" opacity="0.35" />
                <circle cx="55" cy="30" r="20" opacity="0.35" />
                <circle cx="45" cy="47" r="20" opacity="0.35" />
                <path d="M35 30 L55 30 L45 47 Z" stroke="#3d3bff" strokeWidth="1.6" />
                <path d="M25 47 L45 47 L35 64 L55 64" stroke="#3d3bff" strokeWidth="1.6" />
              </g>
              <g transform="rotate(17 50 50)" fill="#ff4b1f">
                <circle cx="35" cy="30" r="3.2" />
                <circle cx="55" cy="30" r="3.2" />
                <circle cx="45" cy="47" r="3.2" />
                <circle cx="25" cy="47" r="3.2" />
                <circle cx="35" cy="64" r="3.2" />
                <circle cx="55" cy="64" r="3.2" />
              </g>
            </svg>
            <div className="play">▶ Play · 45 s</div>
          </div>
          <div className="bar">
            <span>
              <b>One unit apart</b> — the first piece, from the Dodo topic “Unit Distance problem”
            </span>
            <span>plays in the browser, no video file</span>
          </div>
        </a>
        <p>
          That page is the animation itself running in real time: the same HTML, script and GSAP timeline that rendered
          the MP4, scaled to fit, with chapter buttons. Click the picture to replay.
        </p>
      </section>

      <section>
        <h2>
          <span className="n">00</span> The idea
        </h2>
        <p>
          Anthropic launched Claude Motion on 2026-10-08: you hand it a report, a chart or a topic and it writes code that
          moves the text, shapes and numbers, then exports an MP4. It is not a video model. Because the animation is code,
          you can change one word, one number or one timing and everything else stays exactly as it was.
        </p>
        <p>
          Dodo motion is that method done by hand inside Claude Code, on Dodo’s own material (a topic’s flash cards are
          the facts), with{' '}
          <a href="https://github.com/heygen-com/hyperframes" rel="noopener">
            HyperFrames
          </a>{' '}
          as the renderer. The output is a short explainer of one idea, plus a web page that plays it. Each piece is a
          folder under <code>apps/dodo-motion/&lt;slug&gt;/</code>, and <code>unit-distance/</code> is the template to
          copy.
        </p>
        <div className="rules">
          <div className="rule red">
            <b>Storyboard before code.</b>
            <p>Scenes, one idea each, with a duration and what is on screen. The storyboard becomes the script.</p>
          </div>
          <div className="rule blue">
            <b>script.js owns every word, number and timing.</b>
            <p>index.html only draws what the script says. “Slow down the second scene” is one number.</p>
          </div>
          <div className="rule">
            <b>Look at it one frame per second.</b>
            <p>A draft render becomes a contact sheet before anyone watches the video. Fix, then render for delivery.</p>
          </div>
          <div className="rule">
            <b>Nothing fetched at render time.</b>
            <p>Fonts and GSAP live in assets/. A render never needs the network, so it never fails on it.</p>
          </div>
        </div>
      </section>

      <section>
        <h2>
          <span className="n">01</span> The brief
        </h2>
        <p>Before anything is written down, settle four things:</p>
        <ul>
          <li>
            <strong>The one idea.</strong> A piece explains one thing (a problem, a result, a mechanism). If the material
            holds three ideas, that is three pieces.
          </li>
          <li>
            <strong>The facts.</strong> Where every claim comes from. For Dodo pieces that is the topic’s flash cards, and
            the page says so. Nothing on screen that isn’t in the source.
          </li>
          <li>
            <strong>Length and frame.</strong> 30 to 60 seconds, 1920 × 1080 at 30 fps. Longer pieces are several
            pieces.
          </li>
          <li>
            <strong>The look.</strong> Riso inks on cream, two display fonts, colour that means something (below).
          </li>
        </ul>
      </section>

      <section>
        <h2>
          <span className="n">02</span> Storyboard first
        </h2>
        <p>
          Write the scenes as a list before touching code: an <code>id</code>, a <code>duration</code> in seconds, the
          one thing the scene says, what is drawn, and what text appears when. Six to eight scenes fit a 45-second piece.
          Something should change on screen every second or two; a scene that holds still for four seconds is two scenes
          or one too long.
        </p>
        <p>The seven scenes of One unit apart, widths to scale:</p>
        <div className="strip" aria-label="Scenes and durations">
          {SCENES.map((s) => (
            <div key={s.id} className={s.blue ? 'blue' : undefined} style={{ flex: s.d }}>
              <span>{s.name}</span>
              <small>{s.d}s</small>
            </div>
          ))}
        </div>
        <div className="ticks">
          <span>0:00</span>
          <span>0:{String(TOTAL).padStart(2, '0')}</span>
        </div>
        <ol>
          <li>
            <strong>The question</strong> (5 s). Kicker, the question as a three-line title, the credit (Erdős, 1946).
            Twelve points on a rotated triangular lattice appear.
          </li>
          <li>
            <strong>Circles</strong> (7 s). A unit circle grows around each point and finds its partners; the pairs count
            up. Then the rule of the piece, in colour: constructions give lower bounds, proofs give upper bounds.
          </li>
          <li>
            <strong>The rescaled grid</strong> (8 s). A 6 × 6 grid, pairs drawn in, the grid rescales, a red ruler marks
            one unit. The conjecture pops in.
          </li>
          <li>
            <strong>The ceiling</strong> (7 s). The upper bound big in the middle, the names and the year, a boxed claim
            that gets struck through with the caveat.
          </li>
          <li>
            <strong>Exact values</strong> (6 s). A counter runs 1 to 15 over a row of dots lighting up.
          </li>
          <li>
            <strong>May 2026</strong> (8 s). The one full-bleed colour scene (ultramarine): the new result, who did it,
            who checked it, the exponent.
          </li>
          <li>
            <strong>The gap</strong> (4 s). A number line from 1.0 to 1.4 with the best construction and the best proof
            marked and a question mark between them.
          </li>
        </ol>
        <p>
          One payoff moment, placed where the energy peaks (here the full-bleed scene at 33 s). Open on the question,
          close on what is still unknown.
        </p>
      </section>

      <section>
        <h2>
          <span className="n">03</span> script.js: every word, number and timing
        </h2>
        <p>
          The storyboard is typed straight into <code>script.js</code> as <code>window.SCRIPT</code>: the title, frame
          size, fps, the palette, a footer, and the scenes array. Each scene carries its own copy and its own{' '}
          <code>…At</code> offsets in seconds from the start of the scene. Scenes play back to back, so changing one
          duration shifts everything after it, which is what you want.
        </p>
        <Pre>
          <span className="c">{'// One unit apart — every word, number and timing in the animation lives here.\n'}</span>
          <span className="c">{'// index.html only draws what this file says.\n'}</span>
          {'window.SCRIPT = {\n'}
          {"  title: 'One unit apart',\n"}
          {'  fps: 30, width: 1920, height: 1080,\n'}
          {'  unit: 150,                  '}
          <span className="c">{'// one unit = 150 px on screen\n'}</span>
          {"  footer: 'Dodo · Unit Distance problem',\n"}
          {"  colors: { paper: '#f7efdf', ink: '#16121c', red: '#ff4b1f', blue: '#3d3bff', yellow: '#ffc31f', lime: '#b6f23a' },\n"}
          {'  scenes: [\n'}
          {"    { id: 'ask', duration: 5, bg: 'paper',\n"}
          {"      kicker: 'The unit distance problem',\n"}
          {"      title: 'n points in the plane.<br>How many pairs can be<br>exactly one unit apart?',\n"}
          {"      credit: 'Paul Erdős, 1946',\n"}
          {'      points: [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [1, 3], [2, 3], [3, 3]],\n'}
          {'      rotate: 17 },\n'}
          {"    { id: 'circles', duration: 7, bg: 'paper',\n"}
          {"      caption: 'A circle of radius one around each point finds its partners.',\n"}
          {"      pairsLabel: 'pairs exactly one unit apart', pairsAt: 4.3,\n"}
          {'      rule: \'<span class="red">Constructions give lower bounds.</span><br><span class="blue">Proofs give upper bounds.</span>\',\n'}
          {'      ruleAt: 4.0 },\n'}
          {"    { id: 'ceiling', duration: 7, bg: 'paper',\n"}
          {"      kicker: 'The ceiling', bound: { pre: 'O(', base: 'n', exp: '4/3', post: ')' },\n"}
          {"      who: 'Spencer, Szemerédi and Trotter', year: '1984',\n"}
          {"      claim: '1,000 points → about 10,000 pairs', claimAt: 3.0,\n"}
          {"      strikeAt: 4.6, strike: 'only an upper bound — no known construction gets near it' },\n"}
          {"    { id: 'exact', duration: 6, kicker: 'n =', from: 1, to: 15, countSeconds: 3.6,\n"}
          {"      caption: 'Exact values are known only this far.', captionAt: 4.0 },\n"}
          <span className="c">{'    // …\n'}</span>
          {'  ],\n'}
          {'}\n'}
        </Pre>
        <p>What the file guarantees:</p>
        <ul>
          <li>
            <strong>Every string the viewer reads is here</strong>, including the math (as small objects like{' '}
            <code>{'{ base: "n", exp: "4/3" }'}</code>, so the drawing file can typeset them) and the footer.
          </li>
          <li>
            <strong>Every number that drives a drawing is here</strong>: the lattice points, the grid side, the counter’s
            range and how long it counts, the axis of the number line.
          </li>
          <li>
            <strong>Every timing is here</strong>, as seconds into its scene. A note that appears at 5.5 s into the grid
            scene is <code>conjectureAt: 5.5</code>, not a magic number in a tween.
          </li>
          <li>
            <strong>Colour is named by role</strong> in the palette and used by meaning: red for constructions and lower
            bounds, blue for proofs and upper bounds, through the whole piece.
          </li>
        </ul>
      </section>

      <section>
        <h2>
          <span className="n">04</span> index.html: only the drawing
        </h2>
        <p>
          The HTML is the HyperFrames composition. It loads <code>assets/fonts.css</code>, <code>assets/gsap.min.js</code>{' '}
          and <code>script.js</code>, declares a 1920 × 1080 root, and then builds the scenes from{' '}
          <code>window.SCRIPT</code>. Nothing in it is content; it is layout, type and motion.
        </p>
        <ul>
          <li>
            <strong>Scene starts are computed</strong>, never typed: walk the scenes array and add up the durations.
            Each scene is a <code>div.scene</code> with <code>data-start</code> and <code>data-duration</code>, which is
            how HyperFrames knows when a clip is on.
          </li>
          <li>
            <strong>Text is DOM</strong>, animated with GSAP on one master timeline: small helpers like{' '}
            <code>fadeUp(el, at)</code> and <code>popIn(el, at)</code> take absolute times (<code>scene.start +
            scene.somethingAt</code>).
          </li>
          <li>
            <strong>Geometry is canvas</strong>, drawn by a <code>draw(t)</code> function that one clock tween across the
            whole piece calls every frame. Each scene registers a <code>drawers[id](local)</code> that gets the time since
            its own start, so a drawing is a pure function of the clock and the frame is identical at render and in the
            browser.
          </li>
          <li>
            <strong>The timeline is registered</strong> as <code>window.__timelines.main</code>, which is what the
            HyperFrames renderer seeks frame by frame and what the player page plays in real time.
          </li>
          <li>
            <strong>Semantic classes, few of them</strong>: <code>.kicker</code>, <code>.title</code>,{' '}
            <code>.caption</code>, <code>.math</code>, <code>.note</code>, <code>.footer</code>, and <code>.on-blue</code>{' '}
            for the full-bleed scene. Bricolage Grotesque for words, JetBrains Mono for kickers, numbers and math.
          </li>
        </ul>
        <Pre>
          <span className="c">{'// the shape of the drawing file\n'}</span>
          {'const S = window.SCRIPT\n'}
          {'let t0 = 0\n'}
          {'for (const sc of S.scenes) { sc.start = t0; t0 += sc.duration }\n'}
          {'const tl = gsap.timeline({ paused: true })\n'}
          {'const drawers = {}\n\n'}
          {'function scene(sc, cls) {\n'}
          {"  const d = el('div', 'scene ' + (cls ?? ''))\n"}
          {'  d.dataset.start = sc.start; d.dataset.duration = sc.duration\n'}
          {'  stage.appendChild(d); return d\n'}
          {'}\n\n'}
          <span className="c">{'// one tween across the whole piece drives the canvas\n'}</span>
          {'function draw(t) {\n'}
          {'  const sc = S.scenes.find((s) => t >= s.start && t < s.start + s.duration)\n'}
          {'  ctx.clearRect(0, 0, W, H)\n'}
          {'  if (sc && drawers[sc.id]) drawers[sc.id](t - sc.start)\n'}
          {'}\n'}
          {'tl.to(clock, { t: t0, duration: t0, ease: "none", onUpdate: () => draw(clock.t) }, 0)\n\n'}
          {'window.__timelines = window.__timelines || {}\n'}
          {"window.__timelines['main'] = tl\n"}
        </Pre>
        <p>
          Only touch this file for a new <em>kind</em> of visual. A new piece usually reuses the text helpers and writes
          new drawers.
        </p>
      </section>

      <section>
        <h2>
          <span className="n">05</span> The look
        </h2>
        <p>
          Indie riso, the palette Bart approved for all code-drawn video (teal and hot pink read as “AI slop”). One loud
          full-bleed colour per piece, and never a character or mark on a background of its own colour.
        </p>
        <div className="swatches">
          <span className="sw">
            <i style={{ background: '#f7efdf' }} /> cream #f7efdf
          </span>
          <span className="sw">
            <i style={{ background: '#16121c' }} /> ink #16121c
          </span>
          <span className="sw">
            <i style={{ background: '#ff4b1f' }} /> vermillion #ff4b1f
          </span>
          <span className="sw">
            <i style={{ background: '#3d3bff' }} /> ultramarine #3d3bff
          </span>
          <span className="sw">
            <i style={{ background: '#ffc31f' }} /> sunflower #ffc31f
          </span>
          <span className="sw">
            <i style={{ background: '#b6f23a' }} /> lime #b6f23a
          </span>
        </div>
        <ul>
          <li>
            <strong>Type.</strong> Bricolage Grotesque (words, 500 to 800) and JetBrains Mono (kickers in small caps
            with tracking, numbers, math, the footer). Latin subsets as woff2 in <code>assets/fonts/</code>.
          </li>
          <li>
            <strong>Scale.</strong> Titles at 78 px, captions 44, the one big number 230 to 360, kickers 26, footer 22, on
            a 1920-wide frame with 120 px side margins.
          </li>
          <li>
            <strong>Motion.</strong> Fades move up 24 px; numbers pop with a small back-ease; lines draw with an ease-out
            over 0.35 to 0.6 s; a strike-through scales in from the left. Nothing bounces for fun.
          </li>
          <li>
            <strong>Colour means something.</strong> Pick two roles for the two inks before drawing (lower vs upper
            bound, before vs after, cause vs effect) and keep them.
          </li>
        </ul>
      </section>

      <section>
        <h2>
          <span className="n">06</span> The loop: check, draft, one frame per second, fix
        </h2>
        <p>
          Never watch a draft video first. Lint it, render it fast and small, cut it into one still per second, and look
          at the sheet. Every typo, overlap, early or late cue shows up there. Fix in <code>script.js</code> (timing,
          words) or <code>index.html</code> (layout), and go again. Then one delivery render.
        </p>
        <Pre>
          <span className="c">{'# from apps/dodo-motion/<slug>/\n'}</span>
          {'export HYPERFRAMES_SKIP_SKILLS=1          '}
          <span className="c">{'# stop the CLI checking its skills registry every run\n'}</span>
          {'npx hyperframes check                    '}
          <span className="c">{'# lint + runtime + layout\n'}</span>
          {'npx hyperframes render -q draft -w 4 -o renders/draft.mp4\n'}
          {'mkdir -p frames\n'}
          {'ffmpeg -i renders/draft.mp4 -vf fps=1 frames/f%02d.png                 '}
          <span className="c">{'# one frame per second\n'}</span>
          {'ffmpeg -i renders/draft.mp4 -vf "fps=1,scale=480:-1,tile=5x9" -frames:v 1 frames/sheet.png\n'}
          <span className="c">{'# look at frames/sheet.png, fix, repeat; then\n'}</span>
          {'npx hyperframes render -q delivery -w 4 -o renders/one-unit-apart.mp4   '}
          <span className="c">{'# 1080p30\n'}</span>
        </Pre>
        <p>What to look for on the sheet:</p>
        <ul>
          <li>Does something change between every pair of neighbouring frames? A run of identical frames is dead air.</li>
          <li>Does a text appear before the thing it talks about has been drawn? Move its <code>…At</code> later.</li>
          <li>Does anything overlap or run off the frame at 1920 × 1080? Fix the layout class, not the copy.</li>
          <li>Is the one full-bleed scene where the energy peaks, and is it the only one?</li>
          <li>Read every word on the sheet against the source facts once more.</li>
        </ul>
        <p>
          <code>renders/</code> and <code>frames/</code> are gitignored. The composition, its script and the player are
          committed.
        </p>
      </section>

      <section>
        <h2>
          <span className="n">07</span> Deliver: the MP4 and the player
        </h2>
        <ul>
          <li>
            <strong>The MP4</strong> goes to <code>~/Desktop/dodo-motion/</code> and to Bart with SendUserFile.
          </li>
          <li>
            <strong>The player</strong> is a single self-contained web page built by <code>node build-player.mjs</code>:
            it inlines <code>script.js</code>, the composition’s CSS, markup and script from <code>index.html</code>, and
            both fonts as data URIs, and loads GSAP from a CDN. It scales the 1920 × 1080 stage to the viewport, shows a
            progress bar and chapter buttons (one per scene, computed from the durations), replays on click, and with{' '}
            <code>prefers-reduced-motion</code> seeks to the last frame instead of playing.
          </li>
          <li>
            <strong>The player check</strong>, <code>node check-player.mjs &lt;dir&gt;</code>, opens it in Playwright,
            screenshots it at 3 s, at 20 s and at phone width, and fails on any page error.
          </li>
          <li>
            <strong>Hosting.</strong> A copy of the player lives at <code>public/dodo-motion/&lt;slug&gt;.html</code> so it
            has a link on ola.cx, like the one at the top of this page.
          </li>
        </ul>
      </section>

      <section>
        <h2>
          <span className="n">08</span> Starting a new piece
        </h2>
        <ol>
          <li>
            Copy the template:{' '}
            <code>cp -R apps/dodo-motion/unit-distance apps/dodo-motion/&lt;slug&gt;</code>, then set the id and name in{' '}
            <code>meta.json</code> and <code>package.json</code>. Delete <code>renders/</code>, <code>frames/</code> and{' '}
            <code>player.html</code>.
          </li>
          <li>Write the brief: the one idea, the source facts, the length, the two colour roles.</li>
          <li>Write the storyboard as the scenes list, durations summing to the length.</li>
          <li>
            Type it into <code>script.js</code>: every word, number and <code>…At</code>. Nothing else in the folder knows
            the content.
          </li>
          <li>
            In <code>index.html</code>, keep the helpers and the clock; write a <code>drawers[id]</code> per scene that
            needs geometry, and the DOM for each scene’s text.
          </li>
          <li>Run the loop until the one-frame-per-second sheet is clean. Delivery render.</li>
          <li>
            <code>node build-player.mjs</code>, <code>node check-player.mjs</code>, copy the player to{' '}
            <code>public/dodo-motion/</code>, write the README (what it is, the facts’ source, the commands).
          </li>
          <li>Commit, push, send the MP4 and the ola.cx link.</li>
        </ol>
        <div className="note">
          <p>
            The driving instructions are the <code>/motion</code> skill at <code>~/.claude/skills/motion/SKILL.md</code>{' '}
            on the M4 iMac. It was not reachable when this page was written on 2026-10-12, so the page was assembled from
            the committed template, its README and commit c4f1965f, and the Claude Motion method it follows. If the skill
            says something this page doesn’t, the skill wins; bring it into the repo as{' '}
            <code>apps/dodo-motion/SKILL.md</code> and update this page.
          </p>
        </div>
      </section>

      <footer>
        <p>
          Dodo motion · <a href="/dodo-motion/one-unit-apart.html">One unit apart</a> · template{' '}
          <code>apps/dodo-motion/unit-distance/</code> · commits c4f1965f, 817d441b · method after{' '}
          <a href="https://runway.com/news/company-news/runway-claude-motion" rel="noopener">
            Claude Motion
          </a>{' '}
          (Anthropic, 2026-10-08) with{' '}
          <a href="https://github.com/heygen-com/hyperframes" rel="noopener">
            HyperFrames
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
