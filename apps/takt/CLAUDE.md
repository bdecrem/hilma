# Takt (iOS + Mac Catalyst)

A piano course for grown-ups: the conservatory and the club. Level 1 is the blues. **The spec is
[`BRIEF.md`](BRIEF.md)** (product principles, design tokens, layouts, the Lesson 1 step table, the
modules, milestones M0–M4); read it before any change. Started 2026-10-24.

SwiftUI + XcodeGen (`project.yml` is the source of truth, `Takt.xcodeproj` is generated and
committed). Bundle ID `com.bartdecrem.Takt`, scheme `Takt`, Team `274T5WCVD2`, iOS 17+ / Mac
Catalyst (macOS 14+) with the Mac idiom ("Optimize Interface for Mac", device family 6).
iPhone-only on iOS (no iPad). Offline, local-only, no login, no backend.

## Status

- **M0 skeleton: done 2026-10-24, 0.1 (1).** Both targets build and launch; design tokens and type
  styles in place; the lesson screen renders a fixed frame (`LessonState.preview`: A1 step 1, bar 4,
  beat 3, chorus 2) on Mac and iPhone in both themes.
- **M1 sound and input: done 2026-10-24, 0.1 (2).** The band (drums + bass; keys and horns muted
  until the lesson unlocks them) plays the C blues shuffle the moment the app opens. MIDI from any
  source, the computer keyboard and the on-screen keys play the Rhodes monitor and light the keys.
  Play/pause, stop, tempo (applied on the next downbeat, shown in `cue` until then) and mutes
  (unmute on the next downbeat) work. Verified headlessly: see "Checking the audio". Not yet driven
  by hand: the Keystation itself (it was not plugged in), and the computer-keyboard and touch input
  (no way to inject key or touch events without taking the foreground).
- **M2 step 1 playable: done 2026-10-25, 0.1 (3).** The lesson is content
  (`Content/lesson-A1.json`, all six steps); the LessonEngine runs step 1: the coach calls the
  form on each heard downbeat, the Scorer judges every chorus by the brief's rules, the verdict
  shows on bar 1 of the next chorus (and in the Mac's Last Chorus panel), and two clean
  choruses pass the gate. After that it holds ("Two clean. That's the form."); steps 2–6 are M3.
  Verified headlessly, see "Checking the lesson". Still not driven by hand: the Keystation.
- M3 (steps 2–6, ramp, unlocks, payoff, result screen, SkillModel) is next.

## Code map (`Takt/`)

- `App/TaktApp.swift`: `@main`, the theme (`@AppStorage("theme")`, `dark` default, `paper`),
  View → Paper Theme (⇧⌘L) on the Mac, and `MacWindow` (1100×720 minimum, no title text or toolbar).
- `Design/Palette.swift`: the brief's seven tokens as dynamic colors. `signal` = now, `cue` = next;
  never add a third accent, never red/green. White keys are `panel`, black keys `#0D0D0D` in both themes.
- `Design/Typography.swift`: `Font.display` (SF Pro compressed heavy), `.dataLabel()` (SF Mono,
  uppercase, +12% tracking), `.bodyText()`. Sizes go through `@ScaledMetric` with point bases,
  because the Mac idiom shrinks text styles to macOS sizes (caption = 10 pt).
- `Design/Motifs.swift`: `Hairline`, `StaffLines`, `LED`, `CornerTick` (the next mark), `GateRings`.
- `Lesson/LessonState.swift`: everything the screen draws. The views are pure functions of it;
  live, the Player builds it from the transport and the LessonEngine.
- `Lesson/Lesson.swift`: the lesson JSON (form, chords, channels and unlock tempos, steps with
  pattern, tempo, gate and coach lines) and the expected notes of a step. Bad content traps at load.
- `Lesson/Scorer.swift`: pure; one chorus of presses against the expected notes → `ChorusResult`
  (marks, extras, clean, the findings as coach sentences, "11 of 12 · 23 ms early").
- `Lesson/LessonEngine.swift`: pure, main thread; chorus bookkeeping, verdicts, gate, coach line,
  now/next keys. `Lesson/Autoplay.swift` (DEBUG): plays the step for you.
- `Lesson/LessonScreen.swift`: wide layout (regular width: Mac) and stacked layout (compact: iPhone).
- `Lesson/{TransportBar,ChannelStrip,PadGrid,CoachPanel,KeyboardStrip}.swift`: one part each.
  `KeyboardStrip` takes MIDI note bounds (C4 = 60; the Mac shows C3–B4, iPhone C3–F4) and is
  playable (one finger, slide across keys). Controls reach the views as `LessonControls` in the
  environment; a fixed frame gets the empty default and draws inert.
- `Lesson/Player.swift`: `@Observable`, polls the engine at display rate (CADisplayLink), places
  the heard position and every press on the transport, runs the LessonEngine, builds the live
  LessonState; routes MIDI, computer keyboard and touch to the monitor and the lesson.
- `Audio/TransportClock.swift`: host time ↔ heard transport tick, from an engine snapshot.
- `Audio/`: the engine (below). `MIDI/MIDIInput.swift`: CoreMIDI, UMP, every source, hot-plug.
  `Input/KeyCatcher.swift`: the computer keyboard (A = C3 … ; = E4, W E T Y U O P black keys,
  Z / X octave, Space play/pause, ↑ / ↓ tempo ±5), physical key codes.
- `Content/band-blues-C.json`: the band, written by `scripts/band.py` (12 ticks per beat; the
  shuffle's late eighth is tick 8). `Content/lesson-A1.json`: the lesson, hand-written.
  `Sounds/`: the one-shots. `Licenses/README.md`: where every sound comes from; add a row with
  any new sound.

## Audio engine (M1)

One `AVAudioSourceNode` (`Audio/AudioEngine.swift`) whose render block is `BandRenderer`: the
transport, the band, the monitor and the mixer. **This departs from the brief's "one
AVAudioUnitSampler per channel"** on purpose: a sampler can only be told to play "now" from another
thread, so every band note would land up to a buffer late (5–11 ms of jitter), and the brief's
"no audible drift" and the Scorer's ±45 ms windows want a clock that is exact. Here time is the
render frame counter; the transport maps frames to ticks through an anchor (frame, tick) and the
tempo's samples-per-tick, every event's frame is computed from the anchor (never accumulated),
and a tempo change re-anchors on a downbeat. Band events fire on their exact frame.

- **Sounds:** drums and the bass are Bart's own Jambot renders (909 kit + JB202 sub from
  `apps/ko2/out/kit`, normalized to -3 dBFS; the bass picks the nearest sub and repitches it). The
  Rhodes (monitor, KEYS) and the horns are FM voices in `Voices.swift` (`FMPatch`), not samples: no
  CC0 Rhodes worth bundling turned up, and synthesized means no license question. Swap either by
  changing `Voices.swift`; the patterns don't care.
- **Mix:** per-sound `gainDb` in the band JSON, channel faders and a -2 dB master in
  `BandRenderer.mix`/`master`, a soft knee above 0.8. Full band peaks at -2 dBFS, A1's drums + bass
  at -4.5, the monitor around -5.
- **Threads:** commands (`EngineCommand`) go in through an `OSAllocatedUnfairLock` the render thread
  only ever try-locks; state comes out as `EngineSnapshot` (fixed-size, no arrays) the same way.
  Voices live in preallocated buffers; nothing on the render thread allocates.
- **Monitor latency is constant, not minimal-with-jitter:** a live note that happened k frames into
  the buffer period before a callback starts k frames into that callback's buffer, so every note
  sounds exactly one buffer after it was played (spread measured at ≤ 1 ms, was 11 ms). The
  reference is `mach_absolute_time()` at the top of the callback; the timestamp's host time is when
  the buffer will be *heard*. Calibration (M4) can then remove one fixed number.
- **Buffer size:** iOS asks the session for 5 ms. Catalyst ignores both the session preference and
  the HAL buffer property and runs 512 frames (10.7 ms) at 48 kHz; with the constant-latency
  placement that is ~11 ms + the 12 ms output latency the session reports.
- **What's heard:** the pads, the LEDs and the lesson follow `TransportClock.position(atHost: now)`,
  which includes the output latency, so they change when a beat is heard, not when it is rendered.
- `TransportClock` turns a press's host time into the transport tick heard at that moment (logged
  for every MIDI note: `log show --predicate 'subsystem == "takt"' --info`; in zsh call
  `/usr/bin/log`, `log` is a builtin). The snapshot carries the current and the previous anchor,
  so a note played just before a tempo change (or a pause) maps exactly after the render thread
  has moved on, and an epoch that Stop bumps (ticks restart from 0).
- `.schedule(note:velocity:tick:lengthTicks:)` plays a monitor note at a transport tick,
  sample-accurately (autoplay).

## Lesson engine and scoring (M2)

The rules are the brief's §4 "clean chorus", in `ScoringRules`: ≥ 90% of the expected notes hit
(the right pitch class, any octave C2–C5, inside ±60 ms at ≤ 80 bpm, ±45 ms above), ≤ 2 extra
notes. How the Scorer reads a chorus:

- Each expected note takes the nearest press of its pitch class within its association window
  (half a beat, or half the gap to a neighboring expected note). Inside the timing window it is a
  hit; outside, early ("Rushed bar 9.") or late ("Dragged"). Offsets are in ms from the press's own
  tempo, so they are exact across a tempo change.
- Every other press is an extra: doubled, wrong (wrong pitch class near an expected note), too
  high / too low (outside C2–C5), or stray. A wrong press also marks the note it replaced.
- A chorus's presses start half a beat before its bar 1, so an early first note counts for the
  new chorus, not as an extra in the old one.
- The findings come out as coach sentences, most frequent first ("Missed bars 3 and 7.",
  "Rushed every bar.", "Extra notes in bars 2, 6 and 10."); bar lists use ranges ("bars 1–4 and 9").
- The Mac's detail line under the last chorus: hits, the lean (mean offset: "23 ms early", or
  "on the beat" / "centered" under 5 ms) and the spread when the notes scatter 10 ms or more
  ("9 of 12 · centered · ±47 ms").

The LessonEngine (main thread, pure) judges a chorus at the heard downbeat that ends it. A chorus
with no presses isn't judged; neither is one you joined after bar 1 when you weren't playing
the chorus before ("From the top." on the next bar 1). Clean choruses add up (not necessarily in
a row) and count only at the step's tempo or faster ("Clean at 60. It counts at 70."). Stop drops
the chorus in progress and keeps the count. The coach line, from the step's lines in the JSON:
the intro for the step's first two bars, then on every heard downbeat the bar before a change
"Get ready. F on the 1.", any other bar "C on the 1.", and bar 1 of a chorus the verdict on the
last one ("Clean. One more.", "Rushed bar 9. Again."). The keyboard's now key is the latest
expected note, the next key the following one when it differs.

**Calibration is not in yet (M4):** a press is scored at the moment it is made, against the beat
as heard. A player who lines up the sound of their own note with the band presses early by the
monitor latency (~23 ms on this Mac, a third of the window); calibration will measure and remove it.

**Autoplay (DEBUG):** Debug → Autoplay on the Mac, or `-Autoplay perfect|loose|sloppy|rush`.
`perfect` on the tick, `loose` ±40 ms (passes), `sloppy` ±130 ms with 12% missed, 12% wrong,
15% doubled (never clean), `rush` 75 ms early (never clean at 70). Seeded per note, so a run
repeats. The Player plans a bar ahead, schedules each press on the monitor at its tick, and hands
it to the lesson at the host time it is heard, through the same path as a key press.

## Build and run

```bash
cd apps/takt && xcodegen generate        # after adding/removing files or editing project.yml

# Simulator
xcodebuild -project Takt.xcodeproj -scheme Takt -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build

# This Mac (Catalyst, ad-hoc signed), installed as /Applications/Takt.app
xcodebuild -project Takt.xcodeproj -scheme Takt -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath build/dd CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="-" \
  AD_HOC_CODE_SIGNING_ALLOWED=YES PROVISIONING_PROFILE_SPECIFIER="" build
pkill -f "/Contents/MacOS/Takt"; rm -rf /Applications/Takt.app
cp -R build/dd/Build/Products/Debug-maccatalyst/Takt.app /Applications/Takt.app

# iPhone (automatic signing; the team wildcard profile covers it while there are no capabilities)
xcodebuild -project Takt.xcodeproj -scheme Takt -destination 'generic/platform=iOS' \
  -derivedDataPath build/dd -allowProvisioningUpdates build
xcrun devicectl device install app --device <UDID> build/dd/Build/Products/Debug-iphoneos/Takt.app
```

Always `pkill` the running Mac app before replacing it: a live process survives `rm -rf` of its bundle.

**Versioning:** run `./apps/takt/bump-build.sh` before every build that lands on a device (phone,
this Mac's /Applications, TestFlight); build number only, the marketing version moves when Bart
says so. The Mac's About Takt panel shows the version.

`ENABLE_DEBUG_DYLIB: NO` stays: the iOS 27 beta aborts the debug-dylib launch path (black screen).

## Checking the screen headlessly

`apps/takt/scripts/shots.sh [out-dir]` builds both targets and writes `iphone-{dark,paper}.png` and
`mac-{dark,paper}.png` (default `apps/takt/.shots/`, not committed). The Mac app is opened with
`open -g` (behind other windows), captured by window ID (`scripts/winid.swift`) and quit, so the
check never takes the foreground. Launch arguments: `-theme dark|paper`, `-PreviewFrame gate90` (a
fixed frame instead of the live player; `TAKT_FRAME=gate90 scripts/shots.sh`), `-TestPress <note>`
(hold a key from 1 s, through the touch path). The app plays on launch: every headless launch passes
`-Silent 1` (speakers off, everything else runs). Other live arguments: `-Tempo <bpm>`, `-Paused 1`
(band stopped; was `-AutoPlay 0` before M2), `-Autoplay <mode>`, `-ClockTo <file>`.
In zsh pass each argument as its own word (`"-Paused" "1"` or an array); a variable holding
`"-Paused 1"` is not split and the app never sees it.

## Checking the audio

Offline renders run in the simulator, faster than realtime, through the same render code (DEBUG
hook in `App/DebugHooks.swift`):

```bash
U=<simulator udid>; xcrun simctl install $U build/dd/Build/Products/Debug-iphonesimulator/Takt.app
xcrun simctl launch --console $U com.bartdecrem.Takt -RenderTo $PWD/build/audio/x.wav -RenderSeconds 300 \
  -Tempo 70 -RenderScript "0:mute=bass,0:mute=keys,0:mute=horns,0:play,10:tempo=90"
swiftc -O scripts/audiocheck.swift -o build/audiocheck
build/audiocheck build/audio/x.wav Takt/Content/band-blues-C.json 70 [10:90] [--verbose]
```

`audiocheck` prints levels and matches every kick against the band data and tempo program. Results
on 2026-10-24: 5 min at 70 bpm, 217/217 kicks, max deviation 0.05 ms, drift 0.0001 ms/min, the
same kick across 8 choruses within one frame; 70 → 90 requested at 10 s lands on the downbeat at
10.2857 s, 90 → 75 at 7 s on 8.0 s (the ~1.3 ms "deviation" after a change is the detector at the
new tempo; a steady-90 render shows the same). Render drums only for timing: the sub shares the
kick's band.

Live input on the Mac, headless: `swiftc -O scripts/vkeys.swift -o build/vkeys` makes a virtual
MIDI keyboard ("Takt Test Keys"). Open the app in the background recording itself, play into it,
check the log and the recording (`scripts/notecheck.swift`: onsets and pitch):

```bash
open -g -n build/dd/Build/Products/Debug-maccatalyst/Takt.app --args -Silent 1 -Paused 1 \
  -RecordTo $PWD/build/audio/midi.wav -RecordSeconds 8
sleep 2.5; build/vkeys 1.5 48:0:0.5 52:0.6:1.1 55:1.2:1.7 60:1.8:2.6   # note:on-s:off-s
build/notecheck build/audio/midi.wav                                    # C3 E3 G3 C4, ±4 cents
```

The app connects to the source when it appears (hot-plug), logs every note with its bar/beat, and
the recording's note spacing matches what was sent within 1 ms.

## Checking the lesson

Three layers, all headless (verified 2026-10-25).

**The rules, no audio:** `-LessonCheck 1` runs the Scorer, the LessonEngine and the TransportClock
against scripted players (`App/LessonCheck.swift`, 37 cases: the windows at 70, 80 and 90, misses,
octaves and range, wrong, doubled and extra notes, the coach line bar by bar, the now/next keys,
joining late, the gate tempo, a silent chorus, Stop, a hidden window, host time ↔ tick across a
tempo change and at Play). It prints PASS/FAIL per case and exits 1 on any failure:

```bash
xcrun simctl launch --console-pty "iPhone 17 Pro" com.bartdecrem.Takt -LessonCheck 1 | grep -E "FAIL|LessonCheck"
```

**The real input path:** `scripts/midiplay.swift` is a left hand on a virtual MIDI keyboard ("Takt
Test Keys") in time with the app: it reads the app's `-ClockTo` file and plays step 1 from the
next chorus, one chorus per offset, each packet stamped with the host time it was meant for (like
a hardware keyboard; `arrival` stamps 0 instead). The lesson log has every verdict with each note's
offset:

```bash
swiftc -O scripts/midiplay.swift -o build/midiplay
open -g -n build/dd/Build/Products/Debug-maccatalyst/Takt.app --args -Silent 1 -ClockTo $PWD/build/clock.txt
build/midiplay build/clock.txt -70,-50,30
/usr/bin/log show --last 5m --predicate 'subsystem == "takt" AND category == "lesson"' --info --style compact
```

On 2026-10-25 the three choruses read back as -70.0, -50.0 and +30.0 ms on all 12 notes: -70 not
clean ("Rushed every bar. Again."), -50 clean (1 of 2), +30 clean, gate passed.

**Autoplay, live:** `-Autoplay perfect` passes the gate at the end of chorus 2 and `-Autoplay
sloppy` never does. On 2026-10-25, Mac and simulator: perfect 12/12 at ±0.0 ms twice, gate passed;
sloppy 9, 3 and 6 of 12, not clean, with the same verdicts on both platforms as `-LessonCheck`
gives (the presses are seeded). Pictures at chosen moments: `scripts/shoot.py <clock> <dir> [--sim
"iPhone 17 Pro"] name:tick ...` captures the simulator, or the Mac window when the screen is
unlocked; the app's `-SnapshotAt "name:tick,..." -SnapshotDir <dir>` renders the Mac layout
offscreen in both themes and works with the screen locked. Ticks are absolute, 576 per chorus
(chorus 2, bar 1, beat 3 = 576 + 24).

## TestFlight

Not set up. It needs an App Store Connect app record for `com.bartdecrem.Takt` (the ASC API cannot
create apps; Bart makes it in the web UI), App Store profiles for iOS and Mac Catalyst, and the Mac
mini route, because ASC rejects archives from this iMac's Xcode 27 beta: copy
`apps/tokensurfers/testflight/ship-via-mini.sh` and `apps/feynd/testflight/` (export plists, `asc-submit.mjs`).
