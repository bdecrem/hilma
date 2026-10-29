import SwiftUI
import os

/// Live state for the lesson screen: polls the engine at display rate, places the heard
/// transport position and every press on the transport (TransportClock), runs the
/// LessonEngine on them, and routes every input (MIDI, computer keyboard, on-screen keys)
/// to the monitor.
@Observable
final class Player {
    private(set) var bar = 0
    private(set) var beat = 0
    private(set) var chorus = 0
    private(set) var playing = false
    private(set) var tempo = 70
    private(set) var pendingTempo: Int?
    private(set) var meters: [Int] = [0, 0, 0, 0]
    private(set) var muted: UInt8 = 0
    private(set) var pendingUnmute: UInt8 = 0
    private(set) var pressed: Set<Int> = []
    private(set) var midiSources: [String] = []
    /// Computer-keyboard octave shift (Z / X), -2...2 around C3.
    private(set) var octave = 0
    private(set) var lesson = LessonEngine.Output()
    /// The finished payoff chorus: the result screen.
    private(set) var finish: LessonEngine.Finish?
    /// Presses are scored only while the lesson screen is up; elsewhere they just sound.
    var inLesson = false
    /// The calibration under way, and the click being heard.
    private(set) var calibration: Calibration?
    private(set) var calibrationClick: Int?
    /// The count-in's beat (1–4) while it plays, before bar 1.
    private(set) var countIn: Int?
    /// Play it back: the transport epoch the recorded chorus is playing in (it starts at tick 0).
    private(set) var playbackEpoch: Int?
    /// Show me: the step is being played for you (Demo.swift); and it just ended, your turn.
    private(set) var demo = false
    private(set) var demoEnded = false
    /// Stage: the song under way, its part, and the run's result once it ends.
    private(set) var game: GameEngine?
    private(set) var gameResult: GameEngine.Result?
    private(set) var lastRun: ProgressStore.ScoreRecord?
    /// Presses go to the game only on the game screen.
    var inGame = false

    @ObservationIgnored let audio: AudioEngine
    @ObservationIgnored private(set) var content: Lesson
    /// The lesson's channel strips, in order, as mixer channels.
    @ObservationIgnored private(set) var channels: [Channel]
    @ObservationIgnored private var engine: LessonEngine
    @ObservationIgnored let progress: ProgressStore
    /// The current step's form (a minor-key lesson has its own).
    private var form: [FormBar] { content.formBars(of: engine.step) }
    @ObservationIgnored private let midi = MIDIInput()
    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "input")
    @ObservationIgnored private let lessonLog = Logger(subsystem: "takt", category: "lesson")
    @ObservationIgnored private var calibrationEpoch = 0
    /// Clicks sent to the engine so far; the tick loop keeps a bar ahead of the one heard.
    @ObservationIgnored private var clicksSent = 0
    @ObservationIgnored private var bandBeforeCalibration: (playing: Bool, tempo: Int, muted: UInt8)?
    /// The transport tick heard at the last display frame.
    @ObservationIgnored private var heardTick = 0.0
    /// Show me: the epoch it plays in, where it ends, the presses not yet heard and the keys to
    /// let go of.
    @ObservationIgnored private var demoEpoch = 0
    @ObservationIgnored private var demoEnd = 0.0
    @ObservationIgnored private var demoPresses: [Demo.Press] = []
    @ObservationIgnored private var demoReleases: [(note: Int, tick: Double)] = []
    /// Bars in the loaded band's chorus (the lesson's form, or a whole song).
    @ObservationIgnored private var chorusBars: Int
    @ObservationIgnored private var gameEpoch = 0
    @ObservationIgnored private var gameDifficulty = GameEngine.Difficulty.adaptive

    /// Calibration's result: how early (negative) or late this player presses, ms. Every scored
    /// press moves by minus this.
    static var inputOffsetMs: Double { UserDefaults.standard.double(forKey: "inputOffsetMs") }
    static var calibrated: Bool { UserDefaults.standard.bool(forKey: "calibrated") }
    /// Settings → Count-in, on unless turned off. Headless runs (`-Silent`) start on bar 1
    /// unless they pass `-countIn YES`.
    static var countInOn: Bool {
        let d = UserDefaults.standard
        #if DEBUG
        if d.bool(forKey: "Silent") && d.object(forKey: "countIn") == nil { return false }
        #endif
        return d.object(forKey: "countIn") == nil || d.bool(forKey: "countIn")
    }

    static let tempoRange = 50...140

    init(audio: AudioEngine, lesson: Lesson, progress: ProgressStore) {
        self.audio = audio
        self.progress = progress
        content = lesson
        chorusBars = audio.band.chorusBars
        channels = Self.channels(of: lesson)
        engine = LessonEngine(lesson: lesson, ticksPerBeat: audio.band.ticksPerBeat, gated: Self.gated)
        // Locked channels stay muted until the lesson unlocks them; channels the module doesn't
        // use (the scales play over the drums alone) stay out.
        for (c, ch) in zip(lesson.channels, channels) where c.unlockAt != nil {
            audio.send(.mute(ch, true))
        }
        for ch in [Channel.drums, .bass, .keys, .horns] where !channels.contains(ch) { audio.send(.mute(ch, true)) }
        self.lesson = engine.output
        applyBand()
        wire()
        resume()

        midi.onNote = { [weak self] n in
            guard let self else { return }
            // Straight to the render thread: the monitor must not wait for the main thread.
            self.audio.send(n.on ? .noteOn(note: n.note, velocity: n.velocity, hostTime: n.hostTime)
                                 : .noteOff(note: n.note, hostTime: n.hostTime))
            DispatchQueue.main.async {
                if n.on {
                    self.pressed.insert(n.note)
                    self.score(n.note, hostTime: n.hostTime, velocity: n.velocity)
                } else {
                    self.pressed.remove(n.note)
                    self.scoreRelease(n.note, hostTime: n.hostTime)
                }
                self.log.info("midi \(n.on ? "on" : "off", privacy: .public) \(n.note) vel \(n.velocity) at \(self.position(atHostTime: n.hostTime), privacy: .public)")
            }
        }
        midi.onSources = { [weak self] names in self?.midiSources = names }

        let link = CADisplayLink(target: LinkTarget(self), selector: #selector(LinkTarget.tick))
        link.add(to: .main, forMode: .common)
        self.link = link
        refresh()
        #if DEBUG
        // `-Demo 1`: Show me from launch (screenshots of it).
        if UserDefaults.standard.bool(forKey: "Demo") { DispatchQueue.main.async { self.toggleDemo() } }
        #endif
    }

    /// The engine's verdicts go to the log and the progress store, its actions to the band.
    private func wire() {
        engine.onVerdict = { [lessonLog, progress, code = content.code] v in
            let what: String
            if let r = v.result {
                // Play mode: a clean chorus marks the jam done.
                if let jam = v.jam, v.counted { progress.jamDone(jam, in: code) }
                let offsets = r.offsets.map { String(format: "%+.1f", $0) }.joined(separator: " ")
                what = "\(r.hits)/\(r.notes.count) hits, \(r.extras.count) extra, mean \(r.meanOffsetMs.map { String(format: "%+.1f", $0) } ?? "-") ms, \(r.clean ? "clean" : "not clean") [\(r.problems.joined(separator: " "))] offsets \(offsets)"
                if let skill = v.skill { progress.record(skill: skill, result: r, tempo: v.tempo, counted: v.counted) }
                // A judged chorus is a day of practice: the streak.
                progress.practiced()
            } else {
                what = "joined late, not judged"
            }
            lessonLog.info("step \(v.step) chorus \(v.chorus + 1) at \(Int(v.tempo.rounded())): \(what, privacy: .public) · counts \(v.counted) · gate \(v.clean)/\(v.gate) · \"\(v.line, privacy: .public)\"")
            Self.dump("verdict step \(v.step) chorus \(v.chorus + 1) at \(Int(v.tempo.rounded())): \(what) · \"\(v.line)\""
                      + (v.result.map { r in " · marks " + r.notes.map { "\($0.expected.bar + 1):\($0.expected.display)=\($0.mark)" }.joined(separator: " ") } ?? ""))
        }
        engine.onAction = { [weak self] a in
            guard let self else { return }
            switch a {
            case .tempo(let bpm):
                self.audio.send(.tempo(Double(bpm)))
                self.lessonLog.info("tempo \(bpm)")
            case .unlock(let i):
                self.audio.send(.mute(self.channels[i], false))
                self.lessonLog.info("unlock \(self.content.channels[i].name, privacy: .public)")
            case .silence(let from, let to):
                self.audio.send(.silence(from: from, to: to))
                self.lessonLog.info("band out from tick \(Int(from)) to \(Int(to))")
            case .transpose(let n):
                self.audio.send(.transpose(n))
            case .finished:
                self.finish = self.engine.finish
                // The payoff graduates the module; lessons after it stay to be played.
                self.progress.completed(self.content.code, tempo: self.engine.finish?.tempo ?? 0,
                                        steps: self.content.lessonStepCount,
                                        lessons: self.content.lessonIndex(ofStep: self.lesson.step - 1) + 1)
                self.lessonLog.info("lesson \(self.content.code, privacy: .public) finished")
                #if DEBUG
                if UserDefaults.standard.bool(forKey: "PlayBackOnFinish"), let f = self.finish {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.playBack(f) }
                }
                #endif
            }
        }
    }

    // MARK: Controls

    private static func channels(of lesson: Lesson) -> [Channel] {
        let byName: [String: Channel] = ["drums": .drums, "bass": .bass, "keys": .keys, "horns": .horns]
        return lesson.channels.map { c in
            guard let ch = byName[c.channel] else { fatalError("lesson \(lesson.code): unknown channel \(c.channel)") }
            return ch
        }
    }

    /// A module in progress picks up on its next lesson's intro; a finished or fresh one starts
    /// from the top.
    private func resume() {
        let done = lessonsDone
        if done > 0 && done < content.lessons.count {
            restartLesson(at: content.firstStep(ofLesson: done))
        } else {
            restartLesson()
        }
    }

    /// Another module: its band (the minor blues beside the shuffle, from the same tick), form,
    /// channels and steps, picked up where it was.
    func switchModule(to lesson: Lesson) {
        guard lesson.code != content.code else { return }
        if lesson.band != content.band { chorusBars = audio.load(band: lesson.band).chorusBars }
        content = lesson
        channels = Self.channels(of: lesson)
        lessonLog.info("module \(lesson.code, privacy: .public)")
        resume()
    }

    /// From the menu: the lesson from the top (or a step, DEBUG), the band as it starts: locked
    /// channels muted, unused ones out, nothing sitting out, step 1's tempo.
    func restartLesson(at step: Int = 0) {
        if demo { endDemo(stop: false) }
        demoEnded = false
        engine.onAction = nil
        engine.onVerdict = nil
        engine = LessonEngine(lesson: content, ticksPerBeat: audio.band.ticksPerBeat, gated: Self.gated)
        audio.send(.silence(from: 0, to: 0))
        for (c, ch) in zip(content.channels, channels) { audio.send(.mute(ch, c.unlockAt != nil)) }
        for ch in [Channel.drums, .bass, .keys, .horns] where !channels.contains(ch) { audio.send(.mute(ch, true)) }
        finish = nil
        wire()
        if let t = content.steps[0].tempo, t != tempo { audio.send(.tempo(Double(t))) }
        if step > 0 { engine.start(step: step) }
        audio.send(.transpose(engine.step.transpose ?? 0))
        applyBand()
        publish()
    }

    /// A step that names its band (the scales over the drums alone, a jam over the whole band)
    /// mutes the rest; a step without one keeps the module's unlock state.
    private func applyBand() {
        guard let band = engine.step.band else { return }
        for (i, c) in content.channels.enumerated() { audio.send(.mute(channels[i], !band.contains(c.channel))) }
    }

    /// Play mode: the jam under a lesson that is done, from its intro.
    func start(jam j: Lesson.JamSpec) {
        guard j.after <= lessonsDone, let i = content.stepIndex(ofJam: j) else { return }
        restartLesson(at: i)
    }

    /// Lessons of the module finished: the record, or for records from before lessons existed,
    /// what the highest step reached says.
    var lessonsDone: Int {
        let r = progress.lesson(content.code)
        return max(r.lessonsDone, content.lessonsDone(reachedStep: r.reachedStep))
    }

    /// Lesson `n` (1-based) from its intro: the next one, or one already done, played again.
    func start(lesson n: Int) {
        guard n >= 1, n <= lessonsDone + 1, n <= content.lessons.count else { return }
        restartLesson(at: content.firstStep(ofLesson: n - 1))
    }

    /// The engine's output to the screen; a new step, and a lesson just finished, are written
    /// to progress on the way.
    private func publish() {
        let out = engine.output
        if out.step != lesson.step {
            // A jam's step sits past the lessons' steps: reaching it says nothing about them.
            if !out.jam { progress.reached(step: out.step, in: content.code) }
            applyBand()
        }
        if let c = out.complete, c != lesson.complete { progress.lessonDone(c.number, in: content.code) }
        if out != lesson { lesson = out }
    }

    func continueCard() {
        engine.continueCard()
        publish()
    }

    /// Steps wait on their intro and on Lesson complete, except under DEBUG autoplay, which
    /// plays the lesson through by itself.
    static var gated: Bool {
        #if DEBUG
        if UserDefaults.standard.string(forKey: "Autoplay") != nil { return false }
        #endif
        return true
    }

    #if DEBUG
    func debugComplete() {
        engine.debugComplete()
        publish()
    }
    #endif

    /// The intro's Start: the step begins from the top, after the count-in.
    func beginStep() {
        if demo { endDemo(stop: false) }
        demoEnded = false
        engine.begin()
        publish()
        fromTheTop()
    }

    /// Lesson complete's button: the next step (a card shows itself; a play step starts from
    /// the top, after the count-in).
    func nextStep() {
        demoEnded = false
        engine.advance()
        publish()
        if lesson.stepKind != .card { fromTheTop() }
    }

    private func fromTheTop() {
        audio.send(.stop)
        if Self.countInOn { audio.send(.countIn(beats: 4)) }
        audio.send(.play)
    }

    /// Play from the top of a lesson clicks four beats in first (Settings → Count-in); resuming
    /// from a pause doesn't.
    func togglePlay() {
        demoEnded = false
        if !playing && inLesson && calibration == nil && Self.countInOn && audio.snapshot().anchor.tick == 0 {
            audio.send(.countIn(beats: 4))
        }
        audio.send(playing ? .pause : .play)
    }

    func stop() {
        audio.send(.stop)
    }

    func nudgeTempo(_ delta: Int) {
        let base = pendingTempo ?? tempo
        let next = min(Self.tempoRange.upperBound, max(Self.tempoRange.lowerBound, base + delta))
        audio.send(.tempo(Double(next)))
    }

    func toggleMute(_ channel: Channel) {
        let isMuted = muted & channel.bit != 0 && pendingUnmute & channel.bit == 0
        audio.send(.mute(channel, !isMuted))
    }

    func press(_ note: Int, velocity: Float = 0.8) {
        guard !pressed.contains(note) else { return }
        let now = mach_absolute_time()
        pressed.insert(note)
        audio.send(.noteOn(note: note, velocity: velocity, hostTime: now))
        score(note, hostTime: now, velocity: velocity)
    }

    func release(_ note: Int) {
        guard pressed.remove(note) != nil else { return }
        let now = mach_absolute_time()
        audio.send(.noteOff(note: note, hostTime: now))
        scoreRelease(note, hostTime: now)
    }

    /// Tap mode (a phone with no keyboard): a finger down plays the notes due nearest it, a
    /// whole chord on one finger, scored like keys pressed then; lifting it lets them go.
    @ObservationIgnored private var taps: [Int: [Int]] = [:]

    func tapDown(_ touch: Int) {
        let s = audio.snapshot()
        let clock = TransportClock(s)
        guard clock.valid else { return }
        let p = clock.position(atHost: shifted(mach_absolute_time(), clock))
        let due: [Int]
        if let game, inGame {
            due = s.epoch == gameEpoch ? game.due(at: p.tick, msPerTick: p.msPerTick) : []
        } else {
            due = inLesson && !demo ? engine.due(at: p.tick) : []
        }
        let fresh = due.filter { !pressed.contains($0) }
        taps[touch] = fresh
        for n in fresh { press(n) }
    }

    func tapUp(_ touch: Int) {
        for n in taps.removeValue(forKey: touch) ?? [] { release(n) }
    }

    /// Computer keyboard: semitone 0 = C3 shifted by the octave.
    func key(_ semitone: Int, down: Bool) {
        let note = 48 + 12 * octave + semitone
        if down { press(note) } else { release(note) }
    }

    func shiftOctave(_ delta: Int) {
        octave = min(2, max(-2, octave + delta))
    }

    /// A press reaches the lesson at the transport position heard when it happened, moved by
    /// the calibration (autoplay's presses are exact and aren't). During a calibration it is a tap.
    private func score(_ note: Int, hostTime: UInt64, velocity: Float = 0.8, calibrated: Bool = true) {
        let s = audio.snapshot()
        let clock = TransportClock(s)
        guard clock.valid else { return }
        if var c = calibration {
            guard s.epoch == calibrationEpoch else { return }
            let p = clock.position(atHost: hostTime)
            let before = c.taps.count
            c.tap(tick: p.tick, msPerTick: p.msPerTick)
            calibration = c
            if c.taps.count > before, let t = c.taps.last { logTap(t, base: c.base) }
            return
        }
        if let game, inGame {
            guard s.epoch == gameEpoch else { return }
            let p = clock.position(atHost: calibrated ? shifted(hostTime, clock) : hostTime)
            game.played(note: note, tick: p.tick, msPerTick: p.msPerTick)
            return
        }
        // Show me: your keys sound along with it, nothing is scored.
        guard inLesson, !demo else { return }
        let p = clock.position(atHost: calibrated ? shifted(hostTime, clock) : hostTime)
        engine.played(note: note, tick: p.tick, msPerTick: p.msPerTick, epoch: s.epoch, velocity: velocity)
        Self.dump(String(format: "press %d tick %.1f (bar %d beat %.2f) epoch %d calibrated %@ step %d now %@",
                         note, p.tick, Int(p.tick / Double(4 * audio.band.ticksPerBeat)) + 1,
                         (p.tick.truncatingRemainder(dividingBy: Double(4 * audio.band.ticksPerBeat))) / Double(audio.band.ticksPerBeat) + 1,
                         s.epoch, calibrated ? "yes" : "no", engine.output.step, engine.output.nowNotes.sorted().description))
    }

    private func scoreRelease(_ note: Int, hostTime: UInt64, calibrated: Bool = true) {
        guard inLesson, calibration == nil, !demo else { return }
        let s = audio.snapshot()
        let clock = TransportClock(s)
        guard clock.valid else { return }
        let p = clock.position(atHost: calibrated ? shifted(hostTime, clock) : hostTime)
        engine.released(note: note, tick: p.tick, epoch: s.epoch)
    }

    /// A press `inputOffsetMs` early (negative) is placed that much later.
    private func shifted(_ hostTime: UInt64, _ clock: TransportClock) -> UInt64 {
        let delta = Int64((-Self.inputOffsetMs / 1000 * clock.hostTicksPerSecond).rounded())
        return UInt64(max(0, Int64(hostTime) + delta))
    }

    // MARK: Calibration

    /// The band stops and steps out; a cross-stick clicks every beat at 90, beat 1 louder, until
    /// the screen is left. Afterwards the band comes back as it was.
    func startCalibration() {
        let s = audio.snapshot()
        if bandBeforeCalibration == nil { bandBeforeCalibration = (playing, tempo, s.muted) }
        calibrationEpoch = s.epoch + 1
        let c = Calibration(firstTick: Double(2 * audio.band.ticksPerBeat), ticksPerBeat: audio.band.ticksPerBeat,
                            base: Self.inputOffsetMs)
        audio.send(.stop)
        for ch in [Channel.drums, .bass, .keys, .horns] { audio.send(.mute(ch, true)) }
        audio.send(.tempo(Double(Calibration.tempo)))
        audio.send(.play)
        calibration = c
        calibrationClick = nil
        clicksSent = 0
        sendClicks(through: 7)
        lessonLog.info("calibration started from \(String(format: "%+.1f ms", Self.inputOffsetMs), privacy: .public)")
    }

    private func sendClicks(through k: Int) {
        guard let c = calibration else { return }
        while clicksSent <= k {
            audio.send(.click(tick: c.clickTick(clicksSent), velocity: clicksSent % 4 == 0 ? 1 : 0.7))
            clicksSent += 1
        }
    }

    /// Every scored press and every verdict, to Documents/lesson-log.txt in the app's container,
    /// so a real session can be read back afterwards (the unified log drops info lines).
    static func dump(_ line: String) {
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let url = dir.appendingPathComponent("lesson-log.txt")
        let stamped = ISO8601DateFormatter().string(from: Date()) + " " + line + "\n"
        if !FileManager.default.fileExists(atPath: url.path) { try? "".write(to: url, atomically: true, encoding: .utf8) }
        guard let h = try? FileHandle(forWritingTo: url) else { return }
        h.seekToEndOfFile()
        h.write(Data(stamped.utf8))
        try? h.close()
    }

    /// Every counted tap, raw and corrected, to the log and to Documents/calibration-taps.csv, so a
    /// real session can be read back afterwards.
    private func logTap(_ t: (click: Int, ms: Double), base: Double) {
        let line = String(format: "%@,%d,%.1f,%.1f,%.1f\n", ISO8601DateFormatter().string(from: Date()), t.click, t.ms + base, t.ms, base)
        lessonLog.notice("calibration tap: \(line, privacy: .public)")
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let url = dir.appendingPathComponent("calibration-taps.csv")
        if !FileManager.default.fileExists(atPath: url.path) {
            try? "time,click,raw_ms,corrected_ms,base_ms\n".write(to: url, atomically: true, encoding: .utf8)
        }
        guard let h = try? FileHandle(forWritingTo: url) else { return }
        h.seekToEndOfFile()
        h.write(Data(line.utf8))
        try? h.close()
    }

    /// Use this: the steady lean goes into the saved correction, and the needle starts over from it.
    func useCalibration() {
        guard var c = calibration, let offset = c.proposed else { return }
        let taps = c.recent.map { String(format: "%+.1f", $0) }.joined(separator: " ")
        lessonLog.info("calibration: [\(taps, privacy: .public)] from \(String(format: "%+.1f", c.base), privacy: .public) → \(String(format: "%+.1f ms", offset), privacy: .public)")
        UserDefaults.standard.set(offset, forKey: "inputOffsetMs")
        UserDefaults.standard.set(true, forKey: "calibrated")
        c.rebase(offset)
        calibration = c
    }

    /// Leaves the calibration screen: the band as it was, and the first-lesson question answered.
    func endCalibration() {
        if calibration != nil { restoreBand() }
        UserDefaults.standard.set(true, forKey: "calibrated")
        calibration = nil
        calibrationClick = nil
    }

    private func restoreBand() {
        guard let b = bandBeforeCalibration else { return }
        bandBeforeCalibration = nil
        audio.send(.stop)
        for ch in [Channel.drums, .bass, .keys, .horns] { audio.send(.mute(ch, b.muted & ch.bit != 0)) }
        audio.send(.tempo(Double(b.tempo)))
        if b.playing { audio.send(.play) }
    }

    // MARK: Quizzes

    @ObservationIgnored private var bandWasPlaying: Bool?

    /// A quiz needs quiet: the band pauses, and comes back as it was after.
    func holdBand() {
        guard bandWasPlaying == nil else { return }
        bandWasPlaying = playing
        if playing { audio.send(.pause) }
    }

    func releaseBand() {
        guard let was = bandWasPlaying else { return }
        bandWasPlaying = nil
        if was && !playing { audio.send(.play) }
    }

    /// A question's sound on the piano: a chord struck together, or notes one after another.
    func play(_ sound: Question.Sound) {
        let notes: [(note: Int, at: Double, length: Double)]
        switch sound {
        case .chord(let n): notes = n.map { ($0, 0, 1.8) }
        case .notes(let n): notes = n.enumerated().map { ($1, Double($0) * 0.75, 0.65) }
        }
        for n in notes {
            DispatchQueue.main.asyncAfter(deadline: .now() + n.at) { [audio] in
                audio.send(.noteOn(note: n.note, velocity: 0.7, hostTime: 0))
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + n.at + n.length) { [audio] in
                audio.send(.noteOff(note: n.note, hostTime: 0))
            }
        }
    }

    // MARK: Show me

    /// The step can be played for you: a play step (an intro's too), not a card, not Lesson
    /// complete, not the result.
    var canDemo: Bool {
        engine.step.kind != .card && !engine.expected.isEmpty && finish == nil && lesson.complete == nil
    }

    /// Show me: the step from the top at the knob's tempo, every note on the monitor, the keys
    /// and the hand following; again while it plays stops it (your turn).
    func toggleDemo() {
        if demo { endDemo(stop: true) } else { startDemo() }
    }

    private func startDemo() {
        guard canDemo else { return }
        let plan = Demo.plan(expected: engine.expected, loopTicks: engine.loopTicks,
                             ticksPerBar: 4 * audio.band.ticksPerBeat, cycle: engine.step.cycle)
        demoEpoch = audio.snapshot().epoch + 1
        demoEnd = plan.endTicks
        demoPresses = plan.presses
        demoReleases.removeAll()
        demo = true
        demoEnded = false
        fromTheTop()
        for p in plan.presses {
            audio.send(.schedule(note: p.note, velocity: p.velocity, tick: p.tick, lengthTicks: p.lengthTicks))
        }
        lessonLog.info("show me: \(plan.presses.count) notes over \(Int(plan.endTicks)) ticks")
    }

    /// `stop`: the band stops here (the demo ran out, or was clicked off); stopped by you, it
    /// already has.
    private func endDemo(stop: Bool) {
        guard demo else { return }
        demo = false
        demoEnded = true
        for r in demoReleases { pressed.remove(r.note) }
        demoReleases.removeAll()
        demoPresses.removeAll()
        if stop { audio.send(.stop) }
        lessonLog.info("show me: over")
    }

    /// Lights each key as its note is heard, lets go at its length, and ends at the last bar.
    private func runDemo(heard: TransportClock.Position, epoch: Int) {
        if epoch > demoEpoch {
            // Stop (yours) dropped the scheduled notes.
            endDemo(stop: false)
            return
        }
        guard epoch == demoEpoch else { return }
        if heard.tick >= demoEnd {
            endDemo(stop: true)
            return
        }
        while let i = demoPresses.firstIndex(where: { $0.tick <= heard.tick }) {
            let p = demoPresses.remove(at: i)
            pressed.insert(p.note)
            demoReleases.append((p.note, p.tick + p.lengthTicks))
        }
        while let i = demoReleases.firstIndex(where: { $0.tick <= heard.tick }) {
            pressed.remove(demoReleases.remove(at: i).note)
        }
    }

    // MARK: Stage

    /// A song from the top: its band with your keys on the part's instrument, the part's
    /// channel out, the song's tempo, four clicks in. The lesson's band comes back with `endGame`.
    func startGame(song: Song, part: Song.PartKey, difficulty: GameEngine.Difficulty) {
        if demo { endDemo(stop: false) }
        gameDifficulty = difficulty
        gameResult = nil
        lastRun = nil
        let partChannel = song.channel(of: part)
        chorusBars = audio.load(song: song, part: part).chorusBars
        gameEpoch = audio.snapshot().epoch + 1
        game = GameEngine(song: song, part: part, difficulty: difficulty,
                          start: GameEngine.adaptiveStart(song: song.name, part: part, records: progress.scores(song: song.name)))
        audio.send(.stop)
        audio.send(.transpose(0))
        audio.send(.silence(from: 0, to: 0))
        for ch in [Channel.drums, .bass, .keys, .horns] { audio.send(.mute(ch, ch == partChannel)) }
        audio.send(.tempo(Double(song.meta.tempo)))
        audio.send(.countIn(beats: 4))
        audio.send(.play)
        pressed.removeAll()
        lessonLog.info("stage: \(song.meta.title, privacy: .public) · \(part.rawValue, privacy: .public) · \(difficulty.rawValue, privacy: .public)")
    }

    /// The same song, part and level again.
    func restartGame() {
        guard let g = game else { return }
        startGame(song: g.song, part: g.part, difficulty: gameDifficulty)
    }

    /// Back to the lessons: the module's band, where the lesson was.
    func endGame() {
        guard game != nil else { return }
        game = nil
        gameResult = nil
        chorusBars = audio.load(band: content.band).chorusBars
        resume()
    }

    /// Every frame of a run: the engine hears the tick; the end stops the band and puts the run
    /// on the board; Stop (a new epoch) starts the song over.
    private func runGame(_ clock: TransportClock, heard: TransportClock.Position, epoch: Int) {
        guard let game else { return }
        if epoch > gameEpoch {
            // Your Stop starts the song over; the stop at the finish line leaves the result up.
            if gameResult == nil { restartGame() }
            return
        }
        guard epoch == gameEpoch else { return }
        game.heard(tick: heard.tick, msPerTick: heard.msPerTick)
        #if DEBUG
        runGameAutoplay(clock, heard: heard)
        runGameAutoTap(heard)
        #endif
        if game.finished, gameResult == nil {
            let r = game.result()
            gameResult = r
            audio.send(.stop)
            if !ProgressStore.readOnly { lastRun = progress.record(run: r) }
            lessonLog.info("stage: \(r.grade, privacy: .public) \(r.score) · \(r.perfect)/\(r.good)/\(r.missed) · combo \(r.maxCombo)")
        }
    }

    #if DEBUG
    /// `-Autoplay perfect|loose|rush` on a song: the chart's notes a bar ahead on the monitor,
    /// scored through the press path as they are heard (the checks and the screenshots).
    @ObservationIgnored private var gamePlanned = -1
    @ObservationIgnored private var gameAutoEpoch = -1
    @ObservationIgnored private var gamePresses: [Autoplay.Press] = []
    @ObservationIgnored private var gameReleases: [(note: Int, tick: Double)] = []
    private func runGameAutoplay(_ clock: TransportClock, heard: TransportClock.Position) {
        guard let game, let mode = autoplayMode, heard.rolling else { return }
        if gameAutoEpoch != gameEpoch {
            gameAutoEpoch = gameEpoch
            gamePlanned = -1
            gamePresses.removeAll()
            gameReleases.removeAll()
        }
        let horizon = Int(heard.tick) + 4 * audio.band.ticksPerBeat
        if horizon > gamePlanned {
            for (_, n, _) in game.notes(from: Double(gamePlanned + 1), to: Double(horizon)) {
                let offset: Double = mode == .rush ? -140 : mode == .loose ? Double((n.t * 7919) % 81) - 40 : 0
                let p = Autoplay.Press(note: n.n, velocity: 0.75, tick: Double(n.t) + offset / heard.msPerTick,
                                       lengthTicks: Double(n.len) * 0.9)
                audio.send(.schedule(note: p.note, velocity: p.velocity, tick: p.tick, lengthTicks: p.lengthTicks))
                gamePresses.append(p)
            }
            gamePlanned = horizon
        }
        while let i = gamePresses.firstIndex(where: { $0.tick <= heard.tick }) {
            let p = gamePresses.remove(at: i)
            pressed.insert(p.note)
            gameReleases.append((p.note, p.tick + p.lengthTicks))
            if let host = clock.hostTime(atTick: p.tick) { score(p.note, hostTime: host, velocity: p.velocity, calibrated: false) }
        }
        while let i = gameReleases.firstIndex(where: { $0.tick <= heard.tick }) {
            pressed.remove(gameReleases.remove(at: i).note)
        }
    }

    /// `-AutoTap 1` on a song: one finger taps each chord the frame it is heard, through the
    /// tap path (the tap-mode check).
    @ObservationIgnored private var autoTapDown = false
    private func runGameAutoTap(_ heard: TransportClock.Position) {
        guard let game, UserDefaults.standard.bool(forKey: "AutoTap"), heard.rolling else { return }
        if autoTapDown {
            tapUp(0)
            autoTapDown = false
            return
        }
        let reach = GameEngine.goodMs / heard.msPerTick
        if game.notes(from: heard.tick - reach, to: heard.tick).contains(where: { $0.status == .pending }) {
            tapDown(0)
            autoTapDown = true
        }
    }
    #endif

    /// What the game screen draws, this frame.
    func gameState() -> GameState {
        guard let game else { return GameState() }
        let s = audio.snapshot()
        let clock = TransportClock(s)
        let heard = clock.valid ? clock.position(atHost: mach_absolute_time()) : nil
        let tick = s.epoch == gameEpoch ? (heard?.tick ?? 0) : 0
        let msPerTick = 60000 / (Double(game.song.meta.tempo) * Double(game.ticksPerBeat))
        let lookahead = GameState.lookaheadSeconds * 1000 / msPerTick
        let cue = game.cue(at: tick, msPerTick: msPerTick)
        let bar = max(0, Int((tick / Double(game.ticksPerBar)).rounded(.down)))
        let song = game.song
        let visible = game.notes(from: tick - Double(game.ticksPerBeat), to: tick + lookahead).map {
            GameState.HighwayNote(id: $0.index, note: $0.note.n, tick: Double($0.note.t), length: Double($0.note.len),
                                  status: $0.status, finger: $0.note.f)
        }
        return GameState(
            title: song.meta.title, style: song.meta.style, part: game.part, partTitle: song.part(game.part).title,
            difficulty: game.difficulty, level: game.level, tiers: game.tiers, section: song.section(atBar: min(bar, song.bars - 1)),
            chord: song.chord(atBar: min(bar, song.bars - 1)),
            nextChord: bar + 1 < song.bars ? song.chord(atBar: bar + 1) : "",
            bar: min(bar, song.bars - 1), bars: song.bars, beat: beat,
            score: game.score, combo: game.combo, maxCombo: game.maxCombo, multiplier: game.multiplier,
            accuracy: game.accuracy, progress: min(1, max(0, tick / Double(song.bars * game.ticksPerBar))),
            countIn: countIn, playing: playing, pop: game.pop,
            heardTick: tick, lookaheadTicks: lookahead, ticksPerBeat: game.ticksPerBeat, ticksPerBar: game.ticksPerBar,
            notes: visible, keys: song.keyboard(game.part), nowNotes: cue.now, nextNotes: cue.next,
            pressedNotes: pressed, fingers: cue.fingers, nowFingers: cue.nowFingers, nextFinger: cue.nextFingers.min(),
            rightHand: game.part == .melody, result: gameResult, lastRun: lastRun,
            board: progress.scores(song: song.name), sections: song.meta.sections)
    }

    // MARK: Play it back

    /// The payoff chorus again, from the top, with the band (out for the same bars) and your
    /// notes on the monitor as you played them.
    func playBack(_ f: LessonEngine.Finish) {
        let tpb = Double(audio.band.ticksPerBeat)
        playbackEpoch = audio.snapshot().epoch + 1
        audio.send(.stop)
        audio.send(.tempo(Double(f.tempo)))
        audio.send(.play)
        if let first = f.aloneBars.min(), let last = f.aloneBars.max() {
            audio.send(.silence(from: Double(first * 4) * tpb, to: Double((last + 1) * 4) * tpb))
        }
        for p in f.presses {
            audio.send(.schedule(note: p.note, velocity: p.velocity, tick: max(0, p.tick), lengthTicks: p.lengthTicks))
        }
        lessonLog.info("play it back: \(f.presses.count) notes at \(f.tempo)")
    }

    /// The transport tick heard now, while the recorded chorus plays back.
    func playbackTick() -> Double? {
        let s = audio.snapshot()
        guard s.epoch == playbackEpoch else { return nil }
        let clock = TransportClock(s)
        guard clock.valid else { return nil }
        return clock.position(atHost: mach_absolute_time()).tick
    }

    // MARK: Engine → UI

    fileprivate func refresh() {
        let s = audio.snapshot()
        let clock = TransportClock(s)
        if s.playing != playing { playing = s.playing }
        let t = Int(s.tempo.rounded())
        if t != tempo { tempo = t }
        let p = s.pendingTempo > 0 ? Int(s.pendingTempo.rounded()) : nil
        if p != pendingTempo { pendingTempo = p }
        if s.muted != muted { muted = s.muted }
        if s.pendingUnmute != pendingUnmute { pendingUnmute = s.pendingUnmute }
        // Meter: 12 segments over -42...0 dBFS.
        let m = [Channel.drums, .bass, .keys, .horns].map { c in
            min(12, max(0, Int((s.level(c) + 42) / 3.5)))
        }
        if m != meters { meters = m }
        guard clock.valid else { return }
        if let e = playbackEpoch, s.epoch > e { playbackEpoch = nil }

        // The position the speaker is playing now: the pads, the LEDs and the lesson follow it.
        let heard = clock.position(atHost: mach_absolute_time())
        let tpb = Double(audio.band.ticksPerBeat)
        // The count-in runs before tick 0: bar 1, and its own beat number.
        let counting = heard.tick < 0 && heard.rolling ? 4 + Int((heard.tick / tpb).rounded(.down)) + 1 : nil
        if counting != countIn { countIn = counting }
        let beats = max(0, Int((heard.tick / tpb).rounded(.down)))
        let bars = chorusBars
        if beats / 4 % bars != bar { bar = beats / 4 % bars }
        if beats % 4 != beat { beat = beats % 4 }
        if beats / 4 / bars != chorus { chorus = beats / 4 / bars }

        if let c = calibration, s.epoch == calibrationEpoch {
            let k = c.click(at: heard.tick)
            if k != calibrationClick { calibrationClick = k }
            sendClicks(through: (k ?? 0) + 8)
            #if DEBUG
            // `-CalibrateTapsEarly <ms>`: a tap that early (raw) at each click, through the press path
            // (a launch argument can't start with a minus).
            if UserDefaults.standard.object(forKey: "CalibrateTapsEarly") != nil, let k, k + 1 >= Calibration.listen {
                let ms = -UserDefaults.standard.double(forKey: "CalibrateTapsEarly")
                for j in max(Calibration.listen, k - 1)...(k + 1) where c.taps.last.map({ $0.click < j }) ?? true {
                    let at = c.clickTick(j) + ms / heard.msPerTick
                    if at <= heard.tick, at > heard.tick - 6, let host = clock.hostTime(atTick: at) { score(60, hostTime: host, calibrated: false) }
                }
            }
            #endif
        }
        if playbackEpoch == s.epoch, heard.tick >= Double(engine.loopTicks) { playbackEpoch = nil }
        heardTick = heard.tick
        if demo { runDemo(heard: heard, epoch: s.epoch) }
        if game != nil { runGame(clock, heard: heard, epoch: s.epoch) }

        // The frame first, then the presses heard by now: the engine learns the epoch (and judges
        // a finished chorus) before a press of the new chorus arrives.
        engine.heard(tick: heard.tick, tempo: heard.tempo, rolling: heard.rolling, epoch: s.epoch)
        #if DEBUG
        runAutoplay(clock, heard: heard, epoch: s.epoch)
        DebugHooks.writeClockIfRequested(clock)
        #endif
        publish()
        #if DEBUG
        DebugHooks.snapshotIfDue(self, tick: heard.tick)
        #endif
    }

    /// Transport position (bar, beat) heard at a host time, for the input log.
    func position(atHostTime host: UInt64) -> String {
        let clock = TransportClock(audio.snapshot())
        guard clock.valid else { return "stopped" }
        let p = clock.position(atHost: host)
        guard p.rolling else { return "stopped" }
        let beats = p.tick / Double(audio.band.ticksPerBeat)
        let barIndex = Int((beats / 4).rounded(.down))
        let bars = audio.band.chorusBars
        return String(format: "chorus %d bar %d beat %.3f", barIndex / bars + 1, barIndex % bars + 1,
                      beats - Double(barIndex * 4) + 1)
    }

    // MARK: Autoplay (DEBUG)

    #if DEBUG
    var autoplayMode: Autoplay.Mode? {
        didSet {
            autoplay = autoplayMode.map { Autoplay(mode: $0, plannedThrough: heardTick - 0.01) }
            lessonLog.info("autoplay \(self.autoplayMode?.rawValue ?? "off", privacy: .public)")
        }
    }
    @ObservationIgnored private var autoplay: Autoplay?
    /// Scheduled on the monitor, not yet heard.
    @ObservationIgnored private var autoPresses: [Autoplay.Press] = []
    @ObservationIgnored private var autoReleases: [(note: Int, tick: Double)] = []
    @ObservationIgnored private var autoEpoch = 0

    /// Plans a bar ahead, schedules the presses on the monitor, and hands each one to the
    /// lesson when it is heard, at the host time it is heard (the same path as a key press).
    private func runAutoplay(_ clock: TransportClock, heard: TransportClock.Position, epoch: Int) {
        if epoch != autoEpoch {
            // Stopped: the renderer dropped what was scheduled; start over from here.
            autoEpoch = epoch
            autoPresses.removeAll()
            for r in autoReleases { pressed.remove(r.note) }
            autoReleases.removeAll()
            autoplay?.plannedThrough = heard.tick - 0.01
        }
        if var plan = autoplay, heard.rolling, inLesson, !engine.expected.isEmpty, !lesson.passed, !lesson.finished {
            let ahead = plan.plan(through: heard.tick + Double(4 * audio.band.ticksPerBeat), expected: engine.expected,
                                  loopTicks: engine.loopTicks, msPerTick: heard.msPerTick)
            autoplay = plan
            for p in ahead {
                audio.send(.schedule(note: p.note, velocity: p.velocity, tick: p.tick, lengthTicks: p.lengthTicks))
            }
            autoPresses += ahead
        }
        while let i = autoPresses.firstIndex(where: { $0.tick <= heard.tick }) {
            let p = autoPresses.remove(at: i)
            pressed.insert(p.note)
            autoReleases.append((p.note, p.tick + p.lengthTicks))
            if let host = clock.hostTime(atTick: p.tick) { score(p.note, hostTime: host, velocity: p.velocity, calibrated: false) }
        }
        while let i = autoReleases.firstIndex(where: { $0.tick <= heard.tick }) {
            let r = autoReleases.remove(at: i)
            pressed.remove(r.note)
            if let host = clock.hostTime(atTick: r.tick) { scoreRelease(r.note, hostTime: host, calibrated: false) }
        }
    }
    #endif

    // MARK: LessonState

    func lessonState() -> LessonState {
        var strips: [ChannelState] = []
        let band = engine.step.band
        for (i, c) in content.channels.enumerated() {
            // A step that names its band shows those channels alone, all open.
            if let band, !band.contains(c.channel) { continue }
            let ch = channels[i]
            let unlocked = c.unlockAt == nil || lesson.unlocked.contains(i) || band != nil
            let isMuted = muted & ch.bit != 0
            strips.append(ChannelState(name: c.name, unlocked: unlocked, unlockAt: band == nil ? c.unlockAt : nil,
                                       level: unlocked && !isMuted ? meters[ch.rawValue] : 0,
                                       muted: isMuted, pendingUnmute: pendingUnmute & ch.bit != 0, index: i))
        }
        // Show me: the keys and the hand follow the transport whether or not the step is
        // scoring (an intro's demo), and the coach line is the demo's.
        let cue = demo ? engine.cue(at: heardTick) : nil
        let coach = demo ? (countIn != nil ? "Watch and listen." : lesson.coach)
                  : demoEnded && !playing ? "Your turn." : lesson.coach
        return LessonState(
            code: content.code,
            title: content.title,
            step: lesson.step,
            stepCount: lesson.stepCount,
            stepTitle: lesson.stepTitle,
            card: lesson.card,
            tempo: tempo,
            pendingTempo: pendingTempo,
            playing: playing,
            form: form,
            bar: bar,
            beat: beat,
            chorus: chorus + 1,
            cleanChoruses: lesson.clean,
            gate: lesson.gate,
            channels: strips,
            coach: coach,
            lastChorus: lesson.lastChorus,
            lastChorusDetail: lesson.lastChorusDetail,
            lastNote: lesson.lastNote,
            countIn: countIn,
            moduleTitle: content.module.title,
            lesson: lesson.lesson,
            lessonCount: lesson.lessonCount,
            lessonTitle: lesson.lessonTitle,
            goal: lesson.goal,
            intro: lesson.intro,
            complete: lesson.complete,
            fingers: cue?.fingers ?? lesson.fingers,
            nowNote: cue?.nowNote ?? lesson.nowNote,
            nextNote: cue?.nextNote ?? lesson.nextNote,
            nowNotes: cue?.nowNotes ?? lesson.nowNotes,
            nextNotes: cue?.nextNotes ?? lesson.nextNotes,
            pressedNotes: pressed,
            run: runState(nowIndex: cue?.nowIndex ?? lesson.nowIndex),
            jam: lesson.jam,
            theme: lesson.theme,
            handFingers: lesson.handFingers,
            rightHand: lesson.rightHand,
            stepTempo: lesson.stepTempo,
            demo: demo,
            canDemo: canDemo
        )
    }

    /// A scale step's run for the screen: the cycle's notes in order, the one being played
    /// (from the engine's index into the chorus), whether this bar is the hold, and the pass.
    private func runState(nowIndex: Int?) -> LessonState.Run? {
        let step = engine.step
        guard let cycle = step.cycle, let pattern = step.pattern, !pattern.isEmpty, step.kind != .card else { return nil }
        let one = content.expected(step, ticksPerBeat: audio.band.ticksPerBeat).prefix(pattern.count)
        let notes = one.map { LessonState.Run.Note(key: $0.display, finger: $0.finger ?? 0) }
        let resting = !pattern.contains { ($0.bar ?? 0) == bar % cycle }
        let name = step.key ?? content.key ?? ""
        return LessonState.Run(name: name, notes: Array(notes),
                               index: nowIndex.map { $0 % notes.count },
                               resting: resting,
                               number: bar / cycle + 1, count: max(1, form.count / cycle),
                               right: step.hand == "right", flats: name.hasSuffix("blues"))
    }
}

/// CADisplayLink retains its target; this keeps the Player out of that cycle.
private final class LinkTarget: NSObject {
    weak var player: Player?
    init(_ player: Player) { self.player = player }
    @objc func tick() { player?.refresh() }
}
