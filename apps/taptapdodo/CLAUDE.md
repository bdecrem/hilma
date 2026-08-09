# Tap Tap Dodo

Three-lane rhythm game starring a dodo. iOS 17+, iPhone only, portrait. All
music is synthesized on-device (AVAudioSourceNode render block, zero audio
files); every chart is generated from a seed, so a run is fully determined by
`(trackId, seed)`. Full design spec in [SPEC.md](SPEC.md); the two HTML
prototypes it ports live in `reference/`.

Five sets: `ttd01 origin` (126, melodic A-minor plucks — the player plays the
lead line), `ttd02 minimal` (130, percussive lanes, strobe), `ttd03 detroit`
(122, strings + swung hats), `ttd05 afters` (129, the second minimal set —
layered kick + rumble bed, sidechain pump, ghost 16ths, dub-chord echo
chains, ghost bars, one resonant filter arc; see TRACK_RECIPE.md for the
method), `ttd04 gabber` (180, distorted kicks — unlocked by S-ranking any
other set). Daily set = shared seed from yyyymmdd, rotating over the
non-gabber sets.

## Build

XcodeGen project — `project.yml` is the source of truth, the `.xcodeproj` is
generated. Bundle `com.bartdecrem.taptapdodo`, team `274T5WCVD2`.

```bash
cd apps/taptapdodo
xcodegen generate                       # after adding/removing files
xcodebuild -project TapTapDodo.xcodeproj -scheme TapTapDodo \
  -destination 'generic/platform=iOS Simulator' build       # must say BUILD SUCCEEDED
```

Device signing: no Apple ID is signed into Xcode on this machine, so
`-allowProvisioningUpdates` fails ("No Accounts"). Profiles are minted via
the App Store Connect API instead — key `~/.appstoreconnect/private_keys/
AuthKey_5A5HNSWA33.p8`, issuer ID in the taptapdodo memory file. The dev
profile "taptapdodo dev" (expires 2027-08) is installed in
`~/Library/Developer/Xcode/UserData/Provisioning Profiles/`. Signed build +
install:

```bash
xcodebuild -project TapTapDodo.xcodeproj -scheme TapTapDodo \
  -destination 'generic/platform=iOS' -derivedDataPath build-device \
  CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=taptapdodo dev" \
  "CODE_SIGN_IDENTITY=Apple Development" build
xcrun devicectl device install app --device <device-uuid> \
  build-device/Build/Products/Debug-iphoneos/TapTapDodo.app
```

## Verify behavior (not just compile)

Drive the real flow in the simulator. The app has a test hook — the
`TTD_AUTORUN` env var takes a deep link and skips the SpringBoard
open-in-app dialog:

```bash
xcrun simctl boot "iPhone 17 Pro"
xcrun simctl install "iPhone 17 Pro" <DerivedData>/.../TapTapDodo.app
SIMCTL_CHILD_TTD_AUTORUN="taptapdodo://play?track=ttd02&seed=42" \
  xcrun simctl launch --terminate-running-process "iPhone 17 Pro" com.bartdecrem.taptapdodo
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/ttd.png
```

The deterministic core (chart generator constraints, judgment windows,
scoring) and the audio DSP compile standalone on macOS — no simulator needed:

- **Logic tests:** compile `Charts/*.swift` + `Game/JudgmentEngine.swift`
  with a `main.swift` of asserts (determinism, min-gap constraints, hit
  windows, grade math). A worked harness existed in the 2026-08-08 session
  scratchpad; rebuild it in ~40 lines if needed.
- **Audio render:** the `Voice` DSP + `BackingComposer` render offline with a
  tiny shim for the `Voice` protocol (SynthEngine itself is iOS-only). Render
  each set to a float buffer and check per-second peak/RMS — silence, NaN, or
  clipping means a regression.

## Architecture notes

- `Game/Conductor.swift` owns musical time (mach host time → song seconds).
  Notes are positioned analytically from the clock every frame — never
  SKActions. Touch judgment uses `UITouch.timestamp`, not frame time.
- `Audio/SynthEngine.swift` is one AVAudioSourceNode mixing `Voice` structs
  sample-accurately against the Conductor; `BackingScheduler` feeds it with a
  25ms lookahead timer. Trigger latency for player hits is ~6ms by design.
- Calibration (Settings) stores a ±120ms offset applied in judgment only.
- Interruptions/backgrounding: `pauseGame()` freezes the conductor;
  resume realigns the host-time anchor exactly. Overlay: tap to resume.
- Scores/seeds persist as JSON in Application Support (`ScoreStore`).
