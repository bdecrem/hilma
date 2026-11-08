#if DEBUG
import Foundation
import UIKit

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
        // White keys play A minor (Settings → Input): C3–C5 white keys become A2–A4.
        let whites = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72].map { MIDIInput.remap($0, on: true) }
        check("white keys C3–C5 remap to A2–A4 white keys", whites == [45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69]
              && MIDIInput.remap(61, on: true) == 58 && MIDIInput.remap(60, on: false) == 60, "\(whites)")
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
            check("scales: fourteen lessons in C major (the scale in eighths last), fifteen in A minor (the pentatonic over two octaves, then A minor in eighths), their steps in order", major.lessons.count == 14 && major.lessonsDone(reachedStep: 2) == 1
                  && minor.lessons.map(\.title) == ["Up", "Down", "Up and down", "Two octaves", "The left hand", "The blues scale",
                                                    "Minor pentatonic", "The relative major", "E minor", "D minor", "Harmonic minor", "Dorian", "Chromatic",
                                                    "Pentatonic, two octaves", "A minor in eighths"]
                  && major.lessons.map(\.title).suffix(8) == ["Major pentatonic", "The relative minor", "G major", "F major", "Mixolydian", "Dorian", "Chromatic", "C major in eighths"]
                  && (minor.jams ?? []).count == 15 && (minor.jams ?? []).map(\.after) == Array(1...13) + [14, 15], "\(minor.lessons.map(\.title))")
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
                  minor.steps[24].id == "jam-key2" && minor.steps[24].transpose == 7 && minor.steps[25].transpose == 5 && minor.steps[25].flats == true
                  && major.steps[22].transpose == 7 && major.steps[23].transpose == 5 && minor.steps[22].transpose == nil
                  && minor.steps[26].band == ["drums", "bass"], "\(minor.steps[20...26].map { "\($0.id):\($0.transpose ?? 0)" })")
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
            check("run: the second run's second note is index 1 of the run (the run is the judged unit, 4 bars)",
                  re.output.nowIndex == 1 && re.output.nowNote == 59 && re.loopTicks == 3 * 4 * tpb && re.expected.count == 8
                  && re.chorusTicks == 12 * 4 * tpb, "\(String(describing: re.output.nowIndex)) \(re.loopTicks) \(re.expected.count)")
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
            check("jams: fifteen under the scale lessons (the two improvs of levels 1 and 2 last), seven under the blues, each a jam step past the lessons' steps",
                  jams.count == 15 && (lesson.jams ?? []).count == 7 && jams.map(\.after) == Array(1...13) + [14, 15]
                  && minor.stepIndex(ofJam: jams[0]) == 16 && minor.lessonIndex(ofStep: 16) == 0 && minor.jam(ofStep: 16)?.title == "First riff"
                  && minor.steps[16].band == ["drums", "bass", "keys"] && minor.steps[0].band == ["drums"] && minor.steps[20].band == ["drums", "keys"]
                  && lesson.steps[8].kind == .free && lesson.lessonIndex(ofStep: 12) == 4 && lesson.lessonsDone(reachedStep: 7) == 5
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
            check("minor: twelve keys, Two a bar, then Three chords; each key its own i iv v form, the band within -6…+5",
                  minorModule.lessons.count == 14 && minorModule.lessons.last?.title == "Three chords" && minorModule.band == "band-minor-A" && (minorModule.jams ?? []).count == 14
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
                  && shapes.expected(shapes.steps[11], ticksPerBeat: tpb).count == 72 && shapes.steps[11].kind == .free)
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
            je.start(step: 16)
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
            gj.start(step: 16)
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
            ge.start(step: 15)
            ge.heard(tick: 0, tempo: 72, rolling: true, epoch: 0)
            ge.debugComplete()
            check("run: the last lesson passed shows Lesson 15 complete with nothing next (the jams after it don't count)",
                  ge.output.complete?.number == 15 && ge.output.complete?.next == nil && ge.output.complete?.done == "A minor in eighths",
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
        check("a snapshot from before the streak decodes", old.days.isEmpty && old.quiz.level == nil && old.practice.isEmpty)
        typealias PE = ProgressStore.PracticeEntry
        mineSnap.practice = [PE(day: "2026-10-20", kind: "lesson", id: "A1·2")]
        theirs.practice = [PE(day: "2026-10-21", kind: "stage", id: "undertow"), PE(day: "2026-10-20", kind: "lesson", id: "A1·2")]
        let mergedLog = AccountStore.merge(mineSnap, theirs).practice
        check("practice log: merged from both devices, each once, oldest first",
              mergedLog == [PE(day: "2026-10-20", kind: "lesson", id: "A1·2"), PE(day: "2026-10-21", kind: "stage", id: "undertow")])
        let many = (0..<250).map { PE(day: String(format: "2026-%02d-%02d", 1 + $0 / 28, 1 + $0 % 28), kind: "stage", id: "s") }
        check("practice log: the last 200 kept", PE.union(many, []).count == 200 && PE.union(many, []).last == many.last)

        // MARK: Goals and the map

        let plan = LearningPlan.bundled(LearningPlan.defaultId)
        let l1 = plan.levels[0], l2 = plan.levels[1], l3 = plan.levels[2]
        check("plan: 26 levels, 1…26; chapter 1 is levels 1–3 (white keys, five notes, the minor blues), the blues scale level 4, no goals past 3 yet",
              plan.levels.count == 26 && plan.levels.map(\.n) == Array(1...26)
              && [l1, l2, l3].map(\.title) == ["White keys", "Five notes", "The minor blues"]
              && l1.items.map(\.id) == ["scale-c", "scale-a", "song", "improv"] && l2.items.map(\.id) == ["scale-rh", "scale-lh", "song", "improv"]
              && l3.items.map(\.id) == ["chords", "form", "jam"]
              && plan.levels[3].title == "The blues scale" && plan.levels.dropFirst(3).allSatisfy { $0.items.isEmpty }
              && plan.levels[7].title.hasPrefix("Checkpoint"))
        check("plan: every step goal names a play step of its module at its tempo, every jam a free step with choruses",
              plan.levels.flatMap(\.items).filter { $0.kind != .song }.allSatisfy { i in
                  let m = Lesson.bundled("lesson-\(i.module!)")
                  guard let step = m.steps.first(where: { $0.id == i.step }) else { return false }
                  return i.kind == .step ? step.kind == .play && i.tempo == step.tempo : step.kind == .free && (i.choruses ?? 0) > 0
              })
        // Each of levels 1 and 2 ends on a song whose chart, at the goal's part and level, plays
        // only that level's notes (and all of them): the white keys, then A C D E G.
        for (level, notes) in [(l1, Set([0, 2, 4, 5, 7, 9, 11])), (l2, Set([9, 0, 2, 4, 7]))] {
            let item = level.items.first { $0.kind == .song }!
            let song = Song.bundled(item.song!), part = Song.PartKey(rawValue: item.part!)!
            let tier = Charting.bundled.tier(GameEngine.Difficulty(rawValue: item.difficulty!)!, song: song.name, part: part)!
            let chart = song.chart(part, tier: tier), used = Set(chart.map { $0.n % 12 })
            check("plan: level \(level.n)'s song goal is \(song.name), the melody on Medium for an A: \(chart.count) notes, only the level's notes, every one of them",
                  item.kind == .song && item.part == "melody" && item.difficulty == "medium" && item.grade == "A"
                  && used == notes && Set(song.notes(part).map { $0.n % 12 }).isSubset(of: notes),
                  "\(used.sorted())")
        }
        // Each ends on an improv (IMPROV.md): a free step of the A minor scales over that level's
        // song's band, the level's notes as its scale, two choruses, 16 notes, nine in ten on them.
        for (level, step, backing, notes) in [(l1, "improv-white", "song-blue-lantern-white", Set([0, 2, 4, 5, 7, 9, 11])),
                                              (l2, "improv-five", "song-maxwell-street-five", Set([9, 0, 2, 4, 7]))] {
            let item = level.items.last!
            let m = Lesson.bundled("lesson-S1m"), s = m.steps.first { $0.id == step }!
            let band = BandData.bundled(backing).looped(by: m.form(of: s))
            check("plan: level \(level.n) ends on an improv over \(backing)'s band (looped to 48 bars of its 12-bar form, no horns), on the level's notes",
                  item.kind == .improv && item.step == step && item.module == "S1m" && item.choruses == 2 && item.minNotes == 16 && item.inScale == 0.9
                  && s.kind == .free && s.backing == backing && m.scale(of: s) == notes && s.band == ["drums", "bass", "keys"]
                  && band.bars == 48 && band.form == m.form(of: s) && band.channels.drums.allSatisfy { $0.t < 48 * 48 }
                  && m.jams?.contains { $0.step == step } == true,
                  "\(band.bars) bars, scale \(m.scale(of: s).sorted())")
        }
        let k = { (i: Int) in plan.key(l1, l1.items[i]) }
        let k3 = { (i: Int) in plan.key(l3, l3.items[i]) }
        let none = GoalProgress(plan: plan, records: [:])
        check("goals: nothing done clears nothing; the ladder starts at 60, the jam at 0 of 3, the song waits for an A",
              none.cleared == 0 && none.suggestedTempo(l1, l1.items[0]) == 60 && none.status(l3, l3.items[2]) == "0 of 3 choruses in the scale"
              && none.action(l1, l1.items[0]) == "Play at 60" && none.action(l3, l3.items[2]) == "Jam"
              && none.suggestedTempo(l3, l3.items[0]) == 60 && none.action(l1, l1.items[2]) == "Play the song"
              && none.status(l1, l1.items[2]) == "Not yet · an A on Medium is 90%", none.status(l1, l1.items[2]))
        let partial = GoalProgress(plan: plan, records: [k(0): GoalRecord(done: nil, best: 64, choruses: 0), k(1): GoalRecord(done: nil, best: 70, choruses: 0),
                                                         k(2): GoalRecord(done: nil, best: 84, choruses: 0)])
        check("goals: a rung above the best 100% pass, never past the target; the song's best accuracy",
              partial.suggestedTempo(l1, l1.items[0]) == 68 && partial.suggestedTempo(l1, l1.items[1]) == 72
              && partial.action(l1, l1.items[0]) == "Play at 68" && partial.status(l1, l1.items[0]) == "Best 100% pass 64 · counts at 72"
              && partial.status(l1, l1.items[2]) == "Best 84% on Medium · an A is 90%", partial.status(l1, l1.items[2]))
        let doneAll = { (levels: [LearningPlan.Level]) in
            GoalProgress(plan: plan, records: Dictionary(uniqueKeysWithValues: levels.flatMap { l in l.items.map { (plan.key(l, $0), GoalRecord(done: "2026-11-04", best: 92, choruses: 3)) } }))
        }
        check("goals: every goal of levels 1–3 done clears three; level 4 has no goals, so nothing past it; level 1 and 3 alone clear one",
              doneAll([l1, l2, l3]).cleared == 3 && !doneAll([l1, l2, l3]).cleared(plan.levels[3])
              && doneAll([l1, l3]).cleared == 1 && doneAll([l2, l3]).cleared == 0)
        check("goals: -MapCleared overrides, capped at the plan", GoalProgress(plan: plan, records: [:], clearedOverride: 30).cleared == 26)
        let goalStore = ProgressStore(url: nil)
        goalStore.goalChorus(k(0), tempo: 64, target: 72)
        goalStore.goalChorus(k(0), tempo: 60, target: 72)
        check("goals: a 100% chorus under the target keeps the best, isn't done", goalStore.goal(k(0)).best == 64 && goalStore.goal(k(0)).done == nil)
        goalStore.goalChorus(k(0), tempo: 72, target: 72)
        goalStore.goalJam(k3(2), needed: 3); goalStore.goalJam(k3(2), needed: 3)
        check("goals: at the target it is done; two jam choruses aren't three",
              goalStore.goal(k(0)).done != nil && goalStore.goal(k3(2)).choruses == 2 && goalStore.goal(k3(2)).done == nil
              && { goalStore.goalJam(k3(2), needed: 3); return goalStore.goal(k3(2)).done != nil }())
        goalStore.goalRun(k(2), accuracy: 0.8949, floor: 0.9)
        check("goals: a song run under the A keeps its best (89%), isn't done", goalStore.goal(k(2)).best == 89 && goalStore.goal(k(2)).done == nil)
        goalStore.goalRun(k(2), accuracy: 0.93, floor: 0.9)
        goalStore.goalRun(k(2), accuracy: 0.71, floor: 0.9)
        check("goals: an A does it, a worse run after leaves it done at its best",
              goalStore.goal(k(2)).done != nil && goalStore.goal(k(2)).best == 93
              && GameEngine.Result.floor(of: "A") == 0.9 && GameEngine.Result.floor(of: "S") == 0.97 && GameEngine.Result.floor(of: "A+") == nil
              && GameEngine.Result.grade(accuracy: GameEngine.Result.floor(of: "A")!) == "A")
        // Records from before the re-cut: level 1's pentatonic goals land on level 2, its 12-bar
        // and jam on level 3, the C major scale stays; a record already at the new key merges.
        let beforeRecut = """
        {"goals": {"blues-year-1·1·scale-c": {"done": "2026-11-04", "best": 74, "choruses": 0},
                   "blues-year-1·1·scale-rh": {"done": "2026-11-04", "best": 75, "choruses": 0},
                   "blues-year-1·1·jam": {"best": 0, "choruses": 2},
                   "blues-year-1·3·jam": {"best": 0, "choruses": 1}}}
        """
        let moved = try! JSONDecoder.takt.decode(ProgressStore.Snapshot.self, from: Data(beforeRecut.utf8)).goals
        let movedProgress = GoalProgress(plan: plan, records: moved)
        check("goals: records from before levels 1–3 move to their new level; the C major scale stays",
              Set(moved.keys) == ["blues-year-1·1·scale-c", "blues-year-1·2·scale-rh", "blues-year-1·3·jam"]
              && moved["blues-year-1·2·scale-rh"]?.best == 75 && moved["blues-year-1·3·jam"]?.choruses == 2
              && movedProgress.done(l1, l1.items[0]) && movedProgress.done(l2, l2.items[0]) && !movedProgress.done(l2, l2.items[1]),
              "\(moved.keys.sorted())")
        // The new steps: A natural minor in eighths, C major's shape from A; three chords a bar.
        let s1mPlan = Lesson.bundled("lesson-S1m"), mPlan = Lesson.bundled("lesson-M")
        let minorRun = s1mPlan.steps.first { $0.id == "minor2-rh" }!
        let minorNotes = s1mPlan.expected(minorRun, ticksPerBeat: 12)
        let aUp = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24].map { 57 + $0 }
        check("A minor in eighths: 29 notes a run from A3, up two octaves and back on the white keys, C major's fingers, straight, drums alone, lesson 15",
              minorNotes.prefix(29).map(\.display) == aUp + aUp.dropLast().reversed()
              && minorNotes.prefix(29).compactMap(\.finger) == [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]
              && minorRun.straight && minorRun.tempo == 72 && minorRun.band == ["drums"] && s1mPlan.lessons.count == 15
              && s1mPlan.lessons.last?.steps == ["minor2-rh"]
              && s1mPlan.fingerLine(step: "minor2-rh") == "1-2-3, tuck, 1-2-3-4, tuck, 1-2-3, tuck, 1-2-3-4-5, and reverse",
              "\(minorNotes.prefix(15).map(\.display))")
        // Played where it is written (A3 to A5, what the white-keys remap sends from C3–C5) the run is clean:
        // the scorer's range covers the chart, so A5 is not "too high" (Bart's runs, 2026-11-05).
        let asWritten = minorNotes.map { PlayedNote(note: $0.display, tick: Double($0.tick), msPerTick: 60000 / 72 / 12) }
        let writtenRun = Scorer.judge(chorus: 0, expected: minorNotes, played: asWritten, loopTicks: (minorNotes.map(\.tick).max()! / 48 + 1) * 48,
                                      ticksPerBeat: 12, rules: ScoringRules())
        check("A minor in eighths played as written up to A5 is clean, no notes too high",
              writtenRun.clean && writtenRun.extras.isEmpty, "\(writtenRun.detail) · \(writtenRun.extras.count) extra")
        // The version's highway (IMPROV.md, 0.1 (101)): the idea's notes come down the game's lanes, chorus after chorus.
        let laneIdea = [ExpectedNote(tick: 0, bar: 0, pitchClass: 9, display: 57, finger: 1), ExpectedNote(tick: 12, bar: 0, pitchClass: 0, display: 60, finger: 2),
                        ExpectedNote(tick: 24, bar: 0, pitchClass: 2, display: 62, finger: 3)]
        let lanes = { (now: Double, presses: [(tick: Double, note: Int)], demo: Bool) -> [GameState.HighwayNote] in
            Improv.highwayNotes(expected: laneIdea, loopTicks: 48, ticksPerBeat: 12, now: now, lookahead: 60, window: 3, presses: presses, demo: demo)
        }
        let ahead = lanes(0, [], false), later = lanes(20, [(1, 57), (13, 72)], false)
        check("version highway: the idea's notes a lookahead ahead, chorus after chorus, each short of the next, pending; a press of the pitch inside the window hits (any octave); the window gone by misses; Show me hits as the line passes",
              ahead.map(\.tick) == [0, 12, 24, 48, 60] && ahead.allSatisfy { $0.status == .pending } && ahead[0].length == 12 * 0.85 && ahead[2].length == 24 * 0.85
              && later.map(\.tick) == [0, 12, 24, 48, 60, 72] && later[0].status == .hit(.good) && later[1].status == .hit(.good) && later[2].status == .pending
              && lanes(20, [], false)[1].status == .missed && lanes(20, [], true)[1].status == .hit(.good) && lanes(20, [], true)[2].status == .pending,
              "\(ahead.map(\.tick)) \(later.map { "\($0.tick):\($0.status)" })")
        let changes = mPlan.steps.first { $0.id == "changes" }!
        let changeNotes = mPlan.expected(changes, ticksPerBeat: 12)
        let form = mPlan.form(of: changes)
        let pairs = Set(zip(form, form.dropFirst()).map { "\($0)>\($1)" })
        check("three chords: Am Dm Em a bar each over the drums, every change of the four, the triad on the 1, 36 notes a chorus at 60",
              changeNotes.count == 36 && pairs.isSuperset(of: ["Am>Dm", "Dm>Am", "Am>Em", "Em>Dm"]) && !form.contains { !["Am", "Dm", "Em"].contains($0) }
              && zip(form, form.dropFirst()).allSatisfy { $0 != $1 } && changes.tempo == 60 && changes.band == ["drums"]
              && Set(changeNotes.filter { $0.tick == 0 }.map { $0.display % 12 }) == [9, 0, 4]
              && Set(changeNotes.filter { $0.tick == 48 }.map { $0.display % 12 }) == [2, 5, 9]
              && Set(changeNotes.filter { $0.tick == 3 * 48 }.map { $0.display % 12 }) == [4, 7, 11]
              && mPlan.lessons.last?.steps == ["changes"],
              "\(form) \(changeNotes.count)")

        // MARK: Improv (IMPROV.md)

        let improvModules = ["lesson-A1", "lesson-S1", "lesson-S1m", "lesson-M", "lesson-H"].map(Lesson.bundled)
        check("improv: every jam under a lesson is an improv now (no scored riff left), its riff kept as a starting idea",
              improvModules.allSatisfy { m in !m.steps.contains { $0.kind == .jam } }
              && improvModules.flatMap { m in m.steps.filter { $0.kind == .free } }.count == 57
              && Lesson.bundled("lesson-S1m").steps.first { $0.id == "jam-up" }?.pattern?.isEmpty == false)
        let upJam = Lesson.bundled("lesson-S1m")
        let ije = LessonEngine(lesson: upJam, ticksPerBeat: tpb, gated: false)
        ije.start(step: upJam.steps.firstIndex { $0.id == "jam-up" }!)
        ije.heard(tick: 30, tempo: 70, rolling: true, epoch: 0)
        check("improv: the starting idea lights no keys while you play, and tap mode plays nothing (Show me still has it)",
              ije.output.nowNotes.isEmpty && ije.output.fingers.isEmpty && ije.due(at: 30).isEmpty && !ije.expected.isEmpty)
        var rec = Improv.Recorder()
        rec.press(62, tick: 576 - 3, velocity: 0.8, epoch: 1)   // half a beat early for chorus 2
        rec.press(65, tick: 600, velocity: 0.6, epoch: 1)
        rec.release(62, tick: 590, epoch: 1)
        rec.press(69, tick: 1200, velocity: 0.9, epoch: 1)
        let take = rec.take(chorusTicks: 576, ticksPerBeat: 12, formBars: 12, tempo: 84, now: 1210)!
        check("improv: a take starts on the chorus its first note leads into, keeps every press with its length, and runs to the end of the bar being played",
              take.bars == 14 && take.notes.map(\.t) == [0, 24, 624] && take.notes.map(\.len) == [17, 610, 10] && take.notes[1].v == 0.6 && take.tempo == 84,
              "\(take.bars) bars \(take.notes)")
        rec.press(60, tick: 10, velocity: 0.5, epoch: 2)
        check("improv: a Stop (a new epoch) starts a new take", rec.count == 1)
        let count = Improv.Count.of(take, formBars: 12, allowed: [2, 5, 9])
        check("improv: the count: whole choruses, notes, the share on the notes", count.choruses == 1 && count.notes == 3 && abs(count.inScale - 1) < 1e-9
              && Improv.Count.of(take, formBars: 12, allowed: [2]).inScale < 0.34)
        let improvStep = upJam.steps.first { $0.id == "improv-white" }!
        let idea = Improv.Review.Idea(title: "Your bar 1 climb", why: "From bar 1.", bars: 2, notes: [
            .init(t: 0, n: 62, len: 12, f: 1), .init(t: 12, n: 65, len: 12, f: 3), .init(t: 24, n: 67, len: 6, f: 4), .init(t: 30, n: 69, len: 6, f: 5),
            .init(t: 48, n: 62, len: 24, f: 1)])
        let (withVersion, vi) = upJam.withVersion(Improv.versionStep(idea, of: improvStep, take: "abc"), after: improvStep)
        let version = withVersion.steps[vi], vNotes = withVersion.expected(version, ticksPerBeat: tpb)
        check("improv: your version is a jam over the improv's own backing, every note the idea's key, looping every 2 bars, under the improv's lesson",
              version.kind == .jam && version.id == "version-abc" && version.backing == "song-blue-lantern-white" && version.cycle == 2
              && version.band == improvStep.band && version.form == improvStep.form && vNotes.count == 30
              && vNotes.prefix(5).map(\.display) == [62, 65, 67, 69, 62] && vNotes.prefix(5).map(\.tick) == [0, 12, 24, 30, 48]
              && vNotes.prefix(5).compactMap(\.finger) == [1, 3, 4, 5, 1] && vNotes[5].tick == 96
              && withVersion.jam(ofStep: vi)?.after == 15 && withVersion.steps.count == upJam.steps.count + 1
              && withVersion.withVersion(Improv.versionStep(idea, of: improvStep, take: "def"), after: improvStep).0.steps.count == upJam.steps.count + 1,
              "\(vNotes.prefix(6).map { "\($0.display)@\($0.tick)" })")
        let ve = LessonEngine(lesson: withVersion, ticksPerBeat: tpb, gated: false)
        ve.start(step: vi)
        check("improv: your version is judged run by run (two bars), not by the chorus", ve.loopTicks == 96 && ve.expected.count == 5)
        let xpStore = ProgressStore(url: nil)
        let first = xpStore.award("improv·r1", kind: "improv", points: Improv.XP.improv)
        let again = xpStore.award("improv·r1", kind: "improv", points: Improv.XP.improv)
        xpStore.goalImprov(k(3))
        check("xp: an award pays once; a done goal is worth its 100 on top", first && !again && xpStore.xp == Improv.XP.improv + Improv.XP.goal)
        xpStore.practiced(.lesson, id: "S1m·3")
        xpStore.practiced(.lesson, id: "S1m·3")
        check("xp: a lesson finished pays once a day", xpStore.xp == Improv.XP.improv + Improv.XP.goal + Improv.XP.lesson)
        var xa = ProgressStore.Snapshot(), xb = ProgressStore.Snapshot()
        xa.xp = [.init(id: "improv·r1", day: "2026-11-04", kind: "improv", points: 30), .init(id: "stage·s1", day: "2026-11-04", kind: "stage", points: 10)]
        xb.xp = [.init(id: "improv·r1", day: "2026-11-04", kind: "improv", points: 30), .init(id: "version·r1", day: "2026-11-05", kind: "version", points: 50)]
        check("xp: two devices merge as a union, nothing paid twice", ProgressStore.xp(AccountStore.merge(xa, xb)) == 90 && ProgressStore.xp(AccountStore.merge(xb, xa)) == 90)
        let improvItem = l1.items[3]
        check("goals: an improv goal waits for a reviewed take, then says so",
              none.status(l1, improvItem) == "Not yet · 2 choruses, 16 notes, 90% on the notes" && none.action(l1, improvItem) == "Improvise"
              && GoalProgress(plan: plan, records: [k(3): GoalRecord(done: "2026-11-04", best: 0, choruses: 1)]).action(l1, improvItem) == "Improvise again",
              none.status(l1, improvItem))

        // MARK: Feel (the band straight under a run in eighths) and the C major scale in eighths

        let s1 = Lesson.bundled("lesson-S1"), s1m = Lesson.bundled("lesson-S1m")
        func stepOf(_ l: Lesson, _ id: String) -> Lesson.Step { l.steps.first { $0.id == id }! }
        check("feel: a run in straight eighths straightens the band; one note a beat and a shuffle riff keep it; `feel` overrides",
              stepOf(s1m, "penta2-rh").straight && stepOf(s1m, "penta2-lh").straight && stepOf(s1, "major2-rh").straight
              && !stepOf(s1, "updown").straight && !stepOf(s1, "two").straight && !stepOf(s1, "jam-blues").straight
              && !s1m.steps.contains { $0.kind.isJam && $0.backing == nil && $0.straight })
        let shuffle = BandData.bundled("band-blues-C"), straightBand = shuffle.straightened()
        let lateHits = shuffle.channels.drums.filter { $0.t % 12 == 8 }.count
        check("feel: straightened, every late eighth (tick 8) sits on tick 6 and nothing else moves",
              lateHits > 0 && straightBand.channels.drums.count == shuffle.channels.drums.count
              && zip(shuffle.channels.drums, straightBand.channels.drums).allSatisfy { $1.s == $0.s && $1.v == $0.v && $1.t == ($0.t % 12 == 8 ? $0.t - 2 : $0.t) }
              && straightBand.channels.drums.filter { $0.t % 12 == 6 }.count == lateHits + shuffle.channels.drums.filter { $0.t % 12 == 6 }.count
              && zip(shuffle.channels.bass, straightBand.channels.bass).allSatisfy { $1.n == $0.n && $1.t == ($0.t % 12 == 8 ? $0.t - 2 : $0.t) }
              && BandData.straightTick(20, ticksPerBeat: 12) == 18 && BandData.straightTick(12, ticksPerBeat: 12) == 12
              && BandData.straightTick(4, ticksPerBeat: 12) == 4 && straightBand.name.hasSuffix("(straight)") && straightBand.ticksPerBeat == 12)
        let major = stepOf(s1, "major2-rh")
        let majorNotes = s1.expected(major, ticksPerBeat: 12)
        let upFingers = [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5], downFingers = [4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]
        let upKeys = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24].map { 48 + $0 }
        check("C major in eighths: 29 notes a run on every eighth from the 1, C3 up two octaves and back, 1 2 3 1 2 3 4 1 2 3 1 2 3 4 5 and 4 3 2 1 3 2 1 4 3 2 1 3 2 1, three runs a chorus at 72, straight, drums alone",
              majorNotes.count == 87 && majorNotes.prefix(29).map(\.tick) == (0..<29).map { $0 * 6 }
              && majorNotes.prefix(29).map(\.display) == upKeys + upKeys.dropLast().reversed()
              && majorNotes.prefix(29).compactMap(\.finger) == upFingers + downFingers
              && majorNotes[29].tick == 4 * 48 && major.tempo == 72 && major.cycle == 4 && major.gate == 2 && major.hand == "right"
              && major.band == ["drums"] && s1.lessons.last?.steps == ["major2-rh"] && s1.lessons.count == 14)
        let goalC = l1.items[0]
        check("plan: the C major scale is the first goal of level 1, on lesson-S1, at 72 from 60",
              goalC.kind == .step && goalC.module == "S1" && goalC.step == "major2-rh" && goalC.tempo == 72 && goalC.start == 60
              && none.action(l1, goalC) == "Play at 60")
        check("plan: the scale goals say their fingering, tucks, crossings and the way back; the chord and jam goals none",
              s1.fingerLine(step: "major2-rh") == "1-2-3, tuck, 1-2-3-4, tuck, 1-2-3, tuck, 1-2-3-4-5, and reverse"
              && s1m.fingerLine(step: "penta2-rh") == "1-2-3, tuck, 1-2-3, tuck, 1-2-3-4-5, and reverse"
              && s1m.fingerLine(step: "penta2-lh") == "5-4-3-2-1, over, 3-2-1, over, 3-2-1, and reverse"
              && Lesson.bundled("lesson-M").fingerLine(step: "key-1") == nil && Lesson.bundled("lesson-M").fingerLine(step: "jam-five") == nil,
              "\(String(describing: s1.fingerLine(step: "major2-rh"))) | \(String(describing: s1m.fingerLine(step: "penta2-rh"))) | \(String(describing: s1m.fingerLine(step: "penta2-lh"))) | \(String(describing: Lesson.bundled("lesson-M").fingerLine(step: "key-1")))")
        let fl = { (keys: [Int], fingers: [Int], right: Bool) in
            LessonState.Run.fingerLine(zip(keys, fingers).map { LessonState.Run.Note(key: $0, finger: $1) }, right: right) }
        check("fingering line: one way up, one way down with the middle over, a way back that differs, and four notes say nothing",
              fl([60, 62, 64, 65, 67, 69, 71, 72], [1, 2, 3, 1, 2, 3, 4, 5], true) == "1-2-3, tuck, 1-2-3-4-5"
              && fl([72, 71, 69, 67, 65, 64, 62, 60], [5, 4, 3, 2, 1, 3, 2, 1], true) == "5-4-3-2-1, over, 3-2-1"
              && fl([60, 62, 64, 65, 67, 65, 64, 62, 60], [1, 2, 3, 4, 5, 4, 3, 2, 1], true) == "1-2-3-4-5, and reverse"
              && fl([60, 62, 64, 65, 67, 65, 64], [1, 2, 3, 4, 5, 3, 2], true) == "1-2-3-4-5, then 3-2"
              && fl([60, 62, 64, 65], [1, 2, 3, 4], true) == nil,
              "\(String(describing: fl([60, 62, 64, 65, 67, 65, 64], [1, 2, 3, 4, 5, 3, 2], true)))")

        // MARK: A run is the judged unit on a scale step

        let runEngine = LessonEngine(lesson: s1, ticksPerBeat: 12, gated: false)
        runEngine.start(step: 13)
        check("runs: the C major step judges a 4-bar run of 29 notes; a chord step, a jam with a cycle and the A1 lessons keep the 12-bar chorus",
              runEngine.loopTicks == 192 && runEngine.expected.count == 29 && runEngine.chorusTicks == 576
              && { let j = LessonEngine(lesson: s1, ticksPerBeat: 12, gated: false); j.start(step: s1.steps.firstIndex { $0.id == "jam-up" }!); return j.loopTicks == 576 }()
              && { let a = LessonEngine(lesson: Lesson.bundled("lesson-A1"), ticksPerBeat: 12, gated: false); return a.loopTicks == 576 && a.chorusTicks == 576 }()
              && { let m = LessonEngine(lesson: Lesson.bundled("lesson-M"), ticksPerBeat: 12, gated: false); return m.loopTicks == 576 }())
        var runVerdicts: [LessonEngine.Verdict] = []
        runEngine.onVerdict = { runVerdicts.append($0) }
        let runMs = 60000.0 / (72 * 12)
        var runTick = 0.0
        for unit in 0..<3 {
            for (i, e) in runEngine.expected.enumerated() {
                // The second run skips five notes; the others are on the tick.
                runTick = Double(unit * 192 + e.tick)
                runEngine.heard(tick: runTick, tempo: 72, rolling: true, epoch: 0)
                if unit == 1 && (5...9).contains(i) { continue }
                runEngine.played(note: e.display, tick: runTick, msPerTick: runMs, epoch: 0)
            }
        }
        runEngine.heard(tick: 3 * 192 + 1, tempo: 72, rolling: true, epoch: 0)
        check("runs: three runs give three verdicts; a perfect run is clean and 100%, the one with five misses isn't, two clean runs at 72 pass the gate",
              runVerdicts.count == 3 && runVerdicts.map { $0.result?.hits } == [29, 24, 29] && runVerdicts.map { $0.result?.clean } == [true, false, true]
              && runVerdicts.map(\.counted) == [true, false, true] && runVerdicts.map(\.clean) == [1, 1, 2] && runVerdicts.map(\.chorus) == [0, 1, 2]
              && runVerdicts[0].result!.extras.isEmpty && runVerdicts[1].result!.notes.filter { $0.mark == .missed }.count == 5
              && runVerdicts[1].line.hasPrefix("Missed") && runEngine.output.passed && runVerdicts[2].line == "Clean. The scale in eighths.",
              "\(runVerdicts.map { "\($0.chorus):\($0.result?.hits ?? -1):\($0.result?.clean ?? false):\($0.counted):\($0.line)" })")
        let demoC = Demo.plan(expected: runEngine.expected, loopTicks: runEngine.loopTicks, ticksPerBar: 48, cycle: 4, chorusTicks: runEngine.chorusTicks)
        check("runs: Show me tiles the run over its two passes: 58 presses over 8 bars, the second pass from tick 192",
              demoC.presses.count == 58 && demoC.endTicks == 384 && demoC.presses[29].tick == 192 && demoC.presses[29].note == 48
              && demoC.presses[28].lengthTicks > 0 && demoC.presses.last!.tick == 192 + 168)
        let extraVel = Scorer.judge(chorus: 0, expected: runEngine.expected, played: [PlayedNote(note: 48, tick: 0, msPerTick: runMs, velocity: 0.9), PlayedNote(note: 50, tick: 0.4, msPerTick: runMs, velocity: 0.05)],
                                    loopTicks: 192, ticksPerBeat: 12, rules: .init())
        check("runs: an extra keeps its velocity (a whisper beside the note that played is logged as one)",
              extraVel.extras.count == 1 && extraVel.extras[0].velocity == 0.05 && extraVel.extras[0].kind == .wrong && extraVel.hits == 1)
        var goalA = ProgressStore.Snapshot(), goalB = ProgressStore.Snapshot()
        goalA.goals[k(0)] = GoalRecord(done: "2026-11-05", best: 68, choruses: 0)
        goalB.goals[k(0)] = GoalRecord(done: "2026-11-03", best: 72, choruses: 0)
        goalB.goals[k3(2)] = GoalRecord(done: nil, best: 0, choruses: 2)
        let goalM = AccountStore.merge(goalA, goalB)
        var stale = ProgressStore.Snapshot(), fixed = ProgressStore.Snapshot()
        var r14 = ProgressStore.LessonRecord(); r14.lessonsDone = 14; r14.reachedStep = 14; r14.bestTempo = 70
        var r4 = ProgressStore.LessonRecord(); r4.lessonsDone = 4; r4.reachedStep = 5; r4.setAt = Date(timeIntervalSince1970: 1_793_840_000)
        stale.lessons["S1"] = r14; fixed.lessons["S1"] = r4
        var r5 = r4; r5.lessonsDone = 5; r5.reachedStep = 6
        var advanced = ProgressStore.Snapshot(); advanced.lessons["S1"] = r5
        check("progress: a record set by hand beats an older copy either way round (keeping the best tempo); the same stamp merges by max",
              AccountStore.merge(stale, fixed).lessons["S1"].map { ($0.lessonsDone, $0.reachedStep, $0.bestTempo, $0.setAt != nil) } ?? (0, 0, 0, false) == (4, 5, 70, true)
              && AccountStore.merge(fixed, stale).lessons["S1"]?.lessonsDone == 4
              && AccountStore.merge(fixed, advanced).lessons["S1"]?.lessonsDone == 5 && AccountStore.merge(advanced, fixed).lessons["S1"]?.reachedStep == 6)
        check("progress: a step reached moves the module only inside the lessons opened in order (a map goal on lesson 14 after 4 doesn't)",
              s1.inOrder(step: 5, lessonsDone: 4) && s1.inOrder(step: 3, lessonsDone: 4) && !s1.inOrder(step: 14, lessonsDone: 4)
              && !s1.inOrder(step: 6, lessonsDone: 4) && s1.inOrder(step: 1, lessonsDone: 0))
        check("goals: merged, the earliest day and the max of the numbers, either way round",
              goalM.goals[k(0)] == GoalRecord(done: "2026-11-03", best: 72, choruses: 0) && goalM.goals[k3(2)]?.choruses == 2
              && AccountStore.merge(goalB, goalA).goals == goalM.goals)
        check("goals: an old snapshot has none", old.goals.isEmpty)
        check("map: stop states", [0, 1, 2, 3, 4].map { MapWorld.state($0, cleared: 2) } == [.done, .done, .here, .next, .ahead])

        // The free jam: a chorus in the scale with enough notes counts; one note outside doesn't,
        // and the coach names it; too few notes don't either.
        do {
            let m = Lesson.bundled("lesson-M")
            let fi = m.steps.firstIndex { $0.id == "jam-five" }!
            check("free jam: the step's scale is A C D E G, it is a jam under lesson 1, no pattern",
                  m.scale(of: m.steps[fi]) == [9, 0, 2, 4, 7] && m.jam(ofStep: fi)?.after == 1 && m.steps[fi].pattern == nil
                  && m.lessonStepCount < fi && m.lessonIndex(ofStep: fi) == 0)
            let fe = LessonEngine(lesson: m, ticksPerBeat: tpb, gated: false)
            fe.start(step: fi)
            var fv: [LessonEngine.Verdict] = []
            fe.onVerdict = { fv.append($0) }
            let mloop = m.form.count * 4 * tpb
            func chorus(_ c: Int, notes: [Int]) -> [PlayedNote] {
                notes.enumerated().map { PlayedNote(note: $0.element, tick: Double(c * mloop + $0.offset * tpb), msPerTick: msPerTick(70)) }
            }
            var fp = chorus(0, notes: [57, 60, 62, 64, 67, 69, 67, 64, 62, 60]) + chorus(1, notes: [57, 60, 62, 65, 67, 69, 67, 64, 62, 60])
                + chorus(2, notes: [57, 60, 62]) + chorus(3, notes: [69, 72, 74, 76, 79, 81, 79, 76])
            var ft = 0.0
            while ft <= Double(4 * mloop) + 1 {
                fe.heard(tick: ft, tempo: 70, rolling: true, epoch: 0)
                while let p = fp.first, p.tick <= ft {
                    fe.played(note: p.note, tick: p.tick, msPerTick: msPerTick(70), epoch: 0)
                    fp.removeFirst()
                }
                ft += 0.25
            }
            check("free jam: in the scale counts, an F doesn't and is named, three notes aren't enough, any octave counts",
                  fv.count == 4 && fv[0].counted && fv[0].free?.notes == 10 && fv[0].jam == "jam-five" && fv[0].stepId == "jam-five"
                  && !fv[1].counted && fv[1].free?.outside == [65] && fv[1].line == "F isn't in the scale. Keep going."
                  && !fv[2].counted && fv[2].line.hasPrefix("Play more") && fv[3].counted && fe.output.clean == 2 && fe.output.jam && !fe.output.passed,
                  fv.map { "\($0.counted) \($0.line)" }.joined(separator: " | "))
        }

        // The two-octave pentatonic: 21 eighths up and back in each hand.
        do {
            let minor = Lesson.bundled("lesson-S1m")
            let rh = minor.steps.first { $0.id == "penta2-rh" }!, lh = minor.steps.first { $0.id == "penta2-lh" }!
            let rn = minor.expected(rh, ticksPerBeat: tpb), ln = minor.expected(lh, ticksPerBeat: tpb)
            check("scales: pentatonic two octaves, right hand: A3 to A5 and back, 21 eighths, 1 2 3 1 2 3 1 2 3 4 5, three runs a chorus",
                  rn.count == 63 && rn.prefix(11).map(\.display) == [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81] && rn[20].display == 57
                  && rn.prefix(21).map(\.tick) == (0..<21).map { $0 * tpb / 2 } && rn.prefix(11).map(\.finger) == [1, 2, 3, 1, 2, 3, 1, 2, 3, 4, 5]
                  && rn[21].tick == 4 * 4 * tpb && rh.tempo == 72 && rh.gate == 2 && rh.hand == "right",
                  "\(rn.prefix(12).map { "\($0.display)@\($0.tick)" })")
            check("scales: left hand from A2, 5 4 3 2 1 3 2 1 3 2 1",
                  ln.count == 63 && ln.prefix(11).map(\.display) == [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69]
                  && ln.prefix(11).map(\.finger) == [5, 4, 3, 2, 1, 3, 2, 1, 3, 2, 1] && lh.hand == "left")
        }

        for id in MapWorld.all {
            let world = MapWorld.bundled(id)
            let stops = world.stops
            let photos = stops.compactMap { world.imageName($0.venue) }
            check("map \(id): every photo is in the asset catalog", photos.allSatisfy { UIImage(named: $0) != nil },
                  "\(photos.filter { UIImage(named: $0) == nil })")
            check("map \(id): every photo has a credit and a license, and a source is a link",
                  stops.compactMap(\.venue.photo).allSatisfy { !$0.credit.isEmpty && !$0.license.isEmpty && ($0.source.map { URL(string: $0) != nil } ?? true) },
                  "no source yet: " + stops.filter { $0.venue.photo != nil && $0.venue.photo?.source == nil }.map(\.venue.id).joined(separator: ", "))
            check("map \(id): episodes open where their first venue sits", stops.filter(\.opensEpisode).count == world.episodes.count)
            check("map \(id): one stop per plan level", stops.count == plan.levels.count && world.total == plan.levels.count)
        }
        let blues = MapWorld.bundled("blues")
        check("map blues: 26 stops in three episodes, 20 venues with a photo, the last six placeholders",
              blues.stops.count == 26 && blues.episodes.count == 3 && blues.stops.prefix(20).allSatisfy { $0.venue.photo != nil && !$0.venue.isPlaceholder }
              && blues.stops.suffix(6).allSatisfy(\.venue.isPlaceholder))

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
        check("the folded thumb sits under the palm", out.minX < 12 && folded.minX > 60 && HandStyle.allCases.count == 7
              && HandStyle(rawValue: "skizze") == .skizze && HandStyle(rawValue: "kontur") == .kontur)

        // The Kontur hand: every part inside the box, the thumb out beside the palm at rest and,
        // folded, under it with only its tip in the gap between fingers 3 and 4.
        do {
            let rest = KonturDrawing(motion: KonturMotion(), right: true)
            let under = KonturDrawing(motion: KonturMotion(fold: 1, press: [0, 1, 0, 0]), right: true)
            let all = [rest.thumb, rest.palm] + (2...5).map { rest.finger($0, closed: true) }
            let bounds = all.map(\.boundingRect).reduce(CGRect.null) { $0.union($1) }
            check("the Kontur hand stays in its box", box.insetBy(dx: -1, dy: -1).contains(bounds),
                  "\(Int(bounds.minX))…\(Int(bounds.maxX)) × \(Int(bounds.minY))…\(Int(bounds.maxY))")
            let tip = under.thumbTip
            let f3 = under.finger(3, closed: true), f4 = under.finger(4, closed: true)
            check("the Kontur thumb goes under the palm, its tip between fingers 3 and 4",
                  rest.thumb.boundingRect.minX < rest.palm.boundingRect.minX - 10
                  && under.thumb.boundingRect.minX > under.palm.boundingRect.minX
                  && f3.boundingRect.midX < tip.x && tip.x < f4.boundingRect.midX
                  && !f3.contains(tip) && !f4.contains(tip) && !under.palm.contains(tip)
                  && under.palm.boundingRect.minY > tip.y,
                  "tip \(Int(tip.x)),\(Int(tip.y)); 3 at \(Int(f3.boundingRect.midX)), 4 at \(Int(f4.boundingRect.midX))")
            let left = KonturDrawing(motion: KonturMotion(), right: false)
            check("the left Kontur hand is the mirror", abs(left.palm.boundingRect.midX - (240 - rest.palm.boundingRect.midX)) < 0.01)
        }

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
                                                                good: 0, early: 0, late: 0, missed: 0, extras: 0, wrong: 0, maxCombo: 1, accuracy: 1, timing: 1,
                                                                leanMs: 0, level: level, grade: "S", map: [], strays: []),
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
                    for n in ["beginner", "easy", "easy+", "medium", "hard"] { l[n] = max(1, (l[n] as! Int) - 1) }
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
                        for n in ["beginner", "easy", "easy+", "medium", "hard"] where o[n] != nil { o[n] = max(1, (o[n] as! Int) - 1) }
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
                    // A note's `from` is a tier number: it moves down a tier with the ladder.
                    let all = s.notes(k)
                    let shifted = all.map { Song.Note(t: $0.t, n: $0.n, len: $0.len, lv: $0.lv, f: $0.f, r: $0.r, from: $0.from.map { max(1, $0 - 1) }) }
                    let plain = without.masks(shifted, song: s.name, part: k, tempo: s.meta.tempo, ticksPerBeat: s.band.ticksPerBeat, ticksPerBar: s.ticksPerBar)
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
            // Mods (Agent mode): a bundle in the server's shape loads as a Song with its own
            // charting, which only that song's levels follow; the figures the app sends the
            // server (`ladder`) are the ladder line's.
            if let base = songs.first(where: { $0.name == "song-slow-burn-short" }),
               let url = Bundle.main.url(forResource: base.name, withExtension: "json"),
               let file = try? JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] {
                var top: [String: Any] = ["id": "11111111-2222-3333-4444-555555555555", "name": "mod-test0001", "base": base.name, "base_title": base.meta.title,
                                          "title": "Slow Burn Short mod 01", "version": 2, "created_at": "2026-11-01T00:00:00Z", "updated_at": "2026-11-01T00:00:00Z",
                                          "charting": ["melody": ["medium": 3, "phrase": 12, "tiers": ["2": ["space": 0]]]],
                                          "versions": [["version": 1, "title": "Slow Burn Short mod 01", "line": "Half.", "ask": "half the notes", "at": "2026-11-01T00:00:00Z"],
                                                       ["version": 0, "title": "Slow Burn Short mod 01", "line": "", "ask": "The original", "at": "2026-11-01T00:00:00Z"],
                                                       ["version": 2, "title": "Slow Burn Short mod 01", "line": "Half, solo.", "ask": "a solo", "at": "2026-11-01T00:00:00Z"]],
                                          "messages": [["role": "user", "text": "half the notes", "at": "2026-11-01T00:00:00Z"], ["role": "agent", "text": "Done.", "at": "2026-11-01T00:00:00Z", "steps": ["Reading the song"]]]]
                var f = file
                var meta = f["song"] as! [String: Any]
                meta["title"] = "Slow Burn Short mod 01"
                f["song"] = meta
                f["name"] = "mod-test0001"
                top["song"] = f
                do {
                    let bundle = try ModStore.Bundle(data: JSONSerialization.data(withJSONObject: top))
                    let mod = try bundle.song()
                    check("mods: a bundle loads as a song with its version and base", mod.name == "mod-test0001" && mod.version == 2 && mod.mod?.base == base.name && mod.meta.title == "Slow Burn Short mod 01" && bundle.messages.count == 2 && bundle.messages[1].steps?.count == 1)
                    check("mods: the history comes in order, v0 the original", bundle.versions.map(\.version) == [0, 1, 2] && bundle.versions[0].ask == "The original" && bundle.versions[2].line == "Half, solo.")
                    let baseMedium = base.charting.tier(.medium, song: base.name, part: .melody)!, modMedium = mod.charting.tier(.medium, song: mod.name, part: .melody)!
                    check("mods: the mod's own charting moves its Medium (\(baseMedium) → \(modMedium)) and nothing of the base's", baseMedium == 5 && modMedium == 3 && mod.charting.tier(.medium, song: base.name, part: .melody) == baseMedium)
                    let ladder = mod.ladder(.melody), rates = mod.masks(.melody).map { m in Double(Set(mod.notes(.melody).indices.filter { m[$0] }.map { mod.notes(.melody)[$0].t }).count) / mod.seconds }
                    check("mods: the ladder figures are onsets a second per tier, the base's for an unchanged part", ladder == rates && ladder == base.ladder(.melody), ladder.map { String(format: "%.2f", $0) }.joined(separator: " · "))
                    let engine = GameEngine(song: mod, part: .melody, difficulty: .medium)
                    check("mods: a run on the mod plays its own Medium", engine.level == 3 && engine.masks[2].filter { $0 }.count == mod.chart(.melody, tier: 3).count)
                    // A mod's own pin (2026-11-07): it follows its song until unpinned on its card.
                    let pinApp = AppModel(player: nil, progress: ProgressStore(url: nil), account: AccountStore(progress: ProgressStore(url: nil)))
                    let follows = pinApp.isPinned(mod) && pinApp.isPinned(base)
                    pinApp.setPinned(mod, false)
                    let alone = !pinApp.isPinned(mod) && pinApp.isPinned(base) && pinApp.pinnedSongs == StageScreen.defaultPins
                    pinApp.setPinned(base, false)
                    pinApp.setPinned(mod, true)
                    let own = pinApp.isPinned(mod) && !pinApp.isPinned(base)
                    let round = try JSONDecoder.takt.decode(ProgressStore.Snapshot.self, from: JSONEncoder.takt.encode(pinApp.progress.snapshot))
                    check("pins: a mod follows its song until its own pin is set, then keeps it apart from the song's",
                          follows && alone && own && round.pins?.mods == ["mod-test0001": true], "\(follows) \(alone) \(own)")
                } catch {
                    check("mods: a bundle loads", false, "\(error)")
                }
                var broken = top
                var bf = f
                var bmeta = bf["song"] as! [String: Any]
                bmeta["parts"] = ["melody": (bmeta["parts"] as! [String: Any])["melody"]!]
                bf["song"] = bmeta
                broken["song"] = bf
                let fails = (try? ModStore.Bundle(data: JSONSerialization.data(withJSONObject: broken)).song()) == nil
                check("mods: a bundle without a chords part is refused, not trapped", fails)
            }
            // Pinned tracks (2026-11-07): the default set until the player changes it; pin and
            // unpin keep the rest; two devices merge to the set changed last; old snapshots
            // have none.
            do {
                let store = ProgressStore(url: nil)
                let app = AppModel(player: nil, progress: store, account: AccountStore(progress: ProgressStore(url: nil)))
                let first = songs.first { $0.name == StageScreen.defaultPins[0] }!, other = songs.first { !StageScreen.defaultPins.contains($0.name) }!
                let byDefault = app.pinnedSongs == StageScreen.defaultPins && app.isPinned(first) && !app.isPinned(other)
                app.setPinned(first, false)
                app.setPinned(other, true)
                let moved = !app.isPinned(first) && app.isPinned(other) && app.pinnedSongs.count == StageScreen.defaultPins.count
                app.setPinned(other, true)
                check("pins: the default set, then unpin one and pin another; pinning twice keeps one", byDefault && moved && app.pinnedSongs.filter { $0 == other.name }.count == 1, app.pinnedSongs.joined(separator: " "))
                var a = ProgressStore.Snapshot(), b = ProgressStore.Snapshot()
                a.pins = .init(songs: ["song-dockery"], at: Date(timeIntervalSince1970: 100))
                b.pins = .init(songs: ["song-pearl-street", "song-boogie-shoes"], at: Date(timeIntervalSince1970: 200))
                let none = ProgressStore.Snapshot()
                check("pins: the set changed last wins a merge either way; a device without one keeps the other's",
                      AccountStore.merge(a, b).pins == b.pins && AccountStore.merge(b, a).pins == b.pins && AccountStore.merge(none, a).pins == a.pins && AccountStore.merge(a, none).pins == a.pins)
                let old = try JSONDecoder.takt.decode(ProgressStore.Snapshot.self, from: Data(#"{"lessons":{},"skills":{}}"#.utf8))
                let round = try JSONDecoder.takt.decode(ProgressStore.Snapshot.self, from: JSONEncoder.takt.encode(a))
                check("pins: a snapshot from before has none (the default), and a set survives the file", old.pins == nil && round.pins == a.pins)
            } catch {
                check("pins: snapshots decode", false, "\(error)")
            }
            // The teacher's whole track (0.1 (114), IMPROV.md "The whole track"): a bundle of kind
            // "solo" is the Solo level of its base song, never a card; Solo plays every note.
            if let base = songs.first(where: { $0.name == "song-blue-lantern-white" }),
               let url = Bundle.main.url(forResource: base.name, withExtension: "json"),
               let file = try? JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] {
                // A short solo over the whole song: the idea (D F G, D) every two bars, a chord
                // tone on every change.
                var notes: [[String: Any]] = []
                var horns: [[String: Any]] = []
                for bar in stride(from: 0, to: base.bars, by: 2) {
                    let root = base.chord(atBar: bar).hasPrefix("G") ? 67 : base.chord(atBar: bar).hasPrefix("A") ? 69 : base.chord(atBar: bar).hasPrefix("Bb") ? 65 : 62
                    for (i, (tick, n, len, lv)) in [(0, root, 12, 1), (12, root + 3, 12, 2), (24, root + 5, 24, 2), (48, 62, 36, 1)].enumerated() where i < 4 {
                        notes.append(["t": bar * 48 + tick, "n": n, "len": len, "lv": lv])
                        horns.append(["t": bar * 48 + tick, "n": n, "len": len, "v": 0.7])
                    }
                }
                var f = file
                var meta = f["song"] as! [String: Any]
                var parts = meta["parts"] as! [String: Any]
                var melody = parts["melody"] as! [String: Any]
                melody["notes"] = notes
                parts["melody"] = melody
                meta["parts"] = parts
                meta["line"] = "Your climb, through all four choruses."
                f["song"] = meta
                f["name"] = "solo-check001"
                var channels = f["channels"] as! [String: Any]
                channels["horns"] = horns
                f["channels"] = channels
                let now = "2026-11-07T00:00:00Z"
                let top: [String: Any] = ["id": "22222222-3333-4444-5555-666666666666", "kind": "solo", "name": "solo-check001", "base": base.name, "base_title": base.meta.title,
                                          "title": base.meta.title, "version": 1, "created_at": now, "updated_at": now, "song": f,
                                          "messages": [["role": "user", "text": "from their take", "at": now], ["role": "agent", "text": "Lantern climb: the line.", "at": now]],
                                          "versions": [["version": 0, "title": base.meta.title, "line": "", "ask": "The original", "at": now], ["version": 1, "title": base.meta.title, "line": "Your climb, through all four choruses.", "ask": "Lantern climb", "at": now]]]
                do {
                    let data = try JSONSerialization.data(withJSONObject: top)
                    let bundle = try ModStore.Bundle(data: data)
                    let solo = try bundle.song()
                    check("solo: a bundle of kind solo loads as a song that knows it is one", bundle.isSolo && solo.mod?.isSolo == true && solo.mod?.base == base.name && solo.meta.title == base.meta.title && solo.notes(.melody).count == notes.count)
                    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("takt-solo-check-\(UUID().uuidString)", isDirectory: true)
                    let store = ModStore(dir: dir)
                    try store.receive(data)
                    check("solo: the store keeps it apart from the mods (no card), as the song's solo", store.songs.isEmpty && store.solos.count == 1 && store.mods(of: base.name).isEmpty && store.solo(of: base.name)?.name == "solo-check001")
                    let again = ModStore(dir: dir)
                    check("solo: it comes back from disk the same way", again.solos.count == 1 && again.solo(of: base.name)?.version == 1)
                    try? FileManager.default.removeItem(at: dir)
                    let c = Charting.bundled
                    check("solo: the Solo level is the top of the ladder, named apart from the rungs", c.tier(.solo, song: solo.name, part: .melody) == c.melody.tiers.count && GameEngine.Difficulty.solo.title == "Solo" && GameEngine.Difficulty.ladder.count == 6 && !GameEngine.Difficulty.ladder.contains(.solo) && c.line(.solo, song: solo.name, part: .melody).hasPrefix("The teacher's whole track"))
                    let engine = GameEngine(song: solo, part: .melody, difficulty: .solo)
                    check("solo: a run on Solo plays every note of the track", engine.level == c.melody.tiers.count && engine.masks[engine.level - 1].allSatisfy { $0 } && engine.notes.count == notes.count)
                    let app = AppModel(player: nil, progress: ProgressStore(url: nil), account: AccountStore(progress: ProgressStore(url: nil)), mods: store)
                    let before = app.stageLevels(base)
                    app.pick(song: base, part: .melody)
                    app.pick(song: base, difficulty: .solo)
                    let picked = app.stageDifficulty(base)
                    app.pick(song: base, part: .chords)
                    let onChords = app.stageDifficulty(base)
                    let other = songs.first { $0.name != base.name }.map { app.stageLevels($0).contains(.solo) } ?? false
                    check("solo: the song's card offers Solo on the melody only, and only this song's; on the chords the pick falls back to Adaptive",
                          before.contains(.solo) == false && app.stageLevels({ app.pick(song: base, part: .melody); return base }()).last == .solo && picked == .solo && onChords == .adaptive && !other && app.solo(of: solo) == nil && app.songs.allSatisfy { $0.name != solo.name })
                } catch {
                    check("solo: a solo bundle loads", false, "\(error)")
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
                // The right key past the Good window but inside half a beat is Late (before the
                // note, Early): played, a hit for the accuracy, a third of the points, the combo
                // kept, the S withheld; past half a beat the note went by and the press is an
                // extra, not a wrong key. Bart's 51% on a run he played well (0.1 (53): the right
                // key late was a wrong key) and his 55% on Blue Lantern II (0.1 (108): the right
                // key late was a miss).
                let half = 0.5 * Double(tpb)
                let behind = GameEngine(song: song, part: .melody, difficulty: .easy)
                let firstIdx = song.notes(.melody).indices.first { behind.active($0) }!
                let firstNote = song.notes(.melody)[firstIdx]
                let lateTick = Double(firstNote.t) + half - 0.5
                behind.heard(tick: lateTick, msPerTick: ms)
                behind.played(note: firstNote.n, tick: lateTick, msPerTick: ms)
                let latePoints = Int((30 * charting.ladder(.melody).tier(easyTier).bonus).rounded())
                check("stage: the right key \(Int(((half - 0.5) * ms).rounded())) ms behind (inside half a beat) is Late: played, a third of the points, the combo kept, an A not an S",
                      behind.late == 1 && behind.hits == 1 && behind.missed == 0 && behind.extras == 0 && behind.accuracy == 1 && behind.timing == 0
                      && behind.combo == 1 && behind.score == latePoints && behind.result().grade == "A" && behind.result().map.first?.judgment == .late,
                      "\(behind.late) late, \(behind.missed) missed, \(behind.extras) extras, \(behind.score) points, \(behind.result().grade)")
                let ahead = GameEngine(song: song, part: .melody, difficulty: .easy)
                let secondIdx = song.notes(.melody).indices.first { ahead.active($0) && song.notes(.melody)[$0].n % 12 != firstNote.n % 12 }!
                let secondNote = song.notes(.melody)[secondIdx]
                let earlyTick = Double(secondNote.t) - (half - 0.5)
                ahead.heard(tick: earlyTick, msPerTick: ms)
                ahead.played(note: secondNote.n, tick: earlyTick, msPerTick: ms)
                check("stage: the right key the same ahead is Early, and the lean reads early",
                      ahead.early == 1 && ahead.hits == 1 && ahead.extras == 0 && ahead.leanMs < -GameEngine.goodMs && ahead.status[secondIdx] == .hit(.early),
                      "\(ahead.early) early, lean \(ahead.leanMs)")
                let gone = GameEngine(song: song, part: .melody, difficulty: .easy)
                let goneTick = Double(firstNote.t) + half + 0.5
                gone.heard(tick: goneTick, msPerTick: ms)
                gone.played(note: firstNote.n, tick: goneTick, msPerTick: ms)
                check("stage: the right key past half a beat is a miss and an extra, not a wrong key",
                      gone.missed == 1 && gone.extras == 1 && gone.wrong == 0 && gone.accuracy == 0, "\(gone.missed) missed, \(gone.extras) extras, \(gone.wrong) wrong")
                let loose = run(.easy) { _, _ in (half - 0.5) * ms }
                check("stage: every note played but late is an A, not an S: an S wants the time too; the verdict names the lean",
                      loose.hits == easyNotes && loose.missed == 0 && loose.result().accuracy == 1 && loose.result().timing == 0
                      && loose.result().grade == "A" && loose.result().verdict.line.contains("late") && loose.result().verdict.line.contains("Calibration"),
                      "\(loose.late) late of \(easyNotes), \(loose.result().grade): \(loose.result().verdict.line)")
                if let bl2 = songs.first(where: { $0.name == "song-blue-lantern-white" }) {
                    // Bart's run of 2026-11-06 as the record decodes it (5,780 points at tier 5's
                    // 1.7, no multiplier, 55%): 44 notes in the window, 24 of the right keys early
                    // by 200 ms, 4 let go by, 8 stray keys. He counted three or four misses and
                    // gave himself a B. The chart he played is Easy+ since 0.1 (109) (then Medium).
                    let g = GameEngine(song: bl2, part: .melody, difficulty: .easyPlus)
                    let ms2 = 60000 / (Double(bl2.meta.tempo) * Double(tpb))
                    var tick = -Double(bl2.ticksPerBar)
                    var i = 0, k = 0
                    while tick < Double(bl2.endTick) {
                        while i < g.notes.count, Double(g.notes[i].t) <= tick + 4 {
                            if g.active(i) {
                                let t = Double(g.notes[i].t)
                                if k % 18 != 17 {
                                    let at = t + (k % 3 == 0 ? -200 / ms2 : 0)
                                    g.heard(tick: at, msPerTick: ms2)
                                    g.played(note: g.notes[i].n, tick: at, msPerTick: ms2)
                                }
                                if k % 9 == 4 {
                                    g.heard(tick: t, msPerTick: ms2)
                                    g.played(note: 61, tick: t, msPerTick: ms2)
                                }
                                k += 1
                            }
                            i += 1
                        }
                        tick += 4
                        g.heard(tick: tick, msPerTick: ms2)
                    }
                    g.heard(tick: Double(bl2.endTick) + Double(bl2.ticksPerBar), msPerTick: ms2)
                    let r = g.result()
                    check("stage: Bart's Blue Lantern II run (44 in the window, 24 early by 200 ms, 4 let go, 8 stray keys) is a B at 85%, and the verdict sends the 71 ms lean to the calibration",
                          r.notes == 72 && r.perfect == 44 && r.early == 24 && r.late == 0 && r.missed == 4 && r.wrong == 8 && abs(r.accuracy - 0.85) < 1e-9
                          && r.grade == "B" && r.verdict.title == "Solid" && r.leanMs < -60 && r.leanMs > -80 && r.verdict.line.contains("Calibration"),
                          "\(r.perfect)/\(r.good)/\(r.early)/\(r.late)/\(r.missed), wrong \(r.wrong) → \(Int((r.accuracy * 100).rounded()))% \(r.grade), lean \(Int(r.leanMs.rounded())) ms: \(r.verdict.line)")
                }
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
                                                                good: 0, early: 0, late: 0, missed: 0, extras: 0, wrong: 0, maxCombo: 1, accuracy: 1, timing: 1,
                                                                leanMs: 0, level: 1, grade: "S", map: [], strays: []))
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
                let gap = Double(chordTicks[0]) - half - 1
                let strayKeys = stray.due(at: gap, msPerTick: ms)
                for n in strayKeys { stray.played(note: n, tick: gap, msPerTick: ms) }
                check("stage: a tap more than half a beat before a chord plays it as extras, nothing hit",
                      !strayKeys.isEmpty && stray.extras == strayKeys.count && stray.hits == 0)
                let lateTap = GameEngine(song: song, part: .chords, difficulty: .easy)
                let behindTick = Double(chordTicks[0]) + half - 0.5
                lateTap.heard(tick: behindTick, msPerTick: ms)
                let lateKeys = lateTap.due(at: behindTick, msPerTick: ms)
                for n in lateKeys { lateTap.played(note: n, tick: behindTick, msPerTick: ms) }
                check("stage: a tap just inside half a beat behind a chord still plays it, Late",
                      !lateKeys.isEmpty && lateTap.late == lateKeys.count && lateTap.missed == 0 && lateTap.extras == 0,
                      "\(lateKeys.count) keys, \(lateTap.late) late, \(lateTap.missed) missed, \(lateTap.extras) extras")

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

        // MARK: Fingering by hand position (0.1 (104))
        do {
            func line(_ keys: [Int], step: Int = 6) -> [Song.Note] {
                keys.enumerated().map { Song.Note(t: $0.offset * step, n: $0.element, len: step, lv: 1, f: nil, r: nil, from: nil) }
            }
            func plan(_ notes: [Song.Note], right: Bool = true) -> [Int] { Fingering.plan(notes, right: right, ticksPerBeat: 12) }
            let scale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]
            check("fingering: C major up two octaves is 1 2 3 1 2 3 4 1 2 3 1 2 3 4 5",
                  plan(line(scale)) == [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5], plan(line(scale)).map(String.init).joined(separator: " "))
            check("fingering: and down 5 4 3 2 1 3 2 1 4 3 2 1 3 2 1",
                  plan(line(scale.reversed())) == [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1], plan(line(scale.reversed())).map(String.init).joined(separator: " "))
            // The left hand up has no half step to settle where the 4 goes (both crossings are
            // over a whole step), so either of the two taught fingerings is right.
            check("fingering: the left hand up is the mirror, 5 4 3 2 1 3 2 1 4 3 2 1 3 2 1 (or the 4 first)",
                  [[5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1], [5, 4, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 3, 2, 1]].contains(plan(line(scale), right: false)),
                  plan(line(scale), right: false).map(String.init).joined(separator: " "))
            check("fingering: F4 G4 A4 C5 D5 sits in one hand, 1 2 3 4 5",
                  plan(line([65, 67, 69, 72, 74])) == [1, 2, 3, 4, 5], plan(line([65, 67, 69, 72, 74])).map(String.init).joined(separator: " "))
            let first = plan(line([74, 72, 69, 65, 67, 72, 74], step: 12))
            check("fingering: D5 C5 A4 F4 G4 C5 D5 (the sax line's first bars, Blue Lantern II's until 0.1 (107)) stays in one hand: the thumb on F4, D5 under 4 or 5, every step in order",
                  first[3] == 1 && first.last! >= 4 && zip(first, first.dropFirst()).enumerated().allSatisfy { k, p in
                      let d = [72, 69, 65, 67, 72, 74][k] - [74, 72, 69, 65, 67, 72][k]
                      return (d > 0) == (p.1 > p.0) && p.0 != p.1
                  }, first.map(String.init).joined(separator: " "))
            check("fingering: a repeated key keeps its finger, a leap after a rest moves the hand",
                  plan(line([67, 67, 67], step: 12) + [Song.Note(t: 96, n: 79, len: 12, lv: 1, f: nil, r: nil, from: nil), Song.Note(t: 108, n: 81, len: 12, lv: 1, f: nil, r: nil, from: nil)]) == [1, 1, 1, 1, 2]
                  || plan(line([67, 67, 67], step: 12) + [Song.Note(t: 96, n: 79, len: 12, lv: 1, f: nil, r: nil, from: nil), Song.Note(t: 108, n: 81, len: 12, lv: 1, f: nil, r: nil, from: nil)]) == [1, 1, 1, 2, 3])
            // Every blues melody at every tier, judged as a hand: inside a beat, no finger slides
            // between two keys within an octave, and within a fifth no crossing but the thumb's
            // under 2–4 (or 2–4 over it) and no stretch past what the pair reaches. Past a fifth
            // the hand may jump to a new position in order (F♯4 to E5 with 1 then 2), as it does.
            let names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
            func name(_ n: Int) -> String { "\(names[n % 12])\(n / 12 - 1)" }
            for songName in ["song-blue-lantern-white", "song-maxwell-street-five", "song-slow-burn", "song-pearl-street", "song-boogie-shoes", "song-dockery", "song-friars-point", "song-halsted", "song-maxwell-street", "song-blue-lantern"] {
                let song = Song.bundled(songName)
                let e = GameEngine(song: song, part: .melody, difficulty: .hard)
                var faults: [String] = []
                for tier in 1...e.tiers {
                    let on = e.notes.indices.filter { e.masks[tier - 1][$0] }
                    let f = on.map { e.fingers[tier - 1][$0]! }
                    for k in 1..<on.count {
                        let a = e.notes[on[k - 1]], b = e.notes[on[k]]
                        guard b.t - a.t <= 12, b.t > a.t, abs(b.n - a.n) <= 12 else { continue }
                        let d = b.n - a.n, fa = f[k - 1], fb = f[k]
                        var fault: String?
                        if d != 0, fa == fb { fault = "slides" }
                        if abs(d) <= 7 {
                            if d > 0, fb < fa, !(fb == 1 && (2...4).contains(fa) && d <= Fingering.crossMax) { fault = "crosses up" }
                            if d < 0, fb > fa, !(fa == 1 && (2...4).contains(fb) && -d <= Fingering.crossMax) { fault = "crosses down" }
                            if (d > 0) == (fb > fa), d != 0, let r = Fingering.reach[min(fa, fb) * 10 + max(fa, fb)], abs(d) > r.max { fault = "stretches" }
                        }
                        if let fault { faults.append("tier \(tier) bar \(b.t / 48 + 1): \(name(a.n))/\(fa) → \(name(b.n))/\(fb) \(fault)") }
                    }
                }
                check("fingering: \(song.meta.title) melody at every tier: no slide, no crossing but the thumb's, no stretch past the hand",
                      faults.isEmpty, faults.prefix(4).joined(separator: "; "))
            }
            // Blue Lantern II on Easy+ and Medium (the Level 1 goal), for the eye.
            let bl = GameEngine(song: Song.bundled("song-blue-lantern-white"), part: .melody, difficulty: .medium)
            let easyPlus = bl.charting.tier(.easyPlus, song: bl.song.name, part: .melody)!
            let medium = bl.level(atBar: 0)
            var rows: [Int: [String]] = [:]
            for i in bl.notes.indices where bl.masks[medium - 1][i] {
                rows[bl.notes[i].t / 48, default: []].append("\(name(bl.notes[i].n))/\(bl.fingers[medium - 1][i]!)")
            }
            print("Blue Lantern II melody, level \(medium) (Medium), fingered by hand position:")
            for bar in rows.keys.sorted() { print(String(format: "  bar %2d: ", bar + 1) + rows[bar]!.joined(separator: "  ")) }
            // Since 0.1 (107) the line is one riff in one hand (blue_lantern.py --white): every
            // key under the same finger all song long, D5 the pinky, F4 the thumb and E4 its
            // reach down, and (Easy+ since 0.1 (109), Medium before it) exactly the riff and its
            // landing notes, 72 of them.
            let byKey = Dictionary(grouping: bl.notes.indices.filter { bl.masks[easyPlus - 1][$0] }, by: { bl.notes[$0].n })
                .mapValues { Set($0.map { bl.fingers[easyPlus - 1][$0]! }) }
            let easyPlusCount = bl.masks[easyPlus - 1].filter { $0 }.count
            check("fingering: Blue Lantern II on Easy+ (tier \(easyPlus)) is one hand position: \(byKey.count) keys, each under one finger all song, D5 under 5, F4 and E4 under the thumb; \(easyPlusCount) notes",
                  easyPlus == 4 && byKey.count == 7 && byKey.values.allSatisfy { $0.count == 1 } && byKey[74] == [5] && byKey[65] == [1] && byKey[64] == [1] && easyPlusCount == 72,
                  byKey.keys.sorted().map { "\(name($0))/\(byKey[$0]!.sorted().map(String.init).joined(separator: ","))" }.joined(separator: " "))
            // Medium (0.1 (109); Bart: "current difficulty + 2 or 3 times where i need to tuck
            // or move my hand") is Easy+ with three figures, on the chart from tier 6 up (`from`
            // on the notes): the climb C5 D5 E5 F5 off the B4 of bars 12 and 24, the run F4 to
            // D5 off the E4 of bar 34; a thumb under in each, and the hand back on the riff's F
            // after. Beginner, Easy and Easy+ never see the figures' keys (E5, F5): the phrase
            // cover would have put one of each on every level.
            let mediumOn = Set(bl.notes.indices.filter { bl.masks[medium - 1][$0] })
            let easyPlusOn = Set(bl.notes.indices.filter { bl.masks[easyPlus - 1][$0] })
            let figureBars = Set(mediumOn.subtracting(easyPlusOn).map { bl.notes[$0].t / 48 + 1 })
            let lowKeys = Set((0..<easyPlus).flatMap { t in bl.notes.indices.filter { bl.masks[t][$0] }.map { bl.notes[$0].n } })
            let tuckBars = Set(Call.steps(game: bl, from: 0).filter { $0.crossing == .tuck }.map { $0.tick / 48 + 1 })
            let ladderCounts = bl.masks.map { $0.filter { $0 }.count }
            check("charting: Blue Lantern II on Medium (tier \(medium)) is Easy+ and three figures: \(mediumOn.count) notes, the figures in bars \(figureBars.sorted()), a tuck in each (\(tuckBars.sorted())), E5 and F5 on no lower level; the ladder \(ladderCounts)",
                  medium == 6 && easyPlusOn.isSubset(of: mediumOn) && mediumOn.count == 86 && figureBars == [12, 24, 34] && tuckBars == [12, 24, 34]
                  && !lowKeys.contains(76) && !lowKeys.contains(77) && ladderCounts == [48, 52, 52, 72, 72, 86, 120]
                  && bl.charting.tier(.hard, song: bl.song.name, part: .melody) == 7)
        }

        // Call (Call.swift): the next note called out, finger then key, then the crossing, and
        // the step waits for that key.
        do {
            let bl = GameEngine(song: Song.bundled("song-blue-lantern-white"), part: .melody, difficulty: .medium)
            let steps = Call.steps(game: bl, from: 0)
            let active = bl.notes.indices.filter { bl.active($0) }
            let single = steps.allSatisfy { $0.notes.count == 1 }
            let fingered = steps.allSatisfy { s in zip(s.notes, s.indices).allSatisfy { $0.finger == bl.finger($1) && $0.key == bl.notes[$1].n } }
            let crossingsOK = zip(steps, steps.dropFirst()).allSatisfy { a, b in
                guard let c = a.crossing else { return true }
                let d = b.notes[0].key - a.notes[0].key
                guard abs(d) <= Fingering.crossMax, let fa = a.notes[0].finger, let fb = b.notes[0].finger else { return false }
                return c == .tuck ? (d > 0 && fb == 1 && fa > 1) : (d < 0 && fa == 1 && fb > 1)
            }
            let tucks = steps.filter { $0.crossing == .tuck }.count, overs = steps.filter { $0.crossing == .over }.count
            check("call: Blue Lantern II melody on Medium is \(steps.count) single-note steps, one per note of the tier, the tier's fingers; every tuck the thumb under going up and every over a finger over it coming down, inside a crossing's reach (\(tucks) tucks, \(overs) overs: the three figures' thumbs under, 0.1 (109))",
                  steps.count == active.count && !steps.isEmpty && single && fingered && crossingsOK && steps.flatMap(\.indices) == active && tucks == 3 && overs == 0)
            var engine = Call.Engine(steps: steps, right: true, spelling: .of(key: bl.song.meta.key))
            let first = engine.phrase
            let wrongKey = steps[0].notes[0].key + 1
            let wrong = engine.played(key: wrongKey)
            let stayed = engine.index == 0 && engine.wrong == 1
            var verdicts: [Call.Verdict] = []
            for s in steps { verdicts.append(engine.played(key: s.notes[0].key)) }
            check("call: a wrong key (\(wrongKey)) is .wrong and the step stays; the right keys advance \(steps.count - 1) times and the last is done; the first call is \"\(first)\"",
                  wrong == .wrong(wrongKey) && stayed && verdicts.dropLast().allSatisfy { $0 == .advance } && verdicts.last == .done && engine.finished && engine.phrase.isEmpty,
                  "\(verdicts.prefix(3)) … \(verdicts.suffix(1))")
            print("Blue Lantern II, called: " + steps.prefix(12).map { Call.phrase(Call.words(for: $0, spelling: .flats)) }.joined(separator: " | "))

            // A chord is one step that waits for all of its keys, nothing to say about the hand after it.
            let ch = GameEngine(song: Song.bundled("song-blue-lantern-white"), part: .chords, difficulty: .hard)
            let chords = Call.steps(game: ch, from: 0)
            var ce = Call.Engine(steps: chords, right: false, spelling: .flats)
            let c0 = chords[0]
            let partial = c0.notes.dropLast().map { ce.played(key: $0.key) }
            let last = ce.played(key: c0.notes.last!.key)
            check("call: the chords part: a chord is one step (\(c0.notes.count) keys, \"\(Call.phrase(Call.words(for: c0, spelling: .flats)))\"), waiting until every key is down, no crossing called",
                  c0.notes.count > 1 && partial.allSatisfy { $0 == .waiting } && last == .advance && ce.index == 1 && chords.allSatisfy { $0.crossing == nil },
                  "\(partial) then \(last)")

            // A lesson step: C major up and down (lesson-S1 "updown"), said the way Bart said it:
            // 1 C, 2 D, 3 E, tuck, 1 F … 5 C, 4 B … 1 F, over, 3 E, 2 D, 1 C.
            let s1 = Lesson.bundled("lesson-S1")
            let updown = s1.steps.first { $0.id == "updown" }!
            let scale = Call.steps(expected: Array(s1.expected(updown, ticksPerBeat: tpb).prefix(updown.pattern!.count)), right: updown.hand != "left")
            let said = scale.map { Call.phrase(Call.words(for: $0, spelling: .sharps)) }
            check("call: a lesson's scale, C major up and down: \(said.joined(separator: ", "))",
                  said == ["1 · C", "2 · D", "3 · E · tuck", "1 · F", "2 · G", "3 · A", "4 · B", "5 · C", "4 · B", "3 · A", "2 · G", "1 · F · over", "3 · E", "2 · D", "1 · C"])

            // What is said, and how the black keys are spelled.
            let sharp = Call.words(for: Call.Step(notes: [.init(key: 61, finger: 2)], tick: 0, indices: [0], crossing: .tuck), spelling: .sharps)
            let flat = Call.words(for: Call.Step(notes: [.init(key: 61, finger: 2)], tick: 0, indices: [0]), spelling: .flats)
            check("call: the words: \"2 · C♯ · tuck\" (clips two, c-sharp, tuck) in sharps, \"2 · D♭\" in flats; D minor, B♭ and E♭ blues spell flat, E and A minor sharp",
                  Call.phrase(sharp) == "2 · C♯ · tuck" && sharp.map(\.clip) == ["two", "c-sharp", "tuck"] && Call.phrase(flat) == "2 · D♭" && flat.map(\.clip) == ["two", "d-flat"]
                  && Call.Spelling.of(key: "Dm") == .flats && Call.Spelling.of(key: "B♭") == .flats && Call.Spelling.of(key: "E♭ blues") == .flats
                  && Call.Spelling.of(key: "E") == .sharps && Call.Spelling.of(key: "Am") == .sharps,
                  "\(Call.phrase(sharp)) \(sharp.map(\.clip)) \(Call.phrase(flat))")
            let missing = Call.Word.clips.filter { Bundle.main.url(forResource: "call-\($0)", withExtension: "caf") == nil }
            check("call: every word has its clip in the bundle (\(Call.Word.clips.count) clips)", missing.isEmpty, missing.joined(separator: " "))
        }

        // Ask the teacher (ChatContext.swift, 0.1 (113)): what the teacher is told, in words.
        do {
            let bl = Song.bundled("song-blue-lantern-white")
            let g = GameEngine(song: bl, part: .melody, difficulty: .medium)
            let active = g.notes.indices.filter { g.active($0) }.map { g.notes[$0] }
            let tx = ChatContext.transcript(notes: active.map { ($0.t, $0.n, $0.len) }, chords: bl.band.form,
                                            sections: bl.meta.sections.map { ($0.bar, $0.name) }, bars: bl.bars, ticksPerBeat: tpb, ticksPerBar: 4 * tpb)
            let lines = tx.split(separator: "\n").map(String.init)
            check("ask: Blue Lantern II's Medium line reads one line a bar: the chord, the section where one starts, every note with its beat and its length in beats (\(lines.count) lines)",
                  lines.count == 48 && lines[0] == "Bar 1 (Head), Dm7: D5 on 1 for 1.5, F4 on 3.5 for 1.5" && lines[1] == "Bar 2, Dm7: A4 on 1 for 4"
                  && lines[12].hasPrefix("Bar 13 (Snare in), Dm7:") && lines[24].hasPrefix("Bar 25 (Sax solo), Dm7:") && !tx.contains("rest"),
                  "\(lines[0]) / \(lines[1]) / \(lines[12])")
            let keys = ChatContext.keys(active.map(\.n))
            check("ask: the keys by how often they come, most first, and the range: \(keys) · \(ChatContext.range(active.map(\.n)))",
                  keys.hasPrefix("D ") && keys.contains(", F ") && ChatContext.range(active.map(\.n)) == "E4–F5")
            check("ask: beats read 1-based, lengths in beats, two decimals at most: ticks 0 6 8 30 → 1 1.5 1.67 3.5; 18 4 48 → 1.5 0.33 4",
                  [0, 6, 8, 30].map { ChatContext.beat($0, ticksPerBeat: tpb) } == ["1", "1.5", "1.67", "3.5"]
                  && [18, 4, 48].map { ChatContext.beats($0, ticksPerBeat: tpb) } == ["1.5", "0.33", "4"])
            let s1m = Lesson.bundled("lesson-S1m")
            let improv = s1m.steps.first { $0.id == "improv-white" }!
            let form = s1m.form(of: improv)
            let take = Improv.Take(tempo: 84, bars: 13, notes: [.init(t: 0, n: 62, v: 0.6, len: 12), .init(t: 12 * 48 + 6, n: 65, v: 0.9, len: 6)])
            let tt = ChatContext.transcript(take: take, form: form).split(separator: "\n").map(String.init)
            check("ask: a take reads like the improv teacher's transcript, each chorus marked where it starts, an empty bar a rest",
                  tt.count == 13 && tt[0] == "Bar 1 (chorus 1), Dm7: D4 on 1 for 1" && tt[1] == "Bar 2, Dm7: rest" && tt[4] == "Bar 5, Gm7: rest"
                  && tt[12] == "Bar 13 (chorus 2), Dm7: F4 on 1.5 for 0.5", "\(tt[0]) / \(tt[1]) / \(tt[12])")
            let root = s1m.chords(of: improv)[form[0]]!.root
            let scale = ChatContext.scaleLine(allowed: s1m.scale(of: improv), root: root)
            check("ask: the improv's notes allowed, from its root: \(scale)", scale == "D E F G A B C" && root == 2)
            check("ask: key names said in full: Dm → D minor, A → A major; A minor and E♭ blues stay",
                  ChatContext.keyName("Dm") == "D minor" && ChatContext.keyName("A") == "A major" && ChatContext.keyName("A minor") == "A minor"
                  && ChatContext.keyName("E♭ blues") == "E♭ blues" && ChatContext.keyName("F minor") == "F minor")
        }

        // MARK: Reading (2026-11-07)

        let rd = Reading.bundled
        check("reading: three lessons, treble right, bass left, grand both",
              rd.lessons.map(\.clef) == [.treble, .bass, .grand] && rd.lessons[0].right != nil && rd.lessons[0].left == nil
              && rd.lessons[1].left != nil && rd.lessons[1].right == nil && rd.lessons[2].right != nil && rd.lessons[2].left != nil,
              rd.lessons.map(\.id).joined(separator: " "))
        let short = #"{"module":{"code":"X","title":"X","detail":""},"track":"band-blues-C","tempo":70,"key":"C","channel":"horns","chords":{},"cleanShare":0.9,"gate":2,"lessons":[{"id":"X1","title":"X","goal":"","clef":"treble","names":"on","right":["C4/q E4/q"],"fingers":{"right":{"C4":1,"E4":3}},"cheat":{"title":"","lead":"","notes":[],"mnemonics":[],"tip":"","values":false}}]}"#
        check("reading: a bar that doesn't add up to four beats traps at load", (try? Reading.load(Data(short.utf8))) == nil)
        check("reading: pitches", Reading.pitch("C4")?.midi == 60 && Reading.pitch("F#3")?.midi == 54 && Reading.pitch("Bb4")?.midi == 70
              && Reading.pitch("H4") == nil)
        func st(_ p: String, _ c: Reading.Clef) -> Int? {
            let x = Reading.pitch(p)!
            return Reading.step(Reading.Event(midi: x.midi, beats: 1, finger: 1, hand: .right, letter: x.letter, accidental: x.accidental), clef: c)
        }
        let trebleSteps = ["C4", "E4", "G4", "B4", "F5", "F#4"].map { st($0, .treble)! }
        let bassSteps = ["G2", "C3", "F3", "A3", "C4"].map { st($0, .bass)! }
        check("reading: staff steps (treble middle C -2, E on the bottom line; bass G on the bottom line, middle C 10)",
              trebleSteps == [-2, 0, 2, 4, 8, 1] && bassSteps == [0, 3, 6, 8, 10], "\(trebleSteps) \(bassSteps)")
        check("reading: places", Reading.place(step: 2, clef: .treble) == "Second line" && Reading.place(step: 1, clef: .treble) == "First space"
              && Reading.place(step: 3, clef: .bass) == "Second space" && Reading.place(step: 6, clef: .bass) == "Fourth line"
              && Reading.place(step: -2, clef: .treble) == "Middle C, its own little line" && Reading.place(step: 10, clef: .bass) == "Middle C, its own little line")
        func ev(_ p: String, _ f: Int, _ h: Reading.Hand) -> Reading.Event {
            let x = Reading.pitch(p)!
            return Reading.Event(midi: x.midi, beats: 1, finger: f, hand: h, letter: x.letter, accidental: x.accidental)
        }
        let coachLines = [Reading.coach([ev("G4", 5, .right)], lesson: .treble), Reading.coach([ev("C3", 5, .left)], lesson: .bass),
                          Reading.coach([ev("F3", 2, .left), ev("F4", 4, .right)], lesson: .grand)]
        check("reading: the coach says the name, the place, the finger",
              coachLines == ["G. Second line. Pinky.", "C. Second space. Pinky, left hand.", "F. First space. Ring. Left hand F."],
              coachLines.joined(separator: " | "))
        check("reading: numerals", Reading.numeral("C", key: "C") == "I" && Reading.numeral("F7", key: "C") == "IV"
              && Reading.numeral("G", key: "C") == "V" && Reading.numeral("Dm7", key: "C") == "II")
        let rs1 = rd.song(rd.lessons[0])
        let rn1 = rs1.notes(.melody)
        let perChorus: Int = rd.lessons[0].right!.map { (bar: String) -> Int in bar.split(separator: " ").filter { !$0.hasPrefix("r/") }.count }.reduce(0, +)
        let firstThree: [[Int]] = rn1.prefix(3).map { n -> [Int] in [n.t, n.n, n.f ?? 0] }
        let wholeChoruses = rs1.exact && rs1.bars % 12 == 0 && rn1.count == perChorus * rs1.bars / 12
        check("reading: lesson 1's song is whole choruses of the line, every note written",
              wholeChoruses && firstThree == [[0, 60, 1], [12, 64, 3], [24, 67, 5]] && rn1[2].len == 23,
              "\(rs1.bars) bars, \(rn1.count) notes")
        let rg1 = GameEngine(song: rs1, part: .melody, difficulty: .hard)
        check("reading: the engine plays every note at one tier with the file's fingers",
              rg1.tiers == 1 && rg1.notes.indices.allSatisfy { rg1.active($0) && rg1.finger($0) == rg1.notes[$0].f })
        let rline1 = rd.line(rd.lessons[0], bars: 12, ticksPerBeat: 12)
        check("reading: the line keeps its rests (bars 4 and 8)", rline1.filter(\.rest).map(\.tick) == [3 * 48 + 24, 7 * 48 + 24])
        let rs3 = rd.song(rd.lessons[2])
        let lhFirst = rs3.notes(.melody).filter { $0.n < 60 }.prefix(2).map(\.t)
        check("reading: both hands in one part, the left a whole note a bar", Array(lhFirst) == [0, 48] && rs3.notes(.melody).first { $0.n < 60 }?.f == 5)
        let beat = 60.0 / 70
        check("reading: a missed key is half lit a beat, then fades over half a beat",
              Player.hintStrength(elapsed: 0, beat: beat) == 1 && Player.hintStrength(elapsed: beat, beat: beat) == 1
              && abs(Player.hintStrength(elapsed: beat * 1.25, beat: beat) - 0.5) < 1e-9 && Player.hintStrength(elapsed: beat * 1.5, beat: beat) < 1e-9 && Player.hintStrength(elapsed: beat * 2, beat: beat) == 0)
        check("reading: a chorus is clean at 90% of its notes", Reading.chorus(played: 9, of: 10, cleanShare: 0.9)
              && !Reading.chorus(played: 8, of: 10, cleanShare: 0.9) && !Reading.chorus(played: 0, of: 0, cleanShare: 0.9))

        print("LessonCheck: \(passed) passed, \(failed) failed")
        return failed == 0
    }
}
#endif
