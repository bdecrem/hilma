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
  by bar, the two parts). Slow Burn (slow blues in G, 90 since 0.1 (57), four choruses, the lesson kit), Pearl Street (Texas shuffle in E, 112, a stop-time chorus) and Blue Lantern (minor blues in D, 84, Rhodes), both 2026-10-31,
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
  end; **Accuracy** (0.1 (54)) is hits over the chart's notes plus the wrong keys: a miss costs, a
  wrong key costs, a hit inside the Good window (150 ms) pays; grade S / A / B / C / D from it
  (97 / 90 / 80 / 65). A wrong key is one the tune has nowhere within a beat of the press; the
  right key late is a miss, not a wrong key. **Screen**
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
  **0.1 (54), the grid as notation** (Bart: "lines should represent a full note, and then
  shading or thinner grids to mark half and quarter notes, but keep it nice looking"; and the
  dashes had "skipped around": one path held every dashed line, and Core Graphics runs the dash
  pattern on from line to line, so every dash shifted sideways each time a line entered or
  left): the bar (whole note) is the strong numbered line, the half note a plain line, the
  quarter notes alternating shading (`Palette.text` at 3%, no line of their own), the
  subdivision the faintest dashes, one stroke a line; every grid line snaps to whole points so
  it doesn't shimmer while sliding. DEBUG `-Autoplay sloppy` now works on a song too (every
  eighth note skipped, every ninth a semitone off, the rest up to 260 ms out).
  DEBUG `-ChartDump <song>/<part>` prints every tier's chart. Checks 276/276.

- **Normal scoring, and a result card that is a game screen: 0.1 (54), 2026-10-30.** Bart saw
  51% on a run he played well (0.1 (53) had counted a right key outside the Good window as a
  wrong key), then: "make it less autistic, more normal. if I MISS the note, my percentage takes
  a hit. if I hit the wrong note also, but if I hit it with reasonable accuracy I get my
  points", and of the six-number row: "clean up that shitshow and do something FUN and
  GAME-LIKE". **Scoring:** accuracy = hits / (perfect + good + missed + wrong); the Good window
  is 150 ms (was 110; Perfect stays 45); a wrong key is a press the tune has no such note within
  a beat of (`GameEngine.wrong`, `wrongTicks`); the grade follows accuracy; `hitRate` is gone.
  Adaptive's own wrong-key rule (the Good window) is unchanged. **Result card**
  (`GameResultPanel`): grade, title, score and board rank as before; then a verdict in the
  display face with a line under it (`Result.verdict`: Clean run / Tight / Solid / Getting
  there / Rough one, the line naming stray keys or misses, whichever weighs more), a **run map**
  (`RunMap`: the song as a line, a mark per judged onset where it fell, perfect tall in signal,
  good in cue, a miss hollow and short, stray keys as red ticks under the line; `Result.map` /
  `Result.strays`, 0...1 positions, a chord is one mark, its worst note), and two chips,
  accuracy and best combo (a third, stray keys, only when there were any). The
  perfect/good/missed counts are no longer printed anywhere but the log and the accessibility
  label. Checks 278/278 (the right key 200 ms behind is a miss and an extra, not wrong; the map
  has a mark an onset in order, strays where the wrong keys fell).

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

- **Slow Burn Short, and the highway as one movement: 0.1 (55), 2026-10-30.** Bart: "add a new
  Track called Slow Burn Short and it's slow burn, but 45 seconds long" and "the grid lines
  NEVER MOVE. they mark BEATS… the notes move down in one continuous movement, no more 'drop one
  beat at a time'". **Slow Burn Short** (`song-slow-burn-short`, `slow_burn.py --short`, second
  on the set list): the same song once round, one 12-bar chorus (0:42, 45 s with the stop
  ringing) played the way the long one's second chorus is (`feel(c)`: snare in, the head with its
  ornaments, the triplet pushes), ending on the stop; the long song regenerates byte-identical.
  **The highway:** the beat-at-a-time motion was `LiveGameScreen` only re-rendering when an
  observed Player property changed (once a beat); `gameState()` reads the clock, not a property,
  so it sits in a `TimelineView(.animation)` now and redraws every frame while the song rolls
  (the clock was always continuous). The grid is a fixed ruler: one line a beat up from the hit
  line, fading upward, nothing sliding; the bar numbers, the half-note lines, the quarter shading
  and the sub-beat dashes of 0.1 (53–54) are gone with it (`GameEngine.grid` too). Verified on
  the simulator: four frames ~350 ms apart, the grid row at the same pixel in all, the note's
  bottom at four sub-beat positions. Checks 287/287.

- **Slow Burn opens with the snare: 0.1 (56), 2026-10-30.** Bart, after 0.1 (55): "Slow burn short
  in game mode is the correct speed, much faster and better than normal Slow Burn - fix slow
  burn". Both run at 68; the long one opened with the quiet head chorus (cross-stick and hat
  only, no kick push, the bass without its sixth, two comping hits a bar), which reads as slower.
  `feel(c)` is `max(1, c)` for the long song now: chorus 1 plays the second-chorus feel from bar
  1 (its drums, bass and comping are note-for-note the short song's, velocities humanized apart),
  the grace notes still arrive on choruses 2 and 4; the short song is byte-identical to 0.1 (55).
  Checks 287/287.

- **The song's tempo always wins, and Slow Burn is 90: 0.1 (57), 2026-10-31.** Bart: Slow Burn
  melody Beginner "approx 66bpm but normal speed, which I get in Adaptive game mode, is 90bpm
  approx - WAY FASTER… (1) fix it so the song always plays at 90bpm in game mode (2) in game mode
  ALL songs should play at their '1x' tempo". The speed difference was real and not about the
  level: a tempo change the lesson sent while the band played (`tempo 90` at launch with Bart's
  progress, a ramp step, the knob) waits in `pendingTempo` for a downbeat, and `.stop` never
  cleared it, so `startGame`'s stop → `.tempo(68)` → play ran bar 1 at 68 and then jumped to the
  lesson's 90 on the first downbeat; the next run from the Stage had nothing pending and played
  68. Reproduced offline (`-RenderScript "0:play,1.0:tempo=90,1.5:stop,1.6:tempo=68,1.7:play"`
  on 0.1 (56): 89.6 bpm from bar 1). `BandRenderer`: `.stop` clears `pendingTempo` and
  `pendingUnmute`, and `.tempo` while stopped clears `pendingTempo` too; the same render on
  0.1 (57) holds 68 throughout. **The 1x tempo** is the `tempo` in each song's block and the
  Stage plays every song at exactly that, at every level and in Adaptive; it is the speed of
  record the generator sets. Slow Burn and Slow Burn Short move from 68 to 90 (`slow_burn.py`,
  only the tempo field changes in both JSONs; the long song is 2:08, the short 0:32). Verified
  on this Mac's build: `-Route game -Song song-slow-burn -Part melody` recorded at Beginner and
  Adaptive both read 89.6 bpm from the kick grid. Checks 287/287 (the Slow Burn ladders still
  hold their time-based rules at 90: melody 0.30 → 1.23 onsets/s). The Mac app records only
  into its sandbox container (`~/Library/Containers/com.bartdecrem.Takt/Data/tmp`), a path in
  the repo fails with error -54; `-Mutes` does not exist, use `-RenderScript … mute=bass`.

- **A quieter result card: 0.1 (58), 2026-10-31.** Bart: "on the postgame, no need to show the
  little bars of every single hit, and show the accuracy % at the top, instead of the score -
  think like a game designer - keep trimming the ui clutter". `GameResultPanel`: the run map
  (`RunMap`, a mark per onset) is gone from the card and the code (`Result.map` / `strays` stay
  in the engine and its checks); the headline number next to the grade is the accuracy, in
  signal on an S or A; the song's title inside the card went too (the HUD above says it), the
  part · level line stays; the chips under the verdict are points (grouped, 12,070), best combo
  and stray keys when any. Verified with `-SnapshotAt "result:0"` on Slow Burn Short, perfect
  Medium and sloppy Adaptive, both themes.

- **Slow Burn melody Easy at half: 0.1 (59), 2026-10-31.** Bart: "melody / easy on Slow Burn is
  2x too hard". Easy was 0.88 onsets a second on a line whose anchors are 0.41: the ladder's
  two-bar key cover and Easy's 1.8 s silence-borrowing filled it. `charting.json` `songs` can
  now patch a part's ladder per song (`phrase`, and `gap` / `space` by tier, besides naming a
  tier for a difficulty; `Charting.PartOverride` / `TierPatch`, `tiers(song:part:)`,
  `phrase(song:part:)`, validated like the ladder). Slow Burn and Slow Burn Short melody:
  Easy = tier 2 with a chorus-long phrase and no borrowing → 0.43 a second (Beginner 0.29,
  Medium 1.09, Hard 1.23 as before; Adaptive climbs 0.29 → 0.43 → 0.84 → …). Beginner's pool
  (`fromAbove`) is the tier above's phrase picks *and* hits now (it was the picks alone, which
  left four bars empty under a chorus-long phrase); the tier above still prefers only the
  picks, so nothing above Beginner moves. Every other song's ladder, both parts, prints the
  same onsets-a-second figures as 0.1 (58). Checks 287/287 (the Beginner-cut check renumbers a
  song's levels and patches with the ladder). Details and the numbers in `CHARTING.md`.

- **The blues reference sheet, `BLUES.md`: 2026-10-31.** Bart: "make a reference sheet for BLUES
  tracks, where we will write down guidance for melody and chord gameplay difficulty, for each
  level… notes that will be used for all game charts". `apps/takt/BLUES.md`: the ground rules
  (one speed, the band plays the rest, plus-more levels, density in onsets a second, a level is
  still the line, no stubs), a table per part with what each level plays, its onsets-a-second
  band and the measured figure for every blues song, the notes from play that set them, how to
  write a new blues track so the levels fall out right, and the open items (Boogie Shoes melody
  Easy at 0.88 is over its band). Every blues chart is held to it; `CHARTING.md` stays the
  mechanism.

- **Two more blues tracks, Boogie Shoes re-weighted: 0.1 (60), 2026-10-31.** Bart: "update the
  Beginner and Easy levels, Melody, on the OTHER blues track… add a third and a fourth blues
  track… think like a music producer… different key… chart the melody beginner / easy levels
  per the rules you just established". **Boogie Shoes** (`boogie_shoes.py`): the riff carried
  two anchors a bar (0.95 weight-1 onsets a second), so Easy was the riff; one anchor a bar now
  (the note the bar lands on), the rest weight 2; the band's horn line is the same notes.
  Melody 0.25 · 0.64 · 0.79 · 1.49 · 1.57 · 1.69 · 2.17 (was 0.27 · 0.88 · 0.92 · 1.59 · …).
  **Pearl Street** (`song-pearl-street`, `pearl_street.py`): Texas shuffle in E at 112, five
  choruses (2:09), boogie bass two notes a beat, quick four, a stop-time chorus (the band hits
  the 1 and lays out eight bars while the sax talks), sax solo on the ride, out chorus; piano
  stab-and-chank chords part; cover glyph `boots`. **Blue Lantern** (`song-blue-lantern`,
  `blue_lantern.py`): minor blues in D at 84, straight eighths over a sixteenth hat, open hat
  into the 1, Dm7 / Gm7 / B♭7 A7, Rhodes comping (`keys: rhodes`), long sax tones, four
  choruses (2:17); glyph `lantern`. Its sixteenth hat and sustained Rhodes made the first mix
  hit 0 dBFS; the kit sits 4–6 dB under the other blues' and `levels` take keys −4, bass −5,
  horns −3.5 dB, for a mean of −20.7 dBFS and a −4 dB peak (Pearl Street −21 / −2, offline
  renders through `volumedetect`; `audiocheck` cannot read a `-RenderTo` file, its
  frameCapacity assertion). The set list's copy counts the songs (`StageScreen.spelled`)
  instead of saying "Eight". Both on the set list after Boogie Shoes
  (`Song.catalog`), both with the blues melody patch in `charting.json` (Easy = tier 2,
  phrase 12, tier 2 space 0): Pearl Street melody 0.26 · 0.51 · 0.77 · … · 1.86, Blue Lantern
  0.26 · 0.41 · 0.68 · … · 0.97, chords 0.23 → 1.55 and 0.35 → 1.10. **Charting:** the tier
  above a `fromAbove` tier is seeded with its own no-Beginner by-rule set (`aboveRule`), which
  is what makes "Easy and above chart the same with Beginner under them" hold once Beginner may
  take a hit (Boogie Shoes failed it at bar 64 before). Checks 305/305 (ten songs load).
  Every number in `BLUES.md` §2–3, the producer's notes in §5.

- **Practice mode inside a run: 0.1 (61), 2026-10-31.** Bart: "add a Practice Mode to the
  Games… hit Pause at any time and then it's shown as an option. There's a scrubber and I can
  adjust the speed… practice it at a slow speed. then I can restart game mode once I've
  mastered the hard part. THINK LIKE A GAME designer… elegant, not clumsy, UI that tucks in
  subtly". **What you see:** Pause → the card says Paused, Keep going, and under it a quiet
  "Practice this part". Practice holds the band at the start of the bar you paused in; the
  score and combo in the HUD give way to PRACTICE with "70% speed · nothing scored"; the
  progress rail becomes a **scrubber** (drag anywhere: the band holds at that bar, the highway
  shows it) with one small row under it: the bar and its section, ↺ four bars back, − 70% +
  (50–100 in tens; ↑/↓ on the Mac), play (four clicks at the practice tempo, then the band;
  playing, it pauses, and play starts that bar over) and "Play the run", which starts the run
  over from the top at the song's speed with a fresh score. Notes still judge and pop at the
  hit line and the band still fills what the level leaves out, but nothing scores, nothing
  adapts, nothing goes on the board, and the run never "finishes" (the end of the song holds).
  **Plumbing:** `EngineCommand.seek(tick:)` (held, or paused if playing: the transport and the
  band's cursor move, scheduled notes dropped; `repositionCursor()` shared with `.band`) and
  `.countIn` from any held tick (the cursor stays, so the bars before don't sound under the
  clicks); `GameEngine.practice` (pops, no counters, no adapt, no finish) and `seek(to:)`
  (every note from there pending again); `Player.enterPractice / practiceSeek(bar:) /
  practiceBack / practiceSpeed(delta:) / practicePlay / leavePractice`, `practiceTick`
  observed so a scrub redraws while held, `practiceCountBase` so the count-in badge and the
  bar label read the landing bar; `GameState.practice / speed`; `GameControls` grew
  `practice / practiceSeek / practiceBack / practiceSpeed / run`; `PracticeBar`, `Scrubber`,
  `SmallButton` in `GameScreen.swift`. DEBUG `-PracticeAt <tick> -PracticeBar <bar>
  -PracticeSpeed <percent>` enters practice during a run. Verified on this Mac: a Slow Burn
  Easy run recorded through the hook holds 90 bpm, then four clicks and 63.2 bpm from bar 5
  (70%); snapshots of the count-in and of practice playing in both themes. Checks 307/307 (two
  new: practice holds the counts and never finishes; a seek re-pends every note from there).

- **Practice from the set list: 0.1 (62), 2026-10-31.** Bart: "put a small Practice button on
  the main menu of the Game tab - alongside Play and Board for each track, but a little
  smaller/less prominent". Each card's row is Play · Board · **Practice** (outlined, 32 pt, the
  label in `muted`, a size down from Board): the song with the part and level picked, opened
  held at bar 1 in practice (`AppModel.practice(song:)` → `Player.startGame(…, practice: true)`:
  the band stopped at the song's tempo, no count-in, `practice` on; play counts in from
  there). DEBUG: `-Route game … -Practice 1`. Snapshot of Blue Lantern melody Easy held at bar 1
  checked in both themes.

- **Slow Burn chords Easy, two chords a bar: 0.1 (63), 2026-10-31.** Bart: "slow burn, chords,
  easy: remove (almost) half of the chords… whenever I say slow burn, I mean both the full and
  the short versions". Easy was tier 3 (the 1, the 3 and the 4, 1.11 a second); both Slow Burn
  songs name tier 2 for it now (`charting.json` `songs`, `"chords": {"easy": 2}`): the two-note
  shell on the 1 and the 3, 0.74 a second. Nothing else moves (the ladder is the same, Medium
  stays tier 4). The rung under it is the 1 alone (0.38): the note in `BLUES.md` §3 says so, for
  when Bart has played it. Checks 307/307. Then: "add this to your charting rules document - we
  are building a knowledge base for how to build good charts": `CHARTING.md` has a section
  "What makes a good chart: the rules so far", eleven numbered rules, each with the build that
  taught it; `BLUES.md` points at it.

- **Sustain: a held key keeps sounding, 0.1 (64), 2026-10-31.** Bart: "add sustain to the notes
  and chords: as long as I hold the notes down, they keep playing". The engine already held a
  live note until note-off, but the recordings end: the piano files are cut at 3.5 / 5 / 7 s
  (`sounds.py` caps), the Rhodes one-shots at 3.4 s, so a held note stopped there. Now every
  pitched sampled voice loops the file's tail while it sounds (`SampleBuffer.withLoop`,
  `SampleVoice.sustain`): the loop is up to a second before the cutter's 40 ms fade (40% of
  the file at most), crossfaded over up to 300 ms into its start, and every pass is quieter by
  the tail's own measured decay (RMS of the loop's last 100 ms over its first), so a held
  piano note fades the way the piano does; a tail already at silence, or a file under a
  second, does not loop; drums never do. Band notes longer than their sample sustain the same
  way (none of the current songs' are), the dub stab keeps its own length. Measured offline on
  the simulator (`-RenderScript "…,0.5:on=55,15:off=55"`, G3 piano): before, silent from 5.5 s;
  after, −56 dBFS at 6 s, −66 at 10, −80 at 15, then the 0.18 s release; a held G2 B2 D3 chord
  rings at −49 dBFS at 12 s; the loudest step between 100 ms windows across all renders +2 dB
  (no bumps at the loop seams). The synthesized Rhodes one-shot decays to silence inside its
  3.4 s by itself, so a held Rhodes key still ends there; a Rhodes that truly sustains wants a
  live voice or longer samples (open). Checks 307/307.

- **Your instrument: the organ, 0.1 (65), 2026-10-31.** Bart: the notes the user plays "should be
  distinct from the sound of the baked-in instruments" (on the blues tracks your melody was the
  same upright the band comps on), then "add a user setting where we offer instruments for the
  user to play. instrument 1 is the current piano. option 2 will be your Hammond Organ - make
  that default". **Settings → Sound → Your instrument**, Piano / Organ (`@AppStorage
  "instrument"`, default organ; the level row under it is "Your keys" now). Piano is the
  content's own monitor: the upright in the lessons and the blues, the record's synth on the
  electronic tracks. Organ is the Hammond wherever the content would hand you the piano or the
  Rhodes (the lessons, all four blues tracks, both parts); the electronic tracks keep their
  synths either way (`Player.organOn`, `applyInstrument()` on every content change and on the
  picker; `EngineCommand.organ`). **The organ** (`Audio/Organ.swift`), synthesized live, built
  the way the instrument is: nine drawbars at the real bars' ratios from a sine table, 3 dB a
  step, with the generator's fold-back, registration 88 8400 000 (the blues setting);
  percussion on the third harmonic, fast, single-trigger (a key struck while another is held
  gets none, a chord's keys all do); key click on and off; 2 / 6 ms attack and release; the
  scanner vibrato/chorus C3 (a 6.87 Hz swept delay mixed with the dry); a soft tube curve; a
  Leslie in chorale (horn 0.83 Hz above 800 Hz with doppler, swell and a sweep across the
  stereo field, drum 0.67 Hz under it). Velocity moves the level a little (0.7 + 0.3 v: the
  swell pedal following your hand; the instrument has no touch). Voices (16) are structs in a
  pool, the cabinet owns its delay lines, nothing allocates on the render thread. Measured
  offline (`-RenderScript "…,0:organ=1,0.5:on=55,…"`): a held G3 at 0.8 is −26.7 dBFS RMS
  steady, flat for as long as the key is down (−77 after note-off), where the piano's first
  second is −26.4; the onset 2–3 dB over the steady state (the percussion); spectral peaks at
  0.5, 1.0, 1.5 × f0 with the scanner's ±7 Hz sidebands; the Leslie swell about 6 dB at the
  drum's period; a four-note chord peaks at −12.8 dBFS; over the Slow Burn band (−24.5 RMS) a
  triad reads −23.0 and the peak −3.1, no clipping. Checks 307/307. Debug: `organ=1` / `organ=0`
  in a `-RenderScript`; `-instrument piano` at launch.

- **The organ is a sampled Hammond, and the piano is the default again, 0.1 (66), 2026-11-01.**
  Bart on the synthesized organ of 0.1 (65): "it's TERRIBLE. sounds like the dumbest instrument
  ever made". `Audio/Organ.swift` is gone. **Your instrument** keeps its two options, Piano
  (default now) / Organ; Organ is the FreePats **"Percussive organ emulation"** (CC0): a Hammond
  on 888 000 000 with percussion through a Leslie, rendered from the setBfree tonewheel emulator
  by the Strix SoundFont Team, 16 notes a major third apart C2..G#6, each a left and a right
  file (the Leslie's two sides, L/R correlation about 0, so it is real stereo). Cut by
  **`scripts/organ.py`** (`sounds-fetch.sh` downloads it with the rest) to `Sounds/org-<root>.caf`,
  4.4 MB, registered as `organ`. The set's two sides share a loop end but not a loop start, so
  the loop is cut again: the end is the set's, the start the point in the steady part where the
  60 ms before it best match the 60 ms before the end on both sides at once (seam correlation
  0.68–1.00; computing it from the pitch failed, −0.67 on E3: a tonewheel is a few cents off the
  tempered pitch). **The sampler** learned two things for it: a zone's `loop` (start and end
  frames) in `instruments.json` sets the sustain loop explicitly, at full level every pass, 200 ms
  crossfade (`SampleBuffer.bundled(_:loop:)`), where a recording without one still gets the
  measured tail loop of 0.1 (64); and an instrument's `touch` (0...1, default 1, the organ 0.35)
  scales how much velocity moves its level and picks its layer (`SampledInstrument.pick` returns
  the velocity it felt). **The engine** plays your keys on an override instrument instead of a
  separate synth: `EngineCommand.monitor(SampledInstrument?)`, `BandRenderer.monitorOverride`
  (nil: the band's own monitor), `Player.applyInstrument()` sends `SampledInstrument.shared("organ")`
  or nil. Level: the set is normalized to −14 dBFS peak (`NORM`), so a held G3 at 0.8 is −29 dBFS
  RMS and stays there (−30.2 after 14 s, 100 ms windows within ±4 dB from the Leslie, the biggest
  step 3 dB, −89 dBFS half a second after note-off), where the piano's first second at the same
  velocity is −29.0; its spectrum is the three drawbars (0.5, 1, 1.5 × f0, the sub-octave the
  strongest: the sound sits an octave under the written pitch the way an 888 Hammond does). Over
  the Slow Burn band (−24 RMS) a triad reads −19.8 and four notes −20.4, peak −3.0, no clipping.
  Checks 307/307 on the simulator and the Mac. The Rock organ emulation (888 888 888, driven) and
  the Drawbar one (888 8xx) from the same FreePats page are the alternatives if 888 reads too
  dark; swapping is one glob in `organ.py`. Debug: `organ=1` / `organ=0` in a `-RenderScript`.

- **Your instrument: a sampled Rhodes as the third option, 0.1 (67), 2026-11-01.** Bart, on the
  sampled organ: "this sounds alright - samples, right? … so why not do samples for a rhodes
  too, there's many online i'm pretty sure - as a third option". **Settings → Sound → Your
  instrument** is Piano / Organ / Rhodes (`instrument` = "rhodes"; `Player.yourInstrument`
  maps the setting to a manifest name, nil for the content's own). The Rhodes is **Jeff
  Learman's jRhodes3d** (github.com/sfzinstruments/jlearman.jRhodes3d): his 1977 Rhodes Mark I
  Stage 73 recorded from the harp connector, 65 full-length mono samples (up to 25 s), five
  velocity layers, every fourth white key F1..C7. **License: CC BY-NC 4.0 for distribution in
  an app**, commercial licenses on request from the author (jjlearman@gmail.com) — the one
  non-CC0/CC BY sound in Takt, taken because no CC0 or CC BY recording of a real Rhodes exists
  (FreePats has only a synthesized EP, VCSL none, the Freesound Mark II is sparse and mono);
  **a license from him is needed before Takt is sold** (Licenses/README.md). Cut by
  **`scripts/rhodes.py`** (`sounds-fetch.sh` downloads the zip) to `Sounds/rho-<root>-<layer>.caf`,
  11.8 MB, registered as `rhodes73`: the piano's cut (onset trim, tail at −60 dB or the 7/5/3.5 s
  cap, 40 ms fade), the SFZ's velocity groups as layers (ceilings 0.37 · 0.567 · 0.748 · 0.874 ·
  1.0; **the set's file names count the other way, `_5.flac` is the softest**, which cost one
  round: at first velocity 0.3 came out louder than 0.8), the dynamics baked in as the files
  are recorded at one level and the SFZ leaves them to the player (a layer's gain = the velocity
  at its group's centre, −14.5 dB soft to −0.5 hard), and the sustain loop chosen per file like
  the organ's: the longest loop up to 1.3 s before the fade whose seam correlates within 0.02 of
  the best (all 1.00), its decay per pass measured (−2.6 to −3.6 dB a pass on G3, −12 to −20 on
  the top notes that die anyway) and written as the zone's `loopDecay` (new in the manifest,
  default 1; `SampleBuffer.bundled(_:loop:decay:)`). Level: the set at −6 dBFS peak (`NORM`), so
  a G3 at 0.8 is −28.9 dBFS RMS in its first second where the piano's is −29.0, then −35 at 3 s,
  −45 at 7 s, −62 at 14 s (a Rhodes rings longer than the upright; the piano is at −78 by then),
  −90 half a second after note-off; at 0.3 it is −38.5 (ten dB of touch); held 14 s the biggest
  50 ms step is +0.1 dB (no seam audible in the numbers); four notes at 0.9 peak −9.7; over the
  Blue Lantern band a Dm7 peaks −6.5, no clipping. Checks 307/307 on the simulator and the Mac.
  Also: `scripts/sounds.py` got its `if __name__ == "__main__"` guard (importing it ran `main()`,
  which first deletes every file in `Takt/Sounds`; restored from git), and the RenderScript has
  `keys=<instrument>|0` for your keys' instrument by name.

- **Held notes on the Stage: "right, keep holding", 0.1 (68), 2026-11-01.** Bart: "games, esp
  chords, have long held notes, and they are instantly removed as soon as i hit the first note.
  Instead, there should be some UI that indicates both 'you hit it right' and also 'keep holding
  it'… a less saturated version of the note after the first hit". A hit note no longer vanishes
  from the highway: the "PERFECT" / "GOOD" pop still fires, and the capsule stays as a wash of
  itself (`cue` at 0.38) with a crisp `cue` outline while the key is down, clipped above the hit
  line, so the line eats it as it slides and what is left above the line is how long to keep
  holding. Let go early and the outline drops and the wash fades to 0.16 (nothing scores the
  release: the engine judges onsets, as before). `GameEngine.onHighway(from:to:)` keeps a note
  on the highway while it lasts (`notes(from:to:)` still goes by onset, autoplay plans from it);
  `Player.gameState()` draws from it. Checked with `-SnapshotAt` on Blue Lantern chords Hard at
  ticks 7 and 40 (the Dm7 held under the line in both themes); checks 307/307.

- **The set list tucked, and two old-school blues tracks: 0.1 (69), 2026-11-01.** Bart: "Keep slow
  burn, slow burn short, boogie shoes, pearl street in the game. Tuck all the other tracks under a
  pretty small 'all tracks' card at the bottom of the stage tab", then "make 2 new blues tracks
  with a slightly different musical taste, more like super old school blues" (Robert Johnson's
  Delta, Muddy Waters' Chicago) "without any charts". The Stage shows the first four of
  `Song.catalog` in full (`StageScreen.featured`); under them `AllTracksCard` (small: the title,
  "Eight more · " the names in one line, a chevron) opens the rest as full cards below it
  (`-AllTracks 1` opens it at launch). The two tracks sit first under it, uncharted (the weights are
  honest, the ladders fall out of the rules; BLUES.md's bands were not tuned):
  **Dockery** (`scripts/songs/dockery.py`, Delta blues in A at 96, 2:00): one piano, both hands
  (the chords part is the left hand's Delta thumb, boom-chick and the chromatic turnaround; the
  melody part is the right hand, the voice and the bottleneck, on the horns channel played by the
  piano), a foot stomp (the kick at −9) on every beat, every chorus opening in two bars of stop
  time with the voice alone, the third chorus up an octave with the slide's tremolo (band channel
  only). Needs an `xstick` sound for the count-in click even with no drummer (the renderer traps
  without one). Levels keys +5, horns +6: RMS −26.5, peak −4.0 (the band tracks sit at −23).
  **Maxwell Street** (`scripts/songs/maxwell_street.py`, Chicago blues in A at 80, 2:24): the
  stop-time 12-bar (A7 × 8, then E7 D7 A7 E7), an original blues-scale walk-up riff (A C D E♭ E)
  slammed in unison by bass, piano and sax on the even bars, the sax's answers in the gaps, the
  release swinging, a shuffle chorus on the ride with the riff every bar, Spann's tremolo on the
  band's keys, the out chorus ending on one big stop. RMS −25.0, peak −2.7, no clipping; the riff
  bars −23.4 against the gaps −29.3. Glyphs `crossroads` and `stoptime` in `SongArt`. Checks
  325/325 (18 new, the two songs' ladders).

- **Dockery hits harder: 0.1 (70), 2026-11-01.** Bart: "Dockery needs some more dirt. maybe a kick
  drum, or a little louder chords or something... make it hit harder". The foot is a kick drum now
  (gain −3, 0.95 on the 1 and the 3, 0.7 on 2 and 4, the triplet push into the 3 once the hands
  drive), the heel's chick louder, and a cross-stick slap on the backbeat in the driving bars (the
  one-man-band way; the stops stay bare). The bass doubles the thumb an octave down (A1, the boom
  under the boom-chick). The hands play harder (thumb 0.74, chick 0.56, slam 0.92; the voice 0.88 /
  0.76 / 0.62) at keys +4, horns +4, bass −1. RMS −21.7 (was −26.5; the band tracks sit at −23,
  the electronic ones at −19), peak −1.0, no clipping. The first pass at keys/horns +7 hit −19.3
  with the peak at −0.8, too hot against the knee.

- **Dockery on a sampled guitar: 0.1 (71), 2026-11-01.** Bart: "try the sampled steel string guitar -
  add it to dockery - make it dirty". The search: FreePats' FSS Steel-String is GPL (not ours to
  ship), sfzinstruments' OvationGuitar has no license, VCSL has no guitar; **Karoryfer's
  Shinyguitar** (D. Smolken, github.com/sfzinstruments/karoryfer.shinyguitar) is CC0 and an archtop
  played acoustic into a microphone, the 1930s blues guitar. `scripts/guitar.py` cuts it: 17 notes a
  minor third apart (E2..C6), four velocity layers x two round robins, capped at 2.8 s, the layers
  set 12 dB apart with the set's peak at −3 (`guitar`, release 0.12); the six dead strings as
  `guitarMute` (filed under each string's pitch); four knocks on the body as `guitarPerc`; 152 files,
  10.8 MB. Dockery is all guitar now: the thumb and the chick (three-note chicks, the fifth, the
  root and the third; the chick on the 2 and the 4 is a dead-string slap on the record), the voice
  on the same guitar on the horns channel, your keys play the guitar on both parts; the body
  knocks take the backbeat from the cross-stick; the kick, the heel and the bass under the thumb
  stay from 0.1 (70). Everything plays hot (the hardest layer is the dirt). Levels keys +2,
  horns +2, bass −1: RMS −23.0 (the band tracks), peak −1.0, no clipping. Checks 325/325. Built and
  checked in a separate worktree because another session was mid-change in this checkout
  (`Takt/Mods/`); only these files were committed.

- **Agent mode: your own version of a track, charted by the agent. 0.1 (72), 2026-11-01.** Bart:
  "a new feature called AGENT MODE… patterned on the dodo agent, but more targeted: the user can
  request changes to the melody or chords charts for a track… we clone the track for them (Slow
  Burn > Slow Burn mod01)… stored in that user's table… 'medium on melody is way too hard, get rid
  of half the notes', 'add a funky super hard solo towards the end'… a lightweight backend for
  delivering track bundles… think like a designer… it's the agentic superpower of the app!"
  **What you see:** Practice's sibling — **Agent** (the small outlined button, lit) on every song
  card, and **Agent mode** under Practice on the pause menu. A sheet (`Mods/AgentSheet.swift`):
  AGENT MODE, the song, four things to try on an empty thread, a composer. Send, and the agent
  works in view — a pulse, the seconds, each step as it happens ("Reading the sax line, bars
  1–12", "Writing 70 notes into bars 13–24 of the sax line", "Setting the levels of the sax
  line") — then its report in plain words with the figures (Medium 0.97 → 0.50 a second, level 3
  of 7: the tune's main notes), then **the new version as a card**: SLOW BURN SHORT MOD 01, a V1
  badge, the agent's one-line description, every part's four levels in onsets a second with
  "was" where one moved, Play and Practice. The mod sits on the set list under the song it came
  from (the badge says V2, V3 as the thread goes on; Agent on its card continues it; Remove in
  the sheet's header takes it off the account). From the pause menu the agent knows the bar and
  the section you stopped in. The original is never touched; a mod has its own board.
  **The agent** (`src/lib/takt/mod-agent.ts`, Opus 5.5, the dodo's loop shape): one turn per
  message with song tools (`mod-tools.ts`): read_song (everything, with the ladder), read_notes,
  write_notes (a passage, mirrored into the band's channel with the song's own velocities and
  the long-tone instrument), set_weights, set_levels (the song's own charting, the shape of
  charting.json's `songs.<name>`), measure, add_bars / remove_bars (a solo chorus = copy the last
  one, write over it), set_sections, set_form, set_title (the title and the card's line),
  set_tempo. Every edit is validated against the app's own rules (`songfile.ts` mirrors
  Song.validate and BandData) and refused rather than saved broken, so nothing it makes can
  trap the app. Its system prompt carries the format, the ladder and CHARTING.md's rules (half
  as hard = half the figure; find the rung, or rewrite the weights when none is near; a level is
  still the line; the speed never changes). **It measures exactly what the app will play:**
  `src/lib/takt/charting.ts` is `Charting.swift` ported line for line, proven by
  `scripts/takt/charting-check.ts` against the app's `-DumpCharts <file>` (every song, part and
  tier identical; run both after touching either), and the app sends its own figures with every
  message (`Song.ladder`), which the server compares and logs on any disagreement.
  **Delivery, Dodo-topics style:** `takt_mods` (schema 003, applied 2026-11-01): the whole song
  file, the charting override, the thread, a version that counts the turns that changed it
  (0 = a thread that changed nothing yet; the set list hides it, the next message continues it).
  `GET/POST /api/takt/mods`, `GET/DELETE /api/takt/mods/<id>`, `POST …/<id>/agent`; a turn
  streams server-sent events (`mod` when the row exists, `status` per step, `reply`, `done` with
  the bundle; a ping every 10 s; `maxDuration` 300). The app's `ModStore` keeps every bundle in
  Application Support/mods, syncs with the account after it is known (new and newer come down,
  deleted go), loads mods as `Song`s with `Song.ModInfo` (`Song(name:data:mod:)` throws instead
  of trapping), charts them with `song.charting` (`Charting.overriding`), and the renderer's
  cache keys on `song.version` so a new turn is a new band. `AppModel.songs` interleaves mods
  under their base; `-LoadMod <file>` puts a saved bundle on the set list without an account;
  `-AgentSheet <song> [-AgentSay "…"]` opens the sheet (over `-Route game`, with the position)
  and sends; `-ScrollTo <song name>` lands the set list on a card. The phone card's buttons
  are two rows now (Play · Board · best, then Practice · Agent): four didn't fit 360 pt.
  **Verified:** `scripts/takt/mod-agent-check.ts https://ola.cx` (a guest, the half-the-notes ask
  → v1 Medium L5 0.97 → L3 0.50 in 33 s, a question that leaves the version alone, a solo chorus
  → v2, 24 bars, Hard 1.13 → 1.66, list, GET, DELETE: 15/15); the Mac app on this account
  through the sheet (the solo ask, 7 steps, the card, both themes); the simulator the same; a
  Hard autoplay run on the v2 bundle through its Solo section to an S. Checks 330/330 (five new
  mod cases), charting-check 41/41. This Air's local Anthropic key is stale, so the live turns
  run against production. Not yet: a catalog of published mods (the row shape is ready for it);
  the agent writing a new comping under a solo (it offers; the chords part only changes on ask).
  **Versions (0.1 (74), 2026-11-02).** Bart: "when a user invokes the agent and we clone the
  track, then after that all changes are changes to that same cloned version, and we keep a
  version history so we can easily roll back to a prior version". One version per song: Agent
  on a bundled song that already has your version opens that version's thread
  (`AppModel.existingMod`), from the card and from the pause menu alike; a second clone only
  happens after Remove. Every saved version is kept — `takt_mod_versions` (schema 004,
  applied): v0 the clone as made (the original), then one per turn that changed the song, each
  with the ask that made it — and the bundle carries the list (`versions`). **Versions** in the
  sheet's header (V3 on the phone) opens the history, newest first, the ask and the card line
  per version, **Restore** on every one but the current: a restore is a new version with the
  old content (`POST …/<id>/rollback {version}`, "Back to v1" in the history and a line in the
  thread), so nothing is ever lost and the thread stays linear. The agent has the same move
  (`roll_back` tool, the history in its message): "undo the solo", "start over from the
  original". A mod from before the history gets its current state filed as its first entry on
  its next turn. `GET …/<id>/versions` lists the history. DEBUG `-AgentVersions 1` opens the
  panel. Checks: `mod-agent-check.ts` (history v0/v1/v2 with their asks, rollback to v1 → v3
  with v1's 12 bars and 4 entries, a rollback to the current version refused), LessonCheck
  (the history parses in order).

- **Friars Point, the fast loud Delta: 0.1 (73), 2026-11-01.** Bart: "make another delta blues
  track, still in the style of robert Johnson… a louder or faster kind". In genre: Johnson's I
  Believe I'll Dust My Broom and Sweet Home Chicago are the boogie thumb on the low strings under a
  slide hammering triplets; They're Red Hot is a sprint. `scripts/songs/friars_point.py`: Delta
  boogie in E at 116, five choruses (2:04), the same guitar and foot as Dockery. The chords part is
  the thumb's walk (root, fifth, sixth, seventh and back, a note a beat) with the chord chick on
  every late eighth (dead strings on the record); the melody part is the slide figure (the high note
  hammered in triplets for two beats, the step, the landing) answered by the voice, a slide chorus
  of figures in the middle, one big stop at the end. Kick −2, knocks on the body on the backbeat,
  the bass under the thumb. RMS −22.6, peak −1.3, no clipping. Glyph `triplets`. Then Bart:
  "give them each melody and chords parts to be played on keys… make sure to use our .md file
  that has the technical details of how to do the difficulty leveling". Both Delta tracks' parts
  now have `monitor: piano` (your keys play the piano, or the Rhodes or the organ from Settings;
  the record's guitar plays what your part leaves out; no keys channel was added to the records),
  and both are charted to BLUES.md: the blues melody patch in `charting.json` (`easy: 2`,
  `phrase: 12`, tier 2 `space: 0`) for both melodies, `chords: {easy: 2}` for Dockery. Ladders:
  Dockery melody 0.27 · 0.50 · 0.78 · 1.11 · 1.18 · 1.18 · 1.50, chords 0.40 · 0.79 · 1.54 ×4 ·
  2.82 (Medium is the thumb on every beat, the one rung a thumb has); Friars Point melody 0.24 ·
  0.55 · 0.80 · 1.34 · 1.42 · 1.86 · 2.80 (Beginner is every other anchor: at 116 a bar is 2.07 s,
  under the 2.4 s gap; Beginner cannot borrow, so Easy is 2.3× it, noted in the sheet as open),
  chords 0.24 · 0.48 · 0.96 · 0.96 · 1.91 · 1.91 · 3.68 unpatched. Columns for both in BLUES.md.
  Checks 339/339 (with the Agent mode checks of 0.1 (72)). Dockery's card line says "One guitar"
  now. Built in a separate worktree again (the Agent mode session was mid-change here).

- **Six on the Stage: 0.1 (75), 2026-11-01.** Bart: "add dockery and friars point to the main Stage
  listing screen, not All Tracks". `StageScreen.featured` is 6: the four blues tracks and the two
  Delta ones in full, All tracks holds the seven others. (74 is the Agent mode session's build.)

- **The launch sounds: 0.1 (76), 2026-11-01.** Bart: "add a setting where users can pick any of
  those 3 as their startup sound, but the default is Blues and that sound sequence is part of our
  startup sequence, when the letters TAKT 1234 light up". The count-in package in
  `misc/takt-countin2.zip` (another agent's: a README spec, `render.py`, six one-shot cues a set,
  48 kHz) gives three sets Bart auditioned, blues (a Rhodes warming up: C2 and middle C, the blue
  third, A flicked to B♭, the C9 on the landing), acid (a 303 opening its filter count by count,
  a dub landing) and deep (a Sub 37 gliding, a soft kick and a Rhodes Cm9 on the landing). The
  cues are in `Takt/Sounds/launch-<set>-<cue>.caf` (b1…b4, swell, land; 18 files, 1.2 MB, ALAC
  from the package's WAVs), the generator kept at `scripts/launch-sounds/render.py` (own work,
  synthesized; a launch jingle, not an instrument you play). `Audio/LaunchSound.swift` loads a
  set into six AVAudioPlayerNodes attached to the app's own AVAudioEngine
  (`AudioEngine.makePlayer` / `detach`, so they share the output and `-Silent`) and schedules
  them on host time: a cue a beat from beat 1, the 0.34 s swell ending on the landing, the
  landing on the 1 the band comes in on (the menu band is in C, so is every landing). The splash
  (`CountInSplash`) schedules the sound 80 ms ahead and waits for the same instant before
  lighting T, so lights and cues share the mach clock; a tap before the landing lands at once,
  Reduce Motion lands at 0.6 s. The count runs at the band's tempo as before, so the cues sit
  wider apart than the 121 bpm previews on a slow menu band (each cue is under 300 ms of music
  with a tail, so any tempo works). Settings → Sound → **Launch sound**: Blues (default) / Acid /
  Deep / Off, with "Hear it" (the full count at the band's tempo, now). `-LaunchSoundCheck 1`
  proves every set's six cues load. Not taken from the package: its once-a-day rule, its own
  AVAudioEngine and ambient session, the other three sets (soundcheck, boogie, latenight).
  Verified (2026-11-02, once this Mac's coreaudiod had come back on its own; it was wedged on
  the 1st and every app touching the audio session hung at start): both targets build,
  `-LessonCheck` 340/340 on the Mac, `-LaunchSoundCheck` PASS for all three sets (cues ~2.0 s,
  swell 0.34 s, land 2.4–4.1 s), Settings → Sound shows the row, and a real launch with the
  splash and sound on runs the count through. Run the Mac binary for a check with `open -W -g -n
  --stdout <file> /Applications/Takt.app --args …`, not from the shell directly: launched from
  the shell, the app's audio session start takes the shell down with it (exit 144).

- **Launch cues as gestures: 0.1 (77), 2026-11-02.** Bart: "the startup sounds are a little too
  non-artistic. they are single notes so it feels a little stilted. do a double note, or a hold,
  or a bend etc to liven things up some - in all 3 versions". `scripts/launch-sounds/render.py`
  grew a pitch bend and a vibrato on the Rhodes (`rhodes(bend:, vib:)`), 303 slides between tied
  notes (`acid`, a fifth tuple field) and a filter wah on the Sub 37 (`sub37(wah:)`), and every
  set's four cues are gestures of about 400 ms with a tail. Blues: C2 and C4 doubled by the thumb
  with the E; E♭ slipping to a held, shaking E with the G landing on it; G bent up from F♯ and
  held, the octave answering; A–B♭–A–B♭ shaken into the 1 over C2. Acid: B♭ sliding up to C2;
  C2 then the octave pop; E♭ held while the squelch sweeps down; the G accent sliding up to B♭
  for the 1. Deep: C2 and the octave popping after it; C3 bent up slowly from C2 and held; the
  B♭ double tap; G held with the filter rocking into the 1. Landings and swells unchanged; the
  18 CAFs regenerated (1.3 MB), previews at 70 (the menu band) and 121 bpm in `~/Desktop/takt/`.
  Verified on the Mac: `-LaunchSoundCheck` PASS ×3, `-LessonCheck` 340/340, a real launch with
  sound runs the count through.
- **The count says its name: 0.1 (78), 2026-11-02.** Bart: "add some more badassery to the launch
  screen", then picked from a list of German words. The header is a dictionary line, "Takt (m.):
  the bar, the beat, the pulse." (it replaces "Count-in · 4/4"; the iPhone drops the header's BPM,
  the band card has it). The numerals beside T, A, K, T are EINS, ZWEI, DREI, VIER in the display
  face. The 1 is a hit: the screen goes full `signal` with AUF DIE EINS (one line on the Mac,
  stacked AUF / DIE / EINS on the iPhone, EINS spanning the width) and a small "On the one". The
  band now starts on `onDownbeat`, separately from `onFinished`: the landing holds two beats,
  0.7 to 1.2 s, over the band coming in, then the 0.25 s fade. A tap skips straight past it, with
  no line. DEBUG `-Splash 1 -SplashBeat n` holds a beat (0 to 3) or the landing (4) for a
  screenshot. Verified: a recording of a real launch at 70 BPM on the simulator (a beat every
  0.86 s, the landing on the 1, the fade into the app), both layouts shot on simulator and Mac.

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
