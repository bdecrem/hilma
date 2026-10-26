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
    /// Play it back: the transport epoch the recorded chorus is playing in (it starts at tick 0).
    private(set) var playbackEpoch: Int?

    @ObservationIgnored let audio: AudioEngine
    @ObservationIgnored let content: Lesson
    /// The lesson's channel strips, in order, as mixer channels.
    @ObservationIgnored let channels: [Channel]
    @ObservationIgnored private var engine: LessonEngine
    @ObservationIgnored let progress: ProgressStore
    @ObservationIgnored private let form: [FormBar]
    @ObservationIgnored private let midi = MIDIInput()
    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "input")
    @ObservationIgnored private let lessonLog = Logger(subsystem: "takt", category: "lesson")
    @ObservationIgnored private var calibrationEpoch = 0
    /// Clicks sent to the engine so far; the tick loop keeps a bar ahead of the one heard.
    @ObservationIgnored private var clicksSent = 0
    @ObservationIgnored private var bandBeforeCalibration: (playing: Bool, tempo: Int, muted: UInt8)?

    /// Calibration's result: how early (negative) or late this player presses, ms. Every scored
    /// press moves by minus this.
    static var inputOffsetMs: Double { UserDefaults.standard.double(forKey: "inputOffsetMs") }
    static var calibrated: Bool { UserDefaults.standard.bool(forKey: "calibrated") }

    static let tempoRange = 50...140

    init(audio: AudioEngine, lesson: Lesson, progress: ProgressStore) {
        self.audio = audio
        self.progress = progress
        content = lesson
        form = lesson.formBars
        let byName: [String: Channel] = ["drums": .drums, "bass": .bass, "keys": .keys, "horns": .horns]
        channels = lesson.channels.map { c in
            guard let ch = byName[c.channel] else { fatalError("lesson \(lesson.code): unknown channel \(c.channel)") }
            return ch
        }
        engine = LessonEngine(lesson: lesson, ticksPerBeat: audio.band.ticksPerBeat)
        // Locked channels stay muted until the lesson unlocks them.
        for (c, ch) in zip(lesson.channels, channels) where c.unlockAt != nil {
            audio.send(.mute(ch, true))
        }
        self.lesson = engine.output
        wire()

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
    }

    /// The engine's verdicts go to the log and the progress store, its actions to the band.
    private func wire() {
        engine.onVerdict = { [lessonLog, progress] v in
            let what: String
            if let r = v.result {
                let offsets = r.offsets.map { String(format: "%+.1f", $0) }.joined(separator: " ")
                what = "\(r.hits)/\(r.notes.count) hits, \(r.extras.count) extra, mean \(r.meanOffsetMs.map { String(format: "%+.1f", $0) } ?? "-") ms, \(r.clean ? "clean" : "not clean") [\(r.problems.joined(separator: " "))] offsets \(offsets)"
                if let skill = v.skill { progress.record(skill: skill, result: r, tempo: v.tempo, counted: v.counted) }
                // A judged chorus is a day of practice: the streak.
                progress.practiced()
            } else {
                what = "joined late, not judged"
            }
            lessonLog.info("step \(v.step) chorus \(v.chorus + 1) at \(Int(v.tempo.rounded())): \(what, privacy: .public) · counts \(v.counted) · gate \(v.clean)/\(v.gate) · \"\(v.line, privacy: .public)\"")
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
            case .finished:
                self.finish = self.engine.finish
                self.progress.completed(self.content.code, tempo: self.engine.finish?.tempo ?? 0,
                                        steps: self.content.steps.count)
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

    /// From the menu: the lesson from the top (or a step, DEBUG), the band as it starts: locked
    /// channels muted, nothing sitting out, step 1's tempo.
    func restartLesson(at step: Int = 0) {
        engine.onAction = nil
        engine.onVerdict = nil
        engine = LessonEngine(lesson: content, ticksPerBeat: audio.band.ticksPerBeat)
        audio.send(.silence(from: 0, to: 0))
        for (c, ch) in zip(content.channels, channels) { audio.send(.mute(ch, c.unlockAt != nil)) }
        finish = nil
        wire()
        if let t = content.steps[0].tempo, t != tempo { audio.send(.tempo(Double(t))) }
        if step > 0 { engine.start(step: step) }
        lesson = engine.output
    }

    func continueCard() {
        engine.continueCard()
        lesson = engine.output
    }

    func togglePlay() {
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
        guard inLesson else { return }
        let p = clock.position(atHost: calibrated ? shifted(hostTime, clock) : hostTime)
        engine.played(note: note, tick: p.tick, msPerTick: p.msPerTick, epoch: s.epoch, velocity: velocity)
    }

    private func scoreRelease(_ note: Int, hostTime: UInt64, calibrated: Bool = true) {
        guard inLesson, calibration == nil else { return }
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
        let beats = Int((heard.tick / tpb).rounded(.down))
        let bars = audio.band.chorusBars
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

        // The frame first, then the presses heard by now: the engine learns the epoch (and judges
        // a finished chorus) before a press of the new chorus arrives.
        engine.heard(tick: heard.tick, tempo: heard.tempo, rolling: heard.rolling, epoch: s.epoch)
        #if DEBUG
        runAutoplay(clock, heard: heard, epoch: s.epoch)
        DebugHooks.writeClockIfRequested(clock)
        #endif
        if engine.output != lesson {
            if engine.output.step != lesson.step { progress.reached(step: engine.output.step, in: content.code) }
            lesson = engine.output
        }
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
    @ObservationIgnored private var heardTick = 0.0

    /// Plans a bar ahead, schedules the presses on the monitor, and hands each one to the
    /// lesson when it is heard, at the host time it is heard (the same path as a key press).
    private func runAutoplay(_ clock: TransportClock, heard: TransportClock.Position, epoch: Int) {
        heardTick = heard.tick
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
        for (i, c) in content.channels.enumerated() {
            let ch = channels[i]
            let unlocked = c.unlockAt == nil || lesson.unlocked.contains(i)
            let isMuted = muted & ch.bit != 0
            strips.append(ChannelState(name: c.name, unlocked: unlocked, unlockAt: c.unlockAt,
                                       level: unlocked && !isMuted ? meters[ch.rawValue] : 0,
                                       muted: isMuted, pendingUnmute: pendingUnmute & ch.bit != 0))
        }
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
            coach: lesson.coach,
            lastChorus: lesson.lastChorus,
            lastChorusDetail: lesson.lastChorusDetail,
            nowNote: lesson.nowNote,
            nextNote: lesson.nextNote,
            pressedNotes: pressed
        )
    }
}

/// CADisplayLink retains its target; this keeps the Player out of that cycle.
private final class LinkTarget: NSObject {
    weak var player: Player?
    init(_ player: Player) { self.player = player }
    @objc func tick() { player?.refresh() }
}
