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

    @ObservationIgnored let audio: AudioEngine
    @ObservationIgnored let content: Lesson
    /// The lesson's channel strips, in order, as mixer channels.
    @ObservationIgnored let channels: [Channel]
    @ObservationIgnored private let engine: LessonEngine
    @ObservationIgnored private let form: [FormBar]
    @ObservationIgnored private let midi = MIDIInput()
    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "input")
    @ObservationIgnored private let lessonLog = Logger(subsystem: "takt", category: "lesson")

    static let tempoRange = 50...140

    init(audio: AudioEngine, lesson: Lesson) {
        self.audio = audio
        content = lesson
        form = lesson.formBars
        let byName: [String: Channel] = ["drums": .drums, "bass": .bass, "keys": .keys, "horns": .horns]
        channels = lesson.channels.map { c in
            guard let ch = byName[c.channel] else { fatalError("lesson \(lesson.code): unknown channel \(c.channel)") }
            return ch
        }
        engine = LessonEngine(lesson: lesson, ticksPerBeat: audio.band.ticksPerBeat)
        // Locked channels stay muted until the lesson unlocks them (M3).
        for (c, ch) in zip(lesson.channels, channels) where c.unlockAt != nil {
            audio.send(.mute(ch, true))
        }
        self.lesson = engine.output

        engine.onVerdict = { [lessonLog] v in
            let what: String
            if let r = v.result {
                let offsets = r.offsets.map { String(format: "%+.1f", $0) }.joined(separator: " ")
                what = "\(r.hits)/\(r.notes.count) hits, \(r.extras.count) extra, mean \(r.meanOffsetMs.map { String(format: "%+.1f", $0) } ?? "-") ms, \(r.clean ? "clean" : "not clean") [\(r.problems.joined(separator: " "))] offsets \(offsets)"
            } else {
                what = "joined late, not judged"
            }
            lessonLog.info("chorus \(v.chorus + 1) at \(Int(v.tempo.rounded())): \(what, privacy: .public) · counts \(v.counted) · gate \(v.clean)/\(v.gate) · \"\(v.line, privacy: .public)\"")
        }

        midi.onNote = { [weak self] n in
            guard let self else { return }
            // Straight to the render thread: the monitor must not wait for the main thread.
            self.audio.send(n.on ? .noteOn(note: n.note, velocity: n.velocity, hostTime: n.hostTime)
                                 : .noteOff(note: n.note, hostTime: n.hostTime))
            DispatchQueue.main.async {
                if n.on {
                    self.pressed.insert(n.note)
                    self.score(n.note, hostTime: n.hostTime)
                } else {
                    self.pressed.remove(n.note)
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

    // MARK: Controls

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
        score(note, hostTime: now)
    }

    func release(_ note: Int) {
        guard pressed.remove(note) != nil else { return }
        audio.send(.noteOff(note: note, hostTime: mach_absolute_time()))
    }

    /// Computer keyboard: semitone 0 = C3 shifted by the octave.
    func key(_ semitone: Int, down: Bool) {
        let note = 48 + 12 * octave + semitone
        if down { press(note) } else { release(note) }
    }

    func shiftOctave(_ delta: Int) {
        octave = min(2, max(-2, octave + delta))
    }

    /// A press reaches the lesson at the transport position heard when it happened.
    private func score(_ note: Int, hostTime: UInt64) {
        let s = audio.snapshot()
        let clock = TransportClock(s)
        guard clock.valid else { return }
        let p = clock.position(atHost: hostTime)
        engine.played(note: note, tick: p.tick, msPerTick: p.msPerTick, epoch: s.epoch)
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

        // The position the speaker is playing now: the pads, the LEDs and the lesson follow it.
        let heard = clock.position(atHost: mach_absolute_time())
        let tpb = Double(audio.band.ticksPerBeat)
        let beats = Int((heard.tick / tpb).rounded(.down))
        let bars = audio.band.bars
        if beats / 4 % bars != bar { bar = beats / 4 % bars }
        if beats % 4 != beat { beat = beats % 4 }
        if beats / 4 / bars != chorus { chorus = beats / 4 / bars }

        // The frame first, then the presses heard by now: the engine learns the epoch (and judges
        // a finished chorus) before a press of the new chorus arrives.
        engine.heard(tick: heard.tick, tempo: heard.tempo, rolling: heard.rolling, epoch: s.epoch)
        #if DEBUG
        runAutoplay(clock, heard: heard, epoch: s.epoch)
        DebugHooks.writeClockIfRequested(clock)
        #endif
        if engine.output != lesson { lesson = engine.output }
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
        let bars = audio.band.bars
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
        if var plan = autoplay, heard.rolling {
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
            if let host = clock.hostTime(atTick: p.tick) { score(p.note, hostTime: host) }
        }
        while let i = autoReleases.firstIndex(where: { $0.tick <= heard.tick }) {
            pressed.remove(autoReleases.remove(at: i).note)
        }
    }
    #endif

    // MARK: LessonState

    func lessonState() -> LessonState {
        var strips: [ChannelState] = []
        for (i, c) in content.channels.enumerated() {
            let ch = channels[i]
            let unlocked = c.unlockAt == nil
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
