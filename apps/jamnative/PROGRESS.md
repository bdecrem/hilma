# Jambot native — progress log

Resume from any machine or account: `git pull`, read `DESIGN.md`, then the
first unchecked item below. Every agent/session updates this file when it
finishes a step (check the box, one line of what was verified, commit).

## Status

- [ ] 1. Scaffold — XcodeGen project (`project.yml`, Catalyst on, background audio), app shell (`JambotApp.swift`, `Session.swift`, `JamAPI.swift` with login/me/logout/tracks/get/put), `Secrets.swift.example`, `bump-build.sh`, `CLAUDE.md`; `xcodegen generate` + iOS-simulator and Catalyst builds succeed.
- [ ] 2a. Engine host — `Engine/engine.html`, `Engine/engine-bridge.js` (session, controls port, tweak write-through, render → Int16 base64 chunks, agent loop with LLM proxied through Swift), Swift `EngineHost` (WKWebView, request/response table, async API), `AudioPlayer` (AVAudioEngine loop with phase-keeping swap), `AVAudioSession` playback category. Verified in the simulator with a headless test view or unit test: `ready`, `loadSession` of a saved track JSON, `render` of 16 bars decodes to the right frame count and plays.
- [ ] 2b. Screens — `LoginView`, `LibraryView`, `StudioView` (chat, transport, Controls sheet with Faders + M/S) against the `EngineAPI` protocol; compiles with a mock engine; screenshots at iPhone 16 size.
- [ ] 3. Integration — real engine behind the screens, autosave, sign in as jamtest, open "SEQ TEST techno copy", play, fader, chat turn; Catalyst build runs; background-audio go/no-go recorded here.
- [ ] 4. Device — `bump-build.sh`, install on Bart's iPhone (needs the phone unlocked), note the build number here.

## Log

- 2026-09-05 — Design written (`DESIGN.md`). Nothing built yet.

## Known constraints

- The engine bundle is referenced from `../../public/jam/jambot-web.js` (hilma's committed bundle) — rebuild it with `pnpm jam:build` after jambot changes; the app picks it up on the next build.
- Bart's iPhone runs an iOS beta: keep `ENABLE_DEBUG_DYLIB: NO` (see memory `reference_ios27_beta_debug_dylib`).
- Only the `jamtest` account may be used from dev/simulator builds — the backend is production.
