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
        held.start(step: lesson.steps.count - 1)
        let payoffNotes = lesson.expected(lesson.steps.last!, ticksPerBeat: tpb)
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

        print("LessonCheck: \(passed) passed, \(failed) failed")
        return failed == 0
    }
}
#endif
