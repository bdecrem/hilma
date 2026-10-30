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
  **0.1 (30):** the module's last lesson passing showed nothing (the gated hand-over only ran
  when a next step existed; Bart's two clean choruses of Up and down went to an unlit screen).
  Gated engines hand over on every pass; the last one shows **Module complete** ("That's every
  lesson in Scales. More are on the way.", only Back to the module) and records the lesson
  done. `-Step`, `-Lesson` and `-StepComplete` now apply after `-Module` (they used to hit
  A1). The intros draw the new `HandView` (`lit:` every finger the run uses) instead of the
  old HandDiagram. Checks 151/151. **Hand concepts** for the lesson hand (unlockable alt
  hands later): `https://ola.cx/takt/hands` (`src/app/takt/hands/`): Linie (hand-drawn line),
  Automat (robot), Greif (griffin's claw), Schaltplan (circuit), Bauhaus; one SVG each in the
  same 240 × 200 box with `down` / `next` / `tuck` / `lit`, playing the A minor run live.
  **0.1 (31):** all five hands are in the app (`Lesson/Hands.swift`: `HandStyle`, `HandView`
  switches drawings, `HandPicker`), **Settings → Display → Hand** (thumbnails, `@AppStorage
  "hand"`, Linie default; DEBUG `-hand greif`). Same contract everywhere: the run panel, the
  intros (`lit:`), the left hand mirrored. DEBUG `-Route settings -SettingsSection display`
  opens Settings scrolled to the picker.
  **0.1 (32), 2026-10-28, a sixth hand, Skizze** ("a hand drawn hand, very normal", no seams
  where fingers meet the palm): `SkizzeSilhouette`, one closed outline for palm, fingers and
  thumb (an animatable `fold` slides the thumb's points onto the palm's edge when it tucks),
  nails and knuckles in pencil, and the lesson's marks drawn over it: a marker capsule on the
  finger that's down, a dotted outline on the next, and on the tuck the thumb's dotted ghost
  under the palm plus the dotted arc it travels. Same on the web page. Checks 153/153.

- **Scales lessons 4–6: 0.1 (33), 2026-10-28.** Two octaves (right hand, 15 notes A3–A5 one a
  beat over four bars, thumb under twice, three runs a chorus), The left hand (one octave up from
  A2 with 5 4 3 2 1 3 2 1: the middle finger crosses *over* going up), The blues scale (A C D E♭
  E G A up and back, 1 2 3 4 1 2 3, named "A blues" by the step's `key`). Engine: `semitones`
  may be negative (the pitch class wraps), `Run.right` mirrors the crossing rules and the hand
  (`crossing(from:to:right:)`), `Run.flats` spells E♭/B♭ (`Key.letter(_:flats:)`, on when the
  run's name ends in "blues"), `Run.keyboard` widens past `keys` to hold a two-octave run (A3–A5
  on both devices, 15 white keys on the iPhone), the module's `range.high` is 84. The scales
  entry reads "Both hands · 6 lessons". Checks 158/158.

- **Play mode (jams): 0.1 (34), 2026-10-28.** Bart: "a PLAY lesson below each regular lesson…
  not BLOCKING, optional… have fun with what you just learned… these can reach a little beyond
  what was taught". A module file's `jams` (`after` = the lesson it sits under, title, skill,
  goal, `step`) point at steps of `kind: jam`, which come after the lessons' steps
  (`Lesson.lessonStepCount` is where the lessons end; the hand-over and Module complete stop
  there). A jam is scored like a play step but never passes or hands over: a clean chorus at
  its tempo counts (`Verdict.jam` = the step id, `ProgressStore.jamDone`, `LessonRecord.jamsDone`,
  merged as a union) and the band plays on; the footer reads "Play along" / "Clean × n". A step
  may name its `band` (channel keys): those channels play and show, the rest are muted and
  hidden (`Player.applyBand` on every step change; the scales' lessons list `["drums"]`, the
  module now carries all four channels). `ModuleScreen` draws a `JamRowView` under each lesson
  (note icon, "Play · after lesson n", locked until the lesson is done, ✓ once played clean);
  `AppModel.start(module:jam:)` → `Player.start(jam:)`. The header reads "Scales · Play", the
  intro "Play · after lesson n" with a Play button. Content: six scale jams at 70 over drums,
  bass and keys (First riff A C D E, Falling riff, The blue note, The jump, Walking bass in the
  left hand with the band's bass out, Blues riff with the flat five on the late eighth; C major
  equivalents in `lesson-S1.json`), five blues jams over the whole band (Root and fifth, The
  boogie 5–6, Boogie at 80 on every beat, The seventh 5-6-7-6 at 90, Walk it R-3-5-6). DEBUG:
  `-Step 7` opens the scales' first jam (`-Step 8` A1's The boogie). Checks 162/162. Known:
  `-SnapshotAt` renders an intro panel blank (ScrollView under ImageRenderer); capture the
  window instead.

- **Chords: the third finger, twice a bar, the Minor Chords module: 0.1 (35), 2026-10-28.**
  Bart: "add the third finger; then add minor chords… work the user way across all minor
  chords, one lesson at a time; then lessons that mix in more notes… 2 [chords] per bar".
  **Blues Progressions** has two lessons after the payoff: The third finger (C E G / F A C /
  G B D on the 1 with 5 3 1, at 70, whole band) and Twice a bar (the triad on the 1 and the
  3, at 80), with jams Three and a bump (triad, then root + sixth on the 3) and The stomp
  (the triad on every beat). The payoff still graduates the module (`completed`, the result,
  the map's count); `lessonsDone` counts on past it (`Player` records `lessonIndex(ofStep:
  payoff) + 1`), the module screen, the card and `status()` call it done only when every
  lesson is. **Minor Chords** (`lesson-M.json`, code M1, entry "M" after Scales on the Learn
  tab and the map): the minor blues (i iv v) in every key, one lesson a key: A E D G C F B F♯
  C♯ G♯ E♭ B♭ (white keys first), the minor triad on the 1 with 5 3 1 (`minorThird` is a
  tone now), then Two a bar (A minor, the triad on the 1 and the 3); a jam under each (the
  minor boogie: root + fifth on the 1, root + flat seventh on the 3, horns in; Four a bar
  under the last). Each key step carries its own `form` and `chords` (`Lesson.form(of:)`,
  `chords(of:)`, `formBars(of:)`; the coach, the pads and the expected notes follow the
  step) and a `transpose` for the band. **The band switches and transposes:**
  `scripts/band-minor.py` → `band-minor-A.json`, the shuffle's drums and shape with minor
  voicings (Am7 Dm7 Em7), a R b3 5 b7 bass line, a G♯ into the turnaround; the same kit and
  instruments. `BandRenderer.load(_:)` builds another band's events on the main thread
  (`Events`, kept alive, same kit and time structure required), `.band(events)` swaps them
  at the current tick, `.transpose(n)` adds semitones to every bass, keys and horns note
  (not the monitor); `AudioEngine.load(band:)` caches by name; `Player.switchModule` loads
  the module's band when it differs, every step start sends its `transpose` (0 when none).
  Verified offline (`-RenderScript "0:band=band-minor-A,0:transpose=2,…"`): the bass reads
  B D F♯ A at +2, A C E G at 0, C E G A for the shuffle. DEBUG: `-Module M -Lesson 7` is B
  minor. **Progress safety:** `-Silent` and `-Autoplay` runs no longer write progress
  (`ProgressStore.readOnly`); earlier today's headless `-Lesson n` runs had pushed Bart's
  Mac record's `reachedStep` past the lessons he'd played (repaired by hand: A1 step 5, S1m
  step 4, the M1 record removed; backup in the session scratchpad). Checks 168/168.

- **Tempo knob and theme cards: 0.1 (36), 2026-10-28.** Bart: "add a tempo knob and let me
  slow down, or speed up, and in the Coach area show a simple drawing or words explaining the
  theme of that session… like a game UI designer". `Lesson/TempoKnob.swift` replaces the
  readout in both transport bars: a 270° ring over 50–140 with the value arc (`signal`; `cue`
  while a change waits for the downbeat; `muted` below the tempo the step counts at, which is
  a tick on the ring: `Output.stepTempo`), the number inside, − / + buttons, drag up or down
  to turn it (5 bpm per 18 pt). `Lesson/ThemeCard.swift`: every lesson and jam carries a
  `theme` (glyph, title, line) in its module file; the card sits under the coach line (Mac)
  or between the coach line and the pads (iPhone), with `ThemeGlyph` drawings in a 72 × 54
  box: `steps[:n]`, `fall`, `hill`, `tuck`/`over`/`hand` (the real `HandView`), `keys:135`
  (a mini keyboard with dots on the degrees), `rock` (the thumb 5 ↔ 6), `walk`, `form` (i iv
  v over twelve bars), `alone` (11–12 hollow), `tempo`, `blue`, `bars:13` (chord stacks on
  those beats). The engine publishes the theme with the step's fingers and hand
  (`handFingers`, `rightHand`). Checks 168/168.

- **Show me (practice performance): 0.1 (37), 2026-10-28.** Bart: "a little UI item… when I
  click on it (on macOS), then I can watch a performance of the practice play, hear how it's
  supposed to sound and see the keys light up, or the hand move". `Lesson/Demo.swift` plans
  the step's expected notes from the top (a chord step: the chorus; a run: two passes of its
  cycle; each note held 0.9 of the way to the next, downbeats stronger); `Player.toggleDemo`
  restarts the band from the top (count-in and all, at the knob's tempo, so you can slow it
  down and watch), schedules every note on the monitor (`.schedule`), lights each key as it is
  heard (`pressed`), and ends with `.stop` at the last bar ("Your turn." until Play). The
  engine's cue (`LessonEngine.cue(at:)`, factored out of `update()`) lights the now/next keys,
  the fingers and the run's hand from the transport alone, so the demo works on an intro
  (the intro steps aside while it plays) before anything is scored; your own keys sound but
  score nothing during it; Stop or the button ends it. UI: the Mac transport bar has an eye
  pill "Show me" / "Watching" (`ShowMeButton`, lit `signal`) before play/stop; the phone's
  sits beside the theme card (its top bar has no room); every intro has "Show me first"
  beside Start; the footer reads "Watching". DEBUG `-Demo 1` starts it at launch. Known: on
  the phone a long intro (Two octaves) scrolls, so Start and Show me first sit below the fold;
  its 15-finger row now wraps to two rows there. Checks 175/175.

- **Stage, the game tab: 0.1 (38), 2026-10-28.** Bart: "a new game mode… in the style of
  Guitar Hero… four songs: two blues, two electronic (deep house, techno)… chords and melody
  lines… easy, medium, hard, or adaptive… streaks and points… a leaderboard… its own tab… no
  gate". A third tab, **Stage** (`Menu/StageScreen.swift`): the set list, every song open.
  **Songs** (`Takt/Content/song-*.json`, written by `scripts/songs/*.py` on `common.py`): a
  band like the lessons' plus a `song` block (title, style, key, tempo, cover glyph, sections
  by bar, the two parts). Slow Burn (slow blues in G, 68, four choruses, the lesson kit),
  Boogie Shoes (jump blues in C, 120, six choruses, walking bass, chanks on 2 and 4, the sax
  riff, a piano solo chorus), Undertow (deep house in A minor, 122, Am F Dm Em, Rhodes stabs,
  pads, a sub, the hook), Nachtschicht (techno, 130, a rumbling kick, a rolling acid line,
  rave stabs, the riff). The electronic kit and synths are rendered one-shots
  (`scripts/synths.py` → `Sounds/syn-*.caf`, registered in `instruments.json`: kick909,
  kickRumble, clap909, hat909/hatOpen909, ride909, shaker, rim909, tomSyn; sub, acid, stab (FM
  electric piano, two layers), pad (8 s at 24 kHz), lead, leadHouse, rave). **0.1 (39):** Bart: the
  deep house lead "sounds like a $5 plastic toy". Both leads are stereo voices now: detuned saw
  unison with a sub square, a resonant filter envelope, drive, a dotted-eighth delay at the
  song's tempo and a short plate baked in, a long release so the echoes ring after the key
  (`leadHouse` for Undertow: four saws, slow filter, 122; `lead` for Nachtschicht: harder,
  snapping filter, 130). Levels re-trimmed from solo renders (Undertow horns −6, Nachtschicht −10). **Parts:** every note carries
  `lv` 1–3 (easy / medium / hard: the root on the downbeats, then root and fifth, then the
  voicing and the pushes; the melody's bones, then its steps, then its ornaments); the band's
  own channel for a part is the hard chart, so the record plays it in full when you take the
  other. Your keys play the part's instrument (`monitor` per part: the record's stab or lead
  on the electronic songs, the piano on the blues). **Engine** (`Game/GameEngine.swift`,
  pure): Perfect ±45 ms (100), Good ±110 ms (60), a passed window is a miss and breaks the
  combo; a key no note wants is an extra (counted, not punished); the combo's multiplier ×2 /
  ×3 / ×4 at 8 / 16 / 32; a level pays ×1 / ×1.5 / ×2; **Adaptive** starts easy and decides
  each four-bar block two bars ahead from the four bars before that: at or over 90% hit (four
  notes judged at least) it climbs, under 60% it eases off. No failing; the song plays to the
  end; grade S / A / B / C / D by the hit rate (97 / 90 / 80 / 65); since 0.1 (53) **Accuracy**
  is hits over keys played (a wrong key costs, a note let go by doesn't). **Screen**
  (`Game/GameScreen.swift`): the HUD (score, the combo ring filling toward the next multiplier,
  pause), the section rail, the highway (a Canvas: a capsule per note in its key's lane, chords
  as stacks with finger badges, beat and bar lines sliding, 3 s of lookahead at any tempo, the
  hit line in `signal`, Perfect / Good / Miss pops, the bar's chord and the next by the line),
  the playable keyboard spanning the part. The result takes the highway's place: the grade,
  the score, the counts, the song's board with the run lit, Play again / Set list.
  **Audio:** `BandRenderer.load` now builds a whole band (kit, instruments, monitor, length;
  `SampledInstrument.shared` keeps one of each by name) and `.band` swaps all of it, so a song
  with its own kit and a synth for your keys plays on the same clock; the song's form is the
  whole song plus a silent tail bar the game ends in. A band's `levels` (bass, keys, horns, in
  dB) balance a song's synths the way sounds carry `gainDb`; your keys take the part's level
  (`levels["monitor"]`, set by `AudioEngine.load(song:part:)`). Set from solo renders against
  the blues band (drums −28, bass −29, keys −30, horns −28.5 dBFS RMS; `-RenderScript
  "0:band=song-undertow,0:mute=bass,…"`): the two electronic songs sit at −19 dBFS RMS, peak
  −5.5, no clipping, the blues at −23. `-Mutes drums,bass,horns` with `-Route game` records
  your part alone. `Player.startGame / endGame /
  restartGame`, `gameState()`; Stop restarts the song, Esc or Back leaves to the set list and
  the lesson's band comes back. **Board:** `ProgressStore.ScoreRecord` (`Snapshot.scores`, the
  best 50 a song, merged as a union by id, synced with the account); a run counts as a day.
  DEBUG: `-Route stage`, `-Route game -Song song-undertow -Part melody -Difficulty hard
  [-Autoplay perfect|loose|rush]`, `-SnapshotAt "…,result:0"` renders the result when the run
  ends, `-RenderScript "0:band=song-nachtschicht,0:play"` renders a song offline. Checks
  189/189 (the four songs load and hold together, judging, combo, extras, adaptive up and down,
  the board's trim).

- **The Berlin sketches on the Stage: 0.1 (40), 2026-10-28.** Bart: "Replace those 2 tracks
  [Undertow, Nachtschicht] with the 3 new tracks… add a MATCHING melody line (think like a
  music producer and don't ruin the vibes!!)". `misc/sketches.py` (his numpy synthesis, four
  30-second sketches, no samples) is the source: **Hypnotist** (minimal techno 127, A minor,
  track 1), **Warm Nine** (deep house 121, F minor, Fm9 E♭maj9 D♭maj7 Cm7, track 2), **Abyss**
  (dub techno 117, Dm9 drifting to Cm9, track 3); the warehouse acid one was not wanted.
  `scripts/synths.py` is now a port of that file's voices at 48 kHz, cut as one-shots: the
  sketch kicks, hats, clap, rim and click, the bleep (with its ping-pong delay and room baked
  in), the Rhodes (plate and delay baked in), the dub stab (the whole dub chamber baked in),
  the subs, a dub lead, and two beds the drums channel retriggers every eight bars (vinyl
  crackle, hiss and rumble). Filters that breathe over bars are velocity layers (dark, mid,
  bright) the songs drive. What belongs to the beat stayed in the engine: a band's `duck`
  (`BandData.Duck`: every kick dips the named channels by `depth`, back over `release`; the
  renderer notes the kicks fired in a chunk and the mixdown applies the envelope; your keys
  duck with the part you took). The old 909 set, acid, stab, pad, lead, rave are gone with
  the two songs. `scripts/songs/{hypnotist,warm_nine,abyss}.py` are the sketches' 16-step
  patterns bar for bar, stretched to 72–80 bars with intro, break and out. The parts the
  sketches had are the parts (the bleep, the Rhodes stabs, the dub stab); the ones they lacked
  are written to the vibe: a dark Am/G stab in the bleep's voice on the and of 2 (Hypnotist's
  chords), a Rhodes top line an octave up (Warm Nine's melody), long tones in the chamber on
  the ninth, fifth and seventh (Abyss's melody). Not carried over: the deep house sketch's 16%
  swing (half a tick, below the 12-per-beat grid); the pushed stabs carry the feel. Levels from
  solo renders against the blues band as before.

- **Fingers on the Stage: 0.1 (42), 2026-10-28.** Bart: "add finger positions… a fun/lightweight
  UI… that doesn't add clutter". The lessons' own hand (`HandView`, in the style picked in
  Settings) sits top right of the highway, out of the hit line's way: the fingers of the chord
  in the window filled, the next chord's first finger outlined; the left hand for a chords
  part (the pinky low, as the lessons comp), the right for a melody. The keys keep their
  badges for those two chords only. Every melody chart now carries fingers:
  `Song.fingered` in `scripts/songs/common.py` gives the same finger to the same note all
  song (the chart's lowest note under the thumb, a finger further for every two-and-a-bit
  semitones, the thumb again an octave up); the chords' fingers were hand-set in the voicings.
  `GameEngine.cue` returns `nowFingers` / `nextFingers`; `GameState.nowFingers`, `nextFinger`,
  `rightHand`.

- **Charting rules, Abyss rebuilt, M2 gone: 0.1 (43), 2026-10-28.** Bart: "leveling is bad…
  make a charting system with basic rules/formulas for what makes for Easy Medium and Hard both
  in Chord and Melody modes… and Adaptive… that I can easily tweak", and Abyss "all wrong, sound
  wise" (his notes: misc/TRACKS_README.md "Fixing the dub techno sound"). **Charting**
  (`CHARTING.md` is the guide, `Takt/Content/charting.json` the knobs, `Game/Charting.swift`
  the charter): songs carry their parts whole; every note has a weight (`lv` 1 main hits, 2
  groove, 3 pushes/ornaments) and every chord note a role (`r`: root third fifth sixth seventh
  ninth). Each part has a ladder of tiers (chords 7: two-note spread → two-note on the groove →
  three-note spread → three-note on the groove → + pushes → four notes → the record; melody 6),
  each with `notes` (chord size by the `keep` order), `hits` (heaviest weight played), `gap`
  (seconds at least between onsets) and `space` (seconds at most of silence: a longer one borrows
  a lighter hit), `bonus` (points). Easy / Medium / Hard name a tier (chords 2/4/7, melody
  2/4/6; `songs` overrides per song); Adaptive starts at tier 1 and moves one tier per 4-bar
  block, decided 2 bars ahead (`adaptive`: climb ≥ 85%, ease < 60%, 4 notes judged). The HUD and
  the board say "Level n"; the set list's line comes from the tier. Song parts filled out where a
  level had nothing to choose: Slow Burn comps on the 4 from chorus 2, Warm Nine's groove section
  has a line, Abyss's melody is a four-bar phrase with answers. `-LessonCheck` checks each
  tier's rules and prints every ladder's onsets a second with the quietest and busiest 8 bars.
  **Abyss:** a dub send in the engine (`Audio/DubChamber.swift`, a band's `dub`): a ping-pong
  delay synced to the tempo (a dotted eighth), with a highpass (350 Hz), a lowpass (2.5 kHz) and
  tanh saturation inside the feedback loop, its time wobbling ±0.3% at 0.5 Hz, into an 8-line
  FDN reverb with its input highpassed at 250 Hz, the return ducked a little by the kick; the
  sends are post-fader per channel (keys, horns, and your keys when you take that part). The
  stab is dry now (four detuned saws, resonant lowpass, 4 ms attack, 120 ms decay, five filter
  layers from 600 Hz to 3.6 kHz breathing over 16 bars), the lead dry, the hats crisp
  (7–14 kHz), the sub an octave up (D2/C2, still under 80 Hz, audible on a laptop), kick and sub
  never sent and mono (side/mid 0.00 in a solo render), the app's room reverb off for a band
  with its own chamber. Measured: −21 dBFS RMS, peak −0.8, no clipping; a check sends a click
  through the chamber and finds the echoes a dotted eighth apart, alternating sides, each quieter
  and darker. **The menu:** the M2 "The Right Hand" stub is gone (it is listed as coming soon
  inside Blues Progressions); the A1 result no longer claims "A2 is unlocked".

- **The count-in launch: 0.1 (44), 2026-10-28.** Bart: "add a splash screen… refer to
  misc/takt-countin.zip for vibe & general approach". `Menu/CountInSplash.swift`: on a cold
  launch the app counts you in for one bar at the band's tempo (TAKT, four beat squares lit one
  at a time, "Count-in · 4/4", the band card with its name and BPM), then hands off on the next
  downbeat with a 0.25 s fade. The package's own tokens and fonts were dropped for ours
  (`Palette`, `Font.display`, `dataLabel`, `bodyText`), forced dark in either theme; the launch
  screen already was the ground (`LaunchBackground` #0D0D0D). Integrated with the engine: when
  the count-in shows, the launch doesn't start the band (`CountInLaunch.pending` in
  `TaktApp.makePlayer`); `CountInHost`'s `onFinished` starts it, so the band comes in on the 1
  the count lands on (simulator: first sound 3.65 s after launch at 90 bpm, at once without the
  splash). Menu music off (Bart's Mac): the count, then a quiet menu. Tap skips; Reduce Motion
  holds beat 1 for 0.6 s; the iPhone ticks a haptic per beat (medium on the 1), no sound. Wide
  layout from 700 pt (the Mac window), stacked on the iPhone. Once per process (not per
  window). DEBUG launches with `-Silent`, `-Route`, `-SnapshotAt`, `-PreviewFrame`,
  `-LessonCheck` or `-RenderTo` skip it; `-Splash 1` / `-Splash 0` decides outright.
- **Four Letters, the launch redrawn: 0.1 (49), 2026-10-29.** Bart picked it from three
  proposals (Four Letters, Now Line, Dub Stab). Same clock, haptics, hand-off, tap-to-skip and
  Reduce Motion as the count-in above; only the picture changed: T, A, K, T one per beat at full
  height on a rule, `signal` on its beat, `cue` outline for the next, `line` outline still to
  come, `text` once played, the beat's numeral at the right. Stacked one letter to a row under
  700 pt wide (the iPhone), four across from 700 (a Mac window), the letters sized to the space
  they get. SwiftUI has no text stroke, so the outline is the letter drawn twelve times a hair
  off in the stroke color with the ground on top (`LetterCell.glyph`).
  Merged from PR #12 (written without Xcode); on review the 0.1 s state animation was dropped:
  it cross-faded the outline into the fill (an orange letter with a blue edge) on every beat.
- **Abyss = the dub reference: 0.1 (45), 2026-10-29.** Bart: "the dub techno track… is still not
  good at all… make the version in the game sound the same" as `misc/dub_reference.mp3`
  (`dub_reference.py`, `DUB_TECHNO_FIXES.md`). The chamber is a line-for-line port of the
  reference's `dub_delay` and `dattorro` (one-pole filters in the loop, the send filtered,
  crossfeed, a Dattorro plate fed the dry stab and the echoes, tape hiss): −128 dB from the
  Python on the same input. The stab is synthesized live (`Audio/DubStab.swift`, instrument
  `liveStab`, the band's `stab`): PolyBLEP saws through an SVF whose breath sweeps continuously
  from the transport's tick, ported from `render_stab` (−50 dB). Your keys play it too. Hats are
  noise only, the sub ducks 0.6, `duck.channels` is a depth per channel for every song, the room
  is bypassed for dub bands. The melody part is single stab notes the delay answers (no lead
  synth, the doc's §7 option 2). The levels are the reference's bus by bus, 6 dB quieter (the
  other songs' loudness); octave bands within ±0.8 dB of the reference in every section.
  Full write-up: `DUB-TECHNO.md`.
- **Abyss Reference: 0.1 (46), 2026-10-29.** Bart: "add a version of the Dub Tech track in the
  game that doesn't add a melody or anything… ONLY 100% reproduces the song Claude in the app
  made". A sixth Stage song (`song-abyss-ref`, `abyss.py --ref`): the reference's 16 bars as
  written, nothing added, velocities not humanized (`Song.human = 0`), the drum velocities
  inverted from the reference's gains (`vel_for`). Its one part is the stab: a song may now carry
  the chords part alone (`Song.partKeys`; the Part chips, `AppModel.stagePart` and the checks
  follow it). The master knee is a band setting (`knee`, 0.48 here) so the song clips the way the reference does at its lower level; it matches the reference within ±0.2 dB per octave band.
- **Tap mode: 0.1 (47), 2026-10-29.** Bart: "i need to be able to fully test / use the app from
  the iphone build… at least in the GAME mode, i cannot just play with my fingers." The keyboard
  strip followed one finger (a SwiftUI drag), so no chord could be played by touch. Now it takes
  every finger (`Input/TouchSurface.swift`, a multi-touch UIView). Settings → Input → **Tap mode
  (no keyboard connected)**, `@AppStorage("tapMode")`, on by default on the iPhone only: a finger
  anywhere on the strip plays the notes due nearest it, the whole chord, scored like keys pressed
  then (`Player.tapDown/tapUp` → `GameEngine.due` in a song, `LessonEngine.due` in a lesson);
  lifting it lets them go. MIDI and the computer keys are untouched. `-AutoTap 1` taps every chord
  of a song through that path; ImageRenderer snapshots set `\.offscreen` so the UIKit surface
  stays out of them. Simulator check: `cliclick` on the Simulator window is a real touch.
- **Hypnotist II, and a ladder that keeps the line: 0.1 (48), 2026-10-29.** Bart, playing
  Hypnotist melody on Adaptive on the iPhone, saw only a low A and asked how that is a useful
  learning opportunity (it isn't: every weight-1 note of that line is A3, so levels 1–3 were one
  key), then: clone it as Hypnotist II with a good adaptive chart, not cheesy, maybe three notes
  and rhythm variations, and fix the adaptive system. **Hypnotist II** (`song-hypnotist-2`,
  `hypnotist.py --ii`; the original's JSON is byte-identical): the same record with a new melody
  part, "The phase": A3 C4 D4 (fingers 1 3 4) every dotted eighth against the four, round every
  two bars; levels = rhythms of the same three keys (102 → 364 notes, each level the one below
  plus more). **The system** (`CHARTING.md`): `phrase` (melody 2 bars) keeps every key of each
  phrase at every level before the weights; adaptive starts one under your last adaptive run's
  top on that song and part (`resume`); a wrong key is a miss in the window (the record's own
  notes aren't). The original Hypnotist's levels 1–3 now play A E G / A C E G.

- **Scales 7–13, Chord Shapes, a smoother Adaptive: 0.1 (50), 2026-10-29.** Bart: "improve two
  core things: the pedagogy / lessons structure incl creating additional content, for the Scales
  and Chords modules… think like a music curriculum expert… (2) game mode: difficulty level
  construction in particular for Adaptive play… the difficulty curve is smooth". His research
  notes are `misc/scales-and-chords-lessons.txt` and `misc/game-level-design.txt`; the plan and
  the reasons are **`CURRICULUM.md`**. **Scales** (both key files, `scripts/scales-extend.py`,
  lessons 1–6 kept byte for byte): minor / major pentatonic, the relative (same keys, other
  home), E minor / G major (same fingering), D minor / F major (the first flat; F breaks the
  fingering 1 2 3 4 1 2 3 4), harmonic minor / Mixolydian, Dorian, the chromatic; a jam under
  each, the new keys' jams transposing the blues band to the relative major. **Chord Shapes**
  (`lesson-H.json`, `scripts/chord-shapes.py`, entry "H" after Minor Chords): minor sevenths,
  inversions, the four-chord minor loop (Am F C G over the drums), the same loop by voice
  leading, the backbeat, sus4 resolving, the shell, the rootless minor nine; eight jams.
  Content model: a pattern note's `chord` plays it only in that chord's bars (a voicing per
  chord), a step's `flats` spells its run, five more `tones`. **Stage** (`CHARTING.md`): every
  tier is the one below plus more (the charter seeds each tier with the last; the chords ladder
  is 6 tiers, the sparse three-note tier gone, Easy/Medium/Hard = 2/3/6); Adaptive reads one
  window for drops and two for climbs (`judged` 8, reaching back for sparse levels), holds
  climbs after a change (`afterClimb` 1, `afterDrop` 2), never climbs on scattered hits
  (`spreadMaxMs` 60), drops on `missRun` 3, keeps a `floorBelowStart`, skips tiers whose chart
  is identical; a dropped finger keeps the combo. Checks 255/255: the new content note by note,
  ladder health for every song and part, the adaptive rules, a seeded player model that settles.
  Verified on the simulator: the Chord Shapes module, Moving less lighting G C E / 5 2 1 in bar
  3, D minor and F major spelled with B♭.

- **Hypnotist II fixed, the record fills the level: 0.1 (51), 2026-10-29.** Bart, testing
  Hypnotist II melody on Adaptive: "it's just a broken song… 0 notes to play in the first +30
  seconds, then a VERY REPETITIVE terrible set of notes, at maybe one a second". Three causes,
  all real: taking the melody muted the band's bleep (so the record was a kick and a sub for
  16 bars), the line started at bar 8 and Adaptive at level 1 (one note every two beats of a
  dotted-eighth line), and climbing took eight bars a level. Now **the record fills what the
  level leaves out**: `GameEngine.fill(bar:)` is the part's notes the tier doesn't ask for, and
  the Player schedules them on the part's instrument a bar ahead at the band's velocity
  (`fillVelocity` from the band channel), so every level sounds like the song. Adaptive
  **starts on 3** (`start`); a climb's evidence is the bars played at the current tier (a whole
  window of them, up to two), so a climb right after a climb can't ride on the easier tier's
  bars. Hypnotist II's phase comes in at bar 4 (its bones), lifts the D to E in the second bar
  of every fourth phrase (the only fourth key, so the loop turns a corner every eight bars),
  keeps its groove hits in the outro. The band of the song is byte-identical to Hypnotist's
  (same 1828 hits, 408 bass, 282 stabs, 127 bpm); only the bleep line differs, by design.
  Checks 255/255.

- **Beginner's stubs, and Accuracy as clean keys: 0.1 (53), 2026-10-30.** Bart: "some notes, in
  game mode, playing Slow Burn melody beginner, are weird: instead of coming down like a full
  bar, one beat at a time, they are half length and don't attach correctly" and "Accuracy
  should be redefined as any note not wrong: perfect or good notes, not accidentally hitting a
  wrong note". (1) The phrase cover took a 4- or 8-tick ornament off the beat as the only F or
  Bb of its four bars. New tier knob `minBeats` (melody Beginner 1): the tier takes only onsets
  with a note at least a beat long, capped at the part's usual weight-1 length so Hypnotist's
  4-tick stab line keeps its Beginner (`Charting.swift`, `CHARTING.md`). Slow Burn Beginner is
  42 notes, none under a beat; Easy and above unchanged (the check). (2) `GameEngine.wrong`
  counts extras that aren't the record's own notes; `accuracy` = hits / (hits + wrong), the old
  hits-over-notes is `hitRate` and still grades the run; the result screen gets a "Wrong" stat.
  Then Bart: "those are probably shorter notes that fall on a half beat or some such. that's
  fine, but maybe we should add lighter or dotted grid lines for them": the highway draws the
  part's own subdivision between the beats as faint dashes (`GameEngine.grid`, the gcd of the
  onsets' offsets in the beat: Slow Burn's shuffle thirds, Hypnotist's sixteenths), thinned to a
  coarser division where the lines would sit under 22 pt apart (Hypnotist at 127 bpm shows one
  dash a beat). Beginner keeps the `minBeats` rule all the same: its notes are the anchors.
  DEBUG `-ChartDump <song>/<part>` prints every tier's chart. Checks 276/276.

- **Beginner level, and Slow Burn's Easy kept: 0.1 (52), 2026-10-30.** Bart: "the MELODY line
  on Easy is charted like a Medium… keep Easy as is but add a new Beginner level… HALF as hard…
  fewer notes, more time between them", and "in all games, all game modes do not change the
  speed of the songs". **Beginner** is a new bottom tier of both ladders (`charting.json`;
  `CHARTING.md`): one onset every 2.4 s at most, a note at least every 5 s (chords: one note a
  chord), its own `phrase` of four bars (a tier may now name one), and `fromAbove`: it is cut
  from the chart the tier above makes with nothing under it, so Easy, Medium and Hard are
  **byte-identical** to what they were (a check compares every song and part against the
  ladder with the tier cut away). Slow Burn melody: 0.25 onsets a second on Beginner against
  0.67 on Easy. Indices moved up one (chords 1/3/4/7, melody 1/3/5/7; Adaptive `start` 4, the
  same chart as the old 3). The phrase search is a real maximum-cover search now (the old one
  could call a partial cover complete after skipping a key). `GameEngine.Difficulty.beginner` is
  first in the Level chips; the board records it as "beginner". **Tempo:** nothing in the Stage
  ever changed the speed; a Slow Burn Adaptive run recorded on the simulator has every kick on
  the 68 bpm grid from the first bar (the count-in included), so that is written down in
  `CHARTING.md` rather than changed. Checks 268/268. **TestFlight, Mac and iOS:** an external group
  "Public beta" with a public link (https://testflight.apple.com/join/sF4rp7DS), beta review
  contact and test information set on the ASC record; see "TestFlight" below for the Mac
  Installer certificate this Mac lacks.

## Code map (`Takt/`)

- `App/AppModel.swift`: the route (lessons / lesson / result / settings; screens switch without
  animation), the lesson catalog. `Menu/`: `LessonsScreen` (the menu, with the band's
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
  taps after it. Bypassed for a band with its own `dub` chamber. The one synth that runs live is
  the dub stab (`Audio/DubStab.swift`, instrument `liveStab`; the chamber is `Audio/DubChamber.swift`,
  both described in `DUB-TECHNO.md`).
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
Apple Distribution cert `0DDCC75F…`), archiving on the mini at 171.66.240.175. **The MacBook Air
ships it too since 2026-10-30** (`MINI=local ./testflight/ship-via-mini.sh mac`): it now holds a
"3rd Party Mac Developer Installer" identity (Mac Installer Distribution cert `UFUMCYT3W9`,
serial `6C88B10E…`, minted over the ASC API from an openssl CSR after Bart okayed revoking the
unused 2026-08-26 one, `WUZK4CR87J`; Apple issues no fourth while three are current). The key
lives in its own keychain, `~/Library/Keychains/takt-ship.keychain-db` (password `takt-ship`,
on the search list, partition list set for apple-tool/codesign/productbuild): in the login
keychain an imported key makes productbuild wait on an authorization dialog nobody sees, and
`set-key-partition-list` there would need the login password. **Public
beta:** external group "Public beta", public link https://testflight.apple.com/join/sF4rp7DS
(limit 10,000), created 2026-10-30 with the beta review contact (Bart, no demo account: the app
opens as a guest) and the en-US test information; `asc-submit.mjs` adds every build to it and
submits it for beta review, and the link serves a build once Apple has approved one. First build
on it: 0.1 (52), Mac and iOS (both archived signed on the Air with `MINI=local`; the iOS
one uses the "takt appstore" profile and needs no installer certificate).
