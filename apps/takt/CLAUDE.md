# Takt (iOS + Mac Catalyst)

A piano course for grown-ups: the conservatory and the club. Level 1 is the blues. **The spec is
[`BRIEF.md`](BRIEF.md)** (product principles, design tokens, layouts, the Lesson 1 step table, the
modules, milestones M0–M4); read it before any change. Started 2026-10-24.

SwiftUI + XcodeGen (`project.yml` is the source of truth, `Takt.xcodeproj` is generated and
committed). Bundle ID `com.bartdecrem.Takt`, scheme `Takt`, Team `274T5WCVD2`, iOS 17+ / Mac
Catalyst (macOS 14+) with the Mac idiom ("Optimize Interface for Mac", device family 6).
iPhone-only on iOS (no iPad). Everything runs on the device; an account on ola.cx (Dodo's shape,
since 2026-10-25, Bart's call over the brief's "no login") only syncs progress.

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
- **M3 full lesson + menu + accounts: built 2026-10-25, 0.1 (6).** All six steps run (card,
  shuffle, ramp 70→90 with KEYS at 80 and HORNS at 90, gate at 90 with 8 attempts, the payoff with
  the band out for bars 11–12), then the result screen (piano roll of the payoff chorus). A
  LESSONS menu opens the app (the band plays under it: principle 1 kept, Bart asked for a menu),
  Settings has the account, level trims, MIDI inputs, theme, reset, credits. Progress and the
  brief's SkillModel records live in `ProgressStore` (a JSON file, not SwiftData: it is also what
  the account syncs). Verified: `-LessonCheck` 49/49 (12 new whole-lesson cases), autoplay through
  the payoff to the result on the simulator, screenshots of every screen. Not yet: the M3
  acceptance by hand with a real MIDI keyboard.
- **M4 ship: built 2026-10-25, 0.1 (7)** (installed on the iPhone Air over Wi-Fi, no cable, and
  on this Mac). **Export MIDI** on the result screen (Mac: save panel and ⌘E, default name
  `Takt A1 Chorus 01.mid`, numbered per lesson; iOS: share sheet): `Export/MIDIFile.swift`
  writes SMF type 0, one track, 480 ppq, the payoff's tempo, 4/4, the notes as played (velocity
  and held length, not quantized), the end of track on bar 13, so the clip is exactly the chorus.
  **Play it back** replays the chorus from the top with the band (out for bars 11–12 again) and
  your notes scheduled on the monitor, with a playhead on the roll. **Calibration**
  (`Lesson/Calibration.swift`, `Menu/CalibrationScreen.swift`): before the first lesson (Skip is
  offered) and from Settings → Input → Timing. **Accessibility:** Dynamic Type checked at
  accessibility-XL on every screen; mono data labels stop growing at 1.35x (they label fixed
  boxes), body text scales fully; VoiceOver labels on the new controls; Reduce Motion steps the
  playback playhead by beat. Esc leaves the lesson. Verified: `-LessonCheck` 66/66 (17 new), the
  exported file read back by mido and by Apple's MusicSequence (`scripts/midicheck.swift`: 90
  bpm, 4/4, 48 beats, C on 1.1, F on 5.1, G on 9.1), calibration through real MIDI on the Mac
  (eight taps at -23 ms read -23.0), the offset applied live (a 30 ms-late setup: +30 and +60 ms
  played read +0.3 and +30.5), Play it back on the simulator. **Not yet:** dropping the file into
  Ableton by hand (Live 12 is on the MacBook Air; mido and MusicSequence agree), and TestFlight (see
  below: the ASC app record and the mini).

- **Streak, quizzes, map, daily text: built 2026-10-25, 0.1 (8).** Two tabs at the bottom of the
  menu, **Lessons** and **Map** (`Menu/MapScreen.swift`: Level 1 as a winding path; lessons are
  squares, quizzes circles; done filled, "you are here" in `signal`, locked dashed; A3, Q2, A4 are
  placeholders in `LessonEntry.path`). **Streak:** a day counts when you practice (a judged chorus
  or a finished quiz); `ProgressStore.Snapshot.days` (local dates, synced, merged as a union);
  the menu's Today card shows it with the last seven days as LEDs and today's challenge with one
  Start. **Quizzes** (`Quiz/Quiz.swift`, `Menu/QuizScreen.swift`), a second content type beside
  lessons (`LessonEntry.kind`, Q1 "Ear and Form"): the first time, a 5-question ear check (2
  theory, 3 listening, easy to hard) sets `QuizLevel` (new / ear / theory / both: how hard the
  daily ones start); after it, **today's challenge** rotates by day of year — major or minor,
  the 12-bar form, higher or lower, a clean chorus of A1 — the same rule as the daily text
  (`challengeFor` in `src/lib/takt/daily.ts`). A daily five is seeded by the date; questions you
  missed come back first (a Leitner box per question in `Snapshot.quiz.boxes`). Listening
  questions play real chords on the piano monitor (`Player.play(_:)`); the band pauses for a quiz
  and comes back as it was. Every answer gets one line of why; right in `signal`, a wrong pick
  struck through (never red/green). **Settings → Sound → Band on the menu** (`menuMusic`, on by
  default): off, the app opens quiet and the band plays only in a lesson. **Settings → Daily
  text:** phone, a code texted by iMessage, verify, on/off, the hour (see "Daily text" below).
  Checks: `-LessonCheck` 91/91 (streak, merge, old snapshots, the ear check's levels, the daily
  picks, the challenge rotation, the session). DEBUG: `-Route quiz [-QuizAnswers 1,0,1]`,
  `-Route map`, `-DailyPhone <n> / -DailyCode <c>` (against `TAKT_IMESSAGE_DRY=1 pnpm exec next
  dev -p 3270` and `-Backend http://localhost:3270`). Over plain-http localhost the session cookie
  doesn't persist, so every simulator launch is a new guest: delete them after. When a
  simulator run is done, `xcrun simctl terminate <device> com.bartdecrem.Takt`: a Takt left
  running in a booted simulator keeps the band playing through the Mac's speakers (2026-10-26).

- **Ear Trainer (E1): built 2026-10-25, 0.1 (9).** An endless game beside A1 on the menu
  (`Quiz/EarGame.swift`, `Menu/EarGameScreen.swift`, `LessonEntry.kind == .game`): a chord
  plays, you name its quality, the next comes by itself (1.1 s; 3 s after a miss, which shows
  the right one, says what to listen for and plays it again). Seven levels: major or minor on
  C/F/G → any key → inversions → broken (arpeggiated) → plus dominant 7 → plus diminished and
  augmented → major 7 / minor 7 / dominant 7 in any voicing. 8 right of your last 10 at a level
  opens the next (the meter); points 10 × level × combo (×2 from 3 in a row, up to ×4); a miss
  resets the combo; no game over. Opened levels stay playable (the chips). `Snapshot.ear`
  (highest level, best run, answers; merged by max). Ten answers in a session count as a day
  for the streak. DEBUG `-Route eargame [-EarLevel n] [-EarAnswers r,r,w]`. Checks: 11 cases in
  `-LessonCheck` (every chord's pitch classes at every level, voicing range, no repeats,
  inversions, the level-up rule, scoring, the top level, merge): 102/102.

- **Intervals (E2): built 2026-10-25, 0.1 (10).** A peer of the Ear Trainer, not a mode or more
  levels of it: a different skill (distance, not color), its own ladder and best, one row per
  skill on the menu and the map. Same engine (`EarGame.Kind` chords | intervals), screen, meter,
  8-of-10 rule and scoring. Levels: fourth or fifth (named "Fourth (IV)" / "Fifth (V)", the steps
  from I to IV and V) → + octave → + thirds → going down too → sixths → half/whole step and
  the tritone → both notes at once. After a miss: a song that starts with it (Here Comes the
  Bride, Twinkle Twinkle…). `Snapshot.intervals`. DEBUG `-EarKind intervals`. `-LessonCheck`
  110/110.

- **Song list and app icon: 0.1 (11), 2026-10-25.** Intervals has a "Hum it first" sheet (the
  music-note button top right; DEBUG `-EarInfo YES` opens it): five songs whose first leap is the
  interval (`EarGame.songs`: Happy Birthday, When the Saints, Here Comes the Bride, Twinkle
  Twinkle, Somewhere Over the Rainbow), each row playing it up from middle C. The app icon is the
  start-repeat sign, dark version (`branding/icon/`: the spec, the SVGs, and `render.cjs`, which
  writes the iOS 1024 and the Mac sizes, rounded 824 body, no staff at ≤32 px, into
  `AppIcon.appiconset`; run `node apps/takt/branding/icon/render.cjs apps/takt/branding/icon/svg/takt-icon-dark.svg
  apps/takt/Takt/Assets.xcassets/AppIcon.appiconset` from the repo root with sharp installed).

- **Calibration is a timing dial: 0.1 (12), 2026-10-26.** Bart couldn't read the 12-square
  screen, so it became a tuner for timing (`Lesson/Calibration.swift`, `Menu/CalibrationScreen.swift`):
  a click every beat at 90 until you leave (the Player keeps 8 clicks queued ahead), one bar of
  count-in, and a needle on a ±80 ms dial that swings to each tap **with the saved correction
  already applied** (Bart's call: the measured latency is the starting point, so centered = the
  correction is right). Faint marks = the last 8 taps, the thick blue mark = their median; once
  8 taps are steady (median absolute deviation ≤ 40 ms) and lean ≥ 6 ms (on-time band ±20 ms; all three doubled for students the same day), Use this saves
  base + lean (clamped ±150 ms) and the taps start over from the new value. Done/Skip/Back just
  leave. DEBUG: `-Route calibrate -Calibrate 1 -CalibrateTapsEarly <ms>` taps that early (raw)
  on every click. Checks 115/115.
  **0.1 (14), same day, after Bart tapped ~20 runs and never saw a hit:** green hits
  (`Palette.good`, taps within ±25 ms), the needle follows the mean of the last 4 taps, the
  average is the middle half of the last 12 (interquartile mean), and Use this needs a lean of
  ≥ 15 ms: a hand's taps scatter 20–30 ms, so the old 8-tap median wandered ~10 ms and kept
  offering 6 ms "corrections" that were noise. Every counted tap goes to the log (notice) and
  to `Documents/calibration-taps.csv` in the app container
  (`~/Library/Containers/com.bartdecrem.Takt/Data/Documents/` on the Mac): time, click, raw,
  corrected, base. Read that before guessing again. Checks 118/118.
  **0.1 (15):** Bart's first logged run (68 taps on the Mac with a MIDI keyboard): raw mean
  −98.5 ms, median −97.9, SD 25 ms, drifting −60 → −120 → −100 over the run. That is a normal
  hand; the math was right, the ±25 ms band was stricter than the lessons. The green band is now
  the lessons' own window at 90 (`ScoringRules.windowMs`, then ±45 ms, ±80 since 0.1 (17); green on the dial = a hit in a
  lesson), the dial reads ±100 ms. At his saved −97.8 ms, 62 of those 68 taps are green.

- **Count-in and the note needle: 0.1 (18), 2026-10-26.** Settings → Sound → Count-in (on by
  default, `@AppStorage("countIn")`): Play from the top of a lesson sends `.countIn(beats: 4)`
  before `.play`, so the transport starts at tick −4 beats with a click on each (the band's
  events start at 0, so it comes in on bar 1); the footer reads "Count-in 1–4"; resuming from a
  pause doesn't count in. Headless `-Silent` runs skip it unless `-countIn YES`. The needle
  (`Lesson/NoteNeedle.swift`) is the last note, live: `LessonEngine.markPress` matches each press
  to the nearest expected note within half a beat (right pitch class: hit / rushed / dragged by
  the window; another note: wrong), `markMisses` marks a note whose half beat passed unplayed
  while the player is playing (a press in the last 2 bars). Scale ± twice the window, green the
  middle half, yellow rushed/dragged, red missed/wrong (`Palette.good/warn/bad`). Mac: in the
  coach column above Last chorus with a word ("On time", "A bit early", "Rushed", "Missed");
  iPhone: the meter alone beside the coach line. Checks 121/121.

- **Steps hand over with Lesson complete and an intro: 0.1 (19), 2026-10-26.** Bart passed step
  3 without knowing what came next ("WHERE IS MY STEP 4"). The app's engine is now `gated`
  (`LessonEngine(gated:)`; the checks and DEBUG autoplay stay ungated): every play step opens on
  an intro in the pads' place (`Lesson/StepPanel.swift`: title, the step's new `about` text from
  the lesson JSON, a left-hand diagram with the fingers it uses and a legend) and scores nothing
  until Start; a passed step shows **Lesson complete** with the next step's intro under it and
  "Start <next>" (or Next for a card). Start restarts the band from the top with the count-in
  (`Player.beginStep` / `nextStep`). Pattern notes carry a `finger` (A1: root 5, fifth 1), and
  the keyboard shows the current bar's keys with numbered finger badges. DEBUG `-Step n`
  opens step n's intro, `-StepComplete 1` shows Lesson complete. Checks 126/126.
  **0.1 (20):** a lesson in progress resumes at the step it reached (`Player.init` →
  `restartLesson(at:)` from `progress.lesson(code).reachedStep`; before, the record only fed the
  menu label and every launch started A1 at step 1), and every step change goes through
  `Player.publish()`, which writes `progress.reached` (the card's Continue used to skip it, so
  step 3 was never recorded). Verify resume on the simulator with `-ProgressFile`: the Mac build
  is sandboxed and silently can't read a file outside its container, so it shows step 1 there.

- **Modules and lessons: 0.1 (21), 2026-10-26.** The words the player sees are **Module** (a
  skill area, 5–8 lessons) and **Lesson** (one sitting, one goal); "step" never appears in the
  UI. `lesson-A1.json` is the *Blues Progressions* module: its `module` block, `lessons` (title,
  skill, goal, the engine step ids each covers: Roots on the 1 = roots + the name-it card, The
  shuffle, Pick up speed = ramp, Hold it at 90 = gate, The payoff) and `later` (locked rows for
  what isn't built). The Swift `Lesson` type is still the module file; a user-facing lesson is
  `Lesson.LessonSpec` (`lessonIndex(ofStep:)`, `firstStep(ofLesson:)`,
  `lessonsDone(reachedStep:)` for records from before). The engine still runs steps; gated, a
  passed step hands over by lesson (`handOver`): a closing card folds into Lesson complete, the
  next lesson's intro (title, goal, about, fingers) sits under it, and Start begins it from the
  top. Screens: the Learn tab (`LessonsScreen`: Today, Modules = `ModuleCard`, Drills = E1 E2
  Q1), `Menu/ModuleScreen.swift` (the lesson list with ✓ / ▶ / locked, one Start button; back
  from a lesson lands here), the lesson header "The shuffle · Blues Progressions · 2 of 5".
  Progress: `LessonRecord.lessonsDone` (custom decoding, merged by max; `Player.lessonsDone`
  = max of it and the derivation) drives resume, the menu and the map. DEBUG `-Route module`,
  `-Lesson n` (open lesson n's intro). The daily challenge text says "your blues lesson".
  Checks 128/128.
  **0.1 (23), same night:** the shuffle is a **chord**: root and fifth together on the 1 and
  again on the 3 (Bart: "that's how a musician plays"), four pattern notes a bar in shuffle,
  ramp, gate and payoff (48 expected notes a chorus, the exported loop has 48). Every note of
  the chord is required; `ExpectedNote.chord` widens its window by `ScoringRules.chordWindow`
  (1.5×: ±150 at 70, ±120 above). The scorer's association window now takes the nearest
  expected notes at *other* ticks as neighbors (same-tick chord notes made it 0, so nothing
  matched). `Output.nowNotes` / `nextNotes` light every key of the chord; the finger legend
  lists all its beats. Checks 135/135.
  **0.1 (24):** Bart's first logged chorus (`Documents/lesson-log.txt` in the container, written
  by `Player.dump` on every scored press and verdict: note, tick, bar/beat, epoch, step, the
  keys lit, then the verdict with every expected note's mark) showed him hitting the chord on
  the 1 and holding it, 20–76 ms late, correct chords in every bar; the lesson wanted it again
  on the 3, so every bar read "missed". The shuffle is now **the chord on the 1, held** (two
  pattern notes a bar, 24 a chorus; the exported loop has 24). Note length is never scored,
  only onsets. Read that log before guessing about a real session. Checks 136/136.

- **Ear Training module: 0.1 (25), 2026-10-26.** The three drills are one module with three
  lessons (`LessonEntry.ear` / `earLessons`: Chords = E1, Intervals = E2, Ear and form = Q1;
  `EarModuleScreen` / `EarModuleCard` in `Menu/ModuleScreen.swift`, route `.earModule`, DEBUG
  `-Route earmodule`). All three stay open; a game lesson is done at its top level, the quiz
  once it has placed you (`AppModel.earLessonDone`); the first not done is next. The Drills
  section is gone; the map shows the two modules and the locked M2.

- **Scales module and the taste setting: 0.1 (26), 2026-10-26.** `lesson-S1.json` (C major)
  and `lesson-S1m.json` (A minor), generated from one template (the Python in the session; the
  files are the source now): right hand, one octave, over the blues band's drums alone
  (`channels` lists only drums; the Player mutes band channels a module doesn't list). Three
  lessons at 60: Up (a note a beat, thumb under after 3), Down (middle finger over the thumb),
  Up and down (eighths, 15 notes), then three "coming" rows (two octaves, the left hand, the
  blues scale). Content model: a pattern note takes `semitones` instead of `tone`, and `bar`
  inside the step's `cycle` (4 bars here: two of notes, two of rest); a step's `hand: right`
  flips the intro's hand drawing; a run of more than four notes shows its fingering row
  (`StepInfo.fingering`) instead of the finger legend. Settings → Taste → **Prefer minor keys**
  (`preferMinor`, off) picks the A minor file: `AppModel.module("S")`, cache dropped by
  `tasteChanged()`. The Player switches modules on the same band (`switchModule(to:)`, resumes
  by lessons done); `AppModel.openModule` / `start(module:lesson:)` / `currentModule` drive the
  module screen and cards by entry code ("A1", "S"); progress is keyed by content code (S1 and
  S1m separately). DEBUG `-Module S`, `-preferMinor YES`. Checks 142/142.
  **0.1 (27), 2026-10-27:** Bart couldn't read a scale as a 12-bar chord grid with blank rest
  bars ("the two higher scales are not shown"). A scale step (any step with a `cycle`) now draws
  `Lesson/RunPanel.swift` in the pads' place: the run as a row of note tiles (behind you dimmed,
  now `signal`, next `cue`), the crossings as an arrow under the row ("Thumb under" on 3 → 1 up,
  "Middle over" on 1 → 3 down; `LessonState.Run.crossing`), a Now / Next readout with the finger
  name and the crossing as the hint, and the right hand with the finger down filled and the next
  one outlined (`HandDiagram.next`). The hold bar reads "Hold A4 · Keep it down / Next A3 · From
  the top". The engine publishes `Output.nowIndex` (the Player's `runState()` maps it into the
  run) and numbers every key of a run on the keyboard, and the keyboard's range follows the run
  (`Run.keyboard`: the iPhone shows F3–B4 for A minor). The footer counts "Run 2 of 4". The
  cycle is 3 bars (8 notes up, one bar of hold, four runs a chorus; up and down = 60 notes a
  chorus); `key` ("A minor") in the module file names the run. Checks 150/150.
  **0.1 (28), same morning, Bart: "autistic, not artistic", declutter:** no Now/Next block,
  no meter. The run is a **staircase** (`Staircase` in `RunPanel.swift`: one step per note,
  raised by pitch, so up climbs, down descends and up-and-down is a hill; letters only, no
  octave numbers; the finger badge when a step is ≥ 34 pt wide; faint risers; the crossing
  arrow under the pair). Under it a drawn **hand** (`HandView`: palm, four fingers, the thumb
  growing out of the palm's side; every finger numbered; the finger that's down filled `signal`,
  the next outlined `cue`; `tuck` folds the thumb in under the palm as a dashed ghost, sprung),
  placed by centers in a fixed 240 × 200 space and scaled to fit, since offsets in a ZStack
  pushed it out of the panel twice. The last note on a scale lesson is **one dot** (`NoteDot`,
  pops on every note) beside the coach line (iPhone) or under the staff lines (Mac). The Mac's
  pads area is only ~350 pt tall at the minimum window: staircase 124 + the hand takes the rest.
  **0.1 (29):** Up and down is one note a beat over four bars (15 notes, the last beat free,
  three runs a chorus), no eighths: at 60 they were two notes a second, and straight eighths
  (tick 6) against the drums' shuffle (late eighth at tick 8) read as dragged for anyone
  following the swing. Bart: "it should be slow for that lesson".

## Code map (`Takt/`)

- `App/AppModel.swift`: the route (lessons / lesson / result / settings; screens switch without
  animation), the lesson catalog (A1, A2 stub). `Menu/`: `LessonsScreen` (the menu, with the band's
  strip), `SettingsScreen`, `ResultScreen` (+ `PianoRoll`). `Progress/ProgressStore.swift`: lesson
  records and skill records, `progress.json` in Application Support. `Account/AccountStore.swift`:
  guest → sign up / log in against `/api/takt/*`, progress pull (merge) and push.
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
- `Export/MIDIFile.swift`: the SMF writer (and a reader, for the checks). `ResultScreen`'s
  `MIDIExport` names and writes the file; `MIDIDocument` is the Mac save panel's document.
- `Lesson/Calibration.swift` (pure: clicks, taps, the median) and `Menu/CalibrationScreen.swift`.
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

- **Sounds (since 0.1 (5), 2026-10-25):** real recordings, no synthesis. Piano (monitor and
  KEYS): the VCSL Knight upright, whole-tone roots x 2 velocity layers; HORNS: two VCSL tenor
  saxes (staccato, held notes as `saxLong`); BASS: FreePats Finger Bass YR (E1..D#2, lines sit
  low); DRUMS: MuldjordKit (CC BY 4.0, credit in `Licenses/README.md`) with velocity layers and
  round robins, plus a VCSL hat foot chick. `scripts/sounds-fetch.sh <dir>` downloads the sources,
  `scripts/sounds.py <dir>` (numpy + soundfile in a scratch venv) cuts them into `Sounds/*.caf`
  (ALAC, onset-trimmed so hits fire on their frame) and `Sounds/instruments.json`.
  `Audio/Instrument.swift` picks a sample per note and velocity (nearest root, softest layer
  covering the velocity, round robin). Samples sit in memory as Int16 (~100 MB RSS on the Mac).
  An `AVAudioUnitReverb` (medium room, 12% wet) sits between the source and the mixer; `-RecordTo`
  taps after it.
- **Band:** `scripts/band.py` writes a four-chorus Chicago shuffle (`bars: 48`; the lesson, pads
  and snapshot count choruses of the 12-bar `form`, `BandData.chorusBars`): cross-stick into
  snare, hat into ride, ghost notes, a crash on each top, a different fill into every chorus;
  the bass's R-3-5-6 / b7-6-5-3 line with a walk into C; piano stabs, licks, Spann triplets and the
  descending turnaround; two-tenor stabs and riffs. Velocities humanized from a seed, timing on the grid.
- **Mix:** per-sound `gainDb` in the band JSON, channel faders in `BandRenderer.mix` (set from
  solo renders: drums -27, bass -28, keys -30, horns -31 dB RMS), master 0.72, a soft knee above
  0.8. The full band at 80 bpm peaks around -2.5 dBFS, RMS -23.
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

## Accounts (since 2026-10-25)

Dodo's approach in tables of its own: `takt_users` (email, bcrypt hash, `is_guest`) and
`takt_progress` (the ProgressStore snapshot as jsonb), schema `apps/takt/schema/001_takt_accounts.sql`
(apply with `supabase db query --linked -f …`), in the F2 Supabase project. Routes
`src/app/api/takt/auth/{guest,signup,login,logout,me}` and `progress` (GET/PUT), library
`src/lib/takt/auth.ts`; the cookie `takt_session` is signed with `F2_SESSION_SECRET` under a
`takt.` prefix (no new secret; a Dodo cookie never opens Takt). First launch makes a guest; sign
up claims it in place; log in pulls the account's progress and merges (furthest step, best tempo,
the skill record with more attempts). Unreachable server: the error shows, everything local works.
DEBUG: `-Offline 1` skips every call, `-Backend <url>` points at a dev server.

**Daily text** (2026-10-25). One iMessage a day at the user's hour in their zone, through Dodo's
sender (`sendIMessage`, imsghttp on the mini), skipped when today is already in the progress
snapshot's `days`. Schema `apps/takt/schema/002_takt_daily.sql` (phone, verification code,
`daily_enabled/hour/tz`, `daily_sent_on` on `takt_users`). Routes, all on the session cookie, guests
included: `GET/PUT /api/takt/daily` → `{phone, verified, enabled, hour, tz}`; `POST
/api/takt/daily/phone {phone}` (E.164, US default; texts "Takt code: 1234", 10 min, one per 60 s,
502 on a failed send with the code kept) → `{phone, verified:false}`; `POST /api/takt/daily/verify
{code}`; `DELETE /api/takt/daily/phone`. Hourly cron `/api/takt/daily/tick` (Bearer `CRON_SECRET`;
`?now=`, `?force=1&user=<id>`, `&dry=1`). The pure parts (streak, text, the shared challenge
rotation `challengeFor(date, tz)` = `(dayOfYear - 1) % 4`, due check) are `src/lib/takt/daily.ts`,
the DB/send side `daily-send.ts`. `TAKT_IMESSAGE_DRY=1` makes the sender log instead of texting.
Check: `TAKT_IMESSAGE_DRY=1 pnpm exec next dev -p 3270`, then `npx tsx scripts/takt/daily-check.ts`
(pure tests + a throwaway guest through every route and the tick, deleted afterwards;
`SKIP_LIVE=1` for the pure part only).

## Lesson engine and scoring (M2, M3)

The rules are the brief's §4 "clean chorus", in `ScoringRules`: ≥ 90% of the expected notes hit
(the right pitch class, any octave C2–C5, inside ±100 ms at ≤ 80 bpm, ±80 ms above (±60 / ±45 until 2026-10-26)), ≤ 2 extra
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

**Steps 2–6 (M3)**, in `LessonEngine` (its header has the rules): a step that passes on a downbeat
hands over at once (the next chorus is the next step's; the passed line holds two bars, then the
intro two). The card scores nothing; Continue starts the next step with the next chorus. The ramp
raises the tempo after each clean chorus (it lands on bar 2: the renderer applies tempo on a
downbeat), unlocks channels as the tempo reaches them, and passes at 90. The chorus a lesson tempo
change lands in is judged at its ending tempo (otherwise the hand-over to the gate wasted one).
The gate holds after `maxAttempts` judged choruses ("Pick it up tomorrow."). The payoff sends the
renderer `.silence(from:to:)` for bars 11–12 of its chorus (sample-accurate, cleared by Stop; a
silent chorus arms the next) and any played chorus finishes the lesson. The Player carries out
the engine's actions (tempo, unmute, silence) and scores presses only on the lesson screen.
DEBUG: `-Step <n>` and Debug → Jump to Step start at a step; `-Route lesson` opens the lesson.

**Calibration (M4):** a press is scored against the beat as heard, so a player who lines up the
sound of their own note with the band presses early by the monitor latency (~23 ms on this Mac,
a third of the window). Calibration stops the band, mutes it and plays a cross-stick (`.click`,
on the monitor's bus so mutes don't silence it) at 90: four clicks to listen, eight to tap. The
median tap offset (taps over 150 ms off don't count; 6 of 8 needed; clamped to ±80 ms) goes to
`UserDefaults` `inputOffsetMs` (`calibrated` = done or skipped), and `Player.score` moves every
scored press (and release) by minus it. Autoplay's presses are exact and skip the shift. The
band comes back as it was. DEBUG: `-Route calibrate -Calibrate 1` starts it,
`-CalibrateTapsEarly <ms>` taps for you; `scripts/midiplay.swift <clock> taps:<ms,...>` taps
over real MIDI. Launch arguments can't start with a minus: `-inputOffsetMs 30` (a late setup)
works, `-inputOffsetMs -23` doesn't. Test runs write the app's real defaults (same bundle id):
`defaults delete com.bartdecrem.Takt inputOffsetMs` afterwards.

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

`audiocheck` prints levels and matches every kick against the band data and tempo program. With the sampled kit (2026-10-25): 214/214 kicks over a 70 → 90
change, max deviation 2.4 ms, the same kick within 0.5 ms across loops (the detector reads real
kick tails under hats and room; the 909 read 0.05 ms). Results
on 2026-10-24 (909 kit): 5 min at 70 bpm, 217/217 kicks, max deviation 0.05 ms, drift 0.0001 ms/min, the
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
against scripted players (`App/LessonCheck.swift`, 66 cases; since M4 the exported MIDI file and calibration; since M3 the whole lesson too, with a
stand-in renderer that applies tempo on the next downbeat: steps 1–6 in order, the ramp, the
unlocks, the gate's 8 attempts, the payoff's silence and re-arm, the card, a slowed ramp; and the windows at 70, 80 and 90, misses,
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

## Exported MIDI

`-LessonCheck 1 -ExportTo <file.mid>` writes the whole-lesson check's payoff chorus to a file.
`swiftc -O scripts/midicheck.swift -o build/midicheck && build/midicheck <file.mid>` reads it with
Apple's MusicSequence and prints tempo, time signature, length in bars and every note by bar.beat.
DEBUG `-PlayBackOnFinish 1` starts Play it back 1.5 s after the lesson finishes (with
`-Step 6 -Autoplay perfect`).

## TestFlight

`testflight/ship-via-mini.sh ios|mac`: archive unsigned (on the Mac mini from the iMac, whose
Xcode 27 beta ASC rejects; `MINI=local` on the MacBook Air, which has Xcode 26.2), export and
upload here, then `testflight/asc-submit.mjs` waits for
processing and adds the build to every beta group. Set up 2026-10-25: bundle id registered
(`HSR9TXP4B3`), profiles `takt appstore` (IOS_APP_STORE) and `takt catalyst appstore`
(MAC_CATALYST_APP_STORE) minted with `apps/feynd/testflight/mint-profile.mjs` against the
Apple Distribution cert whose key is in the MacBook Air's keychain (serial `16F68C26…`; ASC lists
three, only that one signs here). A local Release archive exports to a signed App Store
`Takt.ipa` with it. **First upload 2026-10-25:** 0.1 (7) from the MacBook Air, app "Takt Keys
Tutor" (ASC id 6826824040), internal group "Internal" (all builds, tester kurona@mac.com = Bart).
**Mac:** the Catalyst build is sandboxed (`Takt/Takt-Mac.entitlements`, macOS SDK only: sandbox,
network client, user-selected files; CoreMIDI and playback need nothing more; checked on the Air:
audio, MIDI from a virtual source and the ola.cx account all work sandboxed). The iMac ships it
(`TAKT_PROFILE="takt catalyst appstore imac" ASC_KEY_ID=5A5HNSWA33`, profile against its
Apple Distribution cert `0DDCC75F…`), archiving on the mini at 171.66.240.175. Formerly blocked: for `mac`, the MacBook Air has no "3rd Party Mac Developer Installer" identity in the keychain (ASC has
three MAC_INSTALLER_DISTRIBUTION certs, so their keys live on another Mac).
