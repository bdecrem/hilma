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
