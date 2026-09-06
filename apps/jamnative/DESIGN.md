# Jambot native (iOS + Mac Catalyst) — test build design

Purpose: find out whether a native client feels much better than the web app at
jambot.to. Same backend, same engine, native SwiftUI screens. This is a TEST
build: Library, Studio (chat + transport + faders), nothing else.

## Where things run

| Piece | Where | Notes |
|---|---|---|
| Synth engines, sequencer, render, session, tools, agent loop | JavaScript — the SAME bundle the web app ships (`public/jam/jambot-web.js`) | Loaded in a hidden `WKWebView` ("engine host") because the engine needs Web Audio's `OfflineAudioContext`, which only WebKit provides on iOS. WKWebView runs in its own process, so a render never blocks the SwiftUI UI. |
| Accounts, tracks, LLM proxy | The existing hilma backend (`https://jambot.to/api/jam/*`) | All HTTP goes through Swift `URLSession` with `HTTPCookieStorage.shared` (cookie `jam_session`), exactly like `apps/feynd/Feynd/F2API.swift`. The web view never talks to the network. |
| Playback | Swift `AVAudioEngine` + `AVAudioPlayerNode` | PCM comes from the engine host; looped at the musical length (bars × 4 × 60 / bpm); `AVAudioSession` category `.playback` + `UIBackgroundModes: audio` so it keeps playing with the screen locked. |
| UI | SwiftUI | Login → Library → Studio. Portrait iPhone first; Catalyst uses the same layout. Styling follows the web design system (putty panel, ink keys, orange LEDs, condensed uppercase labels) — see `src/app/jam/jam.css`. |

## Engine host bridge (Swift ⇄ JavaScript)

`Jambot/Engine/engine.html` (bundled resource) loads `jambot-web.js` (bundled by
reference to `../../public/jam/jambot-web.js` — never copy it) plus
`engine-bridge.js`, which owns one `session` and exposes:

```
bridge.call(id, name, argsJSON)      // Swift → JS; every call answers via
window.webkit.messageHandlers.engine.postMessage({ id, ok, result | error })
```

Calls (names are stable; add, don't rename):

| name | args | result |
|---|---|---|
| `ready` | — | `{ version, tools: [names] }` after `jam.ready()` |
| `loadSession` | `{ session \| null, bpm }` | `{ desc }` — `deserializeSession` or `createSession`; desc = `describeSession()` |
| `serialize` | — | `{ session }` (for saving) |
| `describe` | — | `{ desc }` |
| `controls` | — | `{ groups }` — port of `src/app/jam/controls.ts` (buildControlGroups) to plain JS inside engine-bridge.js |
| `tweak` | `{ path, value }` | `{ result, desc }` — `executeTool('tweak')`; in song mode also the write-through into saved patterns' params (mirror `Studio.onParam`) |
| `setTrack` | `{ key: 'bpm'\|'swing'\|'bars', value }` | `{ desc }` |
| `mix` | `{ id, what: 'mute'\|'solo', on }` | `{ result, desc }` — mute_track / solo_track (`exclusive: false`) |
| `render` | `{ scope?: { kind: 'song' } \| { kind: 'section', index } }` | `{ bars, bpm, hasArrangement, message, sampleRate, channels, length, chunks }` — audio as planar Int16, base64, in ≤ 1 MB chunks (`chunks: [string]`), so a 16-bar loop crosses the bridge in one message set |
| `agent` | `{ task, messages, notes: [string] }` | streams events via `postMessage({ id, event: 'tool'\|'toolResult'\|'text'\|'render'\|'end', ... })`; the JS `llm` function does NOT fetch — it posts `{ id, event: 'llm', request }` and awaits `bridge.resolveLlm(id, responseJSON)` from Swift, which performs the POST to `/api/jam/llm` with the cookie. Final message: `{ id, ok, result: { messages, stopReason, desc } }` |

Errors: `{ id, ok: false, error }`. JS exceptions never leave a call unanswered.

Swift side: `EngineHost` (ObservableObject) wraps the WKWebView, keeps a
`[id: continuation]` table, and offers `async` methods mirroring the table
above, plus a `RenderResult` → `AVAudioPCMBuffer` decoder. The web view is
created once at app start and reused across tracks.

## Screens (SwiftUI, `Jambot/UI/`)

- `LoginView` — username / password → `POST /api/jam/auth/login` (also signup toggle).
- `LibraryView` — `GET /api/jam/tracks`: title, BPM, bars, LED strip (`strip.k/s/h` 16-char strings), "+ New track" small orange key, tap → Studio.
- `StudioView` — header (back, title, readout "128 BPM · 16 bars · song"), chat feed (user bubble, assistant text, tool chips), composer, transport (Play/Stop, position, LED strip lit by the playhead, Controls key), Controls sheet with Faders only (tempo, swing, bars, then the groups from `controls`, each with M/S keys). Autosave 800 ms after changes (`PUT /api/jam/tracks/:id` with `{ session, messages, feed, bpm, bars }`), flush on background/leave.
- Not in the test build: Seq tab, Panels tab, publish/share/remix, export. Say so in PROGRESS.md.

## Project

`apps/jamnative/` — XcodeGen (`project.yml` is the source of truth; `.xcodeproj` is
generated and committed like Feynd). App name **Jambot**, bundle id
`com.bartdecrem.Jambot`, team `274T5WCVD2`, iOS 17, `SUPPORTS_MACCATALYST: YES`,
`ENABLE_DEBUG_DYLIB: NO` (Bart's phone runs an iOS beta — see memory), device
family iPhone + iPad, background mode audio, `bump-build.sh` copied from Feynd.
Backend URL in `Secrets.swift` (gitignored, `Secrets.swift.example` committed;
default `https://jambot.to`). Test account for the simulator: `jamtest` / `jamtest1`
(never Bart's account from a dev build that writes to production).

## Verify

- `cd apps/jamnative && xcodegen generate`
- `xcodebuild -project apps/jamnative/Jambot.xcodeproj -scheme Jambot -destination 'platform=iOS Simulator,name=iPhone 16' build` → `** BUILD SUCCEEDED **`
- Catalyst: `-destination 'platform=macOS,variant=Mac Catalyst'`
- Simulator: boot iPhone 16, install, launch `com.bartdecrem.Jambot`, `xcrun simctl io "iPhone 16" screenshot`, sign in as jamtest, open "SEQ TEST techno copy", Play, move a fader, send "make the kick shorter".
- Background-audio check (the go/no-go): start playback, background the app (simulator: `xcrun simctl … ` home button, or on device lock the screen) — audio must continue; then trigger a render while backgrounded and confirm it completes.

---

# Full app (approved 2026-09-05 after the test build passed)

Parity with jambot.to, native. Everything below is additive to the test build.

## Screens and features

| Area | Native behaviour | Web reference |
|---|---|---|
| Controls sheet | Three tabs in the header: **Faders · Panels · Seq** (remembered per device). Track sliders stay above Faders. | `src/app/jam/ControlsSheet.tsx` |
| Seq | Native port of the step sequencer: instrument pulldown (Menu/Picker), section pills with bar counts and the playhead LED (pulses on the beat), **Loop section** key (audition scope), overview strip of the whole pattern with the visible window + playhead, ‹ page › with 8 steps per page (16 on regular-width layouts) and swipe, drum rows per voice (tap cycles off → hit → accent; beat columns shaded; labels BD SD CP RS LT MT HT CH OH CR RD / JB01: BD SD CP CH OH LT HT CY), mono synths as a note row + step editor (STEP n ‹ ›, note 34pt, −OCT −1 +1 +OCT, ACC, SLIDE, OFF; pitch bar under each gated pad), LENGTH 1·2·4, two-tap CLEAR. Edits go through the engine (see bridge additions) → re-render 300 ms → autosave → a coalesced `[controls]` note. | `src/app/jam/seq/Sequencer.tsx`, `seq/model.ts`, `seq/seq.css` |
| Panels | Native accordion (one open, remembered): per-synth panels in that synth's palette (JB202 dark teal, JT-30 dark/red, JT-10 slate/blue, JT-90 black/red, JB01 dark, effects navy/cyan — colours in `alt/panels-mobile.css` `--ph-*` and `alt/skins.css`), header with LED + name + summary readout + chevron + **M/S** keys beside it; body = knobs (44pt rotary control: 150pt drag for full range, double-tap resets to descriptor default, floating value while dragging), choice toggles (waveforms, modes), JT-10 vertical sliders, JT-90/JB01 voice cards in a 2-column grid with a voice LED. Header LED and voice LEDs flash on the instrument's hits. Layout math like the web (4 knobs per row at 358pt; centred rows). | `src/app/jam/alt/panels.tsx`, `alt/Knob.tsx`, `alt/panels-mobile.css`, `alt/skins.css` (colour values) |
| Hit LEDs | `hits(step:scope:)` from the engine each 16th (drives Panels LEDs and the Seq playing pill); transport LED strip already lit by the playhead. | `seq/model.ts` `hitsAt` |
| Library | "…" per track: Duplicate, Delete (confirm); public/remix tags; Catalog section ("From everyone") under the library and on the login screen (public tracks play in a read-only player at `/jam/t/<slug>`-equivalent: title, author, LED strip, Play, **Remix** → copies into the signed-in library). Pull to refresh. | `Library.tsx`, `Catalog.tsx`, `src/app/jam/t/[slug]/*`, `api.ts` |
| Studio header | Tap title to rename; Publish / Unpublish (green key) and Share (system share sheet with the public URL `https://jambot.to/t/<slug>`). | `Studio.tsx` |
| Bounce | Sheet: **WAV** and **AAC (.m4a)** written from the last render (AVAssetWriter for AAC) → share sheet / Files. (MP3 needs the browser encoder; AAC is the native equivalent.) | `export.ts` |
| Render cache | On-device: last whole-track render per track as Int16 in `Caches/renders/<trackId>.pcm` + sidecar JSON, keyed by SHA-256 of the serialized session + engine stamp; opening an unchanged track plays instantly; keep the 6 most recent. | `renderCache.ts` |
| Playback | Lock-screen / Control Center: `MPNowPlayingInfoCenter` (title, artist "Jambot", elapsed/duration = loop), `MPRemoteCommandCenter` play/pause/toggle; interruption + route-change handling; audio keeps rendering in the background (verified on device in the test build). | — |
| About | Settings/About screen from the Library header (build number, engine bundle stamp, signed-in user, sign out). Bart checks build numbers here. | Dodo's About |
| Catalyst / iPad | Centred 720pt column on regular width; keyboard: space play/stop, ⌘↩ send, ⌘K controls, ⌘, About; window min size 390×700; menus. | `jam.css` wide rules |
| Branding | App icon: putty enamel square, "JAMBOT" in condensed black uppercase with the raised orange LED after the T (never a dot); launch screen = putty colour + wordmark. | `src/app/jam/jam.css` wordmark, `opengraph-image.tsx` |

## Bridge additions (engine-bridge.js + EngineHost.swift + EngineAPI.swift)

| call | args | result |
|---|---|---|
| `hits` | `{ step, scope }` | `{ hits: { instId: [voice…] } }` — port of `hitsAt` (mono synths report `['gate']`) |
| `seq` | `{ op, inst, section?, args }` | `{ desc, pattern }` — ops: `cycleDrum { voice, i }`, `toggleGate { i }`, `setNote { i, note }`, `toggleAccent { i }`, `toggleSlide { i }`, `resize { bars }`, `clear`. Song mode (`section` given): edit `session.patterns[inst][name].pattern` for that section's pattern name and mirror into the live node when it is the loaded one; loop mode: the live node. Port `seq/model.ts` (normalise voices, never mutate in place). Returns the target pattern (dense) so the UI has no second round trip. |
| `pattern` | `{ inst, section? }` | `{ pattern, name, length, kind }` — read the target pattern for the Seq view |
| `encodeWav` | — | not needed (Swift writes WAV from the PCM it already has) |

Swift `EngineAPI` gains `hits(step:scope:)`, `seq(op:inst:section:args:)`, `pattern(inst:section:)`. `SessionDescription.instruments[].pattern` is not decoded (too big); the Seq view uses `pattern`.

## As built (stage 10, 2026-09-06) — where the app deviates from the tables above

- Panels shows the Track card (tempo / swing / length) above the accordion, like the web's sheet; Seq is the bare sequencer.
- Bounce is a key in the transport row next to Controls (not a header action).
- The bridge's `describe()` also returns `effects: [{ target, chain: [{ id, type, params, descriptors }] }]` (descriptors normalised like an instrument's) and every descriptor carries `default` when the engine has one; Swift mirrors them as `SessionDescription.effects` / `ParamDescriptor.defaultValue`.
- `EngineAPI.tweakChoice(path:value:)` sets string-valued choice params through the same bridge `tweak` call.
- The agent's own render autoplays (web parity); a Faders/Panels change while "Loop section" is lit re-renders the section.
- Headless drivers: `-studioScript` (see `UI/StudioScript.swift` for the vocabulary), `-libraryScript` (`UI/LibraryScript.swift`), `tooling/sim-run.sh` / `tooling/catalyst-run.sh` service the `shot:<name>` screenshot handshake.

## Verification (every stage)

Headless only: `xcrun simctl` + the DEBUG launch args (`-autoLogin jamtest jamtest1`, `-openTrack "<title>"`, `-openControls`, `-studioScript "<steps>"` in `UI/StudioScript.swift`; extend the script vocabulary for new features, e.g. `tab:seq`, `seq:tap:kick:2`, `panels:open:jb202`, `bounce:wav`). Screenshots under `apps/jamnative/.shots/`. Never computer-use / request_access. Device installs use `scripts/ios/asc-dev-profile.py` + the commands in `apps/jamnative/CLAUDE.md`; the phone may be locked — say so rather than waiting.
