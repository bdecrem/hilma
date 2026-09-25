# Token Surfers

A brainrot vibe-coding app for iPhone and Mac (Catalyst), built from
`misc/3.MP4` on 2026-09-23. You type what you want. **Splat**, the coding
agent, builds it as one self-contained `index.html` while you play **Token
Surfers**, a Subway-Surfers-style runner, in the bottom half of the screen.
Everything the agent does shows up in the game: streamed tokens become coin
trails, each tool call is a train with the tool's name on its front, bugs found by
`run_app` crawl onto the track (jump on them), and a finished build rains
confetti. The result runs live in the stage above.

## The game (2026-09-24 rebuild)

Token Surfers is a real endless runner now, not a screensaver. `Game/`:

- **Rules** (`SurfEngine.swift`, a plain class the view steps every frame):
  three lanes, the track laid in authored chunks like Subway Surfers'
  prefabs (`layChunk`: gauntlet, ramp ride, roof hop, hurdles, gates, coin
  field, oncoming train, breather), picked harder with distance, with a gap
  between chunks so there is always a way through. Box trains kill from
  the front and bump from the side (bounce back a lane, lose the streak);
  **ramp trains** (yellow chevrons + arrow) carry you onto the roofs, where
  coins run along the top; low red barriers are jumped; teal overhead gates
  ("LGTM ↓ roll") are rolled under; bugs are stomped mid-air or bite. A crash
  ends the run: `over`, the tumble, the card. `restart()` keeps the agent's
  pending trains, bugs and token bank. Score = 1.5 × distance + coins ×
  10 × multiplier (+25-coin streaks raise it to x5) + 250 per stomp.
- **Agent feed** (unchanged API): `feedTokens` → coin trails far ahead (or
  along a ramp train's roof), `toolTrain(name)` → a terminal-liveried train
  (navy, green `> tool_name` on the windshield), `bugs(n)`, `celebrate()`.
- **Autopilot** (`autopilot`, `TS_BOT=1|restart|die`): a bot that reads the
  track ahead (jumps barriers, rolls gates, stomps bugs, switches to a clear
  lane or a ramp when a box train is coming, drifts toward coins). Two
  uses: the build pane runs it as **attract mode** until the player swipes
  ("swipe to take over" → `takeOver()` restarts a run that counts; bot
  runs never reach the leaderboard), and it is the regression check — a
  death prints `[bot] DEATH …` with the nearby entities, so a survivable
  course means an empty log. 70-second runs on 2026-09-24 had none.
- **The runner is the splat blob** (`BlobArt.swift`, 2026-09-24, Bart's pick
  over the tube man for the track: "constantly rotating and tentacles gently
  changing length with a subtle physics feel", the original mockup's
  character): ten round-capped arms of uneven length and thickness (fixed
  per-arm seeds) around a body, a white sticker edge, the token in the
  middle (it doesn't spin with the arms). It spins all the time (1.3 rad/s +
  speed, +3.5 in the air, +6 in a roll, 0 when dead); every arm is a spring
  (k 48, damping 8) chasing a breathing target, trailing arms stretch behind
  a lane change, hanging arms dangle in the air, a landing kicks them all
  out, the crash wilts them to half and drops the body with X eyes on the
  token. Lane-sized: tip radius 0.5 world units, centre 0.52 above the
  ground, the same shadow, squash and roll transforms as the tube man had.
  The springs live in `BlobState` on the engine (animation only). Second
  pass the same day (Bart: "too large and not quite fun enough"): 14 arms,
  tip radius 0.43, a vertical bob, spin 2.1 + 1.3·speed. Third pass, against
  the reference video (`~/Downloads/ScreenRecording_09-24-2026 15-26-25_1.MP4`,
  Bart: "it is the tentacle to body ratio — more tentacle, less body — and
  then the motion"): measured off 30 frames with a colour mask (spin
  ≈ 75–150°/s, bob ≈ ±3% of the radius, tips ≈ 28% of the screen width,
  arms about a quarter of the tip radius wide, core about a quarter, a
  hairline edge — the fat sticker edge was what fused the first versions
  into a cloud). Now: 12 arms, R 0.52, body 0.115, width 0.115, edge 0.014,
  matte terracotta `E68A5C` with one pale-yellow seed dot off centre (no
  disc), spin 1.5 + 1.0·speed (+3.5 in the air, +6 in a roll), bob 0.018 at
  5.1 Hz + 0.006 jitter, breathing ±14% at 1.6–3.1 rad/s, springs k 50.
  Frames to compare against are in the session's scratch (`ref2/crop*.png`). **`BlobHero` replaces `SurferHero`
  everywhere** (Home, the composer's status pill, the cards, the cutaways,
  the game-over card, the empty shelf): the same drawing spinning in place,
  `energy` = liveliness, `.dead` = the wilted one. On the web, `TubeMan` in
  `parts.tsx` now serves `public/surf/blob.svg` (a static 14-arm splat) with
  a slow `sf-spin`; `public/surf/hero.jpg` is a fresh Studio frame with the
  blob in the game, `public/surf/og.png` regenerated with
  `node scripts/surf/og-shot.mjs` against a dev server on 3219.
- **The Home splat** (`UI/HomeSplat.swift`, 2026-09-25, Bart: "think like a
  motion designer … make it MUCH MORE AWESOME"): the top-right hero on Home
  is the track's blob with a face and a brain (`SplatBrain`, stepped once per
  frame from the view's Canvas, like `BlobState`). Awake it spins, fidgets,
  blinks, looks around and does a bit every 6–14 s (a hop with a crouch
  first, a shiver, a double take, a spin burst, a wiggle); after 22–48 s it
  yawns (all arms stretch, mouth round), the lids drop, it nods off twice and
  slumps asleep for 13–30 s (spin 0, arms give in to gravity, a cooler tint,
  slow breathing, z's, a mumble), then wakes with a big stretch and a shake.
  A tap while it sleeps, or focusing the composer, STARTLES it (jump, every
  arm out, white flash, wide eyes, a "!", then it looks left and right). A
  tap awake POKES it (pushed away, a squish that wobbles back, a spin kick
  the way it was hit, a happy squint, sparks and a ring; haptics on iPhone);
  three quick taps make it DIZZY (wild spin, wobble, spiral gaze, stars
  around the head, a sickly tint, a shake to clear). Hold 0.28 s and it is
  PICKED UP (rises into the hand, dangles, kicks, looks up at you; bored
  after 3 s); let go and it drops with a bounce and a sulk. Text in the
  composer keeps it excited (a hop, a grin, glances at the card, no naps).
  The body is `BlobArt.draw` with the override fields on `BlobState` (doze,
  puff, spinScale/spinKick, fidget, bodyScale 1.5 + hideToken for the face,
  squash, sink, tint, flash); the face closure draws in world units on the
  core. The layout box is `unit × 1.7` like `BlobHero`; the Canvas beneath is
  4.6 units with hit-testing off so jumps, glyphs and a dragged splat are not
  clipped, and the hold target is leashed to stay inside it. Verify with
  `TS_SPLAT` (below) and `xcrun simctl io … recordVideo` → ffmpeg contact
  sheets; the simulator has no finger and no Simulator.app on Xcode 27.
- **The tube man** (`SurferArt.swift`, 2026-09-24): Splat is the inflatable
  tube man from `misc/splat-back-smooth.svg` (back) and `misc/splat.svg`
  (front: shades, grin, shaka hand; Home, the cards, the Studio). Drawn in the SVG's own coordinates (y down, feet on 532, `k` =
  world units per SVG px), layer order as in the SVG: white sticker edge,
  one merged ink silhouette, fills. Kept: the eight-ray gradient crown, the
  token on a spring antenna, the goggles strap, the `>_` patch, the sneakers.
  Dropped for the vibe: the seam lines and the static tilt. Animated the way
  `misc/splat-back-rig.svg` intends (arms rotate about the shoulders, the
  antenna and each ray about their roots) but as an air dancer: `Rig.bend(y)`
  bends the tube (base planted, top whipping, leaning against lane changes
  via `pose.sway`), every part rides the bend with `attach`, arm points turn
  a little more toward the hand so they curl. Poses: run (heels kick up and
  show their soles, drawn over the tube), jump (arms up), roll = the tube
  deflates into a squashed crumple, landing squash, stumble lean, crash
  tumble (front view, X eyes). `SurferHero(unit:mood:running:energy:)` is
  the front view as a view; `energy` 0…1 is how hard it dances (the Studio's
  status pill uses it per phase).
- **Renderer** (`SurfRenderer.swift`): camera 6 units back with a long lens
  (`f = min(1.58 W, 0.71 H · 6 / 3)`), feet at 86% of the height, horizon
  near 40% (short panes shorten the lens so the horizon stays on screen),
  the camera lifts with the player on roofs. Sky gradient, sun with halo,
  two parallax skyline layers with lit windows, station platforms with the
  yellow safety line, walls with scrolling posters ("made with code",
  "LGTM", "brb 3am"…), sleepers, rails, ballast. Trains are proper cars:
  undercarriage band, body, stripe, doors with seams, window rows (green
  code bars on tool trains), a roof with a highlight strip, dark gaps
  between 9-unit cars, a rounded front with windshield, headlights (lit and
  glowing on oncoming trains), a route badge; ramp trains get the striped
  wedge. Coins are Tokenur's token (gold with the orange diamond).
  Painter's order by near z, with the player drawn over the train they
  stand on. Speed lines above 15.5 units/s; a red flash, a shake and a
  greyscale fade on death.
- **Audio** (`SurfAudio.swift`): one AVAudioSourceNode. A chiptune loop
  (kick, snare, hats, a square bass on I–V–vi–IV, a lead over 4 bars, an
  arp on the second pass, sidechain duck on the kick) whose tempo runs
  128→150 BPM with the run speed (`pace`), faded by `musicTarget`
  (1 playing, 0.3 on the card, 0 off screen). Effects: coin ping climbing a
  scale, jump, land, roof clang, roll, swipe, bump bonk, crash + minor
  "womp", stomp squish, streak, celebrate fanfare, game-over sting. Music
  and sound toggles live in the gear menu on Home and the ••• menu in the
  Studio (`music`, `muted`, `narrator` in UserDefaults).
- **Leaderboard** (`Leaderboard.swift`, server in `src/lib/surf/scores.ts`
  + `src/app/api/surf/scores/route.ts`, schema
  `apps/tokensurfers/schema/001_surf_scores.sql` — applied 2026-09-24):
  every install mints a device id (`surf.device`) and picks a handle
  (`surf.handle`, 16 chars, emoji fine); `surf_scores` keeps every run,
  the `surf_leaderboard` view is each device's best. `GET
  /api/surf/scores?device=…` → top 50 + your rank; `POST` a run → rank,
  best. The route is gated by `x-surf-key` and rejects scores the engine
  can't produce for the run's distance and coins. Screens: the game-over
  card ("#n in the world", "claim a spot" → `HandleSheet`), `LeaderboardView`
  (purple starfield, medals, your row pinned, rename), the "TOKEN SURFERS"
  card on Home (best, rank, top 3, SURF NOW).
- **Solo mode**: SURF NOW on Home → `GameScreen` (start screen with the
  controls, pause, quit). Controls everywhere: swipe ← → ↑ ↓, tap the
  left/middle/right third, or arrow keys / WASD / space, `p` pause, `r` or
  space to run it back. `TS_SOLO=1` opens it, `TS_BOARD=1` opens the
  leaderboard, `TS_BOT=…` as above.

## Accounts, the gallery and the web (2026-09-24)

The product model: Splat builds little apps on the phone; you can **publish**
one to the gallery on hilma, where anyone can play it, upvote it and remix it
back into their own apps. One handle for all of it (and the leaderboard).

- **Accounts** — `surf_users` (handle + bcrypt), `src/lib/surf/auth.ts`: an
  HMAC token (`SURF_SESSION_SECRET`, on Vercel Production + Preview) that the
  app sends as `Authorization: Bearer` and the web keeps in the httpOnly
  cookie `surf_session`. Routes `POST /api/surf/auth/{signup,login,logout}`,
  `GET …/me`. No email. In the app: `Agent/SurfAccount.swift` (token +
  user in UserDefaults, `AccountSheet`), the "sign in" / "@handle" chip on
  Home; signing in sets the leaderboard handle.
- **Creations** — `surf_apps` holds the whole `index.html` (≤ 400 KB) with
  slug, owner, title, emoji, the first prompt, `remix_of`, `upvotes`;
  `surf_upvotes` one row per (app, user), the counter kept exact by the
  `surf_toggle_upvote` function. `src/lib/surf/apps.ts` (plain lookups, no
  PostgREST embedded joins: the self-join wasn't in the schema cache).
  Routes: `GET /api/surf/apps?sort=top|new` (public, `voted` when signed
  in), `POST /api/surf/apps` (publish; the same `client_id` = the project's
  UUID re-publishes in place), `GET|DELETE /api/surf/apps/:slug`,
  `POST …/:slug/upvote` (toggle). Schema
  `apps/tokensurfers/schema/002_surf_accounts.sql`, applied 2026-09-24.
- **In the app** — Studio ••• → Publish / Update in the gallery, Share the
  link, Unpublish (`Project.remoteSlug`); Home → THE GALLERY card
  (`UI/GalleryView.swift`: top/new grid, `GalleryAppView` plays it in a
  WKWebView, ▲ upvote, **REMIX IT** copies it into your apps as
  "<title> remix" with `Project.remixOf` and opens the Studio, so the next
  prompt edits it). The web's "remix it in the app" button is the deep link
  `tokensurfers://remix/<slug>` (URL scheme in `project.yml`; handled in
  `RootView.handle(_:)`).
- **The web** — `src/app/surf/`: `/surf` landing (one paragraph, the
  studio screenshot `public/surf/hero.jpg` — a simulator shot of a
  `TS_AUTORUN` build, retake it with `scripts/surf/sim-record.sh` (see "Promo video") when Splat's art changes — and the gallery /
  TestFlight / GitHub buttons; the only motion is the falling coins and the
  caption swap, on purpose). Splat on the web is `public/surf/splat.svg`
  (misc/splat.svg with its metadata stripped), used by `TubeMan` in `parts.tsx`, `/surf/gallery` (top/new),
  `/surf/a/<slug>` (the creation in a phone frame, ▲, remix deep link, full
  screen with `?full=1`). Server components + `client.tsx` (sign-in modal,
  upvote, the player). **User HTML never runs on our origin**: the player is
  a `sandbox="allow-scripts …"` iframe with `srcdoc` (opaque origin, so no
  cookies), plus a shim that gives the app an in-memory `localStorage`
  because the sandbox has none. Look: `surf.css` under `.sf` (Anton +
  Montserrat via next/font). OG card: `/surf/og` screenshotted to
  `public/surf/og.png` by `scripts/surf/pw-shots.mjs`, which is also the
  check (desktop + phone shots of the three pages, a throwaway web sign-up,
  an upvote, full screen). `SURF_TESTFLIGHT_URL` (unset = "soon") and
  `SURF_SITE_URL` are the only knobs.
- **Domains** (2026-09-23): `tokensurfers.app` and `brainrot.surf` (+ www)
  are on the Vercel project; `next.config.ts` rewrites their root to
  `/surf` and `/anything` to `/surf/anything` (`/surf/*`, `/api/*` and
  `/_next/*` pass through, so `/surf/a/<slug>` and `/a/<slug>` both work).
  DNS is Namecheap: A `@` → `216.150.1.1`, CNAME `www` →
  `cname.vercel-dns.com` (never `76.76.21.21`, see the Vercel DNS
  migration note in memory), set 2026-09-24 with
  `../tunn3l/plumb/plumb.js dns <domain> add …` — Namecheap's API only
  answers whitelisted IPs (Profile → Tools → API Access; the M4 iMac at
  Stanford is on the list). `SITE` (`src/lib/surf/apps.ts`) and the
  `metadataBase` (`src/app/surf/layout.tsx`) default to
  `https://tokensurfers.app`, so share links are `tokensurfers.app/a/<slug>`
  and the OG card resolves there; `SURF_SITE_URL` overrides both.
- **Simulator hooks**: `TS_BACKEND=http://localhost:3219` points the app at
  a dev server (ATS allows local networking), `TS_LOGIN=handle:password`
  signs in (creating the account if needed), `TS_PUBLISH=1` with
  `TS_OPEN=first` publishes the newest project, `TS_GALLERY=1|<slug>` opens
  the gallery (and that app), `TS_ACCOUNT=1` the sign-in sheet.
- Not built: passwords can't be reset (no email); moderation is
  unpublish-your-own plus a Report button on every creation (app and web,
  `POST /api/surf/apps/:slug/report`, no account needed → `surf_reports` +
  a text and an email to Bart through `src/lib/surf/notify.ts`, which only
  reads env: `SURF_REPORT_EMAIL` + `SENDGRID_API_KEY`, and
  `SURF_REPORT_TEXT_URL/_SECRET/_TO` pointing at
  `/api/f2/imessage/notify`, the secret-gated route that sends through the
  normal ledgered iMessage sender — surf code must not import f2).

## The blob and the warm-up (2026-09-25)

- **The blob** (`Game/BlobArt.swift`): ~8% smaller than build 12 (R 0.48),
  spins a quarter faster with a ±35% nervous wander, twitches every
  0.1–0.34 s (each kick jolts the whole body 3.5%; sometimes the opposite arm
  answers), a quicker bob and a sideways jitter. It reads as solid: the arms
  are lit from the upper left in *screen* space (`lightAngle`), so the shading
  sweeps across them as it spins; the arms pointing at the camera draw last,
  8% thicker and 5% longer; a soft dark ring where they root into the core; the
  core has a radial highlight and a specular dot. Costs ~24 extra strokes a
  frame — nothing (main thread ~10% in the solo simulator run).
- **The warm-up** (`Studio.warmupLoop`): while a remote build is quiet for
  2.5 s+ (the model planning — thinking doesn't stream, code does; the first
  Write of a bigger app comes 30–60 s after `ls -la; git log`), the subtitle
  box shows true things: a live "thinking · Ns" clock in four phrasings, and
  facts queued from the feed — the `start` (resumed or fresh workspace), the
  `session` (id, model, tool count), each Bash command with how many lines
  came back, the ask, the workspace and deploy target, the build number, the
  mini's app count (one `/health` GET per build), tokens so far. A `thinking
  {delta}` event, if the mini ever sends one, shows as "💭 …" and pauses the
  clock (request sent to the mini agent 2026-09-25). The big-caption fillers
  stay as they were. Check: replay `scripts/perf/feed-v2.json` at
  `TS_REPLAY_SPEED=0.3` and screenshot the game pane's bottom-left.

## The screen

- **Home** (`UI/HomeView.swift`): the video's AITA card on a sunburst, used as
  the prompt box ("AITA for wanting an app that…"), idea chips, SURF IT, the
  Token Surfers card (solo play + leaderboard), and a shelf of your apps —
  every card has a "…" at the top right of its thumbnail (rename, share the
  link or the HTML, delete; the same list on a long press — Bart asked for a
  visible menu, 2026-09-24). The surfer runs in place next to the title.
- **Studio** (`UI/StudioView.swift`):
  - The **stage** on top has two tabs. APP is the running app in a
    WKWebView; CODE is the navy "3:00 AM monitor" with a line counter and
    live syntax-coloured code. It switches to CODE while code streams and to
    APP after `run_app` and when the build is done. Tapping a tab pins it for
    the rest of the build.
  - A **caption band** sits on the seam. It plays the agent's caption in
    1–3 word chunks with one word in yellow, and it doubles as the resize
    handle.
  - **Token Surfers** is below the seam, in attract mode until you swipe.
  - A **composer** sits at the bottom and stays open during a build: a
    status strip on top (a dancing mini Splat, the phase, the token count,
    queued notes, Stop — two taps, "stop" then "sure?", because it sits next
    to the note chips and one stray tap used to end a build) and "tell
    splat… he'll catch it next step" with a hold-to-talk mic below. Return
    sends (a vertical-axis TextField turns Return into a newline on its own)
    and the keyboard drops after a send so the stage and the game get the
    screen back. The field's text is `Theme.ink` explicitly and the whole app
    runs `.preferredColorScheme(.light)`: every colour is fixed paper and ink,
    and with the phone in Dark Mode the field's text followed the system and
    was white on white (Bart, 2026-09-24).
  - **Talking to Splat mid-build** (`Studio.Note`, `queue`): what you send
    while he works waits for the current step to end, then rides into the
    next user message as `[user, mid-build]: …` text blocks next to the tool
    results (Claude Code's queued-message shape). A note that arrives while
    he writes the recap makes the loop go one more round instead of ending.
    "⚡ now" cancels the half-streamed turn (`deliverNow` → the `call` task)
    and appends the notes to the last user message; a tool that is already
    running (the test drive) still finishes. × takes a note back. Stopped or
    failed builds put queued notes back in the composer. The prompt tells
    Splat to acknowledge a note in his very next caption. Delivered notes
    join `project.prompts`, so later builds remember them.
  - **Voice** (`Agent/VoiceInput.swift`): hold the mic, talk, let go (slide
    up to cancel). SFSpeechRecognizer with partial results into the field;
    the audio session switches to play-and-record while held, the music
    ducks to 12% and the narrator holds. Idle, the words start a build;
    building, they queue like a typed note (🎙️ chip). Made to feel instant
    (2026-09-24, after "a big lag between hitting the mic and anything
    happening"): permissions are checked synchronously when already granted
    (the old path awaited two prompts every hold), recognition runs
    **on-device** when the phone supports it (`requiresOnDeviceRecognition`:
    first words a few hundred ms in, the final result right after release
    instead of a server round trip; the release wait is 0.9 s on-device,
    1.5 s server), the recognition task is armed before the engine starts so
    the first word isn't dropped, a fresh AVAudioEngine per hold, and the
    field says "opening the mic…" until it is open. `[voice]` console lines
    carry the timings (open in N ms, closed in N ms). The game's engine
    observes `AVAudioEngineConfigurationChange` and session interruptions
    and restarts itself, so the music survives the category flip.
  - **Live feed** (`UI/LiveFeed.swift`): a TikTok-live comment stream over
    the stage during a build — Splat's spoken captions with the tool's icon
    (✍️ 🩹 👀 🧪), 🐞/✅ from run_app, your notes ("next step" → "✓ heard").
    ••• → "What Splat did" shows the whole session.
  - The **narrator** no longer cuts itself off: a new line waits for the
    current one (only the newest waits, dropped after 5 s), and it uses the
    best installed en-US voice (premium/enhanced when downloaded).
  - After a build the game tucks away and the app fills the screen. The
    "🏄 surf" chip or the ⌄ button toggles the game, and follow-up chips
    ("make it prettier ✨") appear. **The way back from a full-screen stage
    is always in the top bar** (2026-09-24, after Bart lost the split view
    mid-build): a split/full button next to the APP·CODE tabs shows or hides
    the game, and the seam handle (drawn in both states, just above the
    composer when the game is hidden) drags it back up. Nothing about the
    layout is gated on the build state any more.
  - **Deployed = published** (2026-09-24): when a build on the mini ends with
    a deploy URL and the user is signed in, the Studio publishes it to the
    gallery on its own (`surf_apps.site_url`, schema 003; the same
    `client_id` re-publishes in place on later builds), the card says "in the
    gallery" and `Project.remoteSlug` is set. The gallery plays site apps
    from Vercel (web: an iframe on the URL with `allow-same-origin`, "open it
    ↗" instead of remix; phone: `SiteWebView`, "OPEN IT ↗"). Signed out,
    nothing is published; the ••• menu's Publish still works for both kinds.
  - The ••• menu has Open fullscreen, Share HTML, the Sound, Music and
    Narrator toggles, and Delete.
- **Cutaways** (`UI/StageViews.swift`, characters in `UI/Mascots.swift`) take
  over the stage for about 2 s:
  - Tok Tok Tok Tokenur: at 1,500 output tokens.
  - Contextino Windowini: on `read_file`, or when the input is over 30k
    tokens.
  - Hallucinello Confidenzo: when `run_app` finds errors.
  - YOU'RE ABSOLUTELY RIGHT!: when the build is done.
- **Wide windows** (Mac, iPad landscape) place the stage on the left and the
  caption + game + composer in a 360–460 pt column on the right. A window
  narrower than 720 pt, or taller than wide, uses the phone layout. Catalyst
  windows are freely resizable (minimum 400×700).

## The agent — Claude Code on the mini (2026-09-24)

The agent is Claude Code itself, run headless with the Agent SDK on the Mac
mini: `apps/tokensurfers/agent/` (Node, `server.mjs`). Bart's call after the
first real session: the four-tool loop below (one index.html on the phone, no
shell, no repo, no deploy) "doesn't sound like a coding agent at all"; the aim
is real web apps on our stack (Supabase, deployed to Vercel), and that is
what Claude Code does all day. The phone is a client of the feed.

- **Server** (`agent/server.mjs`, port 3910, launchd `com.tokensurfers.agent`,
  tunn3l `surf-mini` → `https://surf-mini.tunn3l.sh`): one workspace per app
  at `~/surf-apps/surf-<first 8 of the project UUID>/` (a git repo; the
  workspace rules are written into its `CLAUDE.md` from
  `agent/workspace-CLAUDE.md` on every build, so edit the template, not the
  copies), one Claude Code **session** per app (`.surf.json` keeps the session
  id, the deploy URL, the recap, cost; a follow-up build `resume`s it, so it
  remembers). `query()` with streaming input, `permissionMode:
  'bypassPermissions'`, `settingSources: ['project']` (the workspace CLAUDE.md
  loads, the mini's user settings don't), `includePartialMessages`, model
  `claude-opus-5-5` at `medium` (`SURF_AGENT_MODEL` / `SURF_AGENT_EFFORT`),
  `maxTurns` 80. Billed to the mini's Claude login (`CLAUDE_CODE_OAUTH_TOKEN`
  in `~/.surf-agent.env`, same as GolemBot; a build shows "$0.31" at list
  price, i.e. nothing extra). Verified 2026-09-24: a coin page from the iMac,
  a smiley page through the tunnel, a follow-up on the same session, a note
  delivered with ⚡ now (the interrupted turn ends `ok: false`, the note goes
  in, both changes land in one redeploy).
- **Mid-build notes** (the part Bart asked for explicitly): `POST prompt`
  while a build runs queues the note; a **PostToolUse hook** hands every
  queued note to the model as `additionalContext` on the very next tool
  result (`[user, mid-build]: …`, `note_in` event `via: tool`); a note that
  arrives after the last tool call goes in as the next user message when the
  turn ends (`via: message`). **⚡ now** = `POST now`: `Query.interrupt()`
  (Claude Code's own Escape), the turn's result comes back, the queued notes
  go in as the next message of the same session. **Stop** = `POST stop`:
  interrupt, close the input, return the notes.
- **Feed**: `GET events?after=N&wait=S` long-polls (returns as soon as there
  is something new, or after S seconds) because **tunn3l buffers a streamed
  response until it ends and passes no WebSocket upgrade** (SSE ticks all
  arrived at once through it). Events, coalesced at 120 ms: `start`,
  `session`, `text {delta}` (Splat's lines as they stream), `say {text}`
  (a complete text block), `name {emoji,title}` (from the `NAME:` line),
  `tool_start {id,name}`, `tool_input {id,name,delta,offset,len}` (the
  half-streamed input — Write's content, Edit's strings, Bash's command — as
  deltas since 2026-09-24: the first shape re-sent the whole input on every
  120 ms flush, quadratic, 829 KB of feed for a 12 KB app; now 74 KB. Ask
  with `v=2`; without it the server rebuilds the old `{json}` shape from a
  per-build map of each block's input, so older phones keep streaming code.
  `hold=<ms>` (≤ 1000) on the long-poll waits that long after something new
  arrives, so a build answers ~4×/s instead of once per flush — the phone
  sends `hold=250` while building), `tool_call
  {id,name,input}` (summarized), `tool_result {id,name,ok,summary}`, `file
  {path,size,content}` (after every Write/Edit, ≤ 200 KB), `deployed {url}`,
  `queued`, `note_in {text,via}`, `turn_end {ok,recap,cost,turns,deployUrl}`,
  `error {message}`, `idle`. A ring of 6000 per project, so a phone that
  comes back re-attaches with `after`. The deploy URL is taken from Splat's
  `DEPLOYED:` line (a bare `surf-xxxxxxxx.vercel.app` alias in a tool result
  is a stand-in), never the long per-deployment URL.
- **Deploy**: the workspace rules say `vercel deploy --prod --yes --token
  "$VERCEL_TOKEN" --scope "$VERCEL_SCOPE" --name <dir>`; `VERCEL_TOKEN` is
  plumb's full-account token (in `~/.surf-agent.env` on the mini; the
  `vercel` CLI there is not logged in and doesn't need to be),
  `VERCEL_SCOPE` defaults to `bart-r-decrems-projects` (without `--scope`
  the CLI refuses in non-interactive mode). Every app is a Vercel project
  named `surf-<id8>` under that team — remove test ones with the API
  (`curl -X DELETE "https://api.vercel.com/v9/projects/<name>?slug=bart-r-decrems-projects" -H "Authorization: Bearer $VERCEL_TOKEN"`;
  `vercel project rm` only works interactively). Files go through Write/Edit (the
  rules say so; the first run wrote the whole page through a Bash heredoc,
  invisible to the phone). Supabase is not wired yet (needs an access token
  and a project decision).
- **Ops**: secrets `~/.surf-agent.env` (chmod 600: `SURF_APP_KEY` = the
  phone's key, `VERCEL_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`); install once with
  `bash ~/hilma-deploy/apps/tokensurfers/agent/install.sh` (writes both
  plists, bootstraps them); ship a change with
  `ssh admin@171.66.240.175 'bash ~/hilma-deploy/apps/tokensurfers/agent/update.sh'`
  (pull, npm install, kickstart, health); logs
  `~/Library/Logs/tokensurfers/agent.{out,err}.log` on the mini; health
  `https://surf-mini.tunn3l.sh/health`. Run it on this Mac for development:
  `SURF_APP_KEY=… VERCEL_TOKEN=… SURF_AGENT_ROOT=<scratch> node server.mjs`
  with `ANTHROPIC_API_KEY` unset (the SDK's CLI uses the Mac's Claude
  login), and point the simulator at it with `TS_AGENT=http://localhost:3910`.
- **Phone** (`Agent/RemoteEngine.swift` = `AgentAPI`; `Studio.runRemote`,
  `followRemote`, `apply`): `Studio.engine` (UserDefaults `surf.engine`,
  default `remote`, Home gear → "Claude Code on the mini") decides for a NEW
  app; an app with `Project.siteURL` stays remote, one with local html stays
  local. The same screen: text deltas → coins + subtitle, `say` → the caption
  (spoken) and the feed, every tool → a train (`Write` streams onto the CODE
  stage through `PartialJSON`, `Edit` shows the patch, `Bash` puts `$ cmd` in
  the subtitle), errors → bugs + Hallucinello, `deployed` → `SiteWebView` on
  the APP stage (reloaded past the cache per `previewVersion`), `idle` →
  `finish`. Notes: the chip goes ⏳ → ✓ heard on `note_in`; no × on remote
  notes (the mini already has it). `attach()` on Studio appear picks up a
  build that kept running while the app was closed. `Secrets.agentURL` is
  the server; `TS_AGENT` overrides it in the simulator. Checked in the
  simulator against a local server: "a tip calculator" with "use a dark
  purple theme" injected at 35 s — the note went in with a tool result, the
  app deployed dark purple, the APP stage showed it, 94 s.

## The agent (the original loop, kept behind the toggle)

- **Server** (`src/app/api/surf/llm/route.ts`, prompt and tools in
  `src/lib/surf/prompt.ts`): it adds the key, the system prompt and the tools,
  and passes Anthropic's SSE stream through unchanged. The client sends only
  `{ messages, effort }`.
  - Gate: an `x-surf-key` header must equal `SURF_APP_KEY` (in `.env.local`
    and on Vercel Production + Preview, and in the app's gitignored
    `TokenSurfers/App/Secrets.swift`; copy `Secrets.swift.example`).
  - Model: `claude-opus-5-5`, effort `medium` — both pinned in code, no env
    override; a client may ask for `low` but never more. `thinking.display: "updates"`
    (so between-tool notes come back as short thinking text for the subtitle
    box), max_tokens 64k, prompt caching on the system block.
  - Tune the prompt there; no app build is needed.
- **Loop** (`Agent/Studio.swift`): Jambot's `runAgent` shape, in Swift.
  - Each call is streamed. Every `tool_use` runs in order, and all the
    results go back in one user message. It stops at `end_turn`, after at
    most 20 calls (+4 per note round, cap 32).
  - Hardened 2026-09-24 after "comments mid-build stopped the process":
    a transient failure (dropped connection, 429/5xx/529, an `overloaded_error`
    or `api_error` event mid-stream — `SurfAPIError.transient`) retries the
    same call up to twice (3 s, 6 s; the conversation is intact, the
    half-streamed turn is dropped) with a "server hiccup. retrying" caption;
    if Splat answers a note in words and ends his turn without touching the
    file, one `[app]:` nudge asks him to apply it or finish (never twice);
    ⚡ now merges the notes into the last message only when it is the user's
    (else a new user message), and the interrupt flag is cleared on every
    successful call. `[agent] +12.3s …` console lines log every call (stop
    reason, tools, tokens), every tool result, notes going in, retries,
    nudges and the finish — read them with `simctl launch --console-pty`
    (through `script -q <log>` when unattended; a plain pipe buffers
    `print`). Checked in the simulator against production: a typed note
    injected during the first write_file (delivered with the tool results,
    applied with edits, build done at 127 s) and the ⚡ now interrupt
    (turn dropped at 27 s, rewritten with the note, done at 95 s).
  - Each request starts a **fresh conversation** that carries the current
    file plus the last 8 prompts, so history never grows past one build and
    thinking blocks are always replayed untouched (Opus 5.5's preserved
    thinking).
- **Tools** (all `eager_input_streaming`, so file bodies stream as they are
  written):
  - `write_file {caption, app_title?, app_emoji?, content}`
  - `edit_file {caption, old_string, new_string}` (exact-once replace, with
    airplanecoder's error rules)
  - `read_file {caption, start_line?, end_line?}`
  - `run_app {caption}`: `Agent/AppRunner.swift` loads the page in a hidden
    390×640 web view behind the UI for about 2 s and returns uncaught errors,
    `console.error`, `alert()` calls, the title/canvas count/visible text, and
    a JPEG screenshot.
- **Captions**: every tool has a `caption` field that the model writes
  before the code. `PartialJSON` in `Agent/SurfAPI.swift` reads it out of the
  half-streamed JSON. The narrator (AVSpeechSynthesizer) speaks it once its
  closing quote arrives. The final one-line recap is the last caption.
  While the model thinks silently, local filler captions ("let him cook 🍳")
  appear after 4 s.
- **Storage**: `Documents/TokenSurfers/projects.json` plus
  `apps/<uuid>.html`, all on the device. Each project previews on its own
  origin (`https://<id8>.tokensurfers.app/`), so `localStorage` is per app.

## Performance (2026-09-24, phone + simulator)

Bart's iPhone Air was sluggish in split screen while a build ran. Measured on
the phone through `devicectl … launch --console` with `TS_PERF=1` (a real
build, the game running underneath): **55–79% of one core sustained, 60 fps,
150–235 MB, thermal nominal; 16–26% after the build with the game hidden**.
The tunnel to the phone works over Wi-Fi (`xcrun devicectl device info details`
brings it up; installs work while it's locked, launches don't). Instruments
still can't attach (Xcode 26.2 vs iOS 27.2), so symbols come from the
simulator: `sample <pid> 12` on the simulator process, summarized with
`scripts/sample-report.py <sample.txt>` (the main thread's busy share and
where it went).

- **Tools**: `TS_PERF=1` prints `[perf] cpu N% of one core (N% of cores) ·
  main N% · mem · thermal · fps` every 2 s (`Game/PerfMeter.swift`, thread
  CPU via `thread_info`, the main thread listed separately; stdout is
  line-buffered so the lines reach the console). `TS_REPLAY=<feed.json>`
  replays a saved event feed (`GET events?after=0`) with its original
  timing, no mini needed (`Studio.runReplay`; `TS_REPLAY_SPEED` scales it);
  in replay/perf runs the decoded Write is compared with the `file` event
  ("decoder ok / MISMATCH" in the console). `TS_FPS=30` caps the game.
  `scripts/perf-replay.sh <feed.json> <label> [sample-at-s]` runs a replay
  in the simulator, samples it, and prints averages/medians over the
  replay. `scripts/perf/feed-v2.json` is a recorded real build (v2 shape,
  285 events, 53 s); `scripts/perf/make-stress-feed.py <feed> <out>` turns a
  v1-shape recording into the stress case (a 40 KB Write streamed over 45 s).
  Record a tape with `curl "$AGENT/p/<id>/events?after=0&wait=0[&v=2]" -H
  "x-surf-key: …"` while the mini still has the build in its ring (a restart
  empties it).
- **Findings**: (1) the feed was quadratic — `tool_input` re-sent the whole
  half-streamed input every 120 ms (a 6 KB app: 1 MB of feed; a 60 KB app
  would be ~100 MB), and the phone decoded the whole thing each time on
  NSString-bridged strings (`String.count`/`distance` are O(n) on those);
  (2) the game frame spent a third of its time on the HUD (nine stacked
  `Text`s per stroked label laid out every frame because it sat inside the
  animation timeline), 29% of the canvas on my entity sort (it copied
  entities and searched trains per coin), ~270 sleeper fills as separate
  paths, and Canvas text resolution (posters, signs, badges) every frame;
  (3) every streamed event re-evaluated the whole `StudioView.body` (it read
  `codeForDisplay`, `outputTokens`, `subtitle`, `caption` directly) and
  redrew every `PaperGrain` canvas.
- **Done**: the mini emits `tool_input {delta, offset, len}` for `v=2` (old
  shape kept for old clients) and batches the long-poll with `hold=250`; the
  phone asks for `v=2&hold=250` and decodes fields incrementally
  (`Agent/StreamedField.swift`, only the new bytes; both engines) with
  utf8 counts. HUD on its own 10 Hz timeline; index-based lane ordering;
  sleepers/ballast/rails batched into single paths; words rasterized once
  (`GlyphCache`); coin rings as fills; `CodeView` is `Equatable` and
  memoizes the line split; `PaperGrain` is a cached image (`GrainCache`);
  the per-event state is read by four small child views (`CodeStage`,
  `SubtitleStage`, `CaptionStage`, `StatusPill`) so the rest of the screen
  stays out of the update.
- **Numbers** (simulator, stress feed, medians over the replay):
  baseline main thread 17% at 17 fps → after the feed + frame fixes 18% at
  26 fps (the CPU-bound simulator turns a cheaper frame into more frames) →
  after the view split 16% at 26 fps; memory peak 151 → 118 MB; the
  feed-side work (`apply`, `PartialJSON`) fell out of the profile entirely
  (it was 39% of the main thread's busy time in the baseline sample). On the
  phone the frame rate is pinned at 60, so the same savings show as CPU:
  install and read `[perf] … main N%` during a build (was 55–79% of a core
  total before; see the git log for the after number when Bart has run it).
- **Left**: the trains are still ~15 paths each; a 40 fps cap during builds
  would save the phone battery if it runs warm (`TS_FPS` shows the effect);
  the Starfield behind the gallery/leaderboard sheets.

## Build and run

```bash
cd apps/tokensurfers
xcodegen generate
# simulator
xcodebuild -project TokenSurfers.xcodeproj -scheme TokenSurfers \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build/dd build
xcrun simctl install "iPhone 17 Pro" build/dd/Build/Products/Debug-iphonesimulator/TokenSurfers.app
SIMCTL_CHILD_TS_AUTORUN="a coin flip app" xcrun simctl launch --terminate-running-process \
  "iPhone 17 Pro" com.bartdecrem.tokensurfers
# Mac (Catalyst, ad-hoc signed; runs locally)
xcodebuild -project TokenSurfers.xcodeproj -scheme TokenSurfers \
  -destination 'platform=macOS,variant=Mac Catalyst' -derivedDataPath build/mac \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build
# iPhone — one profile per Mac, each minted via the ASC API for that Mac's
# development cert (bundle-ID resource UXN2VTZCGY, device HS63K263D5):
#   MacBook Air: "tokensurfers dev air" (key FA7268Q94U, 2026-09-23, expires 2027-09)
#   iMac M4:     "tokensurfers dev imac" (key 5A5HNSWA33, cert 9AYMK558AW, 2026-09-24,
#                expires 2027-09; the taptapdodo memory has the issuer id and flow).
# Secrets.swift is gitignored, so a fresh checkout needs it written from
# Secrets.swift.example (appKey = SURF_APP_KEY, `vercel env pull`), then
# `xcodegen generate` again or the build says "cannot find 'Secrets' in scope".
xcodebuild -project TokenSurfers.xcodeproj -scheme TokenSurfers -destination 'generic/platform=iOS' \
  -derivedDataPath build/device CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=274T5WCVD2 \
  "PROVISIONING_PROFILE_SPECIFIER=tokensurfers dev imac" "CODE_SIGN_IDENTITY=Apple Development" build
xcrun devicectl device install app --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 \
  build/device/Build/Products/Debug-iphoneos/TokenSurfers.app
# Over WiFi at Stanford the install fails with CoreDevice 4016 even with the
# phone unlocked and "available"; a cable to the Mac works first try (2026-09-24).
```

Test hooks (environment variables):

- `TS_INJECT="<note>"` sends a mid-build note after `TS_INJECT_AT` seconds
  (default 12); `TS_INJECT_NOW=1` also presses ⚡ now 1.5 s later.
  `TS_SPLAT="2:poke,6:poke,6.3:poke,6.6:poke,14:hold,15:drag,17:release,22:nap,32:poke,38:excite"`
  scripts the Home splat (verbs: poke, pokeleft, hold, drag, release, nap,
  wake, excite, calm at those seconds) for screenshots and recordings.
  `TS_DRAFT="<text>"` pre-fills the composer (to screenshot typed text);
  `TS_SCROLL=apps` scrolls Home to the app shelf.
  `xcrun simctl privacy booted grant microphone com.bartdecrem.tokensurfers`
  skips the mic prompt; the speech prompt can't be pre-granted. If the iOS 27
  simulator shows the speech prompt on every launch, even at Home, it is a
  stale prompt the simulator keeps re-showing after one went unanswered
  (uninstall and `privacy reset` don't clear it; a debugger trap on
  `TCCAccessRequest` showed the app never asks at launch) — reboot the
  simulator (`simctl shutdown` + `boot`). Cost 20 minutes on 2026-09-24.
  `TS_HEAR=/path/audio.aiff` sends a file through the speech recognizer
  (fails to initialize in the iOS 27 simulator — voice needs a device).
  Test against a local server with `TS_BACKEND=http://localhost:3219` so
  prompt edits are live (never run `pnpm build` while that dev server is
  up: it rewrites `.next` under it).

- `TS_AUTORUN="<prompt>"` creates a project and builds it.
- `TS_OPEN=first` opens the newest project.
- `TS_OPEN=first TS_SEND="<change>"` asks that project for a change.
- `TS_SOLO=1` opens solo play; `TS_BOT=1` lets the autopilot play,
  `TS_BOT=restart` runs it back after every death, `TS_BOT=die` hands the
  bot's controls to nobody after 14 s (to see the game-over card);
  `TS_BOARD=1` opens the leaderboard. Set a handle first with
  `xcrun simctl spawn "iPhone 17 Pro" defaults write com.bartdecrem.tokensurfers surf.handle "sim bot"`.
  The bot prints `[bot] DEATH …` to the console (`launch --console-pty`).

Verify with `xcrun simctl io … screenshot` every few seconds. A build
takes about 40–90 s. On the Mac, run the binary directly with the environment
variable set and capture with `screencapture -l <window id>`.

## Promo video and screenshots — the recording workflow (2026-09-24)

The landing-page video (`~/Desktop/tokensurfers/tokensurfers-promo-900x1956.mp4`,
28.5 s, silent) and every simulator screenshot come out of one recorded build.
Two scripts, both exercised on 2026-09-24:

```bash
# 1. record one build: screen recording + a still every 5 s + 1 fps contact sheets
STILL_EVERY=5 scripts/surf/sim-record.sh <out-dir> "a pomodoro timer that screams at me" --build
# 2. pick cut points on the sheets (seconds), then cut → master, 900×1956 web, poster, 2 fps check sheet
scripts/surf/cut.sh <out-dir>/rec.mov ~/Desktop/tokensurfers/tokensurfers-promo 17.9:23.1 27.6:31.4 …
```

- **Frame:** the whole phone screen incl. status bar, the same 900×1956 frame as
  `public/surf/hero.jpg` (`.sq-shot` rotates it 3° and rounds the corners). The
  clock is pinned to 3:00, full bars, charged. Any still in `<out-dir>/stills/`
  is a drop-in replacement for `hero.jpg` (scale 1206×2622 → 900×1956).
- **Shape of a good cut** (the 09-24 one, 8 hard cuts, list in `cut.sh`): build
  starts (Splat's first lines, the Bash train) → code streaming + trains →
  Tokenur cutaway + x5 → coin flood → a crash and the instant restart →
  patch/check/deploy ("praying loudly") → "YOU'RE ABSOLUTELY RIGHT!" + SHIPPED
  confetti + the game tucking away → four seconds on the finished app. A build
  takes 2–3 min on the mini; the first ~15 s after launch are idle (the Studio
  settles before it sends), and the app only fills the screen ~5 s after the
  mini goes idle — the script waits 14 s for that.
- **What bit (all handled by the script, listed so nobody re-learns them):**
  Xcode 27 has no Simulator.app; headless works, but `simctl install/launch`
  hang forever on a device that is "Booted" and still booting — `bootstatus -b`
  first. `Secrets.swift` must exist before `xcodegen generate`. `status_bar
  --time` wants ISO with milliseconds and shows it 5 h ahead of the Z hour on
  this runtime. The simulator records video only, no audio. ffmpeg is in
  `~/bin` on the Neo. `-i` with no output exits 1, which kills a `set -o
  pipefail` script mid-way.
- **After:** the test build made a Vercel project `surf-<id8>` (the id is in the
  first Bash train's `$ cd …/surf-<id8>` subtitle on the stills); delete it with
  the API call in the script header. Nothing is published to the gallery when the
  simulator is signed out.

## The mirror repo

Token Surfers is released as periodic snapshots into its own public MIT
repo, `bdecrem/tokensurfers` (checkout `../tokensurfers`) — **how: `mirror/RELEASE.md`**.
`mirror/sync.sh <out>` takes hilma's committed HEAD (git archive, never the
working tree) and assembles `ios/` (this folder minus CLAUDE.md),
`web/` (a minimal Next.js app — `mirror/web` — around `src/app/surf`,
`src/app/api/surf`, `src/lib/surf`, `public/surf`), `schema/` and `art/`
(the Splat SVGs), then scans the tree for keys (Anthropic/OpenAI/JWT/pem/
SendGrid/GitHub patterns, `Secrets.swift`, and exact values in
`SCAN_VALUES`) and refuses to continue on a hit, and an import scan that fails if the web
code reaches outside `@/lib/surf` / `@/app/surf`. `--push <url>` commits
"Sync from hilma@<sha>" onto the mirror's history. The workflow
`.github/workflows/sync-tokensurfers.yml` runs it on every push that
touches those paths once the `TOKENSURFERS_DEPLOY_KEY` secret exists (and
`SURF_APP_KEY` for the exact-value scan) — not wired yet; releases are run by
hand from RELEASE.md. The mirror's `web/` builds on its own (`pnpm install &&
pnpm build`, verified 2026-09-24). LICENSE (MIT, shipped from `mirror/LICENSE`). The server code
only imports `@/lib/surf/*` and npm packages — keep it that way or the
mirror breaks. When the mirror is live, point `GITHUB` in
`src/app/surf/parts.tsx` / `SURF_GITHUB_URL` at it.

## Handoff — open items (2026-09-24)

State after the Splat / mid-build notes / mirror session (commits `a6077262`,
`bef4da9b`). Everything is pushed; these are what's left:

- **On Bart's phone since 2026-09-24 (build 3)**, installed from the iMac
  over a cable with the "tokensurfers dev imac" profile (see "Build and
  run"; automatic signing does NOT work on the iMac — no Xcode account,
  "No Accounts").
- **Voice is unverified end to end.** Typed notes and ⚡ now were verified in
  the simulator against production (2026-09-24, see "Loop"). Hold-to-talk was
  never heard: the iOS 27 simulator's recognizer says "Failed to initialize
  recognizer", and the Catalyst binary launched from a shell never showed its
  speech prompt. Bart's report from the phone (2026-09-24) was a big lag
  between the mic press and anything happening; the rewrite (on-device
  recognition, no permission round trips, the task armed before the engine)
  is on his phone as build 4 but not yet heard. First real test is on a
  device: hold the mic mid-build, watch for "opening the mic…" → "listening…"
  → words, the `[voice] open in N ms` / `closed in N ms` console lines, the
  🎙️ chip, that music ducks and the narrator holds, and that the session
  goes back to ambient after (game sound should keep playing).
- **The mirror is prepared, not live.** Bart said no to creating
  `bdecrem/tokensurfers` for now. Don't create the repo or add the deploy key
  without asking. The workflow is a no-op until `TOKENSURFERS_DEPLOY_KEY`
  exists. `GITHUB` in `src/app/surf/parts.tsx` points at bdecrem/tokensurfers (2026-09-24).
- **The app key is extractable** from any shipped build (it's in the binary by
  design), so `/api/surf/llm` has a global daily budget: `surf_usage` (schema
  004, applied 2026-09-24) counts calls and tokens per UTC day, read out of the
  SSE stream as it passes through (`meterStream` in `src/lib/surf/usage.ts`);
  `SURF_DAILY_TOKENS` (default 10M input + output) → 429 with a "Splat is out
  of tokens for today" message the app shows. Per-user limits: none yet.
- **Pitfalls hit this session:** `pnpm build` while a `next dev` is running on
  the same checkout breaks the dev server (shared `.next`); SourceKit shows
  false "cannot find X in scope" errors for new files until `xcodegen
  generate` + a build; zsh aborts a `&&` chain on an unmatched glob
  (`rm -f dir/*` on an empty dir).

## Ideas not built yet

- Publishing a made app to a public link (it would need storage on hilma).
- A daily token budget on the LLM route (today only the key gates it).
- Power-ups (magnet, 2x, hoverboard), daily challenges, a second track
  theme (night), unlockable scarves.

## App Store Connect / TestFlight (set up 2026-09-24, from the iMac M4)

Goal: a public TestFlight beta, not an App Store release.

- App record **"Token Surfers"**, id `6815840420`, SKU `ts001`, bundle-ID
  resource `UXN2VTZCGY`. Bart created the record; everything else was filled
  over the ASC API with key `5A5HNSWA33` (issuer in the taptapdodo memory).
- Category Entertainment; age rating answered (mild cartoon violence, UGC on,
  no unrestricted web access — the creations are sandboxed).
- Test Information (en-US): beta description, feedback email, marketing URL
  tokensurfers.app, privacy policy **tokensurfers.app/privacy**
  (`src/app/surf/privacy/page.tsx` — keep it true to the tables and the LLM
  route). Beta review contact = Bart; demo account `applereview` (password in
  the review details on ASC; not required — nothing needs a sign-in except
  publish/upvote/remix); review notes explain the sandboxed web view, the
  Report button and the optional mic.
- Beta group **"Public beta"** (`14902f7d-…`), public link
  https://testflight.apple.com/join/aqDXBFQn, cap 10,000. Set
  `SURF_TESTFLIGHT_URL` to it on Vercel once the first build clears beta
  review (the site's buttons say "soon" until then).
- Wording for Apple (guidelines 2.5.2 and 1.2): a runner game with a coding
  buddy who makes "web toys" / "creations" previewed in a sandboxed web view;
  never "install apps", "run any code", "build real apps"; no other
  companies' model names in store text.
- **Ship: `./apps/tokensurfers/testflight/ship.sh [version]`** — bumps
  `CURRENT_PROJECT_VERSION`, regenerates the project, archives with profile
  "tokensurfers appstore imac" (IOS_APP_STORE on this Mac's distribution cert
  `4YB38SZ2F2`, minted over the API, installed in the Xcode profiles dir),
  uploads with the API key, then `testflight/asc-submit.mjs <build>` waits
  for processing, adds the build to every public-link group and submits it
  for beta review. Another Mac needs its own profile on its own cert.
- **This iMac only has the Xcode 27 beta, and App Store Connect refuses
  uploads built with a beta** ("Unsupported SDK or Xcode version", 2026-09-24).
  The way around it, used for the first build: archive on the Mac mini
  (`admin@171.66.240.175`, Xcode 26.3 release, checkout `~/ts-ship`, no
  signing — its keychain can't be unlocked over ssh), tar the `.xcarchive`
  back here, and `xcodebuild -exportArchive` it from this Mac with the
  distribution profile and the API key; the export re-signs and uploads, and
  ASC judges the SDK from the archive. Exact commands are in the 2026-09-24
  session; the plist for the export is what `ship.sh` writes. `ship.sh`
  itself works once a release Xcode is installed here (set `DEVELOPER_DIR`).
- The first upload went up as **1.0 (1)**: `Info.plist` carried literal
  version strings, so project.yml's `0.1 (8)` never reached the bundle. Fixed
  the same day (the plist now reads `$(MARKETING_VERSION)` /
  `$(CURRENT_PROJECT_VERSION)`, project.yml says 1.0) — the next upload must
  be 1.0 with a build number above 1, so bump before every archive.
