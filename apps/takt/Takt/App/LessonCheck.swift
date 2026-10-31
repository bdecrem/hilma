#if DEBUG
import Foundation

/// `-LessonCheck`: the Scorer, the LessonEngine and the TransportClock against scripted
/// players (the same Autoplay planner the app uses), no audio. One line per case.
///
///   xcrun simctl launch --console <sim> com.bartdecrem.Takt -LessonCheck 1 [-ExportTo <file.mid>]
enum LessonCheck {
    static func run() -> Bool {
        let lesson = Lesson.bundled("lesson-A1")
        let tpb = 12
        let loop = lesson.form.count * 4 * tpb
        let step = lesson.steps[0]
        let expected = lesson.expected(step, ticksPerBeat: tpb)
        var passed = 0, failed = 0
        func check(_ name: String, _ ok: Bool, _ info: String = "") {
            print("\(ok ? "PASS" : "FAIL")  \(name)\(info.isEmpty ? "" : "  · \(info)")")
            if ok { passed += 1 } else { failed += 1 }
        }
        func msPerTick(_ bpm: Double) -> Double { 60000 / (bpm * Double(tpb)) }

        // MARK: Scorer

        /// One press per expected note of a chorus: `note` picks the key (nil skips it).
        func chorus(_ c: Int = 0, bpm: Double = 70, offsetMs: (ExpectedNote) -> Double = { _ in 0 },
                    note: (ExpectedNote) -> Int? = { $0.display }) -> [PlayedNote] {
            expected.compactMap { e in
                note(e).map { PlayedNote(note: $0, tick: Double(c * loop + e.tick) + offsetMs(e) / msPerTick(bpm),
                                         msPerTick: msPerTick(bpm)) }
            }
        }
        func judge(_ presses: [PlayedNote]) -> ChorusResult {
            Scorer.judge(chorus: 0, expected: expected, played: presses, loopTicks: loop, ticksPerBeat: tpb, rules: ScoringRules())
        }
        func text(_ r: ChorusResult) -> String { "\(r.clean ? "clean" : "not clean") · \(r.summary) · \(r.detail)" }
        func doubled(_ bars: [Int]) -> [PlayedNote] {
            chorus() + expected.filter { bars.contains($0.bar) }.map {
                PlayedNote(note: $0.display, tick: Double($0.tick) + 150 / msPerTick(70), msPerTick: msPerTick(70))
            }
        }

        var r = judge(chorus())
        check("perfect at 70 is clean", r.clean && r.hits == 12 && r.extras.isEmpty && r.detail == "12 of 12", text(r))
        r = judge(chorus(offsetMs: { _ in -50 }))
        check("50 ms early at 70 is clean (±100)", r.clean && r.detail == "12 of 12", text(r))
        r = judge(chorus(offsetMs: { _ in -110 }))
        check("110 ms early at 70 is not", !r.clean && r.problems.first == "Rushed every bar.", text(r))
        r = judge(chorus(bpm: 80, offsetMs: { _ in 95 }))
        check("95 ms late at 80 is clean (80 is still ±100)", r.clean, text(r))
        r = judge(chorus(bpm: 90, offsetMs: { _ in 78 }))
        check("78 ms late at 90 is clean (±80)", r.clean, text(r))
        r = judge(chorus(bpm: 90, offsetMs: { _ in 85 }))
        check("85 ms late at 90 is not", !r.clean && r.problems.first == "Dragged every bar.", text(r))
        r = judge(chorus(note: { $0.bar == 2 ? nil : $0.display }))
        check("one bar missed is clean (11 of 12)", r.clean && r.summary == "Clean. Missed bar 3.", text(r))
        r = judge(chorus(note: { [2, 6].contains($0.bar) ? nil : $0.display }))
        check("two bars missed is not", !r.clean && r.problems.first == "Missed bars 3 and 7.", text(r))
        r = judge(chorus(note: { 36 + $0.pitchClass + 12 * ($0.bar % 3) }))
        check("any octave from C2 counts", r.clean && r.hits == 12, text(r))
        r = judge(chorus(note: { $0.pitchClass == 0 ? 72 : $0.display }))
        check("C5 counts", r.clean && r.hits == 12, text(r))
        r = judge(chorus(note: { $0.bar == 0 ? 84 : $0.bar == 4 ? 29 : $0.display }))
        check("C6 and F1 are out of range", !r.clean && r.problems.contains("Too high in bar 1.")
              && r.problems.contains("Too low in bar 5."), text(r))
        r = judge(chorus(note: { $0.bar == 9 ? 55 : $0.display }))
        check("one wrong note is clean (11 of 12, 1 extra)", r.clean && r.summary == "Clean. Wrong note in bar 10.", text(r))
        r = judge(doubled([1, 5]))
        check("two doubled notes are clean", r.clean && r.extras.count == 2, text(r))
        r = judge(doubled([1, 5, 9]))
        check("three doubled notes are not", !r.clean && r.problems.first == "Extra notes in bars 2, 6 and 10.", text(r))
        r = judge(chorus() + chorus(note: { $0.display + 7 }))
        check("root and fifth together is not", !r.clean && r.problems.first == "Wrong notes in every bar.", text(r))
        r = judge(chorus(offsetMs: { $0.bar % 2 == 0 ? -120 : 0 }))
        check("the detail counts, no milliseconds", !r.clean && r.detail == "6 of 12 · 6 rushed", text(r))
        for (bars, want) in [([8], "bar 9"), ([4, 8], "bars 5 and 9"), ([1, 4, 8], "bars 2, 5 and 9"),
                             ([0, 1, 2, 3, 8], "bars 1–4 and 9"), ([1, 2], "bars 2 and 3"), (Array(0..<12), "every bar")] {
            let got = Scorer.barList(bars, total: 12)
            check("bar list: \(want)", got == want, got)
        }

        // MARK: LessonEngine

        struct Run {
            var verdicts: [LessonEngine.Verdict] = []
            /// Coach line and [now, next] keys on beat 3 of each bar (segment × 1000 + bar).
            var coach: [Int: String] = [:]
            var keys: [Int: [Int?]] = [:]
            var output = LessonEngine.Output()
            /// Step 1's gate passed: the last verdict says so, and the lesson moved on to the card.
            var passed: Bool { verdicts.last?.line == "Two clean. That's the form." && output.step == 2 }
        }
        /// Rolls the transport through each segment from tick 0 (a new segment = Stop, then Play),
        /// handing the presses to the engine as they are heard.
        /// `hidden`: no display frames there (a hidden window); presses still arrive.
        func simulate(_ segments: [(presses: [PlayedNote], through: Double)], bpm: Double = 70,
                      hidden: Range<Double> = 0..<0) -> Run {
            let engine = LessonEngine(lesson: lesson, ticksPerBeat: tpb)
            var run = Run()
            engine.onVerdict = { run.verdicts.append($0) }
            for (epoch, segment) in segments.enumerated() {
                var pending = segment.presses.sorted { $0.tick < $1.tick }
                var tick = 0.0
                while tick <= segment.through {
                    // Like the app: the display frame first, then the presses heard by then.
                    if !hidden.contains(tick) || epoch > 0 || tick == 0 {
                        engine.heard(tick: tick, tempo: bpm, rolling: true, epoch: epoch)
                    }
                    while let p = pending.first, p.tick <= tick {
                        engine.played(note: p.note, tick: p.tick, msPerTick: p.msPerTick, epoch: epoch)
                        pending.removeFirst()
                    }
                    if tick.truncatingRemainder(dividingBy: Double(4 * tpb)) == Double(2 * tpb) {
                        let key = epoch * 1000 + Int(tick) / (4 * tpb)
                        run.coach[key] = engine.output.coach
                        run.keys[key] = [engine.output.nowNote, engine.output.nextNote]
                    }
                    tick += 0.25
                }
            }
            run.output = engine.output
            return run
        }
        func autoplay(_ mode: Autoplay.Mode, bpm: Double = 70, choruses: Int) -> [PlayedNote] {
            var a = Autoplay(mode: mode, plannedThrough: -0.01)
            return a.plan(through: Double(choruses * loop), expected: expected, loopTicks: loop, msPerTick: msPerTick(bpm))
                .map { PlayedNote(note: $0.note, tick: $0.tick, msPerTick: msPerTick(bpm)) }
        }
        func text(_ run: Run) -> String {
            run.verdicts.map { "c\($0.chorus + 1): \($0.line)" }.joined(separator: " | ")
        }
        let end = { (choruses: Int) in Double(choruses * loop) + 1 }

        do {
            // The live needle: each press marked as it lands, a miss once its half beat has passed.
            let engine = LessonEngine(lesson: lesson, ticksPerBeat: tpb)
            let mpt = msPerTick(70)
            var marks: [LessonEngine.NoteMark] = []
            var tick = 0.0
            func roll(to t: Double) {
                while tick <= t { engine.heard(tick: tick, tempo: 70, rolling: true, epoch: 0); tick += 1 }
            }
            func press(_ note: Int, at t: Double) {
                roll(to: t)
                engine.played(note: note, tick: t, msPerTick: mpt, epoch: 0)
                if let m = engine.output.lastNote, m.seq != marks.last?.seq { marks.append(m) }
            }
            let e = expected
            press(e[0].display, at: Double(e[0].tick) + 20 / mpt)
            press(e[1].display, at: Double(e[1].tick) - 150 / mpt)
            press(e[2].display + 1, at: Double(e[2].tick))
            roll(to: Double(e[3].tick) + Double(tpb))
            if let m = engine.output.lastNote, m.seq != marks.last?.seq { marks.append(m) }
            check("needle: hit, rushed, wrong note, missed", marks.map(\.kind) == [.hit, .early, .wrong, .missed]
                  && abs((marks[0].offsetMs ?? 0) - 20) < 0.5 && marks[0].windowMs == 100 && marks[3].offsetMs == nil,
                  marks.map { "\($0.kind) \($0.offsetMs.map { String(format: "%.0f", $0) } ?? "-")" }.joined(separator: ", "))
            check("needle words", NoteNeedle.word(marks[0]) == "On time" && NoteNeedle.word(marks[1]) == "Rushed"
                  && NoteNeedle.word(.init(kind: .hit, offsetMs: 60, windowMs: 100, seq: 9)) == "A bit late"
                  && NoteNeedle.word(marks[3]) == "Missed" && NoteNeedle.angle(marks[3]) == 0)
            roll(to: Double(e[3].tick) + Double(12 * tpb))
            check("needle: no misses once the player stops", engine.output.lastNote?.seq == marks.last?.seq)

            // Tap mode in a lesson: the expected chord nearest the tap, wrapping round the loop.
            let tapped = LessonEngine(lesson: lesson, ticksPerBeat: tpb)
            tapped.heard(tick: 0, tempo: 70, rolling: true, epoch: 0)
            let keysAt = { (t: Int) in Set(e.filter { $0.tick == t }.map(\.display)) }
            check("tap mode: a tap in a lesson plays the expected notes nearest it",
                  Set(tapped.due(at: Double(e[1].tick) - 3)) == keysAt(e[1].tick)
                  && Set(tapped.due(at: Double(loop) - 1)) == keysAt(e[0].tick),
                  "\(tapped.due(at: Double(e[1].tick) - 3)) vs \(keysAt(e[1].tick))")

            // Off the count-in: the first note a hair before tick 0 (the lead), then the next
            // frames still before 0. Crashed the Mac build on 2026-10-26 (an empty range).
            let early = LessonEngine(lesson: lesson, ticksPerBeat: tpb)
            early.heard(tick: -8, tempo: 70, rolling: true, epoch: 0)
            early.played(note: e[0].display, tick: -1, msPerTick: mpt, epoch: 0)
            early.heard(tick: -2, tempo: 70, rolling: true, epoch: 0)
            early.heard(tick: 1, tempo: 70, rolling: true, epoch: 0)
            check("needle: an early first note off the count-in doesn't crash, and is a hit",
                  early.output.lastNote?.kind == .hit, "\(String(describing: early.output.lastNote))")
        }

        do {
            // Lessons over steps: five lessons cover the six steps, the card closing lesson 1.
            check("lessons: seven over eight steps (the payoff graduates, two chord lessons after it)", lesson.lessons.count == 7 && lesson.lessonIndex(ofStep: 1) == 0
                  && lesson.lessonIndex(ofStep: 2) == 1 && lesson.firstStep(ofLesson: 1) == 2 && lesson.firstStep(ofLesson: 4) == 5
                  && lesson.firstStep(ofLesson: 5) == 6 && lesson.lessonStepCount == 8)
            check("lessons: done from the step reached (old records)", lesson.lessonsDone(reachedStep: 1) == 0
                  && lesson.lessonsDone(reachedStep: 2) == 1 && lesson.lessonsDone(reachedStep: 3) == 1
                  && lesson.lessonsDone(reachedStep: 4) == 2 && lesson.lessonsDone(reachedStep: 6) == 4)

            // Gated (the app): intro → Start → two clean → Lesson complete (the card folded in) →
            // Start lesson 2 → the shuffle's intro.
            let g = LessonEngine(lesson: lesson, ticksPerBeat: tpb, gated: true)
            g.heard(tick: 0, tempo: 70, rolling: true, epoch: 0)
            let intro = g.output.intro
            check("gated: lesson 1 opens on its intro, pinky, with its goal", intro?.title == "Roots on the 1" && intro?.number == 1
                  && intro?.count == 7 && intro?.goal == "2 clean choruses at 70" && intro?.fingers.map(\.finger) == [5]
                  && g.output.nowNote == nil && g.output.lesson == 1 && g.output.lessonTitle == "Roots on the 1",
                  "\(String(describing: intro))")
            g.begin()
            let presses = autoplay(.perfect, choruses: 3)
            var pending = presses
            var t = 0.0
            while t <= Double(2 * loop) + 1 {
                g.heard(tick: t, tempo: 70, rolling: true, epoch: 0)
                while let p = pending.first, p.tick <= t { g.played(note: p.note, tick: p.tick, msPerTick: p.msPerTick, epoch: 0); pending.removeFirst() }
                t += 1
            }
            let c = g.output.complete
            check("gated: two clean → Lesson complete with the card, lesson 2 waiting", c?.number == 1 && c?.done == "Roots on the 1"
                  && c?.card == lesson.steps[1].card && c?.next?.number == 2 && c?.next?.title == "The shuffle"
                  && g.output.step == 1 && g.output.nowNote == nil,
                  "step \(g.output.step) complete \(String(describing: c))")
            g.advance()
            check("gated: Start lesson 2 skips the card, scoring from the top", g.output.step == 3 && g.output.lesson == 2
                  && g.output.card == nil && g.output.complete == nil && g.output.intro == nil)
            let g2 = LessonEngine(lesson: lesson, ticksPerBeat: tpb, gated: true)
            g2.start(step: 2)
            g2.heard(tick: 0, tempo: 70, rolling: true, epoch: 0)
            let shuffle = g2.output.intro
            check("gated: the shuffle's intro, pinky on the root and thumb on the fifth", g2.output.step == 3 && shuffle?.number == 2
                  && shuffle?.fingers == [.init(finger: 5, tone: "root", beats: [1]), .init(finger: 1, tone: "fifth", beats: [1])]
                  && shuffle?.about != nil, "\(String(describing: shuffle))")
            g2.begin()
            g2.heard(tick: 2, tempo: 70, rolling: true, epoch: 0)
            check("gated: the keyboard shows C pinky, G thumb in bar 1, both lit", g2.output.fingers == [lesson.displayRoot: 5, lesson.displayRoot + 7: 1]
                  && g2.output.nowNotes == [lesson.displayRoot, lesson.displayRoot + 7], "\(g2.output.fingers) \(g2.output.nowNotes)")

            // The shuffle is a chord: root and fifth together on the 1, held, every note required,
            // with half as much again of timing room.
            let shuffleStep = lesson.steps[2]
            let dyad = lesson.expected(shuffleStep, ticksPerBeat: tpb)
            let mpt = msPerTick(70)
            func judgeDyad(_ presses: [PlayedNote]) -> ChorusResult {
                Scorer.judge(chorus: 0, expected: dyad, played: presses, loopTicks: loop, ticksPerBeat: tpb, rules: ScoringRules())
            }
            func dyadChorus(offsetMs: (ExpectedNote) -> Double = { _ in 0 }, drop: (ExpectedNote) -> Bool = { _ in false }) -> [PlayedNote] {
                dyad.filter { !drop($0) }.map { PlayedNote(note: $0.display, tick: Double($0.tick) + offsetMs($0) / mpt, msPerTick: mpt) }
            }
            check("chord: 24 expected notes, all marked chord", dyad.count == 24 && dyad.allSatisfy(\.chord))
            var cr = judgeDyad(dyadChorus())
            check("chord: root and fifth together on the 1 is clean", cr.clean && cr.hits == 24 && cr.extras.isEmpty, text(cr))
            cr = judgeDyad(dyadChorus(offsetMs: { $0.finger == 1 ? 130 : 0 }))
            check("chord: the fifth 130 ms late still hits (±150 for a chord at 70)", cr.clean && cr.hits == 24, text(cr))
            cr = judgeDyad(dyadChorus(offsetMs: { _ in 160 }))
            check("chord: 160 ms late is dragged", !cr.clean && cr.problems.first == "Dragged every bar.", text(cr))
            cr = judgeDyad(dyadChorus(drop: { $0.finger == 1 }))
            check("chord: the fifth missing everywhere is missed, not clean", !cr.clean && cr.hits == 12
                  && cr.problems.first == "Missed every bar.", text(cr))
            cr = judgeDyad(dyadChorus(drop: { $0.finger == 1 && $0.bar == 4 }))
            check("chord: one fifth missing once is still clean (23 of 24)", cr.clean && cr.hits == 23, text(cr))
            // Bart's chorus of 2026-10-26 21:11: the chord held through the bar, in late by 20–76 ms.
            cr = judgeDyad(dyadChorus(offsetMs: { 20 + Double($0.bar * 5) }))
            check("chord: a held chord 20–75 ms late every bar is clean", cr.clean && cr.hits == 24, text(cr))
        }

        do {
            // Scales: right hand, one octave, over a three-bar cycle (two of notes, one hold); the minor variant on A.
            let major = Lesson.bundled("lesson-S1"), minor = Lesson.bundled("lesson-S1m")
            let up = major.expected(major.steps[0], ticksPerBeat: tpb)
            check("scales: C major up is C D E F G A B C, a note a beat over two bars, four times",
                  up.count == 32 && up.prefix(8).map(\.display) == [48, 50, 52, 53, 55, 57, 59, 60]
                  && up.prefix(8).map(\.tick) == (0..<8).map { $0 * tpb } && up[8].tick == 3 * 4 * tpb
                  && up.prefix(8).map(\.finger) == [1, 2, 3, 1, 2, 3, 4, 5], "\(up.prefix(9).map { "\($0.display)@\($0.tick)" })")
            let mup = minor.expected(minor.steps[0], ticksPerBeat: tpb)
            check("scales: A minor up is A B C D E F G A from A3", mup.prefix(8).map(\.display) == [57, 59, 60, 62, 64, 65, 67, 69])
            let down = major.expected(major.steps[1], ticksPerBeat: tpb)
            check("scales: down is the octave back, 5 4 3 2 1 3 2 1", down.prefix(8).map(\.display) == [60, 59, 57, 55, 53, 52, 50, 48]
                  && down.prefix(8).map(\.finger) == [5, 4, 3, 2, 1, 3, 2, 1])
            let both = major.expected(major.steps[2], ticksPerBeat: tpb)
            check("scales: up and down is 15 notes a beat over four bars, 45 a chorus, the last beat free", both.count == 45
                  && both.prefix(15).map(\.tick) == (0..<15).map { $0 * tpb } && both[15].tick == 16 * tpb,
                  "\(both.count) \(both.prefix(16).map(\.tick))")
            let se = LessonEngine(lesson: major, ticksPerBeat: tpb, gated: true)
            se.start(step: 2)
            se.heard(tick: 0, tempo: 60, rolling: true, epoch: 0)
            check("scales: the intro shows the fingering of the run, right hand",
                  se.output.intro?.fingering == [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1] && se.output.intro?.rightHand == true,
                  "\(String(describing: se.output.intro?.fingering))")
            typealias RN0 = LessonState.Run.Note
            check("scales: thirteen lessons, their steps in order", major.lessons.count == 13 && major.lessonsDone(reachedStep: 2) == 1
                  && minor.lessons.map(\.title) == ["Up", "Down", "Up and down", "Two octaves", "The left hand", "The blues scale",
                                                    "Minor pentatonic", "The relative major", "E minor", "D minor", "Harmonic minor", "Dorian", "Chromatic"]
                  && major.lessons.map(\.title).suffix(7) == ["Major pentatonic", "The relative minor", "G major", "F major", "Mixolydian", "Dorian", "Chromatic"]
                  && (minor.jams ?? []).count == 13 && (minor.jams ?? []).map(\.after) == Array(1...13), "\(minor.lessons.map(\.title))")
            // Lessons 7–13 (scripts/scales-extend.py): the pentatonics, two new keys, the colour
            // scales, the chromatic. Each in both files, as the key's own notes.
            let penta = minor.expected(minor.steps[6], ticksPerBeat: tpb)
            check("scales: minor pentatonic is A C D E G A and back, 11 notes with 1 2 3 1 2 3, four runs a chorus",
                  penta.count == 44 && penta.prefix(11).map(\.display) == [57, 60, 62, 64, 67, 69, 67, 64, 62, 60, 57]
                  && penta.prefix(11).map(\.finger) == [1, 2, 3, 1, 2, 3, 2, 1, 3, 2, 1] && penta[11].tick == 3 * 4 * tpb
                  && major.expected(major.steps[6], ticksPerBeat: tpb).prefix(6).map(\.display) == [48, 50, 52, 55, 57, 60],
                  "\(penta.prefix(11).map(\.display))")
            let rel = minor.expected(minor.steps[7], ticksPerBeat: tpb)
            check("scales: the relative is the same five keys from the other home (C major pentatonic in the minor file, A minor in the major)",
                  rel.prefix(6).map(\.display) == [48, 50, 52, 55, 57, 60] && minor.steps[7].form?.allSatisfy { $0 == "C" } == true
                  && major.expected(major.steps[7], ticksPerBeat: tpb).prefix(6).map(\.display) == [57, 60, 62, 64, 67, 69]
                  && major.steps[7].chords?["Am"]?.numeral == "vi" && minor.steps[7].chords?["C"]?.numeral == "III")
            let em = minor.expected(minor.steps[8], ticksPerBeat: tpb), gm = major.expected(major.steps[8], ticksPerBeat: tpb)
            check("scales: the second key keeps the fingering: E minor from E3 (F♯ under the index), G major from G3",
                  em.prefix(8).map(\.pitchClass) == [4, 6, 7, 9, 11, 0, 2, 4] && em[0].display == 52 && em.count == 45
                  && em.prefix(8).map(\.finger) == [1, 2, 3, 1, 2, 3, 4, 5]
                  && gm.prefix(8).map(\.pitchClass) == [7, 9, 11, 0, 2, 4, 6, 7] && gm[0].display == 55 && minor.steps[8].flats == nil,
                  "\(em.prefix(8).map(\.pitchClass))")
            let dm = minor.expected(minor.steps[9], ticksPerBeat: tpb), fm = major.expected(major.steps[9], ticksPerBeat: tpb)
            check("scales: the third key is the first flat: D minor spelled with B♭; F major breaks the fingering, 1 2 3 4 1 2 3 4",
                  dm.prefix(8).map(\.pitchClass) == [2, 4, 5, 7, 9, 10, 0, 2] && minor.steps[9].flats == true
                  && fm.prefix(8).map(\.pitchClass) == [5, 7, 9, 10, 0, 2, 4, 5] && major.steps[9].flats == true
                  && fm.prefix(15).map(\.finger) == [1, 2, 3, 4, 1, 2, 3, 4, 3, 2, 1, 4, 3, 2, 1]
                  && LessonState.Run.crossing(from: RN0(key: 58, finger: 4), to: RN0(key: 60, finger: 1)) == "Thumb under"
                  && LessonState.Run.crossing(from: RN0(key: 60, finger: 1), to: RN0(key: 58, finger: 4)) == "Ring over",
                  "\(fm.prefix(15).map(\.finger))")
            check("scales: the colour scales: A harmonic minor raises the 7th (G♯), C Mixolydian lowers it (B♭); Dorian raises the 6th in both",
                  minor.expected(minor.steps[10], ticksPerBeat: tpb).prefix(8).map(\.pitchClass) == [9, 11, 0, 2, 4, 5, 8, 9]
                  && major.expected(major.steps[10], ticksPerBeat: tpb).prefix(8).map(\.pitchClass) == [0, 2, 4, 5, 7, 9, 10, 0]
                  && minor.expected(minor.steps[11], ticksPerBeat: tpb).prefix(8).map(\.pitchClass) == [9, 11, 0, 2, 4, 6, 7, 9]
                  && major.expected(major.steps[11], ticksPerBeat: tpb).prefix(8).map(\.pitchClass) == [0, 2, 3, 5, 7, 9, 10, 0]
                  && major.steps[10].flats == true && major.steps[11].flats == true && minor.steps[11].flats == nil)
            let chroma = minor.expected(minor.steps[12], ticksPerBeat: tpb)
            check("scales: the chromatic is every key A3 to A4, 1 on white, 3 on black, 2 between two whites; three runs a chorus",
                  chroma.count == 39 && chroma.prefix(13).map(\.display) == Array(57...69)
                  && chroma.prefix(13).map(\.finger) == [1, 3, 1, 2, 3, 1, 3, 1, 2, 3, 1, 3, 1]
                  && major.expected(major.steps[12], ticksPerBeat: tpb).prefix(13).map(\.finger) == [1, 3, 1, 3, 1, 2, 3, 1, 3, 1, 3, 1, 2],
                  "\(chroma.prefix(13).map(\.finger))")
            check("scales: the new keys' jams transpose the blues band to the relative major (E minor → G, D minor → F), the D minor one in flats",
                  minor.steps[21].id == "jam-key2" && minor.steps[21].transpose == 7 && minor.steps[22].transpose == 5 && minor.steps[22].flats == true
                  && major.steps[21].transpose == 7 && major.steps[22].transpose == 5 && minor.steps[19].transpose == nil
                  && minor.steps[23].band == ["drums", "bass"], "\(minor.steps[19...25].map { "\($0.id):\($0.transpose ?? 0)" })")
            // Lessons 4–6: two octaves (15 notes, A3 to A5, three runs), the left hand an octave
            // down with the pinky first, the blues scale up and back (13 notes, the flat five).
            let two = minor.expected(minor.steps[3], ticksPerBeat: tpb)
            check("scales: two octaves is 15 notes a run from A3 to A5, thumb under twice, three runs a chorus",
                  two.count == 45 && two[0].display == 57 && two[14].display == 81 && two.prefix(15).map(\.finger) == [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5]
                  && two[15].tick == 4 * 4 * tpb, "\(two.count) \(two.prefix(15).map(\.display))")
            let left = minor.expected(minor.steps[4], ticksPerBeat: tpb)
            check("scales: the left hand runs A2 to A3 with 5 4 3 2 1 3 2 1, pitch classes right below the root",
                  left.prefix(8).map(\.display) == [45, 47, 48, 50, 52, 53, 55, 57] && left.prefix(8).map(\.finger) == [5, 4, 3, 2, 1, 3, 2, 1]
                  && left.prefix(8).map(\.pitchClass) == [9, 11, 0, 2, 4, 5, 7, 9] && minor.steps[4].hand == "left", "\(left.prefix(8).map(\.pitchClass))")
            let bluesRun = minor.expected(minor.steps[5], ticksPerBeat: tpb)
            check("scales: the blues scale is A C D E♭ E G A and back, 13 notes, named A blues",
                  bluesRun.prefix(13).map(\.display) == [57, 60, 62, 63, 64, 67, 69, 67, 64, 63, 62, 60, 57]
                  && minor.steps[5].key == "A blues" && Key.letter(63, flats: true) == "E♭" && Key.letter(63) == "D♯"
                  && major.expected(major.steps[5], ticksPerBeat: tpb).prefix(7).map(\.pitchClass) == [0, 3, 5, 6, 7, 10, 0])
            check("scales: the left hand crosses the other way: 1 → 3 going up is Middle over, 3 → 1 coming down is Thumb under",
                  LessonState.Run.crossing(from: RN0(key: 52, finger: 1), to: RN0(key: 53, finger: 3), right: false) == "Middle over"
                  && LessonState.Run.crossing(from: RN0(key: 48, finger: 3), to: RN0(key: 47, finger: 1), right: false) == "Thumb under"
                  && LessonState.Run.crossing(from: RN0(key: 52, finger: 1), to: RN0(key: 53, finger: 3), right: true) == nil)
            let twoRun = LessonState.Run(name: "A minor", notes: two.prefix(15).map { RN0(key: $0.display, finger: $0.finger ?? 0) },
                                         index: 0, resting: false, number: 1, count: 3)
            check("scales: the keyboard widens to hold two octaves, A3–A5 on both",
                  LessonState.Run.keyboard(twoRun, keys: 24, fallback: 48...71) == 57...81
                  && LessonState.Run.keyboard(twoRun, keys: 18, fallback: 48...65) == 57...81,
                  "\(LessonState.Run.keyboard(twoRun, keys: 18, fallback: 48...65))")
            check("scales: the key is named", major.key == "C major" && minor.key == "A minor")

            // The run on screen: the engine's index into the chorus, every finger on the keyboard,
            // the crossings, and a keyboard that holds the whole run.
            let re = LessonEngine(lesson: minor, ticksPerBeat: tpb, gated: false)
            re.start(step: 0)
            re.heard(tick: 0, tempo: 60, rolling: true, epoch: 0)
            re.heard(tick: Double(3 * tpb) + 1, tempo: 60, rolling: true, epoch: 0)
            check("run: on beat 4 of bar 1 the engine is at note 4 of the run (D, thumb), E next",
                  re.output.nowIndex == 3 && re.output.nowNote == 62 && re.output.nextNote == 64, "\(String(describing: re.output.nowIndex))")
            check("run: every key of the run carries its finger, not just this bar's",
                  re.output.fingers == [57: 1, 59: 2, 60: 3, 62: 1, 64: 2, 65: 3, 67: 4, 69: 5], "\(re.output.fingers)")
            re.heard(tick: Double(9 * tpb) + 1, tempo: 60, rolling: true, epoch: 0)
            check("run: in the hold bar the top A stays now and the thumb's A is next",
                  re.output.nowIndex == 7 && re.output.nowNote == 69 && re.output.nextNote == 57, "\(String(describing: re.output.nowIndex)) \(String(describing: re.output.nextNote))")
            re.heard(tick: Double(13 * tpb) + 1, tempo: 60, rolling: true, epoch: 0)
            check("run: the second run's second note is index 9 (position 1 of the run)",
                  re.output.nowIndex == 9 && re.output.nowNote == 59)
            typealias RN = LessonState.Run.Note
            check("run: 3 → 1 going up is Thumb under, 1 → 3 going down is Middle over, 1 → 2 is nothing",
                  LessonState.Run.crossing(from: RN(key: 60, finger: 3), to: RN(key: 62, finger: 1)) == "Thumb under"
                  && LessonState.Run.crossing(from: RN(key: 64, finger: 1), to: RN(key: 62, finger: 3)) == "Middle over"
                  && LessonState.Run.crossing(from: RN(key: 57, finger: 1), to: RN(key: 59, finger: 2)) == nil
                  && LessonState.Run.crossing(from: RN(key: 69, finger: 5), to: RN(key: 57, finger: 1)) == nil)
            let amin = LessonState.Run(name: "A minor", notes: [57, 59, 60, 62, 64, 65, 67, 69].map { RN(key: $0, finger: 1) },
                                       index: 7, resting: true, number: 1, count: 4)
            check("run: the Mac keyboard keeps C3–B4 for A minor, the iPhone's moves to hold A3–A4",
                  LessonState.Run.keyboard(amin, keys: 24, fallback: 48...71) == 48...71
                  && LessonState.Run.keyboard(amin, keys: 18, fallback: 48...65) == 53...71
                  && LessonState.Run.keyboard(nil, keys: 18, fallback: 48...65) == 48...65,
                  "\(LessonState.Run.keyboard(amin, keys: 18, fallback: 48...65))")
            check("run: wrapping after the last note, next is the first", amin.wrapping && amin.next?.key == 57 && amin.now?.key == 69)

            // Play mode: a jam under each lesson, its step past the lessons' steps, its own band;
            // clean choruses count and mark it, nothing passes or hands over.
            let jams = minor.jams ?? []
            check("jams: thirteen under the scale lessons, seven under the blues, each a jam step past the lessons' steps",
                  jams.count == 13 && (lesson.jams ?? []).count == 7 && jams.map(\.after) == Array(1...13)
                  && minor.stepIndex(ofJam: jams[0]) == 13 && minor.lessonIndex(ofStep: 13) == 0 && minor.jam(ofStep: 13)?.title == "First riff"
                  && minor.steps[13].band == ["drums", "bass", "keys"] && minor.steps[0].band == ["drums"] && minor.steps[17].band == ["drums", "keys"]
                  && lesson.steps[8].kind == .jam && lesson.lessonIndex(ofStep: 12) == 4 && lesson.lessonsDone(reachedStep: 7) == 5
                  && lesson.lessonsDone(reachedStep: 9) == 7)

            // Chords: the third finger and twice a bar after the payoff (C E G with 5 3 1), and the
            // Minor Chords module: a minor blues in every key, each step with its own form and
            // chords, the A minor band transposed within -6…+5; the minor third as a tone.
            let third = lesson.expected(lesson.steps[6], ticksPerBeat: tpb)
            check("chords: the third finger is C E G on the 1 with 5 3 1, F A C in bar 5, 36 notes a chorus",
                  third.count == 36 && third.prefix(3).map(\.display) == [48, 52, 55] && third.prefix(3).map(\.finger) == [5, 3, 1]
                  && third[12...14].map(\.pitchClass) == [5, 9, 0] && lesson.steps[7].tempo == 80
                  && lesson.expected(lesson.steps[7], ticksPerBeat: tpb).count == 72, "\(third.prefix(3).map(\.display))")
            let minorModule = Lesson.bundled("lesson-M")
            let keys = minorModule.steps.prefix(12)
            check("minor: twelve keys then Two a bar, each key its own i iv v form, the band within -6…+5",
                  minorModule.lessons.count == 13 && minorModule.band == "band-minor-A" && (minorModule.jams ?? []).count == 13
                  && keys.map { $0.transpose! }.allSatisfy { (-6...5).contains($0) } && Set(keys.map { $0.transpose! }).count == 12
                  && keys.allSatisfy { $0.form!.count == 12 && minorModule.chords(of: $0).count == 3 }
                  && minorModule.steps[6].form?[0] == "Bm" && minorModule.steps[6].form?[8] == "F♯m" && minorModule.steps[6].transpose == 2
                  && minorModule.steps[9].form?[8] == "D♯m" && minorModule.steps[12].form == nil,
                  "\(keys.map { $0.transpose! })")
            let bm = minorModule.expected(minorModule.steps[6], ticksPerBeat: tpb)
            check("minor: B minor is B3 D4 F♯4 on the 1, E minor in bar 5, F♯ minor in bar 9",
                  bm.count == 36 && bm.prefix(3).map(\.display) == [59, 62, 66] && bm.prefix(3).map(\.pitchClass) == [11, 2, 6]
                  && bm[12].pitchClass == 4 && bm[24].pitchClass == 6 && minorModule.formBars(of: minorModule.steps[6])[8].numeral == "v",
                  "\(bm.prefix(3).map(\.display))")
            // Chord Shapes (scripts/chord-shapes.py): what a hand does with a chord it knows. A
            // pattern note with `chord` plays only in that chord's bars: a voicing per chord.
            let shapes = Lesson.bundled("lesson-H")
            check("shapes: eight lessons with a jam each, over the A minor band",
                  shapes.lessons.count == 8 && (shapes.jams ?? []).count == 8 && shapes.band == "band-minor-A" && shapes.code == "H1"
                  && shapes.lessons.map(\.title) == ["Minor sevenths", "Inversions", "Four chords", "Moving less", "The backbeat",
                                                     "Suspend, resolve", "The shell", "Minor nine"]
                  && Lesson.tones["ninth"] == 14 && Lesson.tones["majorSeventh"] == 11 && Lesson.tones["fourth"] == 5,
                  "\(shapes.lessons.map(\.title))")
            let m7 = shapes.expected(shapes.steps[0], ticksPerBeat: tpb)
            check("shapes: the minor seventh is A C E G on the 1 with 5 3 2 1, a chord, 48 notes a chorus",
                  m7.count == 48 && m7.prefix(4).map(\.display) == [57, 60, 64, 67] && m7.prefix(4).map(\.finger) == [5, 3, 2, 1]
                  && m7.allSatisfy(\.chord) && m7[16...19].map(\.pitchClass) == [2, 5, 9, 0], "\(m7.prefix(4).map(\.display))")
            let inv = shapes.expected(shapes.steps[1], ticksPerBeat: tpb)
            check("shapes: inversions turn the chord over one a bar: A C E, C E A, E A C; Dm in bar 10 starts over at the root",
                  inv.count == 36 && inv.prefix(3).map(\.display) == [57, 60, 64] && inv[3...5].map(\.display) == [60, 64, 69]
                  && inv[6...8].map(\.display) == [64, 69, 72] && inv[6...8].map(\.finger) == [5, 2, 1] && inv[27...29].map(\.display) == [50, 53, 57]
                  && shapes.steps[1].cycle == 3, "\(inv.prefix(9).map(\.display))")
            let loopNotes = shapes.expected(shapes.steps[2], ticksPerBeat: tpb)
            check("shapes: four chords is Am F C G in root position, the major third on the major chords, over the drums",
                  shapes.steps[2].form == ["Am", "F", "C", "G", "Am", "F", "C", "G", "Am", "F", "C", "G"] && loopNotes.count == 36
                  && loopNotes.prefix(3).map(\.display) == [57, 60, 64] && loopNotes[3...5].map(\.display) == [53, 57, 60]
                  && loopNotes[6...8].map(\.display) == [48, 52, 55] && loopNotes[9...11].map(\.display) == [55, 59, 62]
                  && loopNotes[3...5].map(\.pitchClass) == [5, 9, 0] && shapes.steps[2].band == ["drums"] && loopNotes.allSatisfy(\.chord),
                  "\(loopNotes.prefix(12).map(\.display))")
            let leadNotes = shapes.expected(shapes.steps[3], ticksPerBeat: tpb)
            check("shapes: moving less voices the loop inside one hand: A C E, A C F, G C E, G B D (G3 to F4)",
                  leadNotes.prefix(3).map(\.display) == [57, 60, 64] && leadNotes[3...5].map(\.display) == [57, 60, 65]
                  && leadNotes[6...8].map(\.display) == [55, 60, 64] && leadNotes[9...11].map(\.display) == [55, 59, 62]
                  && leadNotes.map(\.display).min() == 55 && leadNotes.map(\.display).max() == 65
                  && leadNotes[3...5].map(\.pitchClass) == [9, 0, 5] && leadNotes[6...8].map(\.pitchClass) == [7, 0, 4],
                  "\(leadNotes.prefix(12).map(\.display))")
            let chank = shapes.expected(shapes.steps[4], ticksPerBeat: tpb), sus = shapes.expected(shapes.steps[5], ticksPerBeat: tpb)
            check("shapes: the backbeat is the triad on 2 and 4 at 80; sus4 on the 1 (A D E) resolves to the minor on the 3",
                  chank.count == 72 && chank.prefix(6).map(\.tick) == [12, 12, 12, 36, 36, 36] && shapes.steps[4].tempo == 80
                  && sus.prefix(3).map(\.display) == [57, 62, 64] && sus[3...5].map(\.display) == [57, 60, 64] && sus[3].tick == 24
                  && sus.prefix(3).map(\.finger) == [5, 2, 1], "\(sus.prefix(6).map { "\($0.display)@\($0.tick)" })")
            let shell = shapes.expected(shapes.steps[6], ticksPerBeat: tpb), m9 = shapes.expected(shapes.steps[7], ticksPerBeat: tpb)
            check("shapes: the shell is root, third, seventh (A C G); the rootless nine is C E G B over Am, F A C E over Dm",
                  shell.prefix(3).map(\.display) == [57, 60, 67] && m9.prefix(4).map(\.display) == [60, 64, 67, 71]
                  && m9.prefix(4).map(\.finger) == [5, 3, 2, 1] && m9[16...19].map(\.display) == [53, 57, 60, 64]
                  && m9.map(\.display).max()! <= shapes.range.high, "\(m9.prefix(4).map(\.display))")
            check("shapes: the jams sit under their lessons, the voice-leading jam at 80 twice a bar",
                  (shapes.jams ?? []).map(\.after) == Array(1...8) && shapes.steps[11].tempo == 80
                  && shapes.expected(shapes.steps[11], ticksPerBeat: tpb).count == 72 && shapes.steps[11].kind == .jam)
            let minorBand = BandData.bundled("band-minor-A")
            let blues = BandData.bundled("band-blues-C")
            check("minor: the A minor band has the shuffle's time structure and kit, i iv v, the bass low",
                  minorBand.loopTicks == blues.loopTicks && minorBand.chorusBars == 12 && minorBand.sounds.keys.sorted() == blues.sounds.keys.sorted()
                  && minorBand.form == ["Am", "Am", "Am", "Am", "Dm", "Dm", "Am", "Am", "Em", "Dm", "Am", "Em"]
                  && minorBand.channels.bass.allSatisfy { $0.n >= 26 && $0.n <= 50 } && minorBand.instruments == blues.instruments)
            let me = LessonEngine(lesson: minorModule, ticksPerBeat: tpb, gated: false)
            var transposes: [Int] = []
            me.onAction = { if case .transpose(let n) = $0 { transposes.append(n) } }
            me.start(step: 6)
            me.heard(tick: 0, tempo: 70, rolling: true, epoch: 0)
            check("minor: starting B minor transposes the band by 2 and the coach names Bm",
                  transposes == [2] && me.output.coach == "B minor. Pinky on B, the flat third, the fifth." && me.output.nowNotes == [59, 62, 66],
                  "\(transposes) · \(me.output.coach) · \(String(describing: me.output.nowNote)) \(me.output.nowNotes.sorted())")
            me.heard(tick: Double(2 * 4 * tpb) + 1, tempo: 70, rolling: true, epoch: 0)
            check("minor: bar 3 of B minor says Bm on the 1, bar 4 gets ready for Em", me.output.coach == "Bm on the 1. Hold it."
                  && { me.heard(tick: Double(3 * 4 * tpb) + 1, tempo: 70, rolling: true, epoch: 0); return me.output.coach == "Get ready. Em on the 1." }(),
                  me.output.coach)
            let je = LessonEngine(lesson: minor, ticksPerBeat: tpb, gated: false)
            je.start(step: 13)
            var jv: [LessonEngine.Verdict] = []
            je.onVerdict = { jv.append($0) }
            var planner = Autoplay(mode: .perfect, plannedThrough: -0.01)
            var pending = planner.plan(through: Double(2 * loop), expected: je.expected, loopTicks: loop, msPerTick: msPerTick(70)).sorted { $0.tick < $1.tick }
            var jt = 0.0
            while jt <= Double(2 * loop) + 1 {
                je.heard(tick: jt, tempo: 70, rolling: true, epoch: 0)
                while let p = pending.first, p.tick <= jt {
                    je.played(note: p.note, tick: p.tick, msPerTick: msPerTick(70), epoch: 0)
                    pending.removeFirst()
                }
                jt += 0.25
            }
            check("jams: two clean choruses count and mark the jam; nothing passes, no Lesson complete",
                  jv.count == 2 && jv.allSatisfy { $0.counted && $0.jam == "jam-up" } && je.output.clean == 2 && !je.output.passed
                  && je.output.complete == nil && je.output.jam && je.output.gate == 0 && je.output.lessonTitle == "First riff"
                  && je.output.lesson == 1 && je.output.coach == "Clean. Keep it rolling.", "\(jv.map(\.line)) clean \(je.output.clean)")
            let gj = LessonEngine(lesson: minor, ticksPerBeat: tpb, gated: true)
            gj.start(step: 13)
            check("jams: the intro is play mode under lesson 1, with the riff's fingering",
                  gj.output.intro?.jam == true && gj.output.intro?.number == 1 && gj.output.intro?.title == "First riff"
                  && gj.output.intro?.fingering == [1, 2, 3, 4, 4, 3, 2, 1], "\(String(describing: gj.output.intro?.fingering))")
            var ra = ProgressStore.LessonRecord()
            ra.jamsDone = ["jam-up"]
            var rb = ProgressStore.LessonRecord()
            rb.jamsDone = ["jam-down"]
            var sa = ProgressStore.Snapshot()
            sa.lessons["S1m"] = ra
            var sb = ProgressStore.Snapshot()
            sb.lessons["S1m"] = rb
            let old = try? JSONDecoder().decode(ProgressStore.LessonRecord.self, from: Data("{\"reachedStep\":2}".utf8))
            check("jams: played ones merge as a union; records from before decode with none",
                  AccountStore.merge(sa, sb).lessons["S1m"]?.jamsDone == ["jam-down", "jam-up"] && old?.jamsDone == [] && old?.reachedStep == 2)

            // The module's last lesson passing shows Module complete (Bart's two clean choruses of
            // Up and down went to a blank screen: the hand-over skipped the last step).
            let ge = LessonEngine(lesson: minor, ticksPerBeat: tpb, gated: true)
            ge.start(step: 12)
            ge.heard(tick: 0, tempo: 60, rolling: true, epoch: 0)
            ge.debugComplete()
            check("run: the last lesson passed shows Lesson 13 complete with nothing next (the jams after it don't count)",
                  ge.output.complete?.number == 13 && ge.output.complete?.next == nil && ge.output.complete?.done == "Chromatic",
                  "\(String(describing: ge.output.complete))")
        }

        var run = simulate([(autoplay(.perfect, choruses: 3), end(3))])
        check("perfect autoplay: clean, clean, gate passed", run.verdicts.map(\.counted) == [true, true]
              && run.passed && run.verdicts.last?.clean == 2 && run.output.lastChorus == "Clean."
              && run.output.lastChorusDetail == "12 of 12", text(run))
        let intro = step.coach.intro
        check("coach calls the form on the downbeats",
              run.coach[0] == intro && run.coach[1] == intro && run.coach[2] == "C on the 1."
              && run.coach[3] == "Get ready. F on the 1." && run.coach[4] == "F on the 1."
              && run.coach[5] == "Get ready. C on the 1."
              && run.coach[11] == "Get ready. C on the 1." && run.coach[12] == "Clean. One more."
              && run.coach[13] == "C on the 1." && run.coach[24] == "Two clean. That's the form."
              && run.coach[25] == "Two clean. That's the form."
              && run.coach[26] == lesson.steps[1].coach.intro && run.output.card != nil,
              (0..<14).map { "\($0 + 1): \(run.coach[$0] ?? "-")" }.joined(separator: " / "))
        check("keys show now and next", run.keys[3] == [48, 53] && run.keys[8] == [55, 53] && run.keys[1] == [48, nil],
              "bar 4 \(String(describing: run.keys[3])), bar 9 \(String(describing: run.keys[8]))")

        run = simulate([(autoplay(.loose, choruses: 3), end(3))])
        check("loose autoplay (±40 ms) passes", run.passed && run.verdicts.map(\.counted) == [true, true], text(run))

        run = simulate([(autoplay(.sloppy, choruses: 8), end(8))])
        check("sloppy autoplay never passes in 8 choruses", !run.passed && run.output.clean == 0
              && run.verdicts.count == 8 && run.verdicts.allSatisfy { $0.line.hasSuffix(" Again.") }, text(run))

        run = simulate([(autoplay(.rush, choruses: 4), end(4))])
        check("rushing 140 ms never passes", !run.passed && run.verdicts.allSatisfy { $0.line == "Rushed every bar. Again." },
              text(run))

        let early = chorus(0, offsetMs: { _ in -40 }) + chorus(1, offsetMs: { _ in -40 })
        run = simulate([(early, end(2))])
        check("an early downbeat belongs to the next chorus", run.passed
              && run.verdicts.allSatisfy { $0.result?.hits == 12 && $0.result?.extras.isEmpty == true }, text(run))

        let late = autoplay(.perfect, choruses: 4).filter { $0.tick >= Double(2 * 4 * tpb) - 6 }
        run = simulate([(late, end(4))])
        check("joining at bar 3 isn't judged; the next two are", run.verdicts.count == 3 && run.verdicts[0].result == nil
              && run.coach[12] == "From the top." && run.verdicts[2].clean == 2 && run.passed, text(run))

        run = simulate([(autoplay(.perfect, bpm: 60, choruses: 3), end(3))], bpm: 60)
        check("clean at 60 doesn't count", run.output.clean == 0 && !run.passed
              && run.verdicts.allSatisfy { $0.line == "Clean at 60. It counts at 70." }, text(run))

        run = simulate([(chorus(0) + chorus(2), end(3))])
        check("a silent chorus isn't judged", run.verdicts.map(\.chorus) == [0, 2] && run.passed
              && run.coach[24] == "C on the 1.", text(run))

        let beforeStop = autoplay(.perfect, choruses: 2).filter { $0.tick < Double(loop + 6 * 4 * tpb) }
        run = simulate([(beforeStop, Double(loop + 6 * 4 * tpb)), (autoplay(.perfect, choruses: 1), end(1))])
        check("stop drops the half chorus, keeps the clean one", run.verdicts.count == 2 && run.passed
              && run.coach[1000] == intro, text(run))

        // Chorus 2 gets no display frame at all; its tempo comes from the presses.
        run = simulate([(autoplay(.perfect, choruses: 2), end(2) + 20)], hidden: 1..<Double(2 * loop + 10))
        check("choruses played while the window was hidden still count", run.passed
              && run.verdicts.map(\.counted) == [true, true], text(run))

        // MARK: The whole lesson

        struct LessonRun {
            var verdicts: [LessonEngine.Verdict] = []
            var actions: [LessonEngine.Action] = []
            var steps: [Int] = []
            /// The tempo when each chorus ended.
            var tempos: [Int] = []
            var output = LessonEngine.Output()
            var finish: LessonEngine.Finish?
            var coachAt: [Int: String] = [:]
        }
        /// Plays the lesson from `start` (0-based step) like the app: tempo actions apply on the
        /// next downbeat (the renderer), a card is continued one bar after it shows, and the
        /// player plays every chorus `play(chorus, step)` returns presses for, at the tempo heard.
        func lessonRun(from start: Int = 0, choruses: Int, bpm startTempo: Double = 70, followTempo: Bool = true,
                       play: (Int, LessonEngine) -> [(tick: Double, note: Int)]?) -> LessonRun {
            let engine = LessonEngine(lesson: lesson, ticksPerBeat: tpb)
            var run = LessonRun()
            var tempo = startTempo
            var pendingTempo: Double?
            engine.onVerdict = { run.verdicts.append($0) }
            engine.onAction = { a in
                run.actions.append(a)
                if case .tempo(let t) = a, followTempo { pendingTempo = Double(t) }
            }
            engine.heard(tick: 0, tempo: tempo, rolling: true, epoch: 0)
            if start > 0 { engine.start(step: start) }
            var cardShownAt: Double?
            var pending: [(tick: Double, note: Int, ms: Double)] = []
            var planned = -1
            var tick = 0.0
            while tick <= Double(choruses * loop) + 1 {
                if tick.truncatingRemainder(dividingBy: Double(4 * tpb)) == 0, let p = pendingTempo {
                    tempo = p
                    pendingTempo = nil
                }
                engine.heard(tick: tick, tempo: tempo, rolling: true, epoch: 0)
                let c = Int(tick) / loop
                if tick.truncatingRemainder(dividingBy: Double(loop)) == 0 && tick > 0 { run.tempos.append(Int(tempo)) }
                // Plan each chorus half a beat before it starts, with the step that is current.
                if c + 1 > planned && tick >= Double((c + 1) * loop) - 7 {
                    planned = c + 1
                    for p in play(c + 1, engine) ?? [] {
                        pending.append((Double((c + 1) * loop) + p.tick, p.note, msPerTick(tempo)))
                    }
                }
                if tick == 0 && planned < 0 {
                    planned = 0
                    for p in play(0, engine) ?? [] { pending.append((p.tick, p.note, msPerTick(tempo))) }
                }
                pending.sort { $0.tick < $1.tick }
                while let p = pending.first, p.tick <= tick {
                    engine.played(note: p.note, tick: p.tick, msPerTick: msPerTick(tempo), epoch: 0)
                    pending.removeFirst()
                }
                if engine.output.card != nil {
                    if cardShownAt == nil { cardShownAt = tick }
                    if tick - cardShownAt! >= Double(4 * tpb) { engine.continueCard(); cardShownAt = nil }
                }
                if run.steps.last != engine.output.step { run.steps.append(engine.output.step) }
                if tick.truncatingRemainder(dividingBy: Double(4 * tpb)) == Double(2 * tpb) {
                    run.coachAt[Int(tick) / (4 * tpb)] = engine.output.coach
                }
                if engine.output.finished { break }
                tick += 0.25
            }
            run.output = engine.output
            run.finish = engine.finish
            return run
        }
        /// Every expected note of the current step, on the tick (nil on a card).
        let perfect: (Int, LessonEngine) -> [(tick: Double, note: Int)]? = { _, e in
            e.expected.isEmpty ? nil : e.expected.map { (Double($0.tick), $0.display) }
        }
        func describe(_ r: LessonRun) -> String {
            "steps \(r.steps) · tempos \(r.tempos) · " + r.verdicts.map { "s\($0.step)c\($0.chorus + 1) \($0.line)" }.joined(separator: " | ")
        }

        var whole = lessonRun(choruses: 20, play: perfect)
        let tempoActions = whole.actions.compactMap { a -> Int? in if case .tempo(let t) = a { return t }; return nil }
        let unlocks = whole.actions.compactMap { a -> String? in if case .unlock(let i) = a { return lesson.channels[i].name }; return nil }
        let silences = whole.actions.compactMap { a -> Double? in if case .silence(let f, _) = a { return f }; return nil }
        check("perfect play runs steps 1 to 6 in order", whole.steps == [1, 2, 3, 4, 5, 6], describe(whole))
        check("the ramp goes 70, 75, 80, 85, 90", tempoActions == [75, 80, 85, 90], "\(tempoActions)")
        check("keys unlock at 80, horns at 90", unlocks == ["Keys", "Horns"]
              && whole.verdicts.contains { $0.line == "Clean. Up 5. Keys are in." }, "\(unlocks)")
        check("the gate passes on three clean at 90", whole.verdicts.filter { $0.step == 5 && $0.counted }.count == 3
              && whole.verdicts.contains { $0.step == 5 && $0.line == "Three clean at 90. It's yours." }, describe(whole))
        // Card at the end of chorus 2, step 3 from chorus 4, 2 + 4 ramp + 3 gate choruses, the payoff on chorus 13.
        let payoffChorus = 3 + 2 + 4 + 3
        check("the band sits out bars 11-12 of the payoff chorus",
              silences == [Double(payoffChorus * loop + 10 * 4 * tpb)], "\(silences.map { $0 / Double(loop) })")
        check("the payoff finishes the lesson", whole.output.finished && whole.finish?.presses.count == 24
              && whole.finish?.tempo == 90 && whole.finish?.aloneBars == [10, 11] && whole.actions.last == .finished,
              "finish \(String(describing: whole.finish?.presses.count)) at \(String(describing: whole.finish?.tempo))")
        check("the coach says alone in bars 11 and 12", whole.coachAt[payoffChorus * 12 + 10] == "Alone. Bring it home."
              && whole.coachAt[payoffChorus * 12 + 9] != "Alone. Bring it home.",
              "\(whole.coachAt[payoffChorus * 12 + 10] ?? "-")")
        check("no chorus is judged on the card", !whole.verdicts.contains { $0.step == 2 }, describe(whole))

        // Presses on the card sound but don't count.
        let card = lessonRun(from: 1, choruses: 3) { c, _ in c == 0 ? expected.map { (Double($0.tick), $0.display) } : nil }
        check("presses on the card aren't scored", card.verdicts.isEmpty && card.steps.first == 2, describe(card))

        // The gate holds after eight judged attempts.
        var sloppy = Autoplay(mode: .sloppy, plannedThrough: -0.01)
        let gate = lessonRun(from: 4, choruses: 12, bpm: 90) { c, e in
            sloppy.plan(through: Double((c + 1) * loop), expected: e.expected, loopTicks: loop, msPerTick: msPerTick(90))
                .filter { $0.tick >= Double(c * loop) - 6 }.map { ($0.tick - Double(c * loop), $0.note) }
        }
        check("the gate stops after 8 attempts: pick it up tomorrow", gate.verdicts.count == 8 && gate.output.holding
              && gate.output.coach == "Pick it up tomorrow." && !gate.output.passed, describe(gate))

        // A silent payoff chorus arms the next one.
        let quiet = lessonRun(from: 5, choruses: 4, bpm: 90) { c, e in c < 2 ? nil : e.expected.map { (Double($0.tick), $0.display) } }
        let quietSilences = quiet.actions.compactMap { a -> Double? in if case .silence(let f, _) = a { return f / Double(loop) }; return nil }
        check("a silent payoff chorus re-arms the next", quiet.output.finished && quietSilences.count == 3
              && quiet.finish?.presses.count == 24, "\(quietSilences)")

        // MARK: The exported loop (M4)

        if let f = whole.finish, let path = UserDefaults.standard.string(forKey: "ExportTo") {
            try? MIDIExport.data(f).write(to: URL(fileURLWithPath: path))
        }
        if let f = whole.finish, let file = MIDIFile.parse(MIDIExport.data(f)) {
            let want = f.expected.map { $0.tick * 40 }.sorted()
            check("export: SMF type 0, one track, 480 ppq, 4/4", file.format == 0 && file.tracks == 1 && file.ppq == 480
                  && file.timeSignature == [4, 2, 24, 8], "format \(file.format) tracks \(file.tracks) ppq \(file.ppq) \(file.timeSignature)")
            check("export: the tempo is the payoff's (90)", file.usPerQuarter == 666_667, "\(file.usPerQuarter) µs per quarter")
            check("export: exactly 12 bars long", file.endTick == 12 * 4 * 480, "end \(file.endTick)")
            check("export: every note on its beat from bar 1", file.notes.count == 24 && file.notes.map(\.tick).sorted() == want
                  && file.notes.first?.tick == 0, "\(file.notes.count) notes, first at \(file.notes.first?.tick ?? -1)")
            check("export: a key still down at the end holds a quarter", file.notes.allSatisfy { $0.length == 480 },
                  "lengths \(Set(file.notes.map(\.length)))")
            check("export: the name", file.name == "Takt A1 Chorus", file.name)
        } else {
            check("export: the file reads back", false)
        }
        let earlyFinish = LessonEngine.Finish(code: "A1", bars: 12, presses: [
            .init(note: 36, tick: -3, velocity: 1, lengthTicks: 10),
            .init(note: 43, tick: 24.5, velocity: 0.5, lengthTicks: 6),
            .init(note: 36, tick: 570, velocity: 0.8, lengthTicks: 30),
        ], expected: [], aloneBars: [10, 11], tempo: 72, summary: "", detail: nil)
        let e = MIDIFile.notes(earlyFinish, ticksPerBeat: 12, bars: 12)
        let wantEarly: [MIDIFile.Note] = [.init(tick: 0, length: 280, note: 36, velocity: 127),
                                          .init(tick: 980, length: 240, note: 43, velocity: 64),
                                          .init(tick: 22800, length: 240, note: 36, velocity: 102)]
        check("export: an early first note starts on bar 1, nothing rings past the chorus, velocity kept", e == wantEarly, "\(e)")
        let eFile = MIDIFile.parse(MIDIFile.data(notes: e, tempo: 72, bars: 12, name: "x"))
        check("export: 72 bpm and the notes read back", eFile?.usPerQuarter == 833_333 && eFile?.notes == e)
        check("vlq", MIDIFile.vlq(0) == [0] && MIDIFile.vlq(127) == [0x7F] && MIDIFile.vlq(128) == [0x81, 0x00]
              && MIDIFile.vlq(0x0FFFFFFF) == [0xFF, 0xFF, 0xFF, 0x7F])

        // Keys let go: their lengths and velocities reach the loop.
        let held = LessonEngine(lesson: lesson, ticksPerBeat: tpb)
        let payoffIndex = lesson.steps.firstIndex { $0.kind == .payoff }!
        held.start(step: payoffIndex)
        let payoffNotes = lesson.expected(lesson.steps[payoffIndex], ticksPerBeat: tpb)
        var t = 0.0
        while !held.output.finished && t < Double(4 * loop) {
            held.heard(tick: t, tempo: 90, rolling: true, epoch: 0)
            let inChorus = t.truncatingRemainder(dividingBy: Double(loop))
            for n in payoffNotes where Double(n.tick) == inChorus {
                held.played(note: n.display, tick: t, msPerTick: msPerTick(90), epoch: 0, velocity: 0.6)
            }
            for n in payoffNotes where Double(n.tick + 5) == inChorus { held.released(note: n.display, tick: t, epoch: 0) }
            t += 0.25
        }
        let heldNotes = held.finish.map { MIDIFile.notes($0, ticksPerBeat: tpb, bars: 12) } ?? []
        check("export: held keys keep their length and velocity", heldNotes.count == payoffNotes.count
              && heldNotes.allSatisfy { $0.length == 200 && $0.velocity == 76 },
              "\(heldNotes.count) notes, lengths \(Set(heldNotes.map(\.length))), velocities \(Set(heldNotes.map(\.velocity)))")

        // MARK: Calibration (M4)

        func calibrate(_ offsets: [(Int, Double)], base: Double = 0) -> Calibration {
            var c = Calibration(firstTick: 24, ticksPerBeat: tpb, base: base)
            for (k, ms) in offsets { c.tap(tick: 24 + Double(k * tpb) + ms / msPerTick(90), msPerTick: msPerTick(90)) }
            return c
        }
        let steady = calibrate((4..<16).map { ($0, -23.0) })
        check("calibration: twelve taps 23 ms early read -23, steady, propose -23", steady.taps.count == 12
              && abs((steady.average ?? 0) + 23) < 0.01 && steady.steady && abs((steady.proposed ?? 0) + 23) < 0.01,
              "\(steady.average.map { String(format: "%.2f", $0) } ?? "nil")")
        let corrected = calibrate((4..<16).map { ($0, -95.0) }, base: -75)
        check("calibration: the needle starts from the saved correction", abs((corrected.needle ?? 0) + 20) < 0.01
              && abs((corrected.proposed ?? 0) + 95) < 0.01, "\(String(describing: corrected.needle))")
        let eleven = calibrate((4..<15).map { ($0, -20.0) })
        check("calibration: no average before twelve taps", eleven.average == nil && eleven.proposed == nil && eleven.needle != nil)
        let wobbly = calibrate([(4, -40), (5, -10), (6, -20), (7, -25), (8, 30), (9, -22), (10, -18), (11, -24),
                                (12, -90), (13, -21), (14, 60), (15, -19)])
        check("calibration: the middle half, so wild taps don't count", abs((wobbly.average ?? 0) + 124.0 / 6) < 0.01, "\(String(describing: wobbly.average))")
        let needle = calibrate([(4, 80), (5, -10), (6, -20), (7, 10), (8, 0)])
        check("calibration: the needle is the mean of the last four", abs((needle.needle ?? 99) + 5) < 0.01 && needle.lastTap == 0)
        check("calibration: a hit is the lessons' window at 90", Calibration.hit(-80) && Calibration.hit(79) && !Calibration.hit(81)
              && Calibration.onTimeMs == ScoringRules().windowMs(tempo: Double(Calibration.tempo)))
        let scattered = calibrate([(4, -60), (5, 40), (6, -10), (7, 70), (8, -50), (9, 30), (10, -80), (11, 60),
                                   (12, -70), (13, 50), (14, -60), (15, 80)])
        check("calibration: scattered taps aren't steady, nothing to use", !scattered.steady && scattered.proposed == nil)
        let loose = calibrate((4..<16).map { ($0, $0 % 2 == 0 ? -50.0 : 10.0) })
        check("calibration: a student's ±30 ms is still steady", loose.steady && loose.proposed != nil)
        let rolling = calibrate((4..<16).map { ($0, 50.0) } + (16..<28).map { ($0, -5.0) })
        check("calibration: the average is the last twelve", abs((rolling.average ?? 0) + 5) < 0.01 && rolling.taps.count == 24)
        let listen = calibrate((0..<6).map { ($0, -20.0) })
        check("calibration: taps in the count-in don't count", listen.taps.count == 2)
        let wild = calibrate([(4, -250), (5, 10)])
        check("calibration: a tap 200+ ms off isn't a tap", wild.taps.count == 1)
        let tooLate = calibrate((4..<16).map { ($0, 180.0) }, base: 100)
        check("calibration: the correction stops at 150 ms", tooLate.proposed == 150)
        var twice = calibrate([(4, -5)])
        twice.tap(tick: 24 + Double(4 * tpb) + 2, msPerTick: msPerTick(90))
        check("calibration: a second tap at a click doesn't count", twice.taps.count == 1)
        var rebased = steady
        rebased.rebase(-23)
        check("calibration: Use this starts over from the new value", rebased.taps.isEmpty && rebased.base == -23)
        check("calibration: words", Calibration.words(-23.4) == "23 ms early" && Calibration.words(2) == "on the beat"
              && Calibration.words(11) == "11 ms late")

        // MARK: Streak and quizzes

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Brussels")!
        let today = cal.date(from: DateComponents(year: 2026, month: 3, day: 1, hour: 10))!
        check("streak: today, yesterday, the day before", ProgressStore.streak(days: ["2026-02-27", "2026-02-28", "2026-03-01"], today: today, calendar: cal) == 3)
        check("streak: not yet today still counts yesterday's run", ProgressStore.streak(days: ["2026-02-27", "2026-02-28"], today: today, calendar: cal) == 2)
        check("streak: a missed day breaks it", ProgressStore.streak(days: ["2026-02-26", "2026-02-27"], today: today, calendar: cal) == 0)
        check("streak: none", ProgressStore.streak(days: [], today: today, calendar: cal) == 0)

        var mineSnap = ProgressStore.Snapshot(), theirs = ProgressStore.Snapshot()
        mineSnap.days = ["2026-10-20", "2026-10-22"]; theirs.days = ["2026-10-21", "2026-10-22"]
        theirs.quiz.level = .ear; theirs.quiz.answered = 5
        let merged = AccountStore.merge(mineSnap, theirs)
        check("merge: days from both devices, the placed quiz record", merged.days == ["2026-10-20", "2026-10-21", "2026-10-22"] && merged.quiz.level == .ear)
        let old = try! JSONDecoder.takt.decode(ProgressStore.Snapshot.self, from: Data(#"{"lessons":{},"skills":{}}"#.utf8))
        check("a snapshot from before the streak decodes", old.days.isEmpty && old.quiz.level == nil)

        let place = QuizBank.placement
        check("ear check: five, theory and listening", place.count == 5 && place.filter { $0.kind == .listen }.count == 3)
        func placementLevel(_ right: Set<String>) -> QuizLevel { QuizBank.level(placement: Dictionary(uniqueKeysWithValues: place.map { ($0.id, right.contains($0.id)) })) }
        let listenIds = place.filter { $0.kind == .listen }.map(\.id), theoryIds = place.filter { $0.kind == .theory }.map(\.id)
        check("ear check: levels", placementLevel([]) == .new && placementLevel(Set(listenIds)) == .ear
              && placementLevel(Set(theoryIds)) == .theory && placementLevel(Set(listenIds + theoryIds)) == .both)
        let d1 = QuizBank.daily(.chords, level: .new, boxes: [:], day: "2026-10-25")
        let d2 = QuizBank.daily(.chords, level: .new, boxes: [:], day: "2026-10-25")
        check("daily: five different chord questions, the same all day", d1.count == 5 && Set(d1.map(\.id)).count == 5
              && d1 == d2 && d1.allSatisfy { $0.id.hasPrefix("triad") && $0.level == 1 }, d1.map(\.id).joined(separator: " "))
        let missed = QuizBank.daily(.form, level: .both, boxes: ["form-bar9": 0, "shuffle": 0, "form-bars": 3], day: "2026-10-26")
        check("daily: missed questions come back", missed.contains { $0.id == "form-bar9" } && missed.contains { $0.id == "shuffle" }, missed.map(\.id).joined(separator: " "))
        for c in [QuizBank.Challenge.chords, .form, .steps] {
            for l in QuizLevel.allCases {
                let q = QuizBank.daily(c, level: l, boxes: [:], day: "2026-11-02")
                check("daily: \(c) at \(l.rawValue) has five", q.count == 5 && Set(q.map(\.id)).count == 5)
            }
        }
        let oct25 = cal.date(from: DateComponents(year: 2026, month: 10, day: 25, hour: 12))!
        check("challenge: day 298 is the form (same as the daily text)", QuizBank.challenge(placed: true, date: oct25, calendar: cal) == .form
              && QuizBank.challenge(placed: false, date: oct25, calendar: cal) == .earCheck)
        var quiz = QuizSession(mode: .placement, questions: place)
        quiz.choose(place[0].answer); quiz.choose(0); quiz.next()
        quiz.choose(1 - place[1].answer); quiz.next()
        check("quiz session: one answer each, score", quiz.index == 2 && quiz.score == 1 && quiz.choices.count == 2)
        check("every question's answer is one of its options", QuizBank.all.allSatisfy { $0.options.indices.contains($0.answer) } && Set(QuizBank.all.map(\.id)).count == QuizBank.all.count)

        // MARK: Ear Trainer

        var earRng = SeededRandom(seed: 7)
        var voicingOK = true, spreadOK = true, noRepeat = true
        var seen: [Int: Set<EarGame.Quality>] = [:]
        for level in EarGame.levels {
            var last: EarGame.Round?
            for _ in 0..<200 {
                let r = EarGame.round(level: level.number, avoiding: last, using: &earRng)
                // The pitch classes are the quality's on the root, whatever the voicing.
                let pcs = Set(r.notes.map { $0 % 12 }), want = Set(r.quality!.intervals.map { (r.root + $0) % 12 })
                if pcs != want || r.options != level.qualities.map(\.name) || r.options[r.answer] != r.quality!.name
                    || r.broken != level.broken || !level.roots.contains(r.root) { voicingOK = false }
                if r.notes.min()! < 53 || r.notes.max()! > 64 + 11 + 12 { spreadOK = false }
                if let l = last, l.quality == r.quality && l.root == r.root { noRepeat = false }
                seen[level.number, default: []].insert(r.quality!)
                last = r
            }
        }
        check("ear trainer: every chord is its quality on its root, at its level", voicingOK)
        check("ear trainer: voiced around middle C", spreadOK)
        check("ear trainer: never the same chord twice in a row", noRepeat)
        check("ear trainer: every level plays all its qualities", EarGame.levels.allSatisfy { seen[$0.number] == Set($0.qualities) })
        var inverted = false
        for _ in 0..<50 { let r = EarGame.round(level: 3, using: &earRng); if r.notes.min()! % 12 != r.root { inverted = true } }
        check("ear trainer: level 3 turns chords over", inverted)

        var earRun = EarGame.Run(level: 1)
        for _ in 0..<7 { earRun.answer(right: true) }
        check("ear trainer: 7 right isn't enough", earRun.level == 1 && earRun.combo == 7 && earRun.multiplier == 3)
        earRun.answer(right: true)
        check("ear trainer: the 8th right opens level 2, the meter starts over", earRun.level == 2 && earRun.leveledUp && earRun.recent.isEmpty)
        var mixed = EarGame.Run(level: 2)
        for r in [true, true, false, true, true, true, true, true, true] { mixed.answer(right: r) }
        check("ear trainer: 8 right with a miss in between opens the next level", mixed.level == 3)
        var miss = EarGame.Run(level: 4)
        miss.answer(right: true); miss.answer(right: true); miss.answer(right: true)
        let missBefore = miss.score
        let pts = miss.answer(right: true)
        miss.answer(right: false)
        check("ear trainer: points are 10 x level x combo, a miss resets the combo", pts == 10 * 4 * 2 && miss.combo == 0 && miss.score == missBefore + pts)
        var top = EarGame.Run(level: EarGame.levels.count)
        for _ in 0..<12 { top.answer(right: true) }
        check("ear trainer: the top level stays the top", top.level == EarGame.levels.count && !top.leveledUp)
        var a = ProgressStore.Snapshot(), b = ProgressStore.Snapshot()
        a.ear = .init(level: 3, best: 900, answered: 40); b.ear = .init(level: 5, best: 400, answered: 30)
        let m = AccountStore.merge(a, b).ear
        check("ear trainer: merge keeps the highest level and the best score", m.level == 5 && m.best == 900 && m.answered == 40)

        // Intervals
        var ivOK = true, ivRange = true, ivRepeat = true, ivDown = false
        var ivSeen: [Int: Set<EarGame.Interval>] = [:]
        for level in EarGame.intervalLevels {
            var last: EarGame.Round?
            for _ in 0..<200 {
                let r = EarGame.intervalRound(level: level.number, avoiding: last, using: &earRng)
                let iv = r.interval!
                if abs(r.notes[1] - r.notes[0]) != iv.rawValue || r.options != level.intervals.map(\.name)
                    || r.options[r.answer] != iv.name || r.broken == level.together { ivOK = false }
                if r.notes[1] < r.notes[0] { if level.both { ivDown = true } else { ivOK = false } }
                if r.notes.min()! < 48 || r.notes.max()! > 72 { ivRange = false }
                if let l = last, l.interval == iv && l.root == r.root { ivRepeat = false }
                ivSeen[level.number, default: []].insert(iv)
                last = r
            }
        }
        check("intervals: every round is its interval, the right button, together only at the top", ivOK)
        check("intervals: C3 to C5", ivRange)
        check("intervals: never the same twice in a row", ivRepeat)
        check("intervals: going down from level 4", ivDown)
        check("intervals: every level plays all its intervals", EarGame.intervalLevels.allSatisfy { ivSeen[$0.number] == Set($0.intervals) })
        check("intervals: level 1 is IV or V", EarGame.intervalLevels[0].intervals == [.fourth, .fifth])
        var ivRun = EarGame.Run(level: 7, top: EarGame.intervalLevels.count)
        for _ in 0..<10 { ivRun.answer(right: true) }
        check("intervals: the top level stays the top", ivRun.level == 7 && !ivRun.leveledUp)
        var ia = ProgressStore.Snapshot(), ib = ProgressStore.Snapshot()
        ia.intervals = .init(level: 2, best: 100, answered: 10); ib.intervals = .init(level: 4, best: 50, answered: 5)
        let im = AccountStore.merge(ia, ib)
        check("intervals: kept apart from chords, merged by max", im.intervals.level == 4 && im.intervals.best == 100 && im.ear.level == 1)

        // The ramp doesn't count a clean chorus the player slowed down.
        let slow = lessonRun(from: 3, choruses: 3, bpm: 60, followTempo: false, play: perfect)
        check("a clean chorus below the ramp's tempo doesn't raise it", !slow.actions.contains(.tempo(75)) && slow.output.clean == 0
              && slow.verdicts.first?.line == "Clean at 60. Keep it at 70.", describe(slow))

        // MARK: TransportClock

        var s = EngineSnapshot()
        s.sampleRate = 48000
        s.refFrame = 400_000
        s.refHostTime = 9_000_000_000
        let spt70 = 48000 * 60 / (70 * Double(tpb)), spt90 = 48000 * 60 / (90 * Double(tpb))
        // A tempo change 70 → 90 on the downbeat of chorus 2.
        s.previousAnchor = .init(frame: 1000, tick: 0, samplesPerTick: spt70, tempo: 70)
        s.anchor = .init(frame: 1000 + Int64((Double(loop) * spt70).rounded(.up)), tick: Double(loop),
                         samplesPerTick: spt90, tempo: 90)
        let clock = TransportClock(s)
        var worst = 0.0
        for t in [100.0, Double(loop) - 0.5, Double(loop), Double(loop) + 24.25] {
            worst = max(worst, abs(clock.position(atHost: clock.hostTime(atTick: t)!).tick - t))
        }
        check("host time ↔ tick round trip", worst < 1e-3, String(format: "worst %.6f ticks", worst))
        let downbeat = clock.hostTime(atTick: Double(loop))!
        let thirty = UInt64(0.030 * clock.hostTicksPerSecond)
        let before = clock.position(atHost: downbeat - thirty), after = clock.position(atHost: downbeat + thirty)
        let earlyMs = (before.tick - Double(loop)) * before.msPerTick, lateMs = (after.tick - Double(loop)) * after.msPerTick
        // Within a frame (0.02 ms): the downbeat lands on a whole frame.
        check("30 ms either side of a tempo change reads as 30 ms", abs(earlyMs + 30) < 0.021 && abs(lateMs - 30) < 0.021,
              String(format: "%+.3f / %+.3f ms", earlyMs, lateMs))

        // Play from stopped: the beat on the anchor reads as rolling even a host tick early
        // (floating point), a millisecond early is still the stopped transport.
        var start = s
        start.previousAnchor = .init(frame: 7777, tick: 0, samplesPerTick: .infinity, tempo: 70)
        start.anchor = .init(frame: 7777, tick: 0, samplesPerTick: spt70, tempo: 70)
        let startClock = TransportClock(start)
        let onBeat = startClock.hostTime(atTick: 0)!
        let hair = startClock.position(atHost: onBeat - 1)
        let milli = startClock.position(atHost: onBeat - UInt64(0.001 * startClock.hostTicksPerSecond))
        check("the first beat after Play reads as rolling", hair.rolling && abs(hair.tick) < 1e-3 && !milli.rolling,
              "a host tick early: \(hair.rolling ? "rolling" : "held"), 1 ms early: \(milli.rolling ? "rolling" : "held")")

        // The Skizze hand: one silhouette inside the 240 × 200 box, the thumb folding onto the palm.
        let box = CGRect(x: 0, y: 0, width: 240, height: 200)
        let out = SkizzeSilhouette(fold: 0).path(in: box).boundingRect
        let folded = SkizzeSilhouette(fold: 1).path(in: box).boundingRect
        check("the Skizze silhouette stays in its box", box.insetBy(dx: -2, dy: -2).contains(out) && box.contains(folded),
              "out \(Int(out.minX))…\(Int(out.maxX)) × \(Int(out.minY))…\(Int(out.maxY)), folded \(Int(folded.minX))…\(Int(folded.maxX))")
        check("the folded thumb sits under the palm", out.minX < 12 && folded.minX > 60 && HandStyle.allCases.count == 6
              && HandStyle(rawValue: "skizze") == .skizze)

        // Show me: the demo plan, and the engine's cue on an intro (nothing scored).
        do {
            let bar = 4 * tpb
            let shuffle = lesson.steps[2]
            let shuffled = lesson.expected(shuffle, ticksPerBeat: tpb)
            let plan = Demo.plan(expected: shuffled, loopTicks: loop, ticksPerBar: bar, cycle: nil)
            check("show me: a chord step plays the whole chorus, every expected note once",
                  plan.endTicks == Double(loop) && plan.presses.count == shuffled.count
                  && plan.presses.map(\.tick) == shuffled.map { Double($0.tick) }.sorted(),
                  "\(plan.presses.count) notes, ends at \(Int(plan.endTicks))")
            check("show me: the chord on the 1 rings for most of the bar, stronger on the downbeat",
                  plan.presses.allSatisfy { $0.lengthTicks == Double(bar) * 0.9 && $0.velocity == 0.8 })
            let minor = Lesson.bundled("lesson-S1m")
            let up = minor.steps[0]
            let upNotes = minor.expected(up, ticksPerBeat: tpb)
            let runPlan = Demo.plan(expected: upNotes, loopTicks: loop, ticksPerBar: bar, cycle: up.cycle)
            check("show me: a run shows two passes (6 bars of a 3-bar cycle), 16 notes",
                  runPlan.endTicks == Double(6 * bar) && runPlan.presses.count == 16
                  && runPlan.presses.allSatisfy { $0.tick < runPlan.endTicks },
                  "\(runPlan.presses.count) notes, ends at \(Int(runPlan.endTicks))")
            let last = runPlan.presses[7]
            check("show me: the last note of a run holds through the rest bar",
                  last.tick == Double(7 * tpb) && last.lengthTicks == (Double(3 * bar) - last.tick) * 0.9,
                  "tick \(Int(last.tick)) for \(Int(last.lengthTicks)) ticks")
            let updown = minor.steps[2]
            let udPlan = Demo.plan(expected: minor.expected(updown, ticksPerBeat: tpb), loopTicks: loop, ticksPerBar: bar, cycle: updown.cycle)
            check("show me: notes a beat apart hold for most of the beat", udPlan.presses[1].lengthTicks == Double(tpb) * 0.9
                  && udPlan.presses.count == 30)
            // The cue on an intro: the gated engine scores nothing, the demo still lights keys.
            let gated = LessonEngine(lesson: minor, ticksPerBeat: tpb, gated: true)
            gated.heard(tick: 0, tempo: 60, rolling: true, epoch: 1)
            gated.heard(tick: Double(2 * tpb) + 1, tempo: 60, rolling: true, epoch: 1)
            let cue = gated.cue(at: Double(2 * tpb) + 1)
            check("show me: the engine's cue follows the tick on an intro while its output stays dark",
                  gated.output.intro != nil && gated.output.nowNotes.isEmpty && cue.nowIndex == 2 && cue.nowNote == 60 /* C4, the 3rd note of A minor */
                  && cue.nextNote == 62 && cue.fingers[60] == 3,
                  "cue now \(cue.nowNote ?? -1) index \(cue.nowIndex ?? -1) next \(cue.nextNote ?? -1)")
            let begun = LessonEngine(lesson: lesson, ticksPerBeat: tpb)
            begun.heard(tick: Double(4 * bar) + 5, tempo: 70, rolling: true, epoch: 1)
            let c = begun.cue(at: Double(4 * bar) + 5)
            check("show me: the cue is what the keyboard shows when scoring",
                  c.nowNotes == begun.output.nowNotes && c.nextNotes == begun.output.nextNotes && c.fingers == begun.output.fingers
                  && c.nowIndex == begun.output.nowIndex && c.nowNotes == [53])
        }

        // Stage: the songs load and hold together; the game engine judges, scores and adapts.
        do {
            let songs = Song.catalog.compactMap { name in
                Bundle.main.url(forResource: name, withExtension: "json") == nil ? nil : Song.bundled(name)
            }
            check("stage: the set list loads (\(songs.count) of \(Song.catalog.count) songs in the bundle)", !songs.isEmpty)
            let charting = Charting.bundled
            for s in songs {
                let ok = s.partKeys.allSatisfy { k in
                    let all = s.notes(k), span = s.keyboard(k)
                    return !all.isEmpty && all.allSatisfy { span.contains($0.n) } && all.last!.t < s.bars * s.ticksPerBar
                }
                check("stage: \(s.meta.title): \(s.partKeys.map(\.rawValue).joined(separator: " and ")), inside the keys, \(s.length)", ok)
                // Every tier keeps its own rules: the gap, the most a bar, the chord size; the
                // top one is the whole part. The detail is the ladder: onsets a second per tier.
                for k in s.partKeys {
                    let all = s.notes(k), masks = s.masks(k), tiers = charting.tiers(song: s.name, part: k)
                    let secondsPerTick = 60 / (Double(s.meta.tempo) * Double(s.band.ticksPerBeat))
                    var rules = true
                    var ladderLine: [String] = []
                    for (ti, m) in masks.enumerated() {
                        let tier = tiers[ti]
                        var byTick: [Int: Int] = [:]
                        for i in all.indices where m[i] { byTick[all[i].t, default: 0] += 1 }
                        let ticks = byTick.keys.sorted()
                        if zip(ticks, ticks.dropFirst()).contains(where: { Double($1 - $0) * secondsPerTick < tier.gap - 0.001 }) { rules = false }
                        if let cap = tier.notes, byTick.values.contains(where: { $0 > cap }) { rules = false }
                        if ticks.isEmpty { rules = false }
                        // Onsets a second over the song, and the quietest and busiest eight bars
                        // the part plays in: how even the level is.
                        let window = 8 * s.ticksPerBar, seconds = Double(window) * secondsPerTick
                        let partBars = Set(all.map { $0.t / window })
                        let rates = partBars.map { w in Double(ticks.filter { $0 / window == w }.count) / seconds }
                        ladderLine.append(String(format: "%.2f [%.1f–%.1f]", Double(ticks.count) / s.seconds, rates.min() ?? 0, rates.max() ?? 0))
                    }
                    let top = masks.last!.allSatisfy { $0 }
                    check("stage: \(s.meta.title) \(k.rawValue): every level keeps its rules, the top is the whole part", rules && top,
                          "onsets/s by level [quietest–busiest 8 bars]: \(ladderLine.joined(separator: " · "))")
                }
            }
            // A level is still the line: in every phrase where the melody plays more than one key,
            // a level that plays two notes or more there plays two keys or more (the gap can leave
            // room for no more: Slow Burn's F and D sit 0.6 s apart). The detail: the fewest keys
            // a level plays in a phrase.
            // The detail: the fewest keys any level plays in a phrase, per level.
            for s in songs where s.partKeys.contains(.melody) {
                let all = s.notes(.melody), masks = s.masks(.melody)
                var fewest: [Int] = []
                var bad: [String] = []
                var ok = true
                for (ti, m) in masks.enumerated() {
                    let span = (charting.melody.tiers[ti].phrase ?? charting.phrase(song: s.name, part: .melody) ?? 1) * s.ticksPerBar
                    let phrases = Set(all.map { $0.t / span }).sorted()
                    var low = Int.max
                    for p in phrases {
                        let line = Set(all.filter { $0.t / span == p }.map(\.n))
                        let kept = Set(all.indices.filter { m[$0] && all[$0].t / span == p }.map { all[$0].n })
                        let onsets = Set(all.indices.filter { m[$0] && all[$0].t / span == p }.map { all[$0].t }).count
                        if line.count > 1 { low = min(low, kept.count); if kept.count < min(2, onsets) { ok = false; bad.append("level \(fewest.count + 1) phrase \(p) keys \(kept.sorted()) of \(line.sorted())") } }
                    }
                    fewest.append(low == .max ? 0 : low)
                }
                check("stage: \(s.meta.title) melody: every level plays the line's keys, not one", ok, "fewest keys a phrase, by level: \(fewest) \(bad.prefix(3).joined(separator: "; "))")
            }
            if let two = songs.first(where: { $0.name == "song-hypnotist-2" }) {
                let all = two.notes(.melody), masks = two.masks(.melody), span = 2 * two.ticksPerBar
                let counts = masks.map { m in m.filter { $0 }.count }
                let grows = zip(masks, masks.dropFirst()).allSatisfy { lo, hi in zip(lo, hi).allSatisfy { !$0 || $1 } } && Set(counts).count == counts.count
                var thin: [String] = []
                for (li, m) in masks.enumerated() {
                    // Beginner (level 1) keeps two of them in every four bars (cut from level 2's picks, it can't always reach the A).
                    let pspan = li == 0 ? 2 * span : span
                    for p in Set(all.map { $0.t / pspan }).sorted() {
                        let keys = Set(all.indices.filter { m[$0] && all[$0].t / pspan == p }.map { all[$0].n })
                        // Three of the line's keys in every phrase at every level, A among them; an
                        // answer phrase (A C D E) can't fit four at level 2's gap, and keeps the lift.
                        if keys.count < (li == 0 ? 2 : 3) || (li > 0 && !keys.contains(57)) {
                            let seeded = li == 0 ? "" : " under " + all.indices.filter { masks[li - 1][$0] && all[$0].t >= p * pspan - 61 && all[$0].t < (p + 1) * pspan + 61 }.map { "\(all[$0].t):\(all[$0].n)" }.joined(separator: ",")
                            let mine = all.indices.filter { m[$0] && all[$0].t / pspan == p }.map { "\(all[$0].t):\(all[$0].n)" }.joined(separator: ",")
                            thin.append("level \(li + 1) phrase \(p) \(keys.sorted()) [\(mine)]\(seeded)")
                        }
                    }
                }
                let acd = thin.isEmpty
                check("stage: Hypnotist II: seven levels, each the one below plus more, three of its keys in every phrase of every one over Beginner (A C D, or A D E on the lift), two in every four bars of Beginner",
                      masks.count == 7 && grows && acd && Set(all.map(\.n)) == [57, 60, 62, 64] && all[0].t / two.ticksPerBar == 4,
                      "notes by level \(counts), from bar \(all[0].t / two.ticksPerBar) \(thin.prefix(4).joined(separator: "; "))")

                // Adaptive resumes just under the last run's top, and wrong keys hold it back
                // where the record's own notes don't.
                func record(_ part: String, _ difficulty: String, level: Int, _ ago: Double) -> ProgressStore.ScoreRecord {
                    ProgressStore.ScoreRecord(GameEngine.Result(song: two.name, part: part, difficulty: difficulty, score: 1, notes: 1, perfect: 1,
                                                                good: 0, missed: 0, extras: 0, wrong: 0, maxCombo: 1, accuracy: 1, level: level, grade: "S", map: [], strays: []),
                                              date: Date(timeIntervalSinceNow: -ago))
                }
                let starts = [
                    GameEngine.adaptiveStart(song: two.name, part: .melody, records: []),
                    GameEngine.adaptiveStart(song: two.name, part: .melody, records: [record("melody", "adaptive", level: 6, 60)]),
                    GameEngine.adaptiveStart(song: two.name, part: .melody, records: [record("melody", "adaptive", level: 6, 600),
                                                                                    record("melody", "adaptive", level: 3, 60)]),
                    GameEngine.adaptiveStart(song: two.name, part: .melody, records: [record("melody", "hard", level: 6, 60),
                                                                                    record("chords", "adaptive", level: 7, 30)]),
                ]
                let a0 = charting.adaptive.start
                check("stage: adaptive starts at \(charting.adaptive.start), then one under the last adaptive run's top (that song and part only), never under the start",
                      starts == [a0, a0 + 1, a0, a0], "\(starts)")
                let ms = 60000 / (Double(two.meta.tempo) * Double(two.band.ticksPerBeat))
                func adaptive(wrong: Int?, extra: Bool) -> GameEngine {
                    let g = GameEngine(song: two, part: .melody, difficulty: .adaptive)
                    var tick = 0.0
                    while tick < Double(two.endTick) {
                        for i in g.notes.indices where Double(g.notes[i].t) >= tick && Double(g.notes[i].t) < tick + 4 {
                            let at = Double(g.notes[i].t)
                            if g.active(i) {
                                g.heard(tick: at, msPerTick: ms)
                                g.played(note: g.notes[i].n, tick: at, msPerTick: ms)
                                if let w = wrong { g.played(note: w, tick: at, msPerTick: ms) }
                            } else if extra {
                                g.played(note: g.notes[i].n, tick: at, msPerTick: ms)  // the record's note, more than the level asks
                            }
                        }
                        tick += 4
                        g.heard(tick: tick, msPerTick: ms)
                    }
                    return g
                }
                let clean = adaptive(wrong: nil, extra: true), sloppy = adaptive(wrong: 63, extra: false)
                check("stage: a wrong key with every note holds adaptive down; playing more of the record doesn't",
                      clean.result().level == 7 && sloppy.result().level == 4 && sloppy.blockLevel.min() == 3,
                      "clean + record notes: top \(clean.result().level), \(clean.extras) extras · with a wrong key: top \(sloppy.result().level)")

                // The adaptive rules (charting.json `adaptive`, CHARTING.md): one tier a step, a
                // phrase held after a climb and two after a drop, no climb on scattered hits, a
                // drop after three misses in a row, a floor just under the start.
                func drive(_ g: GameEngine, _ play: (Int, Song.Note) -> Double?) {
                    var tick = 0.0
                    var i = 0
                    while tick < Double(g.endTick) {
                        while i < g.notes.count, Double(g.notes[i].t) < tick + 4 {
                            if g.active(i), let offset = play(i, g.notes[i]) {
                                let at = Double(g.notes[i].t) + offset / ms
                                g.heard(tick: at, msPerTick: ms)
                                g.played(note: g.notes[i].n, tick: at, msPerTick: ms)
                            }
                            i += 1
                        }
                        tick += 4
                        g.heard(tick: tick, msPerTick: ms)
                    }
                }
                let a = charting.adaptive
                let steady = GameEngine(song: two, part: .melody, difficulty: .adaptive)
                drive(steady) { _, _ in 0 }
                let gaps = zip(steady.changes, steady.changes.dropFirst()).map { $1.block - $0.block }
                check("stage: a perfect run climbs one tier at a time, a whole block at each tier before the next (afterClimb \(a.afterClimb)), from \(a.start) to the top",
                      steady.changes.count == steady.tiers - a.start && steady.changes.allSatisfy { $0.to == $0.from + 1 }
                      && gaps.allSatisfy { $0 == a.afterClimb + 1 }, "changes at blocks \(steady.changes.map(\.block))")
                let scatter = GameEngine(song: two, part: .melody, difficulty: .adaptive)
                drive(scatter) { i, _ in i % 2 == 0 ? 70 : -70 }
                check("stage: hits scattered 70 ms (over spreadMaxMs \(Int(a.spreadMaxMs ?? 0))) never climb, though every note is hit",
                      scatter.missed == 0 && scatter.result().level == a.start && scatter.changes.isEmpty, "top \(scatter.result().level), \(scatter.good) good")
                var skipped = 0
                let cluster = GameEngine(song: two, part: .melody, difficulty: .adaptive)
                drive(cluster) { _, n in
                    // Three misses in a row in bar 24, everything else clean: the window's rate stays
                    // over `ease`, the cluster alone drops it.
                    if n.t / two.ticksPerBar == 24, skipped < 3 { skipped += 1; return nil }
                    return 0
                }
                let drop = cluster.changes.first { $0.to < $0.from }
                check("stage: \(a.missRun ?? 0) misses in a row drop a tier even at a hit rate over ease, then two blocks hold (afterDrop \(a.afterDrop))",
                      drop != nil && drop!.rate >= a.ease && skipped == 3
                      && (cluster.changes.firstIndex { $0.to < $0.from }.map { i in i + 1 < cluster.changes.count ? cluster.changes[i + 1].block - cluster.changes[i].block >= a.afterDrop + 1 : true } ?? false),
                      "changes \(cluster.changes.map { "\($0.block):\($0.from)→\($0.to) @\(Int($0.rate * 100))%" })")
                let floorRun = GameEngine(song: two, part: .melody, difficulty: .adaptive, start: 5)
                drive(floorRun) { _, _ in nil }
                check("stage: a run that started on 5 and plays nothing sinks to 4 and no further (floorBelowStart \(a.floorBelowStart))",
                      floorRun.blockLevel.min() == 4 && floorRun.blockLevel[0] == 5 && floorRun.result().level == 5, "levels \(floorRun.blockLevel)")
                // A player model: clean up to their tier, 70% a tier above, under half beyond;
                // offsets normal with 30 / 45 / 60 ms spread (a seeded LCG with Box–Muller). Adaptive
                // should settle on the tier above theirs (hysteresis: 75% is between ease and climb)
                // and stop changing, not ping-pong.
                var seed: UInt64 = 7
                func rand() -> Double { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Double(seed >> 11) / Double(1 << 53) }
                func gauss(_ sd: Double) -> Double { sd * (-2 * log(max(rand(), 1e-12))).squareRoot() * cos(2 * .pi * rand()) }
                let own = 4
                let bot = GameEngine(song: two, part: .melody, difficulty: .adaptive)
                drive(bot) { _, n in
                    let t = bot.level(atBar: n.t / two.ticksPerBar)
                    let (p, sd) = t <= own ? (0.95, 30.0) : t == own + 1 ? (0.7, 45.0) : (0.45, 60.0)
                    return rand() < p ? gauss(sd) : nil
                }
                let half = bot.blockLevel.count / 2
                let late = bot.changes.filter { $0.block >= half }
                // A 70% player sits in the hold band on average; a window still scatters the
                // rate, so the bound is on how far and how often it wanders, not zero changes.
                check("stage: a level-\(own) player model ends on level \(own) or \(own + 1), stays within \(own)–\(own + 2) in the second half, changing at most twice",
                      (own...own + 1).contains(bot.blockLevel.last!) && late.count <= 2
                      && bot.blockLevel[half...].allSatisfy { (own...own + 2).contains($0) },
                      "levels \(bot.blockLevel), changes \(bot.changes.map { "\($0.block):\($0.from)→\($0.to)" })")
                // A thin part cuts the same chart on two or three tiers (Abyss's long tones at
                // the top of its ladder): a climb lands on the next tier that differs.
                if let abyss = songs.first(where: { $0.name == "song-abyss" }) {
                    let skip = GameEngine(song: abyss, part: .melody, difficulty: .adaptive)
                    let ams = 60000 / (Double(abyss.meta.tempo) * Double(abyss.band.ticksPerBeat))
                    var tick = 0.0
                    var i = 0
                    while tick < Double(skip.endTick) {
                        while i < skip.notes.count, Double(skip.notes[i].t) < tick + 4 {
                            if skip.active(i) { skip.heard(tick: Double(skip.notes[i].t), msPerTick: ams); skip.played(note: skip.notes[i].n, tick: Double(skip.notes[i].t), msPerTick: ams) }
                            i += 1
                        }
                        tick += 4
                        skip.heard(tick: tick, msPerTick: ams)
                    }
                    let m = abyss.masks(.melody)
                    check("stage: on Abyss's melody every adaptive climb changes the chart or lands on the top (identical tiers are skipped)",
                          skip.changes.allSatisfy { m[$0.to - 1] != m[$0.from - 1] || $0.to == skip.tiers } && skip.result().level == skip.tiers
                          && skip.distinct(from: 5, up: true) == 7 && m[4] == m[6],
                          "changes \(skip.changes.map { "\($0.block):\($0.from)→\($0.to)" })")
                }
            }
            // Ladder health, every song and part: each level is the one below plus more (seeded
            // masks), so it never has fewer notes a second; and level 1 is at most half the top,
            // so the ladder has somewhere to go. The detail: notes a second by level, and the
            // rise per step.
            // Beginner changes nothing above it: the same charting with the bottom tier of each
            // ladder cut away charts Easy and everything over it identically.
            let without: Charting = {
                let url = Bundle.main.url(forResource: "charting", withExtension: "json")!
                var d = try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
                for part in ["chords", "melody"] {
                    var l = d[part] as! [String: Any]
                    var tiers = l["tiers"] as! [[String: Any]]
                    guard tiers[0]["fromAbove"] as? Bool == true else { continue }
                    tiers.removeFirst()
                    l["tiers"] = tiers
                    for n in ["beginner", "easy", "medium", "hard"] { l[n] = max(1, (l[n] as! Int) - 1) }
                    d[part] = l
                }
                var a = d["adaptive"] as! [String: Any]
                a["start"] = (a["start"] as! Int) - 1
                d["adaptive"] = a
                // A song's own levels and tier patches move down a tier with the ladder.
                var songsD = d["songs"] as! [String: Any]
                for (song, partsAny) in songsD {
                    var parts = partsAny as! [String: Any]
                    for (part, oAny) in parts {
                        var o = oAny as! [String: Any]
                        for n in ["beginner", "easy", "medium", "hard"] where o[n] != nil { o[n] = max(1, (o[n] as! Int) - 1) }
                        if let tiers = o["tiers"] as? [String: Any] {
                            var moved: [String: Any] = [:]
                            for (k, v) in tiers where Int(k)! > 1 { moved[String(Int(k)! - 1)] = v }
                            o["tiers"] = moved
                        }
                        parts[part] = o
                    }
                    songsD[song] = parts
                }
                d["songs"] = songsD
                return try! JSONDecoder().decode(Charting.self, from: JSONSerialization.data(withJSONObject: d))
            }()
            for s in songs {
                for k in s.partKeys {
                    let masks = s.masks(k)
                    let plain = s.masks(k, charting: without)
                    let all = s.notes(k)
                    var diffs: [String] = []
                    for (li, (a, b)) in zip(masks.dropFirst(), plain).enumerated() where a != b {
                        let d = all.indices.filter { a[$0] != b[$0] }
                        diffs.append("level \(li + 2): \(d.count) notes differ, first at bar \(all[d[0]].t / s.ticksPerBar) tick \(all[d[0]].t % s.ticksPerBar) (\(a[d[0]] ? "extra" : "missing"))")
                    }
                    check("stage: \(s.meta.title) \(k.rawValue): Easy and above chart the same with Beginner under them as without", diffs.isEmpty, diffs.joined(separator: "; "))
                    // `minBeats`: no Beginner note shorter than a beat, or than the part's usual
                    // weight-1 note where the line is all short stabs (Hypnotist).
                    if let beats = charting.ladder(k).tiers[0].minBeats {
                        let anchors = all.filter { $0.lv == 1 }.map(\.len).sorted()
                        let minLen = min(Int((beats * Double(s.band.ticksPerBeat)).rounded()), anchors[anchors.count / 2])
                        let short = all.indices.filter { masks[0][$0] && all[$0].len < minLen }
                        check("stage: \(s.meta.title) \(k.rawValue): no Beginner note shorter than \(minLen) ticks", short.isEmpty && !masks[0].allSatisfy { !$0 },
                              short.isEmpty ? "" : "\(short.count) short, first at bar \(all[short[0]].t / s.ticksPerBar + 1) len \(all[short[0]].len)")
                    }
                    let subset = zip(masks, masks.dropFirst()).allSatisfy { lo, hi in zip(lo, hi).allSatisfy { !$0 || $1 } }
                    let rates = masks.map { m in Double(m.filter { $0 }.count) / s.seconds }
                    let rising = zip(rates, rates.dropFirst()).allSatisfy { $1 >= $0 - 1e-9 }
                    let rise = zip(rates, rates.dropFirst()).map { $0 > 0 ? "+\(Int((($1 / $0) - 1) * 100 + 0.5))%" : "—" }
                    // A dense part has room for a ladder (level 1 at most half the top); a thin one
                    // (long tones under 1.5 a second) can only thin so far: the phrase rule keeps
                    // every key of every phrase, and Abyss's line is nearly that already.
                    let share = rates.last! >= 1.5 ? 0.5 : 0.7
                    check("stage: \(s.meta.title) \(k.rawValue): every level is the one below plus more, level 1 at most \(Int(share * 100))% of the top",
                          subset && rising && rates[0] <= rates.last! * share + 1e-9,
                          "notes/s " + rates.map { String(format: "%.2f", $0) }.joined(separator: " · ") + " · rise \(rise.joined(separator: " "))")
                }
            }
            if let song = songs.first {
                let tpbar = song.ticksPerBar
                let ms = 60000 / (Double(song.meta.tempo) * Double(tpb))
                func run(_ difficulty: GameEngine.Difficulty, play: (Song.Note, Int) -> Double?) -> GameEngine {
                    let g = GameEngine(song: song, part: .melody, difficulty: difficulty)
                    var tick = -Double(tpbar)
                    var i = 0
                    while tick < Double(song.endTick) {
                        // Presses for the notes in this frame's span (a frame is 4 ticks).
                        while i < g.notes.count, Double(g.notes[i].t) <= tick + 4 {
                            if g.active(i), let offset = play(g.notes[i], i) {
                                let at = Double(g.notes[i].t) + offset / ms
                                g.heard(tick: at, msPerTick: ms)
                                g.played(note: g.notes[i].n, tick: at, msPerTick: ms)
                            }
                            i += 1
                        }
                        tick += 4
                        g.heard(tick: tick, msPerTick: ms)
                    }
                    return g
                }
                let perfect = run(.easy) { _, _ in 0 }
                let easyTier = charting.tier(.easy, song: song.name, part: .melody)!
                let easyNotes = song.chart(.melody, tier: easyTier).count
                check("stage: perfect on easy hits every note, no misses, grade S", perfect.perfect == easyNotes && perfect.missed == 0
                      && perfect.result().grade == "S" && perfect.finished && perfect.maxCombo == easyNotes,
                      "\(perfect.perfect)/\(easyNotes), score \(perfect.score)")
                check("stage: the multiplier climbs at 8, 16 and 32", perfect.multiplier == 4 && GameEngine.steps == [8, 16, 32])
                let late = run(.easy) { _, i in i % 2 == 0 ? 70 : 0 }
                check("stage: 70 ms late is Good, on the tick is Perfect", late.good > 0 && late.perfect > 0 && late.missed == 0
                      && late.score < perfect.score, "\(late.perfect) perfect, \(late.good) good")
                var k = 0
                let sloppy = run(.easy) { _, _ in
                    k += 1
                    return k % 3 == 0 ? nil : 0
                }
                check("stage: a skipped note is a miss and breaks the combo", sloppy.missed == easyNotes / 3
                      && sloppy.maxCombo <= 2 && sloppy.result().grade != "S", "\(sloppy.missed) missed, best combo \(sloppy.maxCombo)")
                let wrong = GameEngine(song: song, part: .melody, difficulty: .easy)
                wrong.heard(tick: 0, msPerTick: ms)
                wrong.played(note: 61, tick: 0, msPerTick: ms)
                check("stage: a key no note wants is an extra, not a hit", wrong.extras == 1 && wrong.perfect + wrong.good == 0)
                // Accuracy is how clean the keys you played were: a wrong key costs, a note let go
                // by doesn't (the hit rate grades the run), and the record's own notes the level
                // left out cost nothing.
                check("stage: accuracy is hits over notes and wrong keys: a skipped note costs, a wrong key costs",
                      sloppy.accuracy < 0.7 && sloppy.accuracy > 0.6 && sloppy.result().wrong == 0 && wrong.accuracy == 0 && wrong.result().wrong == 1,
                      "skipped a third: \(sloppy.accuracy) · wrong key: \(wrong.accuracy), \(wrong.result().wrong) wrong")
                let own = GameEngine(song: song, part: .melody, difficulty: .easy)
                let left = song.notes(.melody).indices.first { !own.active($0) }!
                let leftNote = song.notes(.melody)[left]
                own.heard(tick: Double(leftNote.t), msPerTick: ms)
                let before = own.accuracy
                own.played(note: leftNote.n, tick: Double(leftNote.t), msPerTick: ms)
                check("stage: the record's own note the level left out is an extra but not wrong", own.extras == 1 && own.wrong == 0 && own.accuracy == before)
                // The right key 200 ms late (past the Good window): the note is missed, the press
                // an extra, and nothing is wrong. Bart's 51% on a run he played well, 0.1 (53).
                let behind = GameEngine(song: song, part: .melody, difficulty: .easy)
                let firstIdx = song.notes(.melody).indices.first { behind.active($0) }!
                let firstNote = song.notes(.melody)[firstIdx]
                let lateTick = Double(firstNote.t) + 200 / ms
                behind.heard(tick: lateTick, msPerTick: ms)
                behind.played(note: firstNote.n, tick: lateTick, msPerTick: ms)
                check("stage: the right key 200 ms behind is a miss and an extra, not a wrong key",
                      behind.missed == 1 && behind.extras == 1 && behind.wrong == 0 && behind.accuracy == 0, "\(behind.missed) missed, \(behind.extras) extras, \(behind.wrong) wrong")
                check("stage: the run's map has a mark per judged onset in order, strays where the wrong keys fell",
                      sloppy.result().map.count == easyNotes && sloppy.result().map.filter { $0.judgment == .miss }.count == easyNotes / 3
                      && zip(sloppy.result().map, sloppy.result().map.dropFirst()).allSatisfy { $0.at < $1.at }
                      && wrong.result().strays == [0], "\(sloppy.result().map.count) marks, \(wrong.result().strays)")
                let adaptive = run(.adaptive) { _, _ in 0 }
                let steps = zip(adaptive.blockLevel, adaptive.blockLevel.dropFirst())
                check("stage: adaptive climbs one level at a time to the top on clean playing (past a level whose chart is the same)",
                      adaptive.blockLevel[0] == charting.adaptive.start && steps.allSatisfy { $1 == $0 || $1 == adaptive.distinct(from: $0, up: true) }
                      && adaptive.result().level == adaptive.tiers, "levels \(adaptive.blockLevel)")
                let eases = run(.adaptive) { n, _ in n.t / tpbar >= 12 && n.t / tpbar < 20 ? nil : 0 }
                let down = zip(eases.blockLevel, eases.blockLevel.dropFirst()).enumerated().first { $0.element.1 < $0.element.0 }?.offset
                check("stage: missed bars ease it off a level at a time, clean ones bring it back",
                      down != nil && zip(eases.blockLevel, eases.blockLevel.dropFirst()).allSatisfy { $1 == $0 || $1 == eases.distinct(from: $0, up: $1 > $0) }
                      && eases.blockLevel.last! > eases.blockLevel[down! + 1], "levels \(eases.blockLevel)")
                let hardScore = run(.hard) { _, _ in 0 }.score
                check("stage: hard pays more than twice easy", hardScore > perfect.score * 2,
                      "hard \(hardScore) vs easy \(perfect.score)")
                let r = ProgressStore.ScoreRecord.trimmed((0..<60).map { i in
                    ProgressStore.ScoreRecord(GameEngine.Result(song: "s", part: "melody", difficulty: "easy", score: i, notes: 1, perfect: 1,
                                                                good: 0, missed: 0, extras: 0, wrong: 0, maxCombo: 1, accuracy: 1, level: 1, grade: "S", map: [], strays: []))
                })
                check("stage: the board keeps the best 50 a song, best first", r.count == 50 && r.first?.score == 59 && r.last?.score == 10)

                // Tap mode: one finger per chord, a hair early, every key of it from `due`; and a
                // tap far from any chord takes the next one (extras, nothing hit).
                let tap = GameEngine(song: song, part: .chords, difficulty: .easy)
                let chordTicks = Set(tap.notes.indices.filter { tap.active($0) }.map { tap.notes[$0].t }).sorted()
                for t in chordTicks {
                    let at = Double(t) - 20 / ms
                    tap.heard(tick: at, msPerTick: ms)
                    for n in tap.due(at: at, msPerTick: ms) { tap.played(note: n, tick: at, msPerTick: ms) }
                }
                tap.heard(tick: Double(song.endTick) + Double(tpbar), msPerTick: ms)
                let chordNotes = tap.notes.indices.filter { tap.active($0) }.count
                check("stage: tap mode plays each chord whole on one finger: every key hit, none extra, grade S",
                      tap.perfect == chordNotes && tap.missed == 0 && tap.extras == 0 && tap.result().grade == "S"
                      && chordNotes > chordTicks.count, "\(tap.perfect)/\(chordNotes) on \(chordTicks.count) taps, \(tap.extras) extra")
                // One finger of every chord dropped: a miss per chord, but the combo runs on (a
                // 30-combo shouldn't go on one finger); a whole chord skipped breaks it.
                let dropped = GameEngine(song: song, part: .chords, difficulty: .easy)
                for (n, t) in chordTicks.enumerated() {
                    dropped.heard(tick: Double(t), msPerTick: ms)
                    let keys = dropped.due(at: Double(t), msPerTick: ms).sorted()
                    for k in (n == 5 ? [] : keys.dropLast()) { dropped.played(note: k, tick: Double(t), msPerTick: ms) }
                }
                dropped.heard(tick: Double(song.endTick) + Double(tpbar), msPerTick: ms)
                check("stage: a chord with one finger dropped is a miss for that note but keeps the combo; a whole chord skipped breaks it",
                      dropped.missed == chordTicks.count + 1 && dropped.maxCombo == chordTicks.count - 6 && dropped.combo == chordTicks.count - 6
                      && dropped.perfect == chordNotes - chordTicks.count - 1,
                      "\(dropped.missed) missed, combo \(dropped.combo) of \(chordTicks.count) chords, max \(dropped.maxCombo)")
                let stray = GameEngine(song: song, part: .chords, difficulty: .easy)
                let gap = Double(chordTicks[0]) - 400 / ms
                let strayKeys = stray.due(at: gap, msPerTick: ms)
                for n in strayKeys { stray.played(note: n, tick: gap, msPerTick: ms) }
                check("stage: a tap 400 ms before a chord plays it as extras, nothing hit",
                      !strayKeys.isEmpty && stray.extras == strayKeys.count && stray.perfect + stray.good == 0)

                // Practice (the pause menu): a seek makes every note from there pending again
                // and leaves what came before; presses and pass-bys still pop, but the score, the
                // combo and the counts hold, and the run never finishes.
                let prac = GameEngine(song: song, part: .melody, difficulty: .easy)
                let pracNotes = prac.notes.indices.filter { prac.active($0) }
                let pracFirst = pracNotes[0], midNote = pracNotes[pracNotes.count / 2]
                let pracFirstTick = Double(prac.notes[pracFirst].t), midTick = Double(prac.notes[midNote].t)
                prac.heard(tick: pracFirstTick, msPerTick: ms)
                prac.played(note: prac.notes[pracFirst].n, tick: pracFirstTick, msPerTick: ms)
                let scored = (prac.score, prac.combo, prac.perfect)
                prac.practice = true
                prac.seek(to: midTick)
                let pendingFromMid = prac.status.indices.filter { Double(prac.notes[$0].t) >= midTick }.allSatisfy { prac.status[$0] == .pending }
                prac.played(note: prac.notes[midNote].n, tick: midTick, msPerTick: ms)
                let hitPop = prac.pop?.judgment == .perfect
                prac.played(note: prac.notes[midNote].n + 1, tick: midTick + 1, msPerTick: ms)
                prac.heard(tick: Double(song.endTick) + Double(tpbar), msPerTick: ms)
                check("stage: practice judges and pops but holds the score, the combo and the counts, and never finishes",
                      prac.isHit(midNote) && hitPop && prac.pop?.judgment == .miss && (prac.score, prac.combo, prac.perfect) == scored
                      && prac.missed == 0 && prac.extras == 0 && prac.wrong == 0 && !prac.finished,
                      "score \(prac.score) combo \(prac.combo) missed \(prac.missed) extras \(prac.extras) finished \(prac.finished)")
                prac.seek(to: midTick)
                check("stage: a practice seek makes every note from there pending again and leaves the ones before",
                      pendingFromMid && prac.status[midNote] == .pending && prac.isHit(pracFirst)
                      && prac.status.indices.filter { Double(prac.notes[$0].t) >= midTick }.allSatisfy { prac.status[$0] == .pending })
            }
        }

        // The dub chamber (misc/DUB_TECHNO_FIXES.md "How to check it"): one short stab in (30 ms of
        // the song's live stab, the material it was tuned on). The echoes
        // (the plate off) come a dotted eighth apart, alternating sides, each 2–6 dB quieter
        // than the one before from the second on; a bright click's echoes get darker every time
        // (the lowpass in the loop); the plate alone (the echoes off) decays evenly, 0.5 s at a
        // time, with no bumps.
        do {
            let sr = 48000.0, beat = sr * 60 / 117
            let abyss = BandData.bundled("song-abyss")
            let base = abyss.dub!.settings
            let burst = Int(0.03 * sr)
            var stab = [Float](repeating: 0, count: burst + 512), stabR = stab
            for note in [50, 53, 57, 60, 64] {
                var v = DubStab.Voice()
                v.start(note: note, velocity: 1, breath: 0.5, held: burst, gain: 1, bus: 0, live: false, age: 0,
                        settings: abyss.stab!.settings, sampleRate: sr)
                stab.withUnsafeMutableBufferPointer { l in
                    stabR.withUnsafeMutableBufferPointer { r in v.render(l.baseAddress!, r.baseAddress!, from: 0, to: burst + 512) }
                }
            }
            // A bright click: a few samples of a saw-like burst.
            var click = [Float](repeating: 0, count: 64)
            for i in 0..<64 { click[i] = (i % 8 < 4 ? 1 : -1) * Float(1 - Double(i) / 64) }
            func run(_ s: DubChamber.Settings, seconds: Double, input source: [Float]) -> (l: [Float], r: [Float]) {
                let chamber = DubChamber(sampleRate: sr)
                chamber.configure(s)
                let n = Int(seconds * sr), chunk = 512
                var outL = [Float](repeating: 0, count: n), outR = [Float](repeating: 0, count: n)
                let zero = [Float](repeating: 0, count: chunk)
                // The input at the reference's send level (peak 0.8 inside the chamber).
                let top = source.map(abs).max()!
                let stab = source.map { $0 / top * 0.8 * s.level }
                var at = 0
                while at < n {
                    let m = min(chunk, n - at)
                    let input = at < stab.count ? Array(stab[at..<min(stab.count, at + m)]) + [Float](repeating: 0, count: max(0, at + m - stab.count)) : zero
                    outL.withUnsafeMutableBufferPointer { l in
                        outR.withUnsafeMutableBufferPointer { r in
                            chamber.process(sendL: input, sendR: input, kick: zero, n: m, samplesPerBeat: beat, playing: false,
                                            outL: l.baseAddress! + at, outR: r.baseAddress! + at)
                        }
                    }
                    at += m
                }
                return (outL, outR)
            }
            var dry = base
            dry.reverb = 0
            var echoes = run(dry, seconds: 6, input: stab)
            // Echo k sits at k · 0.75 beat: its energy in 30 ms there (both sides), its brightness
            // (the share of the first difference), and how much of it is on the side it should be.
            let d = 0.75 * beat
            func echo(_ k: Int) -> (db: Double, high: Double, side: Double) {
                let s0 = Int(Double(k) * d) - 200, s1 = s0 + Int(0.03 * sr) + burst
                var e = 0.0, h = 0.0, own = 0.0, prev: Float = 0
                let mine = k % 2 == 1 ? echoes.l : echoes.r
                for i in max(0, s0)..<min(echoes.l.count, s1) {
                    e += Double(echoes.l[i] * echoes.l[i] + echoes.r[i] * echoes.r[i])
                    own += Double(mine[i] * mine[i])
                    let x = echoes.l[i] + echoes.r[i], diff = x - prev
                    h += Double(diff * diff)
                    prev = x
                }
                return (10 * log10(max(e, 1e-30)), h / max(e, 1e-30), own / max(e, 1e-30))
            }
            let es = (1...7).map(echo)
            let steps = (1..<es.count).map { es[$0 - 1].db - es[$0].db }
            echoes = run(dry, seconds: 6, input: click)
            let clicks = (1...7).map(echo)
            check("dub chamber: a trail of echoes a dotted eighth apart, each 2–6 dB quieter than the last from the second on",
                  steps.dropFirst().allSatisfy { $0 >= 2 && $0 <= 6 },
                  "echoes " + es.map { String(format: "%.1f", $0.db) }.joined(separator: ", ") + " dB")
            check("dub chamber: every echo darker than the one before, alternating sides",
                  (1..<clicks.count).allSatisfy { clicks[$0].high < clicks[$0 - 1].high } && clicks.allSatisfy { $0.side > 0.55 },
                  "brightness " + clicks.map { String(format: "%.3f", $0.high) }.joined(separator: " ")
                      + ", own side " + clicks.map { String(format: "%.2f", $0.side) }.joined(separator: " "))
            var wet = base
            wet.echo = 0
            let plate = run(wet, seconds: 5, input: stab)
            let half = Int(0.5 * sr)
            let windows = (1..<9).map { w -> Double in
                var e = 0.0
                for i in (w * half)..<((w + 1) * half) { e += Double(plate.l[i] * plate.l[i] + plate.r[i] * plate.r[i]) }
                return 10 * log10(max(e, 1e-30))
            }
            let drops = (1..<windows.count).map { windows[$0 - 1] - windows[$0] }
            let mean = drops.reduce(0, +) / Double(drops.count)
            check("dub chamber: the plate's tail decays evenly (every 0.5 s within 1.5 dB of the mean drop)",
                  mean > 0.5 && drops.allSatisfy { abs($0 - mean) < 1.5 },
                  "drops " + drops.map { String(format: "%.1f", $0) }.joined(separator: " ") + String(format: " dB, RT60 %.1f s", 60 / mean * 0.5))
        }

        print("LessonCheck: \(passed) passed, \(failed) failed")
        return failed == 0
    }
}
#endif
