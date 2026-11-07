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
    var pressed: Set<Int> = []
    private(set) var midiSources: [String] = []
    /// Computer-keyboard octave shift (Z / X), -2...2 around C3.
    private(set) var octave = 0
    private(set) var lesson = LessonEngine.Output()
    /// The finished payoff chorus: the result screen.
    private(set) var finish: LessonEngine.Finish?
    /// Presses are scored only while the lesson screen is up; elsewhere they just sound.
    var inLesson = false
    /// The calibration under way, and the click being heard.
    var calibration: Calibration?
    var calibrationClick: Int?
    /// The count-in's beat (1–4) while it plays, before bar 1.
    private(set) var countIn: Int?
    /// Play it back: the transport epoch the recorded chorus is playing in (it starts at tick 0).
    var playbackEpoch: Int?
    /// Show me: the step is being played for you (Demo.swift); and it just ended, your turn.
    var demo = false
    var demoEnded = false
    /// Stage: the song under way, its part, and the run's result once it ends.
    var game: GameEngine?
    var gameResult: GameEngine.Result?
    var lastRun: ProgressStore.ScoreRecord?
    /// Presses go to the game only on the game screen.
    var inGame = false

    @ObservationIgnored let audio: AudioEngine
    @ObservationIgnored private(set) var content: Lesson
    /// The lesson's channel strips, in order, as mixer channels.
    @ObservationIgnored private(set) var channels: [Channel]
    @ObservationIgnored var engine: LessonEngine
    @ObservationIgnored let progress: ProgressStore
    /// The current step's form (a minor-key lesson has its own).
    var form: [FormBar] { content.formBars(of: engine.step) }
    @ObservationIgnored private let midi = MIDIInput()
    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "input")
    @ObservationIgnored let lessonLog = Logger(subsystem: "takt", category: "lesson")
    /// The transport tick heard at the last display frame.
    @ObservationIgnored var heardTick = 0.0
    /// Tap mode (a phone with no keyboard): the notes each finger (by id) holds down.
    @ObservationIgnored private var taps: [Int: [Int]] = [:]
    /// Computer keyboard: the notes each key (by semitone) holds down.
    @ObservationIgnored private var keyNotes: [Int: [Int]] = [:]

    // The state of the Player's other files (Player+*.swift): stored here because an extension
    // cannot hold it, open to them because `private` is the file. The screens only read it.

    // Player+Improv: what you've played on this improv so far (`Improv.Recorder`); `takeNotes`
    // for the screen; your presses on the teacher's version this transport epoch, for its highway.
    @ObservationIgnored var recorder = Improv.Recorder()
    var takeNotes = 0
    @ObservationIgnored var versionPresses: [(tick: Double, note: Int)] = []
    @ObservationIgnored var versionEpoch = -1
    /// The module before the teacher's idea was added to it (`startVersion`, `dropVersion`).
    @ObservationIgnored private var versionBase: Lesson?
    /// The band in the engine: the module's file, or the step's backing (a Stage song looping
    /// by the step's form, for an improv), straight or as written. Swapped only when that
    /// changes (a step's feel or backing, another module, back from the Stage).
    @ObservationIgnored var loadedBand: (name: String, straight: Bool)?

    // Player+Calibration: the click being heard, the band as it was, and a quiz's hold on it.
    @ObservationIgnored var calibrationEpoch = 0
    /// Clicks sent to the engine so far; the tick loop keeps a bar ahead of the one heard.
    @ObservationIgnored var clicksSent = 0
    @ObservationIgnored var bandBeforeCalibration: (playing: Bool, tempo: Int, muted: UInt8)?
    @ObservationIgnored var bandWasPlaying: Bool?

    // Player+Demo: Show me's epoch, where it ends, and its presses not yet heard.
    @ObservationIgnored var demoEpoch = 0
    @ObservationIgnored var demoEnd = 0.0
    @ObservationIgnored var demoQueue = PressQueue()

    // Player+Stage: the run's epoch, the record's fills, the level, and practice's hold.
    /// Practice, inside a run (0.1 (61)): the band from any bar, nothing scored.
    var practice = false
    /// The knob on the Stage (0.1 (103)): the band at this fraction of the song's tempo, half
    /// to full, in a run and in practice alike. Under full speed a run is practice: it ends on
    /// its result, but goes on no board and clears no goal.
    var gameSpeed = 1.0
    /// Bars in the loaded band's chorus (the lesson's form, or a whole song).
    @ObservationIgnored var chorusBars: Int
    @ObservationIgnored var gameEpoch = 0
    /// The record fills what the level leaves out: the part's notes the tier doesn't ask for are
    /// scheduled on the part's instrument a bar ahead, at the band's own velocity, so a low level
    /// still sounds like the song and the player plays a part of it (Guitar Hero's rule).
    @ObservationIgnored var fillVelocity: [Int: Float] = [:]
    @ObservationIgnored var fillThrough = -1
    @ObservationIgnored var gameDifficulty = GameEngine.Difficulty.adaptive
    /// `practiceTick` is where practice sits while held (observed, so a scrub redraws the
    /// highway); `practiceCountBase` is the tick a practice count-in lands on.
    var practiceTick = 0.0
    @ObservationIgnored var practiceCountBase = 0.0

    // Player+Call: the call under way on the song (Call.swift), the key just played wrong (the
    // HUD, until the right one), the voice, and the timer that says a call again after silence.
    var call: Call.Engine?
    var callWrong: Int?
    @ObservationIgnored var callVoice: CallVoice?
    @ObservationIgnored var callNag: DispatchWorkItem?

    // Player+Reading: the Reading lesson under way (Game/Reading.swift) on the Stage's
    // machinery, its names chip and its gate.
    var reading: ReadingSession?

    #if DEBUG
    // Player+Debug: the autoplays' plans and presses not yet heard.
    var autoplayMode: Autoplay.Mode? {
        didSet {
            autoplay = autoplayMode.map { Autoplay(mode: $0, plannedThrough: heardTick - 0.01) }
            lessonLog.info("autoplay \(self.autoplayMode?.rawValue ?? "off", privacy: .public)")
        }
    }
    @ObservationIgnored var autoplay: Autoplay?
    @ObservationIgnored var autoQueue = PressQueue()
    @ObservationIgnored var autoEpoch = 0
    @ObservationIgnored var gamePlanned = -1
    @ObservationIgnored var gameAutoEpoch = -1
    @ObservationIgnored var gameQueue = PressQueue()
    @ObservationIgnored var autoTapDown = false
    @ObservationIgnored var autoKeysDown: [Int] = []
    @ObservationIgnored var practiceHookDone = false
    /// `-ImprovPlay`: after that many choruses, AppModel sends the take.
    @ObservationIgnored var onImprovDone: (() -> Void)?
    @ObservationIgnored var improvPlayed: [(note: Int, tick: Double, len: Double)] = []
    @ObservationIgnored var improvBegun = false
    @ObservationIgnored var improvPlannedBar = -1
    @ObservationIgnored var improvSent = false
    #endif


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

    /// Settings → Sound → Your instrument (`instrument`: "piano", "organ" or "rhodes"; the
    /// picker since 0.1 (65), piano the default since 0.1 (66), the Rhodes since 0.1 (67)). Piano
    /// is the content's own monitor: the upright in the lessons and the blues, the record's synth
    /// on the electronic tracks. Organ is the sampled Hammond (`organ` in instruments.json,
    /// `scripts/organ.py`) and Rhodes the sampled Mark I (`rhodes73`, `scripts/rhodes.py`),
    /// wherever the content would hand you the piano or its own Rhodes; the electronic tracks
    /// keep their synths either way.
    static var yourInstrument: String? {
        switch UserDefaults.standard.string(forKey: "instrument") ?? "piano" {
        case "organ": return "organ"
        case "rhodes": return "rhodes73"
        default: return nil
        }
    }

    /// Tells the engine which instrument your keys play for the current content.
    func applyInstrument() {
        let monitor = game.map { $0.song.part($0.part).monitor } ?? audio.band.instruments["monitor"] ?? "piano"
        let yours = ["piano", "rhodes"].contains(monitor) ? Self.yourInstrument : nil
        audio.send(.monitor(yours.map { SampledInstrument.shared($0) }))
    }

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
        for ch in Channel.band where !channels.contains(ch) { audio.send(.mute(ch, true)) }
        self.lesson = engine.output
        // The engine opened on the module's band as written (TaktApp).
        loadedBand = (lesson.band, false)
        applyBand()
        applyInstrument()
        wire()
        resume()

        midi.onNote = { [weak self] n in
            guard let self else { return }
            // Straight to the render thread: the monitor must not wait for the main thread.
            self.audio.send(n.on ? .noteOn(note: n.note, velocity: n.velocity, hostTime: n.hostTime)
                                 : .noteOff(note: n.note, hostTime: n.hostTime))
            DispatchQueue.main.async {
                if n.on {
                    CountInLaunch.onHit?(n.hostTime)
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
        engine.onVerdict = { [weak self, lessonLog, progress, code = content.code] v in
            let what: String
            // Play mode: a clean chorus marks the jam done (a free jam's chorus in the scale too);
            // the improv teacher's idea is not a jam of the module, it pays XP instead.
            if let jam = v.jam, jam.hasPrefix(Improv.versionPrefix) {
                let take = String(jam.dropFirst(Improv.versionPrefix.count))
                if let r = v.result, r.hits * 2 >= r.notes.count { progress.award("version·\(take)", kind: "version", points: Improv.XP.version) }
                if v.counted { progress.award("version-clean·\(take)", kind: "version", points: Improv.XP.versionClean) }
            } else if let jam = v.jam, v.counted {
                progress.jamDone(jam, in: code)
            }
            // The plan's goals score themselves off the same verdict.
            self?.onGoalChorus?(code, v)
            if let free = v.free {
                what = "free: \(free.notes) notes, \(free.outside.count) outside, \(v.counted ? "counts" : "doesn't count")"
            } else if let r = v.result {
                let offsets = r.offsets.map { String(format: "%+.1f", $0) }.joined(separator: " ")
                what = "\(r.hits)/\(r.notes.count) hits, \(r.extras.count) extra, mean \(r.meanOffsetMs.map { String(format: "%+.1f", $0) } ?? "-") ms, \(r.clean ? "clean" : "not clean") [\(r.problems.joined(separator: " "))] offsets \(offsets)"
                if let skill = v.skill { progress.record(skill: skill, result: r, tempo: v.tempo, counted: v.counted) }
            } else {
                what = "joined late, not judged"
            }
            lessonLog.info("step \(v.step) chorus \(v.chorus + 1) at \(Int(v.tempo.rounded())): \(what, privacy: .public) · counts \(v.counted) · gate \(v.clean)/\(v.gate) · \"\(v.line, privacy: .public)\"")
            var dumped = "verdict step \(v.step) chorus \(v.chorus + 1) at \(Int(v.tempo.rounded())): \(what) · \"\(v.line)\""
            if let r = v.result {
                let marks: [String] = r.notes.map { "\($0.expected.bar + 1):\($0.expected.display)=\($0.mark)" }
                dumped += " · marks " + marks.joined(separator: " ")
                if !r.extras.isEmpty {
                    let extras: [String] = r.extras.map { "\($0.bar + 1):\($0.note)=\($0.kind)@" + String(format: "%.2f", $0.velocity) }
                    dumped += " · extras " + extras.joined(separator: " ")
                }
            }
            Self.dump(dumped)
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
                if !ProgressStore.readOnly { self.progress.practiced(.lesson, id: "\(self.content.code)·finish") }
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
    func resume() {
        let done = lessonsDone
        if done > 0 && done < content.lessons.count {
            restartLesson(at: content.firstStep(ofLesson: done))
        } else {
            restartLesson()
        }
    }


    /// The teacher's idea as a step over the same backing, from its intro (Show me plays it).
    /// `take` names it (the review's id), so its XP is paid once.
    func startVersion(_ idea: Improv.Review.Idea, take: String) {
        let improv = engine.step
        guard improv.kind == .free else { return }
        if versionBase == nil { versionBase = content }
        let (withIt, i) = content.withVersion(Improv.versionStep(idea, of: improv, take: take), after: improv)
        content = withIt
        restartLesson(at: i)
    }

    /// The module as it was again, the idea's step gone (leaving the lesson screen).
    func dropVersion() {
        guard let base = versionBase else { return }
        versionBase = nil
        content = base
        resume()
    }

    /// Another module: its band (the minor blues beside the shuffle, from the same tick), form,
    /// channels and steps, picked up where it was.
    func switchModule(to lesson: Lesson) {
        versionBase = nil
        guard lesson.code != content.code else { return }
        // Its band comes in with its first step (`restartLesson`, through `resume`).
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
        recorder.reset()
        takeNotes = 0
        loadBand()
        audio.send(.silence(from: 0, to: 0))
        for (c, ch) in zip(content.channels, channels) { audio.send(.mute(ch, c.unlockAt != nil)) }
        for ch in Channel.band where !channels.contains(ch) { audio.send(.mute(ch, true)) }
        finish = nil
        wire()
        if let t = content.steps[0].tempo, t != tempo { audio.send(.tempo(Double(t))) }
        if step > 0 { engine.start(step: step) }
        audio.send(.transpose(engine.step.transpose ?? 0))
        applyBand()
        publish()
    }

    private func loadBand() {
        let step = engine.step
        let want = (name: step.backing ?? content.band, straight: step.straight)
        if let l = loadedBand, l == want { return }
        chorusBars = audio.load(band: want.name, straight: want.straight, loop: step.backing.map { _ in content.form(of: step) }).chorusBars
        loadedBand = want
        lessonLog.info("band \(want.name, privacy: .public) \(want.straight ? "straight" : "as written", privacy: .public)")
        // A backing brings its own instruments: your keys follow it (Blue Lantern's Rhodes).
        applyInstrument()
    }

    /// A step that names its band (the scales over the drums alone, a jam over the whole band)
    /// mutes the rest; a step without one keeps the module's unlock state. A step in straight
    /// eighths gets the band on the straight grid (`Lesson.Step.straight`).
    private func applyBand() {
        loadBand()
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

    /// A plan goal: the step by id from its intro, the knob set to `tempo` (the ladder's next
    /// number; the step still counts at its own tempo).
    func start(stepId: String, tempo: Int?) {
        guard let i = content.steps.firstIndex(where: { $0.id == stepId }) else { return }
        restartLesson(at: i)
        if let tempo, tempo != self.tempo { audio.send(.tempo(Double(tempo))) }
    }

    /// Every judged chorus, with the module's code: the plan's goals (`AppModel`).
    @ObservationIgnored var onGoalChorus: ((String, LessonEngine.Verdict) -> Void)?
    /// Every Stage run played to the end (not practice).
    @ObservationIgnored var onGameRun: ((GameEngine.Result) -> Void)?

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
            // A jam's step sits past the lessons' steps, and a map goal's step can sit past the
            // lessons played in order: reaching either says nothing about the lessons before it.
            if !out.jam, content.inOrder(step: out.step, lessonsDone: lessonsDone) { progress.reached(step: out.step, in: content.code) }
            applyBand()
        }
        if let c = out.complete, c != lesson.complete {
            if c.number <= lessonsDone + 1 { progress.lessonDone(c.number, in: content.code) }
            // A finished lesson is a day of practice (a replay too).
            if !ProgressStore.readOnly { progress.practiced(.lesson, id: "\(content.code)·\(c.number)") }
        }
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
        recorder.reset()
        takeNotes = 0
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

    func fromTheTop() {
        // A step's tempo and its channels' unmutes asked for while the band played (the menu's
        // band, a goal opened from the map) wait for a downbeat, and a stop drops what waits
        // (0.1 (57)); stopped, they apply at once, so they go again after it.
        let tempo = pendingTempo, unmute = pendingUnmute
        audio.send(.stop)
        if let tempo { audio.send(.tempo(Double(tempo))) }
        for ch in Channel.allCases where unmute & ch.bit != 0 { audio.send(.mute(ch, false)) }
        if Self.countInOn { audio.send(.countIn(beats: 4)) }
        audio.send(.play)
    }

    /// Play from the top of a lesson clicks four beats in first (Settings → Count-in); resuming
    /// from a pause doesn't.
    func togglePlay() {
        if practice {
            practicePlay()
            return
        }
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
        if game != nil {
            nudgeGameTempo(delta)
            return
        }
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



    func tapDown(_ touch: Int) {
        let fresh = dueNow().filter { !pressed.contains($0) }
        taps[touch] = fresh
        for n in fresh { press(n) }
    }

    /// The notes due at the transport position heard now: the pending chord nearest it in a
    /// song, the expected chord nearest it around a lesson's loop. Empty when nothing is scored.
    private func dueNow() -> [Int] {
        // Calling: the keys the voice asked for.
        if let call, inGame { return (call.current?.keys ?? []).sorted() }
        let s = audio.snapshot()
        let clock = TransportClock(s)
        guard clock.valid else { return [] }
        let p = clock.position(atHost: shifted(mach_absolute_time(), clock))
        if let game, inGame {
            return s.epoch == gameEpoch ? game.due(at: p.tick, msPerTick: p.msPerTick) : []
        }
        return inLesson && !demo ? engine.due(at: p.tick) : []
    }

    func tapUp(_ touch: Int) {
        for n in taps.removeValue(forKey: touch) ?? [] { release(n) }
    }


    func key(_ semitone: Int, down: Bool) {
        guard down else {
            for n in keyNotes.removeValue(forKey: semitone) ?? [] { release(n) }
            return
        }
        CountInLaunch.onHit?(mach_absolute_time())
        let plain = 48 + 12 * octave + semitone
        let named = dueNow().filter { ($0 - plain) % 12 == 0 && !pressed.contains($0) }
        let notes = named.isEmpty ? [plain] : named
        keyNotes[semitone] = notes
        for n in notes { press(n) }
    }

    func shiftOctave(_ delta: Int) {
        octave = min(2, max(-2, octave + delta))
    }

    /// A press reaches the lesson at the transport position heard when it happened, moved by
    /// the calibration (autoplay's presses are exact and aren't). During a calibration it is a tap.
    func score(_ note: Int, hostTime: UInt64, velocity: Float = 0.8, calibrated: Bool = true) {
        // Calling (Player+Call): the key goes to the call, not the clock.
        if call != nil, inGame {
            callPlayed(note)
            return
        }
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
        if engine.step.id.hasPrefix(Improv.versionPrefix) {
            if s.epoch != versionEpoch { versionPresses = []; versionEpoch = s.epoch }
            versionPresses.append((p.tick, note))
            if versionPresses.count > 128 { versionPresses.removeFirst(versionPresses.count - 128) }
        }
        // An improv keeps the take for the teacher (not on its intro, not while stopped).
        if engine.step.kind == .free, lesson.intro == nil, playing {
            recorder.press(note, tick: p.tick, velocity: Double(velocity), epoch: s.epoch)
            takeNotes = recorder.count
        }
        Self.dump(String(format: "press %d tick %.1f (bar %d beat %.2f) epoch %d calibrated %@ step %d now %@ vel %.2f",
                         note, p.tick, Int(p.tick / Double(4 * audio.band.ticksPerBeat)) + 1,
                         (p.tick.truncatingRemainder(dividingBy: Double(4 * audio.band.ticksPerBeat))) / Double(audio.band.ticksPerBeat) + 1,
                         s.epoch, calibrated ? "yes" : "no", engine.output.step, engine.output.nowNotes.sorted().description, velocity))
    }

    func scoreRelease(_ note: Int, hostTime: UInt64, calibrated: Bool = true) {
        guard inLesson, calibration == nil, !demo else { return }
        let s = audio.snapshot()
        let clock = TransportClock(s)
        guard clock.valid else { return }
        let p = clock.position(atHost: calibrated ? shifted(hostTime, clock) : hostTime)
        engine.released(note: note, tick: p.tick, epoch: s.epoch)
        if engine.step.kind == .free { recorder.release(note, tick: p.tick, epoch: s.epoch) }
    }

    /// A press `inputOffsetMs` early (negative) is placed that much later.
    private func shifted(_ hostTime: UInt64, _ clock: TransportClock) -> UInt64 {
        let delta = Int64((-Self.inputOffsetMs / 1000 * clock.hostTicksPerSecond).rounded())
        return UInt64(max(0, Int64(hostTime) + delta))
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
        let m = Channel.band.map { c in
            min(12, max(0, Int((s.level(c) + 42) / 3.5)))
        }
        if m != meters { meters = m }
        guard clock.valid else { return }
        if let e = playbackEpoch, s.epoch > e { playbackEpoch = nil }

        // The position the speaker is playing now: the pads, the LEDs and the lesson follow it.
        let heard = clock.position(atHost: mach_absolute_time())
        let tpb = Double(audio.band.ticksPerBeat)
        // The count-in runs before tick 0 (bar 1), or before the bar practice lands on: its own
        // beat number.
        let base = practice ? practiceCountBase : 0
        let counting = heard.tick < base && heard.rolling ? 4 + Int(((heard.tick - base) / tpb).rounded(.down)) + 1 : nil
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
            runCalibrationHook(c, click: k, clock, heard: heard)
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
        runImprovPlay(clock, heard: heard, epoch: s.epoch)
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
            canDemo: canDemo,
            improv: engine.step.kind == .free && lesson.intro == nil && !demo
                ? LessonState.Improv(notes: takeNotes, canSend: takeNotes >= Self.takeMinimum) : nil,
            highway: engine.step.id.hasPrefix(Improv.versionPrefix) && lesson.intro == nil && lesson.complete == nil
        )
    }

    /// A scale step's run for the screen: the cycle's notes in order, the one being played
    /// (from the engine's index into the chorus), whether this bar is the hold, and the pass.
    private func runState(nowIndex: Int?) -> LessonState.Run? {
        let step = engine.step
        // An improv's pattern is a starting idea: the run shows only while Show me plays it.
        guard let cycle = step.cycle, let pattern = step.pattern, !pattern.isEmpty, step.kind != .card, step.kind != .free || demo else { return nil }
        let one = content.expected(step, ticksPerBeat: audio.band.ticksPerBeat).prefix(pattern.count)
        let notes = one.map { LessonState.Run.Note(key: $0.display, finger: $0.finger ?? 0) }
        let resting = !pattern.contains { ($0.bar ?? 0) == bar % cycle }
        let name = step.key ?? content.key ?? ""
        return LessonState.Run(name: name, notes: Array(notes),
                               index: nowIndex.map { $0 % notes.count },
                               resting: resting,
                               number: bar / cycle + 1, count: max(1, form.count / cycle),
                               right: step.hand == "right", flats: step.flats ?? name.hasSuffix("blues"))
    }
}

/// CADisplayLink retains its target; this keeps the Player out of that cycle.
private final class LinkTarget: NSObject {
    weak var player: Player?
    init(_ player: Player) { self.player = player }
    @objc func tick() { player?.refresh() }
}