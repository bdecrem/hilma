#if DEBUG
import Foundation

/// `-LessonCheck`: the Scorer, the LessonEngine and the TransportClock against scripted
/// players (the same Autoplay planner the app uses), no audio. One line per case.
///
///   xcrun simctl launch --console <sim> com.bartdecrem.Takt -LessonCheck 1
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
        check("perfect at 70 is clean", r.clean && r.hits == 12 && r.extras.isEmpty && r.detail == "12 of 12 · on the beat", text(r))
        r = judge(chorus(offsetMs: { _ in -50 }))
        check("50 ms early at 70 is clean (±60)", r.clean && r.detail == "12 of 12 · 50 ms early", text(r))
        r = judge(chorus(offsetMs: { _ in -65 }))
        check("65 ms early at 70 is not", !r.clean && r.problems.first == "Rushed every bar.", text(r))
        r = judge(chorus(bpm: 80, offsetMs: { _ in 58 }))
        check("58 ms late at 80 is clean (80 is still ±60)", r.clean, text(r))
        r = judge(chorus(bpm: 90, offsetMs: { _ in 44 }))
        check("44 ms late at 90 is clean (±45)", r.clean, text(r))
        r = judge(chorus(bpm: 90, offsetMs: { _ in 50 }))
        check("50 ms late at 90 is not", !r.clean && r.problems.first == "Dragged every bar.", text(r))
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
        r = judge(chorus(offsetMs: { $0.bar % 2 == 0 ? -20 : 20 }))
        check("±20 ms reads as centered, with the spread", r.clean && r.detail == "12 of 12 · centered · ±20 ms", text(r))
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
              && run.output.passed && run.output.clean == 2 && run.output.lastChorus == "Clean."
              && run.output.lastChorusDetail == "12 of 12 · on the beat", text(run))
        let intro = step.coach.intro
        check("coach calls the form on the downbeats",
              run.coach[0] == intro && run.coach[1] == intro && run.coach[2] == "C on the 1."
              && run.coach[3] == "Get ready. F on the 1." && run.coach[4] == "F on the 1."
              && run.coach[5] == "Get ready. C on the 1."
              && run.coach[11] == "Get ready. C on the 1." && run.coach[12] == "Clean. One more."
              && run.coach[13] == "C on the 1." && run.coach[24] == "Two clean. That's the form."
              && run.coach[30] == "Two clean. That's the form.",
              (0..<14).map { "\($0 + 1): \(run.coach[$0] ?? "-")" }.joined(separator: " / "))
        check("keys show now and next", run.keys[3] == [48, 53] && run.keys[8] == [55, 53] && run.keys[1] == [48, nil],
              "bar 4 \(String(describing: run.keys[3])), bar 9 \(String(describing: run.keys[8]))")

        run = simulate([(autoplay(.loose, choruses: 3), end(3))])
        check("loose autoplay (±40 ms) passes", run.output.passed && run.verdicts.map(\.counted) == [true, true], text(run))

        run = simulate([(autoplay(.sloppy, choruses: 8), end(8))])
        check("sloppy autoplay never passes in 8 choruses", !run.output.passed && run.output.clean == 0
              && run.verdicts.count == 8 && run.verdicts.allSatisfy { $0.line.hasSuffix(" Again.") }, text(run))

        run = simulate([(autoplay(.rush, choruses: 4), end(4))])
        check("rushing 75 ms never passes", !run.output.passed && run.verdicts.allSatisfy { $0.line == "Rushed every bar. Again." },
              text(run))

        let early = chorus(0, offsetMs: { _ in -40 }) + chorus(1, offsetMs: { _ in -40 })
        run = simulate([(early, end(2))])
        check("an early downbeat belongs to the next chorus", run.output.passed
              && run.verdicts.allSatisfy { $0.result?.hits == 12 && $0.result?.extras.isEmpty == true }, text(run))

        let late = autoplay(.perfect, choruses: 4).filter { $0.tick >= Double(2 * 4 * tpb) - 6 }
        run = simulate([(late, end(4))])
        check("joining at bar 3 isn't judged; the next two are", run.verdicts.count == 3 && run.verdicts[0].result == nil
              && run.coach[12] == "From the top." && run.verdicts[2].clean == 2 && run.output.passed, text(run))

        run = simulate([(autoplay(.perfect, bpm: 60, choruses: 3), end(3))], bpm: 60)
        check("clean at 60 doesn't count", run.output.clean == 0 && !run.output.passed
              && run.verdicts.allSatisfy { $0.line == "Clean at 60. It counts at 70." }, text(run))

        run = simulate([(chorus(0) + chorus(2), end(3))])
        check("a silent chorus isn't judged", run.verdicts.map(\.chorus) == [0, 2] && run.output.passed
              && run.coach[24] == "C on the 1.", text(run))

        let beforeStop = autoplay(.perfect, choruses: 2).filter { $0.tick < Double(loop + 6 * 4 * tpb) }
        run = simulate([(beforeStop, Double(loop + 6 * 4 * tpb)), (autoplay(.perfect, choruses: 1), end(1))])
        check("stop drops the half chorus, keeps the clean one", run.verdicts.count == 2 && run.output.passed
              && run.coach[1000] == intro, text(run))

        // Chorus 2 gets no display frame at all; its tempo comes from the presses.
        run = simulate([(autoplay(.perfect, choruses: 2), end(2) + 20)], hidden: 1..<Double(2 * loop + 10))
        check("choruses played while the window was hidden still count", run.output.passed
              && run.verdicts.map(\.counted) == [true, true], text(run))

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
