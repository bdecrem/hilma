# Jambot native — progress log

Resume from any machine or account: `git pull`, read `DESIGN.md`, then the
first unchecked item below. Every agent/session updates this file when it
finishes a step (check the box, one line of what was verified, commit).

## Status

- [x] 1. Scaffold — XcodeGen project (`project.yml`, Catalyst on, background audio), app shell (`JambotApp.swift`, `Session.swift`, `JamAPI.swift` with login/me/logout/tracks/get/put), `Secrets.swift.example`, `bump-build.sh`, `CLAUDE.md`; `xcodegen generate` + iOS-simulator and Catalyst builds succeed.
- [ ] 2a. Engine host — `Engine/engine.html`, `Engine/engine-bridge.js` (session, controls port, tweak write-through, render → Int16 base64 chunks, agent loop with LLM proxied through Swift), Swift `EngineHost` (WKWebView, request/response table, async API), `AudioPlayer` (AVAudioEngine loop with phase-keeping swap), `AVAudioSession` playback category. Verified in the simulator with a headless test view or unit test: `ready`, `loadSession` of a saved track JSON, `render` of 16 bars decodes to the right frame count and plays.
- [ ] 2b. Screens — `LoginView`, `LibraryView`, `StudioView` (chat, transport, Controls sheet with Faders + M/S) against the `EngineAPI` protocol; compiles with a mock engine; screenshots at iPhone 16 size.
- [ ] 3. Integration — real engine behind the screens, autosave, sign in as jamtest, open "SEQ TEST techno copy", play, fader, chat turn; Catalyst build runs; background-audio go/no-go recorded here.
- [ ] 4. Device — `bump-build.sh`, install on Bart's iPhone (needs the phone unlocked), note the build number here.

## Log

- 2026-09-05 — Design written (`DESIGN.md`). Nothing built yet.
- 2026-09-05 — Stage 1 scaffold done. `project.yml` (Catalyst on, `ENABLE_DEBUG_DYLIB: NO`, background audio, TARGETED_DEVICE_FAMILY 1,2, LSApplicationCategoryType public.app-category.music, engine bundle referenced by path from `../../public/jam/jambot-web.js`); app shell (`JambotApp.swift`, `Session.swift`, `JamAPI.swift`, `Models.swift`, `Theme.swift`, `Secrets.swift.example`); placeholder screens (`UI/LoginView.swift`, `UI/LibraryView.swift`, `UI/StudioView.swift`); `Engine/EngineAPI.swift` (the shared protocol — pasted in full below for 2a/2b) with `MockEngine`; placeholder `Engine/engine.html` + `Engine/engine-bridge.js`; `bump-build.sh`, `CLAUDE.md`, `.gitignore` (`Secrets.swift`, `.shots/`). Verified: `xcodegen generate` OK; iOS Simulator build `** BUILD SUCCEEDED **`; Mac Catalyst build `** BUILD SUCCEEDED **`; `jambot-web.js` confirmed present in the built `Jambot.app` (`ls Jambot.app | grep jambot-web`); simulator install+launch+screenshot on iPhone 16 shows the putty/ink/orange login screen (`.shots/stage1-login.png`, gitignored). Left for 2a/2b: everything else in the checklist below — engine host, real screens, integration, device install.

### EngineAPI protocol (shared contract for stage 2a/2b — see `Engine/EngineAPI.swift`)

```swift
protocol EngineAPI: AnyObject {
    func ready() async throws
    func loadSession(session: JSONValue?, bpm: Int) async throws -> LoadedSession
    func serialize() async throws -> JSONValue
    func describe() async throws -> SessionDescription
    func controls() async throws -> [ControlGroup]
    func tweak(path: String, value: Double) async throws -> SessionDescription
    func setTrack(key: String, value: Double) async throws -> SessionDescription
    func mix(id: String, what: String, on: Bool) async throws -> SessionDescription
    func render(scope: RenderScope) async throws -> RenderResult
    func agent(task: String, messages: [AgentMessage], notes: [String]) -> AsyncThrowingStream<AgentEvent, Error>
}
```
Codable types (`SessionDescription`, `InstrumentDescription`, `ParamEntry`, `ParamDescriptor`, `ControlGroup`/`Control`, `RenderResult`, `AgentEvent`, `RenderScope`, `LoadedSession`) live in the same file. `MockEngine` conforms and returns canned data so 2b's screens compile before 2a's real engine host exists.

## Known constraints

- The engine bundle is referenced from `../../public/jam/jambot-web.js` (hilma's committed bundle) — rebuild it with `pnpm jam:build` after jambot changes; the app picks it up on the next build.
- Bart's iPhone runs an iOS beta: keep `ENABLE_DEBUG_DYLIB: NO` (see memory `reference_ios27_beta_debug_dylib`).
- Only the `jamtest` account may be used from dev/simulator builds — the backend is production.
