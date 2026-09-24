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
- **The surfer** (`SurferArt.swift`): Splat with legs. Orange paper
  starburst body, dark-orange legs in chunky white sneakers (orange stripe,
  ink sole), mitten arms that pump, a red scarf whipping off to the right at
  neck height, an antenna with a pulsing yellow bulb, a goggles strap across
  the back of the head (goggles on the forehead from the front; down over
  the eyes for the `.cool` mood), and a navy laptop backpack with a green
  `>_` sticker. Poses: run cycle with foreshortened forward leg, jump (legs
  tucked, arms up), roll (spinning ball with speed streaks), stumble lean,
  landing squash, and the death tumble (front view, X eyes). `SurferHero`
  is the SwiftUI front view used on Home, the cards and the name sheet.
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
- **The web** — `src/app/surf/`: `/surf` landing (hero with the tube man in
  SVG, TestFlight + GitHub + gallery buttons, how it goes, phone shots from
  `public/surf/shots/`, the top creations), `/surf/gallery` (top/new),
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
- **Simulator hooks**: `TS_BACKEND=http://localhost:3219` points the app at
  a dev server (ATS allows local networking), `TS_LOGIN=handle:password`
  signs in (creating the account if needed), `TS_PUBLISH=1` with
  `TS_OPEN=first` publishes the newest project, `TS_GALLERY=1|<slug>` opens
  the gallery (and that app), `TS_ACCOUNT=1` the sign-in sheet.
- Not built: passwords can't be reset (no email), no moderation beyond
  unpublish-your-own, no TestFlight build yet (create the App Store Connect
  record, upload, then set `SURF_TESTFLIGHT_URL`).

## The screen

- **Home** (`UI/HomeView.swift`): the video's AITA card on a sunburst, used as
  the prompt box ("AITA for wanting an app that…"), idea chips, SURF IT, the
  Token Surfers card (solo play + leaderboard), and a shelf of your apps
  (long-press to rename, share the HTML or delete). The surfer runs in place
  next to the title.
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
  - A **composer** sits at the bottom. While a build runs it becomes a status
    pill (phase and token count) plus a Stop button.
  - After a build the game tucks away and the app fills the screen. The
    "🏄 surf" chip or the ⌄ button toggles the game, and follow-up chips
    ("make it prettier ✨") appear.
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

## The agent

- **Server** (`src/app/api/surf/llm/route.ts`, prompt and tools in
  `src/lib/surf/prompt.ts`): it adds the key, the system prompt and the tools,
  and passes Anthropic's SSE stream through unchanged. The client sends only
  `{ messages, effort }`.
  - Gate: an `x-surf-key` header must equal `SURF_APP_KEY` (in `.env.local`
    and on Vercel Production + Preview, and in the app's gitignored
    `TokenSurfers/App/Secrets.swift`; copy `Secrets.swift.example`).
  - Model: `claude-opus-5-5`, effort `medium`, `thinking.display: "updates"`
    (so between-tool notes come back as short thinking text for the subtitle
    box), max_tokens 64k, prompt caching on the system block.
  - Tune the prompt there; no app build is needed.
- **Loop** (`Agent/Studio.swift`): Jambot's `runAgent` shape, in Swift.
  - Each call is streamed. Every `tool_use` runs in order, and all the
    results go back in one user message. It stops at `end_turn`, after at
    most 14 calls.
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
# iPhone (MacBook Air profile "tokensurfers dev air", minted 2026-09-23 via the
# ASC API with key FA7268Q94U, bundle-ID resource UXN2VTZCGY, expires 2027-09)
xcodebuild -project TokenSurfers.xcodeproj -scheme TokenSurfers -destination 'generic/platform=iOS' \
  -derivedDataPath build/device CODE_SIGN_STYLE=Manual \
  "PROVISIONING_PROFILE_SPECIFIER=tokensurfers dev air" "CODE_SIGN_IDENTITY=Apple Development" build
xcrun devicectl device install app --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 \
  build/device/Build/Products/Debug-iphoneos/TokenSurfers.app
```

Test hooks (environment variables):

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

## Ideas not built yet

- Publishing a made app to a public link (it would need storage on hilma).
- A daily token budget on the LLM route (today only the key gates it).
- Power-ups (magnet, 2x, hoverboard), daily challenges, a second track
  theme (night), unlockable scarves.
