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
method), `ttd08 minimal ii` (128, F minor — the authored set: swing, sidechain duck
bus, dub-delay bus the player's tick taps feed, 3-against-4 polymeter chart
with velocities; exact port of reference/tap-tap-dodo-minimal-ii.html),
`ttd04 gabber` (180, distorted kicks — unlocked by S-ranking any other
set). Daily set = shared seed from yyyymmdd, rotating over the non-gabber
sets.

## The engine matches WebAudio — keep it that way

The synth was A/B'd against Chromium's WebAudio until solo voices sit within
~1.5 dB and the full minimal-ii mix within ±0.6 dB RMS per second. What that
took (all in `Audio/`): polyBLEP band-limited oscillators (naive squares
alias); Blink's exact lowpass/highpass design (WebAudio Q for those types is
resonance in dB — the RBJ version was measurably wrong); WebAudio's
mono→stereo unity upmix (equal-power panning centered voices is −3 dB);
independent noise streams per clap burst (a summed envelope on one stream is
+4.5 dB coherent); WebAudio oscillator start phases (saw begins at value 0);
and a compressor modeled on MEASURED DynamicsCompressor behavior — static
curves per config, τ≈50 ms release from a −5 dB idle, fast attack, 6 ms
lookahead (`Compressor` in SynthSupport.swift, tables inside). MixCore.swift
is the whole mix path (buses/delay/duck/pan/compressor) and compiles on
macOS, so offline A/B harnesses exercise exactly what ships. Ground truth
comes from OfflineAudioContext renders driven through Playwright — the
method lives in the 2026-08-09 session's scratchpad harnesses; rebuild from
this description if needed.

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

## In-game pause button

During a run a small "‖" glyph (two `SKShapeNode` bars) sits top-center on the
HUD line, between the score and combo, respecting the safe-area inset. Tapping
inside its ~44pt hit rect (`pauseButtonRect`, checked in `touchesBegan` BEFORE
lane judgment so it never eats a lane tap) calls `pauseGame()`. The paused
overlay is now two explicit skinned buttons — **resume** (`resumeGame()`) and
**exit** (`exitRun()` → `onExit` closure → `app.route = .setSelect`), hit-tested
by node `name` via `nodes(at:)`. Tap-anywhere-to-resume is gone. Backgrounding
and audio interruptions still auto-pause. `abort()` is idempotent (scheduler
stop / voice flush / conductor pause run exactly once) since exit, finish and
the view's `onDisappear` can race.

## Online track store

Tracks can live server-side and be downloaded into the app like a built-in set.

- **Track pack format v1** (`Charts/TrackPack.swift`): a JSON pack reuses a
  built-in synthesis family (`backingStyle` ∈ origin/minimal/detroit/afters/
  gabber) and a built-in skin (`skinRef`, a ttd id) but carries its own
  skeleton — bpm, bars, travel, swing, `sections` (kind + start/end bars) and
  `patternBank` (kind → `[[[offsetEighth, lane], ...], ...]`). `toTrackDef()`
  validates and converts; it fails loudly on bad fields.
- **`TrackDef`** gained `backingStyle` (defaults to an id-based mapping for the
  five built-ins) and `skinRef` (defaults to own id). `BackingComposer.plan`,
  `Skin.forTrack`, and the GameScene tap/ghost/masterGain switches all dispatch
  on `backingStyle`/`skinRef`, not raw id, so packs Just Work.
- **Composers follow `track.sections`.** Every entrance/breakdown/ghost-bar
  boundary is derived from `track.sectionRange(_:)` (not hardcoded bars), so a
  pack with a different length/layout sounds right. Built-in output is
  bit-identical to the pre-refactor code (verified by diffing event streams).
- **`Services/TrackLibrary.swift`** (`@MainActor ObservableObject`): built-ins +
  packs decoded from `Application Support/taptapdodo/tracks/*.json`. `allPlayable`,
  `byId` (used everywhere `TrackDef.byId` was), `fetchOnline()`, `download(id)`,
  `ensurePlayable(id)`. The set-select pager appends one card per online/
  downloaded track after the built-ins; fetch failure is silent (never blocks
  on network). The `TTD_AUTORUN` / deep-link path downloads an online-only
  track before starting the run.

### Backend (Next.js, this repo)

- Table `ttd_tracks (id text pk, name text, payload jsonb, created_at)` —
  `apps/taptapdodo/schema/001_ttd_tracks.sql`. Reuses the F2 Supabase env
  (`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`) via the lazy getter in
  `src/lib/ttd/supabase.ts`.
- Routes: `GET /api/ttd/tracks` (list: id/name/genreLine/bpm/bars from payload),
  `GET /api/ttd/tracks/[id]` (full payload). Base URL hardcoded in
  `TrackLibrary` as `https://hilma-nine.vercel.app`.
- Seed: `node scripts/ttd-seed-track.mjs` upserts the ttd06 "warehouse" test
  track (afters family, ttd02 skin, 127 bpm, 36 bars).

## Feel layer (polish pass, build 4)

Title dodo idles in a transparent SpriteKit scene; set-select cards preview
two bars of their peak section (`Services/PreviewPlayer.swift` — conductor
started mid-song via `start(atSongTime:)`, scheduler skips the past);
count-in plays four quiet ticks; non-perfect judgments show early/late;
menu buttons haptic-tick via `Haptics.ui()`; headphones-out auto-pauses.
`taptapdodo://sets?page=N` deep links to a specific pager card — that plus
`TTD_AUTORUN` is how every screen gets screenshot-verified headlessly.

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
