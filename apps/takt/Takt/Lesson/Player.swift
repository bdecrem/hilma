import SwiftUI
import os

/// Live state for the lesson screen: polls the engine at display rate and turns it into
/// LessonState, and routes every input (MIDI, computer keyboard, on-screen keys) to the monitor.
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

    @ObservationIgnored let audio: AudioEngine
    @ObservationIgnored private let midi = MIDIInput()
    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "input")
    @ObservationIgnored private var hostTicksPerSecond: Double

    static let tempoRange = 50...140

    init(audio: AudioEngine) {
        self.audio = audio
        var mach = mach_timebase_info_data_t()
        mach_timebase_info(&mach)
        hostTicksPerSecond = 1e9 * Double(mach.denom) / Double(mach.numer)

        midi.onNote = { [weak self] n in
            guard let self else { return }
            // Straight to the render thread: the monitor must not wait for the main thread.
            self.audio.send(n.on ? .noteOn(note: n.note, velocity: n.velocity, hostTime: n.hostTime)
                                 : .noteOff(note: n.note, hostTime: n.hostTime))
            let position = self.position(atHostTime: n.hostTime)
            DispatchQueue.main.async {
                if n.on { self.pressed.insert(n.note) } else { self.pressed.remove(n.note) }
                self.log.info("midi \(n.on ? "on" : "off", privacy: .public) \(n.note) vel \(n.velocity) at \(position, privacy: .public)")
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
        pressed.insert(note)
        audio.send(.noteOn(note: note, velocity: velocity, hostTime: mach_absolute_time()))
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

    // MARK: Engine → UI

    fileprivate func refresh() {
        let s = audio.snapshot()
        let now = mach_absolute_time()
        // The beat the speaker is playing now: the newest rendered beat unless it is still ahead.
        let b = s.lastBeat.hostTime <= now ? s.lastBeat : s.previousBeat
        if b.bar != bar { bar = b.bar }
        if b.beat != beat { beat = b.beat }
        if b.chorus != chorus { chorus = b.chorus }
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
    }

    /// Transport position (bar, beat) heard at a host time, for logging and later scoring.
    func position(atHostTime host: UInt64) -> String {
        let s = audio.snapshot()
        guard s.playing, s.refHostTime > 0 else { return "stopped" }
        let dt = (Double(host) - Double(s.refHostTime)) / hostTicksPerSecond
        let frame = Double(s.refFrame) + dt * s.sampleRate
        let tick = s.anchorTick + (frame - Double(s.anchorFrame)) / s.samplesPerTick
        let tpb = Double(audio.band.ticksPerBeat)
        let beats = tick / tpb
        let barIndex = Int(beats / 4)
        let bars = audio.band.bars
        return String(format: "chorus %d bar %d beat %.3f", barIndex / bars + 1, barIndex % bars + 1,
                      beats - Double(barIndex * 4) + 1)
    }

    // MARK: LessonState

    /// The A1 screen with the live transport, meters, mutes and keys. Lesson logic (steps,
    /// gates, coach) arrives in M2; until then the now/next keys are the bar roots.
    func lessonState(from base: LessonState) -> LessonState {
        var s = base
        s.tempo = tempo
        s.pendingTempo = pendingTempo
        s.playing = playing
        s.bar = bar
        s.beat = beat
        s.chorus = chorus + 1
        let order: [Channel] = [.drums, .bass, .keys, .horns]
        for i in s.channels.indices {
            let c = order[i]
            s.channels[i].muted = muted & c.bit != 0
            s.channels[i].pendingUnmute = pendingUnmute & c.bit != 0
            s.channels[i].level = s.channels[i].unlocked && !s.channels[i].muted ? meters[i] : 0
        }
        let roots: [String: Int] = ["C": 48, "F": 53, "G": 55]
        let now = roots[s.form[bar].chord]
        let next = roots[s.form[s.nextBar].chord]
        s.nowNote = now
        s.nextNote = next == now ? nil : next
        s.coach = next == now ? "\(s.form[bar].chord) on the 1." : "Get ready. \(s.form[s.nextBar].chord) on the 1."
        s.lastChorus = nil
        s.cleanChoruses = 0  // nothing is judged until the Scorer (M2)
        s.pressedNotes = pressed
        return s
    }
}

/// CADisplayLink retains its target; this keeps the Player out of that cycle.
private final class LinkTarget: NSObject {
    weak var player: Player?
    init(_ player: Player) { self.player = player }
    @objc func tick() { player?.refresh() }
}
