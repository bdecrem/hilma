import Foundation

/// Runs a lesson's steps against the transport: the notes each chorus expects, the verdict on
/// each chorus, the gates, the ramp, the unlocks, the payoff and what the coach says. Pure logic
/// on the main thread: the Player feeds it the heard transport position every display frame and
/// every key press, and carries out its actions (tempo, unlocks, the band sitting out); it never
/// touches audio itself. Everything it shows changes on a heard downbeat (principle 5).
///
/// A chorus is judged at the downbeat that ends it. Presses up to half a beat before a chorus
/// belong to it (an early first note). A chorus with no presses is not judged; neither is one
/// you joined after bar 1 when you weren't playing the chorus before ("you join the band"), nor
/// one that began before its step did.
///
/// The steps (brief §4):
/// - play: clean choruses add up toward the gate, not necessarily in a row, and count only at the
///   step's tempo or faster. With `maxAttempts`, judged choruses run out and the step holds.
/// - card: nothing is scored; `continueCard()` moves on, and the next step starts with the next
///   chorus.
/// - ramp: each clean chorus at the ramp's tempo raises it by `by` (from bar 2 of the next chorus:
///   the renderer applies tempo on a downbeat, and the verdict is heard on one); channels unlock
///   as the tempo reaches their `unlockAt`; reaching `to` passes.
/// - payoff: the next chorus plays with the band out for `aloneBars`; playing it through (any
///   presses) finishes the lesson. A silent chorus arms the next one.
/// A step that passes on a downbeat hands over at once: the next chorus belongs to the next step,
/// and the coach shows the passed line for two bars, then the new step's intro for two.
final class LessonEngine {
    enum Action: Equatable {
        case tempo(Int)
        /// Unmute a lesson channel (index into `lesson.channels`).
        case unlock(Int)
        /// The band sits out between these absolute ticks.
        case silence(from: Double, to: Double)
        case finished
    }

    /// How the last note landed, live (the chorus verdict comes at its end): the lesson's needle.
    struct NoteMark: Equatable {
        enum Kind { case hit, early, late, wrong, missed }
        let kind: Kind
        /// Signed, negative = early; nil for a missed note.
        let offsetMs: Double?
        /// The hit window it was judged against.
        let windowMs: Double
        /// Counts up with every mark, so the same mark twice still moves the needle.
        let seq: Int
    }

    /// A step as its intro shows it: the title, what to do, and which finger plays which tone.
    struct StepInfo: Equatable {
        let title: String
        let about: String?
        let kind: Lesson.Kind
        /// (finger, tone), in the order the pattern plays them.
        let fingers: [Finger]
        struct Finger: Equatable { let finger: Int; let tone: String; let beat: Int }
    }

    /// A step just passed: its title, and the step that comes next.
    struct Complete: Equatable {
        let done: String
        let next: StepInfo
    }

    struct Output: Equatable {
        var step = 1
        var stepCount = 1
        var stepKind = Lesson.Kind.play
        var stepTitle = ""
        /// The card's text while a card step is up.
        var card: String?
        var clean = 0
        var gate = 0
        var passed = false
        /// The gate's attempts ran out this session.
        var holding = false
        var coach = ""
        var lastChorus: String?
        var lastChorusDetail: String?
        /// Keyboard: the key for now and the next different one (MIDI notes).
        var nowNote: Int?
        var nextNote: Int?
        /// Lesson channels the lesson has opened (indices into `lesson.channels`).
        var unlocked: Set<Int> = []
        var rampTarget: Int?
        var finished = false
        var lastNote: NoteMark?
        /// A play step waiting for Start (gated engines): its intro takes the pads' place.
        var intro: StepInfo?
        /// A step just passed (gated engines): Lesson complete, and the next step.
        var complete: Complete?
        /// Keys of the current bar's notes → the finger for each.
        var fingers: [Int: Int] = [:]
    }

    struct Verdict {
        /// 0-based chorus of the transport.
        let chorus: Int
        let step: Int
        let skill: String?
        /// nil: joined late, not judged.
        let result: ChorusResult?
        let tempo: Double
        /// It counts toward the step's gate (or the ramp).
        let counted: Bool
        let clean: Int
        let gate: Int
        let line: String
    }

    /// The payoff chorus, for the result screen: every press with its tick inside the chorus.
    struct Finish: Equatable {
        struct Press: Equatable {
            let note: Int
            /// From the chorus's bar 1 (an early first note is negative).
            let tick: Double
            var velocity: Float = 0.8
            var lengthTicks: Double = 6
        }
        let code: String
        /// Bars in the chorus.
        let bars: Int
        let presses: [Press]
        let expected: [ExpectedNote]
        /// 0-based bars the band sat out.
        let aloneBars: [Int]
        let tempo: Int
        let summary: String
        let detail: String?
    }

    let lesson: Lesson
    let rules: ScoringRules
    let ticksPerBeat: Int
    let loopTicks: Int
    private(set) var output = Output()
    private(set) var stepIndex = 0
    private(set) var expected: [ExpectedNote] = []
    private(set) var finish: Finish?
    var onVerdict: ((Verdict) -> Void)?
    var onAction: ((Action) -> Void)?

    private var presses: [PlayedNote] = []
    /// Live marks: expected notes (chorus × count + index) already matched, or answered with a
    /// wrong note; the tick checked for misses through; the last press, so a player who has
    /// stopped playing isn't shown a miss on every note.
    private var liveMatched: Set<Int> = []
    private var liveWrong: Set<Int> = []
    private var liveChecked = 0.0
    private var lastPressTick = -Double.infinity
    private var markSeq = 0
    /// The next chorus to judge, and the first one the current step judges.
    private var nextChorus = 0
    private var firstChorus = 0
    private var epoch: Int?
    private var heardTick = 0.0
    private var heardTempo = 0.0
    private var stepStartBar = 0
    private var attempted: Set<Int> = []
    /// Slowest tempo in each chorus, and the tempo at its end, from display frames and presses.
    private var minTempo: [Int: Double] = [:]
    private var endTempo: [Int: Double] = [:]
    private var verdict: (chorus: Int, line: String)?
    /// A line that holds the coach until a bar (a step that just passed).
    private var banner: (line: String, untilBar: Int)?
    private var clean = 0
    private var attempts = 0
    private var passed = false
    private var holding = false
    private var unlocked: Set<Int> = []
    private var rampTarget = 0
    /// The payoff's chorus.
    private var aloneChorus = 0
    /// The chorus a tempo change of ours lands in (on bar 2, the next heard downbeat): it is
    /// judged at the tempo it ends at, so the hand-over to a faster step doesn't waste a chorus.
    private var tempoChangeChorus: Int?

    var step: Lesson.Step { lesson.steps[stepIndex] }
    private var ticksPerBar: Int { 4 * ticksPerBeat }
    private var bars: Int { lesson.form.count }
    /// How far before a chorus its first press may land.
    private var lead: Double { Double(ticksPerBeat) / 2 }
    private var scoring: Bool { step.kind != .card && !passed && !holding && finish == nil && !awaiting }

    /// Gated (the app): a play step waits on its intro for Start, and a passed step holds on
    /// Lesson complete until the next one is started. Ungated (the checks, autoplay): steps hand
    /// over by themselves on the next chorus.
    let gated: Bool
    private var awaiting = false
    private var completed: String?

    init(lesson: Lesson, ticksPerBeat: Int, rules: ScoringRules = .init(), gated: Bool = false) {
        self.lesson = lesson
        self.rules = rules
        self.gated = gated
        self.ticksPerBeat = ticksPerBeat
        loopTicks = lesson.form.count * 4 * ticksPerBeat
        guard lesson.steps.first?.kind == .play else { fatalError("lesson \(lesson.code): step 1 must be a play step") }
        startStep(0)
    }

    /// Jumps to a step (0-based): the menu's restart, DEBUG and the checks.
    func start(step index: Int) {
        precondition(lesson.steps.indices.contains(index), "no step \(index)")
        banner = nil
        finish = nil
        startStep(index)
    }

    /// The card's Continue: the next step starts with the next chorus (gated: its intro).
    func continueCard() {
        guard step.kind == .card, stepIndex + 1 < lesson.steps.count else { return }
        startStep(stepIndex + 1)
    }

    /// The intro's Start: scoring begins with the next chorus (the Player restarts the band from
    /// the top, so that is the one after the count-in).
    func begin() {
        guard awaiting else { return }
        awaiting = false
        firstChorus = Int(((heardTick - lead) / Double(loopTicks)).rounded(.up))
        stepStartBar = bar(at: heardTick)
        update()
    }

    /// Lesson complete's button: the next step, its intro already read (a card shows itself).
    func advance() {
        guard completed != nil, stepIndex + 1 < lesson.steps.count else { return }
        completed = nil
        startStep(stepIndex + 1)
        begin()
    }

    #if DEBUG
    /// `-StepComplete 1`: the current step as if just passed (screenshots of Lesson complete).
    func debugComplete() {
        guard gated, stepIndex + 1 < lesson.steps.count else { return }
        passed = true
        awaiting = false
        completed = step.title
        update()
    }
    #endif

    func info(_ s: Lesson.Step) -> StepInfo {
        let pattern = (s.pattern ?? []).sorted { ($0.beat, $0.tick ?? 0) < ($1.beat, $1.tick ?? 0) }
        var seen: Set<Int> = []
        let fingers = pattern.compactMap { p -> StepInfo.Finger? in
            guard let f = p.finger, seen.insert(f).inserted else { return nil }
            return .init(finger: f, tone: p.tone, beat: p.beat)
        }
        return StepInfo(title: s.title, about: s.about, kind: s.kind, fingers: fingers)
    }

    private func startStep(_ index: Int) {
        stepIndex = index
        expected = step.pattern == nil ? [] : lesson.expected(step, ticksPerBeat: ticksPerBeat)
        clean = 0
        attempts = 0
        passed = false
        holding = false
        completed = nil
        awaiting = gated && step.kind != .card
        verdict = nil
        // The first chorus that starts after now (an early first note's half beat counts).
        firstChorus = Int(((heardTick - lead) / Double(loopTicks)).rounded(.up))
        stepStartBar = max(bar(at: heardTick), banner?.untilBar ?? 0)
        presses.removeAll { chorus(ofPress: $0.tick) < firstChorus }

        let tempo: Int? = step.kind == .ramp ? step.ramp!.from : step.tempo
        if let tempo {
            if step.kind == .ramp { rampTarget = tempo }
            if Int(heardTempo.rounded()) != tempo { changeTempo(tempo) }
            unlock(upTo: tempo)
        }
        if step.kind == .payoff { armPayoff(firstChorus) }
        update()
    }

    /// Opens every locked channel whose tempo has been reached; returns the names it opened.
    @discardableResult
    private func unlock(upTo tempo: Int) -> [String] {
        var names: [String] = []
        for (i, c) in lesson.channels.enumerated() {
            guard let at = c.unlockAt, at <= tempo, !unlocked.contains(i) else { continue }
            unlocked.insert(i)
            names.append(c.name)
            onAction?(.unlock(i))
        }
        return names
    }

    private func armPayoff(_ c: Int) {
        aloneChorus = c
        let alone = step.aloneBars!.sorted()
        let from = Double(c * loopTicks + (alone.first! - 1) * ticksPerBar)
        let to = Double(c * loopTicks + alone.last! * ticksPerBar)
        onAction?(.silence(from: from, to: to))
    }

    private func changeTempo(_ bpm: Int) {
        tempoChangeChorus = Int((heardTick / Double(loopTicks)).rounded(.down))
        onAction?(.tempo(bpm))
    }

    private func bar(at tick: Double) -> Int { Int((tick / Double(ticksPerBar)).rounded(.down)) }

    private func chorus(ofPress tick: Double) -> Int { Int(((tick + lead) / Double(loopTicks)).rounded(.down)) }

    /// The transport position being heard now (absolute tick), every display frame.
    func heard(tick: Double, tempo: Double, rolling: Bool, epoch: Int) {
        if epoch != self.epoch {
            // First call, or the transport was stopped: it starts again from the top.
            let first = self.epoch == nil
            self.epoch = epoch
            presses.removeAll()
            attempted.removeAll()
            minTempo.removeAll()
            endTempo.removeAll()
            verdict = nil
            liveMatched.removeAll()
            liveWrong.removeAll()
            liveChecked = tick
            lastPressTick = -.infinity
            heardTick = tick
            nextChorus = Int((tick / Double(loopTicks)).rounded(.down))
            firstChorus = Int(((tick - lead) / Double(loopTicks)).rounded(.up))
            stepStartBar = bar(at: tick)
            // Stop cleared the band's silence; the payoff arms again.
            if !first && step.kind == .payoff && finish == nil { armPayoff(firstChorus) }
        }
        heardTick = tick
        heardTempo = tempo
        if rolling {
            let c = Int((tick / Double(loopTicks)).rounded(.down))
            minTempo[c] = min(minTempo[c] ?? .infinity, tempo)
            endTempo[c] = tempo
        }
        markMisses(through: tick)
        while tick >= Double((nextChorus + 1) * loopTicks) {
            judge(nextChorus)
            nextChorus += 1
        }
        update()
    }

    /// Half a beat: how far from an expected note a press still belongs to it.
    private var reach: Double { Double(ticksPerBeat) / 2 }

    private func mark(_ kind: NoteMark.Kind, _ offsetMs: Double?, msPerTick: Double) {
        markSeq += 1
        let tempo = 60000 / (msPerTick * Double(ticksPerBeat))
        output.lastNote = NoteMark(kind: kind, offsetMs: offsetMs, windowMs: rules.windowMs(tempo: tempo), seq: markSeq)
    }

    /// The press against the nearest expected note within half a beat: the right pitch class is
    /// a hit, rushed or dragged by the window; another note there is wrong; a second press of a
    /// matched note, or one nowhere near a note, leaves the needle where it was.
    private func markPress(note: Int, tick: Double, msPerTick: Double, chorus c: Int) {
        let base = Double(c * loopTicks)
        var right: (i: Int, d: Double)?
        var near: (i: Int, d: Double)?
        for (i, e) in expected.enumerated() {
            let d = tick - (base + Double(e.tick))
            guard abs(d) <= reach else { continue }
            if (rules.low...rules.high).contains(note) && note % 12 == e.pitchClass && !liveMatched.contains(c * expected.count + i) {
                if right == nil || abs(d) < abs(right!.d) { right = (i, d) }
            } else if near == nil || abs(d) < abs(near!.d) {
                near = (i, d)
            }
        }
        if let r = right {
            liveMatched.insert(c * expected.count + r.i)
            let ms = r.d * msPerTick
            let tempo = 60000 / (msPerTick * Double(ticksPerBeat))
            let w = rules.windowMs(tempo: tempo)
            mark(abs(ms) <= w ? .hit : ms < 0 ? .early : .late, ms, msPerTick: msPerTick)
        } else if let n = near, !liveMatched.contains(c * expected.count + n.i) {
            liveWrong.insert(c * expected.count + n.i)
            mark(.wrong, n.d * msPerTick, msPerTick: msPerTick)
        }
    }

    /// An expected note whose half beat has passed with nothing played at it is a miss, while
    /// the player is playing (a press in the last two bars).
    private func markMisses(through tick: Double) {
        defer { liveChecked = max(liveChecked, tick) }
        guard scoring, !expected.isEmpty, heardTempo > 0, tick > liveChecked, tick - lastPressTick <= Double(2 * ticksPerBar) else { return }
        let first = Int(((liveChecked - reach) / Double(loopTicks)).rounded(.down))
        let last = Int((tick / Double(loopTicks)).rounded(.down))
        guard first <= last else { return }
        for c in max(first, firstChorus)...last {
            for (i, e) in expected.enumerated() {
                let deadline = Double(c * loopTicks + e.tick) + reach
                let id = c * expected.count + i
                guard deadline > liveChecked, deadline <= tick, !liveMatched.contains(id), !liveWrong.contains(id) else { continue }
                mark(.missed, nil, msPerTick: 60000 / (heardTempo * Double(ticksPerBeat)))
            }
        }
    }

    /// A key press, placed on the transport (see TransportClock). Presses while the transport
    /// holds, on a card, and after a step passed or finished, are not scored.
    func played(note: Int, tick: Double, msPerTick: Double, epoch: Int, velocity: Float = 0.8) {
        let c = chorus(ofPress: tick)
        guard epoch == self.epoch, msPerTick.isFinite, scoring, c >= nextChorus, c >= firstChorus else { return }
        presses.append(PlayedNote(note: note, tick: tick, msPerTick: msPerTick, velocity: velocity))
        lastPressTick = tick
        markPress(note: note, tick: tick, msPerTick: msPerTick, chorus: c)
        // The press knows its tempo too: display frames stop while the window is hidden.
        minTempo[c] = min(minTempo[c] ?? .infinity, 60000 / (msPerTick * Double(ticksPerBeat)))
    }

    /// A key let go: the length of its press, for the exported loop.
    func released(note: Int, tick: Double, epoch: Int) {
        guard epoch == self.epoch, let i = presses.lastIndex(where: { $0.note == note && $0.lengthTicks == nil }) else { return }
        presses[i].lengthTicks = max(1, tick - presses[i].tick)
    }

    private func judge(_ c: Int) {
        let mine = presses.filter { chorus(ofPress: $0.tick) == c }
        presses.removeAll { chorus(ofPress: $0.tick) <= c }
        guard scoring, c >= firstChorus else { return }
        guard !mine.isEmpty else {
            verdict = nil
            if step.kind == .payoff && c == aloneChorus { armPayoff(c + 1) }
            return
        }
        attempted.insert(c)
        let coach = step.coach
        let tempo = (c == tempoChangeChorus ? endTempo[c] : minTempo[c]) ?? 0
        let result = Scorer.judge(chorus: c, expected: expected, played: mine, loopTicks: loopTicks,
                                  ticksPerBeat: ticksPerBeat, rules: rules)

        if step.kind == .payoff {
            // Any completion: the chorus was played through.
            guard c == aloneChorus else { return }
            let base = Double(c * loopTicks)
            // A key still down at the downbeat keeps a quarter note, inside the chorus.
            let presses = mine.map { p in
                Finish.Press(note: p.note, tick: p.tick - base, velocity: p.velocity,
                             lengthTicks: p.lengthTicks ?? max(1, min(Double(ticksPerBeat), base + Double(loopTicks) - p.tick)))
            }
            finish = Finish(code: lesson.code, bars: lesson.form.count, presses: presses, expected: expected,
                            aloneBars: step.aloneBars!.map { $0 - 1 }, tempo: Int(tempo.rounded()),
                            summary: result.summary, detail: result.detail)
            output.lastChorus = result.summary
            output.lastChorusDetail = result.detail
            report(c, result, tempo, counted: true, line: coach.passed!)
            banner = (coach.passed!, Int.max)
            update()
            onAction?(.finished)
            return
        }

        let barTwo = Double(c * loopTicks + ticksPerBar) - lead
        guard attempted.contains(c - 1) || mine.contains(where: { $0.tick < barTwo }) else {
            verdict = (c, coach.join!)
            report(c, nil, tempo, counted: false, line: coach.join!)
            return
        }
        attempts += 1

        var line: String
        var counted = false
        if step.kind == .ramp {
            let r = step.ramp!
            counted = result.clean && (endTempo[c] ?? tempo) >= Double(rampTarget) - 0.5
            if counted {
                rampTarget = min(r.to, rampTarget + r.by)
                clean += 1
                let opened = unlock(upTo: rampTarget)
                if rampTarget >= r.to {
                    passed = true
                    line = coach.passed!
                } else {
                    changeTempo(rampTarget)
                    line = opened.isEmpty ? coach.clean! : coach.unlock!.filled(["channel": Self.list(opened)])
                }
            } else if result.clean {
                line = coach.slow!.filled(["tempo": "\(Int(tempo.rounded()))", "gateTempo": "\(rampTarget)"])
            } else {
                line = coach.again!.filled(["problem": result.problems.first ?? ""])
            }
        } else {
            let gate = step.gate!
            let gateTempo = step.tempo!
            counted = result.clean && tempo >= Double(gateTempo) - 0.5
            if counted { clean += 1 }
            if clean >= gate { passed = true }
            if passed {
                line = coach.passed!
            } else if counted {
                line = coach.clean!.filled(["left": Self.word(gate - clean)])
            } else if result.clean {
                line = coach.slow!.filled(["tempo": "\(Int(tempo.rounded()))", "gateTempo": "\(gateTempo)"])
            } else {
                line = coach.again!.filled(["problem": result.problems.first ?? ""])
            }
            if !passed, let max = step.maxAttempts, attempts >= max {
                holding = true
                line = coach.tomorrow!
            }
        }
        verdict = (c, line)
        output.lastChorus = result.summary
        output.lastChorusDetail = result.detail
        report(c, result, tempo, counted: counted, line: line)

        if passed && stepIndex + 1 < lesson.steps.count {
            if gated {
                // Lesson complete: the band plays on, and the next step waits for its button.
                completed = step.title
                update()
            } else {
                // Hand over now: the chorus that just began is the next step's.
                banner = (line, bar(at: heardTick) + 2)
                startStep(stepIndex + 1)
            }
        }
    }

    private func report(_ c: Int, _ result: ChorusResult?, _ tempo: Double, counted: Bool, line: String) {
        onVerdict?(Verdict(chorus: c, step: stepIndex + 1, skill: step.skill, result: result, tempo: tempo,
                           counted: counted, clean: clean, gate: step.gate ?? 0, line: line))
    }

    private func update() {
        var o = output
        o.step = stepIndex + 1
        o.stepCount = lesson.steps.count
        o.stepKind = step.kind
        o.stepTitle = step.title
        o.card = step.kind == .card ? step.card : nil
        o.clean = clean
        o.gate = step.kind == .ramp ? (step.ramp!.to - step.ramp!.from) / step.ramp!.by : step.gate ?? 0
        o.passed = passed
        o.holding = holding
        o.unlocked = unlocked
        o.rampTarget = step.kind == .ramp ? rampTarget : nil
        o.finished = finish != nil
        o.intro = awaiting ? info(step) : nil
        o.complete = completed.map { Complete(done: $0, next: info(lesson.steps[stepIndex + 1])) }

        let absBar = bar(at: heardTick)
        let barInForm = ((absBar % bars) + bars) % bars
        let chorus = Int((Double(absBar) / Double(bars)).rounded(.down))
        let coach = step.coach
        if let b = banner, absBar < b.untilBar {
            o.coach = b.line
        } else if holding {
            o.coach = coach.tomorrow!
        } else if passed {
            o.coach = coach.passed!
        } else if step.kind == .card || awaiting || absBar - stepStartBar < 2 {
            o.coach = coach.intro
        } else if barInForm == 0, let v = verdict, v.chorus == chorus - 1 {
            o.coach = v.line
        } else if step.kind == .payoff, chorus == aloneChorus, step.aloneBars!.contains(barInForm + 1) {
            o.coach = coach.alone!
        } else {
            let chord = lesson.form[barInForm]
            let next = lesson.form[(barInForm + 1) % bars]
            o.coach = next != chord ? coach.change!.filled(["next": next]) : coach.hold!.filled(["chord": chord])
        }

        // The latest expected note at or before now, and the one after it (none on a card).
        if expected.isEmpty || !scoring {
            o.nowNote = nil
            o.nextNote = nil
            o.fingers = [:]
        } else {
            var fingers: [Int: Int] = [:]
            for e in expected where e.bar == barInForm { if let f = e.finger { fingers[e.display] = f } }
            o.fingers = fingers
            let t = heardTick - Double(chorus * loopTicks)
            let i = expected.lastIndex { Double($0.tick) <= t + 1e-6 } ?? expected.count - 1
            let now = expected[i]
            let next = expected[(i + 1) % expected.count]
            o.nowNote = now.display
            o.nextNote = next.display == now.display ? nil : next.display
        }
        if o != output { output = o }
    }

    static func word(_ n: Int) -> String {
        let words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]
        return n < words.count ? words[n] : "\(n)"
    }

    /// "Keys", "Keys and Horns".
    static func list(_ names: [String]) -> String {
        names.count <= 1 ? names.joined() : names.dropLast().joined(separator: ", ") + " and " + names.last!
    }
}
