# Dolly — a three-minute call a day (iOS)

Built 2026-10-10 from the daily-call v2 design (`src/app/design/daily-call-v2`,
ola.cx/design/daily-call-v2): one text a day with a link into a three-minute
spoken conversation, three things said back, ten cards. **The new build on
Polly's TestFlight**: Polly's App Store record (6813318254, renamed "Dolly:
Three minutes a day" — plain "Dolly" is taken by another account) and bundle
id `com.bartdecrem.Polly`, so Bart's testers get it as an update; Aidan's
Polly (`../polly`, his own account) is untouched. Version 0.2, build 33 on.

Backend: hilma, `src/lib/dolly/` + `/api/dolly/*` (see the project CLAUDE.md
row). Voice: Polly's ElevenLabs + Claude engine, ported — `ElevenVoiceClient.swift`
is Polly's with Dolly's finish; GPT-Live is the gap left in `VoiceClient.swift`.

## Files (`Dolly/`)

- `DollyApp.swift` — `@main`, `RootView` (loading / onboarding / map), `FlowView`
  (talk → things → cards → done inside one full-screen cover; the server's day
  state says what comes next), `onOpenURL` for `dolly://today` and the
  `https://ola.cx/dolly/today` universal link (`Dolly.entitlements`,
  `applinks:ola.cx`; the AASA is `src/app/api/dolly/aasa`).
- `AppState.swift` — who is signed in, today's `DayView`, the flow on screen,
  the launch hooks.
- `Skin.swift` — every color, font and radius, the mascot's asset names. One
  instance, `.candy`; `Skin.current` is what views read. The look will change:
  add a skin, keep the names.
- `Mascot.swift` — Gummy (two frames from `misc/dodo-redesign`, Dodo's jelly
  critter) with a motion per mood: idle, talking, listening, thinking, happy.
- `Models.swift`, `DollyAPI.swift` — the JSON and the client.
- `OnboardingView` (welcome → language → starting point → hour → number →
  code), `MapView` (+ `Trail`), `TalkView`, `ThingsView`, `CardsView`,
  `DoneView`, `SettingsView`, `Components.swift`.
- `VoiceClient.swift` (phase, engine enum, protocol, factory),
  `ElevenVoiceClient.swift`.
- `Fonts/` Baloo 2 (ExtraBold, SemiBold) + Quicksand (Medium, Bold), Google
  Fonts static TTFs; PostScript names in `Skin.candy`.

## Build, run, check

```bash
cd apps/dolly && xcodegen generate                      # after adding files or editing project.yml
xcodebuild -project Dolly.xcodeproj -scheme Dolly -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath <dd> build                            # must say BUILD SUCCEEDED
xcrun simctl install <udid> <dd>/Build/Products/Debug-iphonesimulator/Dolly.app
xcrun simctl privacy <udid> grant microphone com.bartdecrem.Polly   # once per sim boot, before a voice run
```

Launch hooks (simulator, `xcrun simctl launch <udid> com.bartdecrem.Polly …`;
with zsh build the arguments as an array):
- `-BackendURL http://localhost:3260` — a local dev server (the worktree's `next dev -p 3260`).
- `-TestSessionToken <value>` — sign in as the test account: the value is what
  `npx tsx scripts/dolly/e2e.ts` prints ("cookie value"). Never Bart's account.
- `-Open map|settings|talk|things|cards|done` — where to open. `talk` needs
  the day at `morning`, `things` at `after_talk`, `cards` at `after_things`:
  `scripts/dolly/e2e.ts --until talk|things|cards` leaves the test account there.
- `-VoiceDrill 1` (with `-Open talk`) — the protocol drill: session up, Dolly
  spoke, audio arrived, a clean end with the finish landing. Read the
  `DOLLY_DRILL` lines: `xcrun simctl spawn <udid> log show --start "<time>"
  --predicate 'composedMessage CONTAINS "DOLLY_"'`. The simulator mic is
  silent, so a drilled call ends with no learner turns and the day stays at
  `morning` by design; the listening side is `e2e.ts --voice`.
- `-voiceHoldToTalk 1` — the push-to-talk key (the Settings toggle's key).

The voice bridge must route the dev engine here: `bash apps/dodo-voice-bridge/run.sh`
(re-points "Dolly (dev)" at this machine; `DOLLY_ELEVEN_SPEECH_ENGINE_ID` in
`.env.local` is that engine, Vercel's is "Dolly").

Without `-TestSessionToken` a fresh install opens on onboarding; the sign-in
code goes out by iMessage for real numbers. The test phones in
`src/lib/dolly/send.ts` get no text: their code is `DOLLY_TEST_CODE` (`.env.local`
and Vercel), which is how `e2e.ts` signs in against production too.

## Ship to TestFlight

```bash
./apps/dolly/bump-build.sh            # 0.2 (33) → (34), regenerates the project; commit it
./apps/dolly/testflight/ship-via-mini.sh
```

This Mac has only Xcode 27 beta (App Store Connect refuses beta-SDK archives),
so the archive is built unsigned on the Mac mini over Tailscale
(`admin@100.95.51.98`, Xcode 26.3, folder `~/dolly-ship`), exported here with
`polly appstore m1` (this iMac M1's profile for `com.bartdecrem.Polly`; it
already carries `associated-domains`) and the ASC key `748UX45NAP`, then
`testflight/asc-submit.mjs` waits for processing, adds the build to the Testers
group and submits it for beta review. `scripts/dolly/asc.mjs info|rename|domains|profile`
are the App Store Connect chores.
