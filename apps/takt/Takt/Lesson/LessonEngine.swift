import Foundation

/// Runs a lesson's steps against the transport: the notes each chorus expects, the verdict on
/// each chorus, the gate, and what the coach says. Pure logic on the main thread: the Player
/// feeds it the heard transport position every display frame and every key press; it never
/// touches audio. Everything it shows changes on a heard downbeat (principle 5).
///
/// A chorus is judged at the downbeat that ends it. Presses up to half a beat before a chorus
/// belong to it (an early first note). A chorus with no presses is not judged; neither is one
/// you joined after bar 1 when you weren't playing the chorus before ("you join the band").
/// Clean choruses add up toward the gate, not necessarily in a row, and count only at the
/// step's tempo or faster.
final class LessonEngine {
    struct Output: Equatable {
        var step = 1
        var stepCount = 1
        var clean = 0
        var gate = 0
        var passed = false
        var coach = ""
        var lastChorus: String?
        var lastChorusDetail: String?
        /// Keyboard: the key for now and the next different one (MIDI notes).
        var nowNote: Int?
        var nextNote: Int?
    }

    struct Verdict {
        /// 0-based chorus of the transport.
        let chorus: Int
        /// nil: joined late, not judged.
        let result: ChorusResult?
        let tempo: Double
        /// Clean at the step's tempo: it counts toward the gate.
        let counted: Bool
        let clean: Int
        let gate: Int
        let line: String
    }

    let lesson: Lesson
    let rules: ScoringRules
    let ticksPerBeat: Int
    let loopTicks: Int
    private(set) var output = Output()
    private(set) var stepIndex = 0
    private(set) var expected: [ExpectedNote] = []
    var onVerdict: ((Verdict) -> Void)?

    private var presses: [PlayedNote] = []
    /// The next chorus to judge.
    private var nextChorus = 0
    private var epoch: Int?
    private var heardTick = 0.0
    private var stepStartBar = 0
    private var attempted: Set<Int> = []
    /// Slowest tempo in each chorus, from display frames and presses.
    private var minTempo: [Int: Double] = [:]
    private var verdict: (chorus: Int, line: String)?
    private var clean = 0
    private var passed = false

    var step: Lesson.Step { lesson.steps[stepIndex] }
    private var ticksPerBar: Int { 4 * ticksPerBeat }
    private var bars: Int { lesson.form.count }
    /// How far before a chorus its first press may land.
    private var lead: Double { Double(ticksPerBeat) / 2 }

    init(lesson: Lesson, ticksPerBeat: Int, rules: ScoringRules = .init()) {
        self.lesson = lesson
        self.rules = rules
        self.ticksPerBeat = ticksPerBeat
        loopTicks = lesson.form.count * 4 * ticksPerBeat
        guard lesson.steps.first?.kind == .play else { fatalError("lesson \(lesson.code): step 1 must be a play step") }
        startStep(0)
    }

    /// M2 runs step 1 and holds once it passes; M3 moves on to the card, the shuffle and the rest.
    private func startStep(_ index: Int) {
        stepIndex = index
        expected = lesson.expected(step, ticksPerBeat: ticksPerBeat)
        clean = 0
        passed = false
        verdict = nil
        stepStartBar = bar(at: heardTick)
        update()
    }

    private func bar(at tick: Double) -> Int { Int((tick / Double(ticksPerBar)).rounded(.down)) }

    private func chorus(ofPress tick: Double) -> Int { Int(((tick + lead) / Double(loopTicks)).rounded(.down)) }

    /// The transport position being heard now (absolute tick), every display frame.
    func heard(tick: Double, tempo: Double, rolling: Bool, epoch: Int) {
        if epoch != self.epoch {
            // First call, or the transport was stopped: it starts again from the top.
            self.epoch = epoch
            presses.removeAll()
            attempted.removeAll()
            minTempo.removeAll()
            verdict = nil
            nextChorus = Int((tick / Double(loopTicks)).rounded(.down))
            stepStartBar = bar(at: tick)
        }
        heardTick = tick
        if rolling {
            let c = Int((tick / Double(loopTicks)).rounded(.down))
            minTempo[c] = min(minTempo[c] ?? .infinity, tempo)
        }
        while tick >= Double((nextChorus + 1) * loopTicks) {
            judge(nextChorus)
            nextChorus += 1
        }
        update()
    }

    /// A key press, placed on the transport (see TransportClock). Presses while the transport
    /// holds, and after the gate passed, are not scored.
    func played(note: Int, tick: Double, msPerTick: Double, epoch: Int) {
        let c = chorus(ofPress: tick)
        guard epoch == self.epoch, msPerTick.isFinite, !passed, c >= nextChorus else { return }
        presses.append(PlayedNote(note: note, tick: tick, msPerTick: msPerTick))
        // The press knows its tempo too: display frames stop while the window is hidden.
        minTempo[c] = min(minTempo[c] ?? .infinity, 60000 / (msPerTick * Double(ticksPerBeat)))
    }

    private func judge(_ c: Int) {
        let mine = presses.filter { chorus(ofPress: $0.tick) == c }
        presses.removeAll { chorus(ofPress: $0.tick) <= c }
        guard !passed, !mine.isEmpty else {
            verdict = nil
            return
        }
        attempted.insert(c)
        let coach = step.coach
        let tempo = minTempo[c] ?? 0
        let gate = step.gate!
        let barTwo = Double(c * loopTicks + ticksPerBar) - lead
        guard attempted.contains(c - 1) || mine.contains(where: { $0.tick < barTwo }) else {
            verdict = (c, coach.join!)
            onVerdict?(Verdict(chorus: c, result: nil, tempo: tempo, counted: false, clean: clean, gate: gate, line: coach.join!))
            return
        }
        let result = Scorer.judge(chorus: c, expected: expected, played: mine, loopTicks: loopTicks,
                                  ticksPerBeat: ticksPerBeat, rules: rules)
        let gateTempo = step.tempo!
        let counted = result.clean && tempo >= Double(gateTempo) - 0.5
        if counted { clean += 1 }
        if clean >= gate { passed = true }
        let line: String
        if passed {
            line = coach.passed!
        } else if counted {
            line = coach.clean!.filled(["left": Self.word(gate - clean)])
        } else if result.clean {
            line = coach.slow!.filled(["tempo": "\(Int(tempo.rounded()))", "gateTempo": "\(gateTempo)"])
        } else {
            line = coach.again!.filled(["problem": result.problems.first ?? ""])
        }
        verdict = (c, line)
        output.lastChorus = result.summary
        output.lastChorusDetail = result.detail
        onVerdict?(Verdict(chorus: c, result: result, tempo: tempo, counted: counted, clean: clean, gate: gate, line: line))
    }

    private func update() {
        var o = output
        o.step = stepIndex + 1
        o.stepCount = lesson.steps.count
        o.clean = clean
        o.gate = step.gate ?? 0
        o.passed = passed

        let absBar = bar(at: heardTick)
        let barInForm = ((absBar % bars) + bars) % bars
        let chorus = Int((Double(absBar) / Double(bars)).rounded(.down))
        let coach = step.coach
        if passed {
            o.coach = coach.passed!
        } else if absBar - stepStartBar < 2 {
            o.coach = coach.intro
        } else if barInForm == 0, let v = verdict, v.chorus == chorus - 1 {
            o.coach = v.line
        } else {
            let chord = lesson.form[barInForm]
            let next = lesson.form[(barInForm + 1) % bars]
            o.coach = next != chord ? coach.change!.filled(["next": next]) : coach.hold!.filled(["chord": chord])
        }

        // The latest expected note at or before now, and the one after it.
        let t = heardTick - Double(chorus * loopTicks)
        let i = expected.lastIndex { Double($0.tick) <= t + 1e-6 } ?? expected.count - 1
        let now = expected[i]
        let next = expected[(i + 1) % expected.count]
        o.nowNote = now.display
        o.nextNote = next.display == now.display ? nil : next.display
        if o != output { output = o }
    }

    static func word(_ n: Int) -> String {
        let words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]
        return n < words.count ? words[n] : "\(n)"
    }
}
