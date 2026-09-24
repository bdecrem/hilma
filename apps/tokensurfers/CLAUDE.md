# Token Surfers

A brainrot vibe-coding app for iPhone and Mac (Catalyst), built from
`misc/3.MP4` on 2026-09-23. You type what you want. **Splat**, the coding
agent, builds it as one self-contained `index.html` while you play **Token
Surfers**, a Subway-Surfers-style runner, in the bottom half of the screen.
Everything the agent does shows up in the game: streamed tokens become coin
trails, each tool call is a train with the tool's name on its front, bugs found by
`run_app` crawl onto the track (jump on them), and a finished build rains
confetti. The result runs live in the stage above.

## The screen

- **Home** (`UI/HomeView.swift`): the video's AITA card on a sunburst, used as
  the prompt box ("AITA for wanting an app that…"), idea chips, SURF IT, and a
  shelf of your apps (long-press to rename, share the HTML or delete).
- **Studio** (`UI/StudioView.swift`):
  - The **stage** on top has two tabs. APP is the running app in a
    WKWebView; CODE is the navy "3:00 AM monitor" with a line counter and
    live syntax-coloured code. It switches to CODE while code streams and to
    APP after `run_app` and when the build is done. Tapping a tab pins it for
    the rest of the build.
  - A **caption band** sits on the seam. It plays the agent's caption in
    1–3 word chunks with one word in yellow, and it doubles as the resize
    handle.
  - **Token Surfers** is below the seam.
  - A **composer** sits at the bottom. While a build runs it becomes a status
    pill (phase and token count) plus a Stop button.
  - After a build the game tucks away and the app fills the screen. The
    "🏄 surf" chip or the ⌄ button toggles the game, and follow-up chips
    ("make it prettier ✨") appear.
  - The ••• menu has Open fullscreen, Share HTML, the Sound and Narrator
    toggles, and Delete.
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
- **Game controls**: swipe (left/right lanes, up jump, down roll), tap the
  left, middle or right third, or arrow keys / WASD / space. A crash never
  ends the run: it turns the frame grey ("BRUH 💀"), resets the multiplier and
  gives 1.6 s of blinking immunity.

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

Verify with `xcrun simctl io … screenshot` every few seconds. A build
takes about 40–90 s. On the Mac, run the binary directly with the environment
variable set and capture with `screencapture -l <window id>`.

## Ideas not built yet

- Publishing a made app to a public link (it would need storage on hilma).
- A daily token budget on the route (today only the key gates it).
- A sound bed. Today there are only synth sound effects and the narrator.
