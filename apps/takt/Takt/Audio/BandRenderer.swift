import Foundation
import os

/// Mixer channels. The monitor is the player's own notes.
enum Channel: Int, CaseIterable {
    case drums, bass, keys, horns, monitor

    var bit: UInt8 { 1 << UInt8(rawValue) }
}

enum EngineCommand {
    case play
    case pause
    /// Stop and rewind to bar 1 of chorus 1.
    case stop
    /// Applied at the next downbeat while playing, at once while stopped.
    case tempo(Double)
    /// Mute is immediate; unmute waits for the next downbeat while playing.
    case mute(Channel, Bool)
    /// Live notes carry the host time of the key event (0 = as soon as possible).
    case noteOn(note: Int, velocity: Float, hostTime: UInt64 = 0)
    case noteOff(note: Int, hostTime: UInt64 = 0)
    /// A monitor note at a transport tick, sample-accurate (autoplay). Held for `lengthTicks`.
    case schedule(note: Int, velocity: Float, tick: Double, lengthTicks: Double)
    /// A cross-stick click at a transport tick, sample-accurate, on the monitor's bus so it
    /// sounds whatever the mutes (calibration).
    case click(tick: Double, velocity: Float)
    /// Held: the transport starts `beats` beats before where it sits, with a click on each, so
    /// the band comes in on that bar after a count-in (bar 1 from the top; any bar in
    /// practice, after a `.seek`). Send before `.play`.
    case countIn(beats: Int)
    /// Held (paused if playing): the transport moves to `tick`, the band's cursor with it,
    /// scheduled notes dropped. Practice scrubs with it; `.play` goes on from there.
    case seek(tick: Double)
    /// Seconds from render to the speaker; beat times the UI sees include it.
    case outputLatency(Double)
    /// The band sits out from tick `from` to `to` (absolute transport ticks), sample-accurately:
    /// no band note starts in the window (the payoff's turnaround alone). Stop clears it.
    case silence(from: Double, to: Double)
    /// The player's level trims from Settings, 0...1.5: the whole band, and the monitor.
    case trim(band: Float, monitor: Float)
    /// Semitones added to every pitched band note (the minor band in another key).
    case transpose(Int)
    /// Another band's events (`BandRenderer.load`), picked up at the same tick.
    case band(BandRenderer.Events)
}

/// What the render thread tells everyone else. Fixed-size (no arrays), copied under a lock.
struct EngineSnapshot {
    struct Beat {
        /// Host time at which this beat reaches the speaker (0 when unknown, e.g. offline).
        var hostTime: UInt64 = 0
        var bar = 0
        var beat = 0
        var chorus = 0
    }

    /// The frame → tick mapping from `frame` on. Held (paused, stopped): `samplesPerTick` is
    /// infinite and every frame maps to `tick`.
    struct Anchor {
        var frame: Int64 = 0
        var tick = 0.0
        var samplesPerTick = Double.infinity
        var tempo = 0.0

        var rolling: Bool { samplesPerTick.isFinite }
    }

    var playing = false
    /// Counts stops: ticks restart from 0 in a new epoch.
    var epoch = 0
    var tempo = 0.0
    /// The tempo waiting for the next downbeat, 0 when none.
    var pendingTempo = 0.0
    var lastBeat = Beat()
    var previousBeat = Beat()
    /// Peak level per channel in dBFS, smoothed.
    var levels: (Float, Float, Float, Float, Float) = (-120, -120, -120, -120, -120)
    var muted: UInt8 = 0
    var pendingUnmute: UInt8 = 0

    // Clock mapping: host time → frame → transport tick (see TransportClock).
    var sampleRate = 48000.0
    var refFrame: Int64 = 0
    var refHostTime: UInt64 = 0
    /// The mapping now, and the one before it: a note played just before a tempo change
    /// (or a pause) can be read after the render thread has moved on.
    var anchor = Anchor()
    var previousAnchor = Anchor()

    func level(_ c: Channel) -> Float {
        switch c {
        case .drums: levels.0
        case .bass: levels.1
        case .keys: levels.2
        case .horns: levels.3
        case .monitor: levels.4
        }
    }
}

/// The single clock and everything that sounds. One instance, owned by AudioEngine; `render`
/// runs on the audio thread. Time is the frame counter: frames rendered since the engine
/// started. The transport maps frames to ticks through an anchor (frame, tick) and the
/// samples-per-tick of the current tempo; a tempo change re-anchors on a downbeat, so event
/// times are computed from the anchor, never accumulated, and nothing drifts.
final class BandRenderer {
    let sampleRate: Double
    let ticksPerBeat: Int
    let ticksPerBar: Int
    /// The loaded band's: a song is longer than the lesson's loop (`.band` swaps them).
    private(set) var loopTicks: Int
    private(set) var chorusBars: Int

    // MARK: Cross-thread

    private let inbox = OSAllocatedUnfairLock(initialState: [EngineCommand]())
    private let published = OSAllocatedUnfairLock(initialState: EngineSnapshot())

    func send(_ command: EngineCommand) {
        inbox.withLock { $0.append(command) }
    }

    func snapshot() -> EngineSnapshot {
        published.withLock { $0 }
    }

    // MARK: Render-thread state

    fileprivate struct Event {
        var tick: Int
        var channel: Channel
        /// Drum: index into `drumSounds`. Otherwise the MIDI note.
        var value: Int
        var velocity: Float
        var lengthTicks: Int
        /// Pitched: index into `instruments`.
        var instrument: Int
        /// Pitched: the channel's level from the band's `levels`.
        var gain: Float = 1
    }

    fileprivate struct DrumSound {
        var kit: SampledInstrument
        var gain: Float
        var group: Int
        var chokes: Int
        /// A kick: it ducks the band's `duck` channels.
        var kick: Bool
    }

    /// A band as the renderer plays it: its events, its kit, its instruments and the monitor's,
    /// its length. Built on the main thread by `load`, kept alive for the renderer (`.band`
    /// swaps the whole set: a song brings its own kit and its synth for your keys).
    final class Events {
        fileprivate let buffer: UnsafeMutableBufferPointer<Event>
        fileprivate let drumSounds: UnsafeMutableBufferPointer<DrumSound>
        fileprivate let clickSound: Int
        /// nil: the live stab (`DubStab`).
        fileprivate let instruments: [SampledInstrument?]
        fileprivate let stab: DubStab.Settings?
        fileprivate let monitor: Int
        /// Your keys' level (the band's `levels["monitor"]`: a song's part).
        fileprivate let monitorGain: Float
        /// Sidechain depth per channel (drums, bass, keys, horns, monitor) and its release.
        fileprivate let duck: [Float]
        fileprivate let duckRelease: Double
        /// The dub send: each channel's send level, and the chamber's settings (nil: no dub).
        fileprivate let sends: [Float]
        fileprivate let dub: DubChamber.Settings?
        fileprivate let knee: Float
        /// A band with its own chamber skips the app's room reverb: its low end stays dry.
        var hasDub: Bool { dub != nil }
        let loopTicks: Int
        let chorusBars: Int
        let name: String
        fileprivate init(_ buffer: UnsafeMutableBufferPointer<Event>, drumSounds: UnsafeMutableBufferPointer<DrumSound>,
                         clickSound: Int, instruments: [SampledInstrument?], stab: DubStab.Settings?, monitor: Int, monitorGain: Float,
                         duck: [Float], duckRelease: Double, sends: [Float], dub: DubChamber.Settings?, knee: Float,
                         loopTicks: Int, chorusBars: Int, name: String) {
            self.buffer = buffer
            self.drumSounds = drumSounds
            self.clickSound = clickSound
            self.instruments = instruments
            self.stab = stab
            self.monitor = monitor
            self.monitorGain = monitorGain
            self.duck = duck
            self.duckRelease = duckRelease
            self.sends = sends
            self.dub = dub
            self.knee = knee
            self.loopTicks = loopTicks
            self.chorusBars = chorusBars
            self.name = name
        }
    }

    private var events: UnsafeMutableBufferPointer<Event>
    private var transpose = 0
    private var drumSounds: UnsafeMutableBufferPointer<DrumSound>
    private var clickSound: Int
    /// The pitched instruments of the loaded band (nil: the live stab); `monitor` is the one
    /// your keys play.
    private var instruments: [SampledInstrument?]
    private var stab: DubStab.Settings?
    private var monitor: Int
    private var monitorGain: Float = 1
    /// Sidechain: depth per channel, the release's per-sample decay, the last kick's frame and
    /// the kicks fired in the chunk being mixed.
    private var duck: [Float] = [0, 0, 0, 0, 0]
    private var duckDecay: Float = 1
    private var lastKick: Int64 = .min / 2
    private let chunkKicks = UnsafeMutableBufferPointer<Int64>.allocate(capacity: 64)
    private var chunkKickCount = 0
    /// The duck envelope across the chunk being mixed (1 right after a kick).
    private let kickEnv: UnsafeMutablePointer<Float>
    /// The dub send: per-channel send levels, the send bus and the chamber.
    private var sends: [Float] = [0, 0, 0, 0, 0]
    private let sendL: UnsafeMutablePointer<Float>
    private let sendR: UnsafeMutablePointer<Float>
    private let chamber: DubChamber

    private var commands: [EngineCommand] = []

    /// Live notes for the current buffer, placed at frames (see `render`).
    private struct LiveNote {
        var frame: Int64
        var note: Int
        var velocity: Float
        var on: Bool
    }
    private let live = UnsafeMutableBufferPointer<LiveNote>.allocate(capacity: 128)
    private var liveCount = 0
    private var liveNext = 0

    /// Scheduled monitor notes (autoplay, Play it back) and clicks, sorted by tick.
    private struct Scheduled {
        var tick: Double
        var note: Int
        var velocity: Float
        var lengthTicks: Double
        /// A click (the cross-stick) instead of a monitor note.
        var click = false
    }
    private let scheduled = UnsafeMutableBufferPointer<Scheduled>.allocate(capacity: 256)
    private var scheduledCount = 0

    private var frame: Int64 = 0
    private var playing = false
    private var tempo: Double
    private var pendingTempo = 0.0
    private var samplesPerTick: Double
    private var anchorFrame: Int64 = 0
    private var anchorTick = 0.0
    /// Paused/stopped position in ticks.
    private var heldTick = 0.0
    private var nextEvent = 0
    private var loopBase = 0
    private var nextBeatTick = 0
    private var lastBeat = EngineSnapshot.Beat()
    private var previousBeat = EngineSnapshot.Beat()
    private var muted: UInt8 = 0
    private var pendingUnmute: UInt8 = 0
    private var latencySeconds = 0.0
    private var silenceFrom = 0.0
    private var silenceTo = 0.0
    private var bandTrim: Float = 1
    private var monitorTrim: Float = 1
    private var hostTicksPerSecond: Double
    private var epoch = 0
    private var anchor = EngineSnapshot.Anchor()
    private var previousAnchor = EngineSnapshot.Anchor()

    private let maxChunk = 4096
    private let busL: UnsafeMutablePointer<Float>
    private let busR: UnsafeMutablePointer<Float>
    private var channelGain: (Float, Float, Float, Float, Float) = (1, 1, 1, 1, 1)
    private var levels: (Float, Float, Float, Float, Float) = (0, 0, 0, 0, 0)
    /// Channel faders: drums, bass, keys, horns, monitor. Set from solo renders at 80 bpm
    /// (RMS: drums -27, bass -28, keys -30, horns -31 dBFS; the monitor sits with the keys).
    private let mix: [Float] = [1.6, 0.32, 0.88, 0.54, 0.9]
    /// Headroom: kick, bass and crash land together on the tops.
    private let master: Float = 0.72
    /// The band's knee scale (`BandData.knee`).
    private var knee: Float = 1
    private let levelDecay: Float

    private let drumVoices = UnsafeMutableBufferPointer<SampleVoice>.allocate(capacity: 24)
    private let bassVoices = UnsafeMutableBufferPointer<SampleVoice>.allocate(capacity: 4)
    private let keyVoices = UnsafeMutableBufferPointer<SampleVoice>.allocate(capacity: 24)
    private let hornVoices = UnsafeMutableBufferPointer<SampleVoice>.allocate(capacity: 8)
    private let monitorVoices = UnsafeMutableBufferPointer<SampleVoice>.allocate(capacity: 24)
    /// The live stab's notes, on whichever bus plays it (keys, horns, monitor).
    private let stabVoices = UnsafeMutableBufferPointer<DubStab.Voice>.allocate(capacity: 48)
    private var age = 0

    init(band: BandData, sampleRate: Double, tempo: Double) {
        self.sampleRate = sampleRate
        self.tempo = tempo
        ticksPerBeat = band.ticksPerBeat
        ticksPerBar = band.ticksPerBar
        loopTicks = band.loopTicks
        chorusBars = band.chorusBars
        samplesPerTick = sampleRate * 60 / (tempo * Double(band.ticksPerBeat))

        var mach = mach_timebase_info_data_t()
        mach_timebase_info(&mach)
        hostTicksPerSecond = 1e9 * Double(mach.denom) / Double(mach.numer)

        let first = Self.load(band)
        events = first.buffer
        drumSounds = first.drumSounds
        clickSound = first.clickSound
        instruments = first.instruments
        stab = first.stab
        monitor = first.monitor
        monitorGain = first.monitorGain
        duck = first.duck
        duckDecay = Float(exp(-1 / (first.duckRelease * sampleRate)))
        sends = first.sends
        knee = first.knee
        chamber = DubChamber(sampleRate: sampleRate)
        chamber.configure(first.dub)
        kickEnv = .allocate(capacity: maxChunk)
        sendL = .allocate(capacity: maxChunk)
        sendR = .allocate(capacity: maxChunk)

        busL = .allocate(capacity: maxChunk * 5)
        busR = .allocate(capacity: maxChunk * 5)
        levelDecay = Float(exp(-Double(1) / (0.25 * sampleRate)))
        drumVoices.initialize(repeating: SampleVoice())
        bassVoices.initialize(repeating: SampleVoice())
        keyVoices.initialize(repeating: SampleVoice())
        hornVoices.initialize(repeating: SampleVoice())
        monitorVoices.initialize(repeating: SampleVoice())
        stabVoices.initialize(repeating: DubStab.Voice())
        commands.reserveCapacity(256)
        inbox.withLock { $0.reserveCapacity(256) }
        anchor = .init(frame: 0, tick: 0, samplesPerTick: .infinity, tempo: tempo)
        previousAnchor = anchor
        publish(hostTime: nil, frames: 0)
    }

    /// A band as the renderer plays it, built on the main thread: its kit (a closed hat or the
    /// foot chokes the open one), its pitched instruments (each channel's own, any a note
    /// names, and the monitor's; shared by name across bands), its events in tick order.
    private static func load(_ band: BandData) -> Events {
        let names = band.sounds.keys.sorted()
        let drumSounds = UnsafeMutableBufferPointer<DrumSound>.allocate(capacity: names.count)
        for (i, name) in names.enumerated() {
            let s = band.sounds[name]!
            drumSounds.initializeElement(at: i, to: DrumSound(
                kit: SampledInstrument.shared(s.kit), gain: Float(pow(10, s.gainDb / 20)),
                group: s.kit.hasPrefix("hatOpen") ? 1 : 0, chokes: (s.kit.hasPrefix("hat") && !s.kit.hasPrefix("hatOpen")) ? 1 : 0,
                kick: s.kit.hasPrefix("kick")))
        }
        guard let click = names.firstIndex(of: "xstick") else { fatalError("band \(band.name): no xstick for the click") }

        var instrumentNames: [String] = []
        func instrument(_ name: String) -> Int {
            if let i = instrumentNames.firstIndex(of: name) { return i }
            instrumentNames.append(name)
            return instrumentNames.count - 1
        }
        for key in ["bass", "keys", "horns", "monitor"] {
            guard let name = band.instruments[key] else { fatalError("band \(band.name): no instrument for \(key)") }
            _ = instrument(name)
        }
        for n in band.channels.bass + band.channels.keys + band.channels.horns { if let i = n.i { _ = instrument(i) } }
        let monitor = instrumentNames.firstIndex(of: band.instruments["monitor"]!)!
        let instruments = instrumentNames.map { $0 == DubStab.name ? nil : SampledInstrument.shared($0) }
        if instruments.contains(where: { $0 == nil }) && band.stab == nil { fatalError("band \(band.name): \(DubStab.name) without a stab") }
        let duck = ["drums", "bass", "keys", "horns", "monitor"].map { Float(band.duck?.channels[$0] ?? 0) }
        let sends = ["drums", "bass", "keys", "horns", "monitor"].map { Float(band.dub?.sends[$0] ?? 0) }
        return Events(events(of: band, sounds: names, instruments: instrumentNames), drumSounds: drumSounds, clickSound: click,
                      instruments: instruments, stab: band.stab?.settings, monitor: monitor, monitorGain: Float(pow(10, (band.levels?["monitor"] ?? 0) / 20)),
                      duck: duck, duckRelease: max(0.01, band.duck?.release ?? 0.2), sends: sends, dub: band.dub?.settings,
                      knee: Float(band.knee ?? 1),
                      loopTicks: band.loopTicks, chorusBars: band.chorusBars, name: band.name)
    }

    /// A band's events as the renderer plays them, in tick order.
    private static func events(of band: BandData, sounds names: [String], instruments: [String]) -> UnsafeMutableBufferPointer<Event> {
        func instrument(_ name: String) -> Int {
            guard let i = instruments.firstIndex(of: name) else { fatalError("band \(band.name): instrument \(name) is not loaded") }
            return i
        }
        var list: [Event] = []
        for h in band.channels.drums {
            guard let i = names.firstIndex(of: h.s) else { fatalError("band \(band.name): unknown drum sound \(h.s)") }
            list.append(Event(tick: h.t, channel: .drums, value: i, velocity: Float(h.v), lengthTicks: 0, instrument: 0))
        }
        for (channel, key, notes) in [(Channel.bass, "bass", band.channels.bass), (.keys, "keys", band.channels.keys),
                                      (.horns, "horns", band.channels.horns)] {
            let own = instrument(band.instruments[key]!)
            let gain = Float(pow(10, (band.levels?[key] ?? 0) / 20))
            for n in notes {
                list.append(Event(tick: n.t, channel: channel, value: n.n, velocity: Float(n.v), lengthTicks: n.len,
                                  instrument: n.i.map(instrument) ?? own, gain: gain))
            }
        }
        list.sort { $0.tick < $1.tick }
        let buffer = UnsafeMutableBufferPointer<Event>.allocate(capacity: list.count)
        _ = buffer.initialize(from: list)
        return buffer
    }

    /// Another band for `.band`, built on the main thread: its own kit, instruments and length
    /// (the minor blues beside the shuffle; a song with its synths), on the same tick grid.
    func load(_ band: BandData) -> Events {
        precondition(band.ticksPerBeat == ticksPerBeat && band.ticksPerBar == ticksPerBar, "band \(band.name): a different tick grid")
        return Self.load(band)
    }

    // MARK: Render

    /// Called by the source node. `hostTime` is the buffer's host time, nil offline.
    ///
    /// Live notes get a constant latency instead of a jittery one: a key event that happened
    /// k frames into the buffer period before this callback starts k frames into this buffer, so
    /// every note sounds one buffer period after it was played (calibration can only remove a
    /// latency that holds still). The callbacks are clocked by the hardware, so "now" at the top
    /// of the callback is the reference; the timestamp's host time is when the buffer will be
    /// heard, which is in the future. Without host times (offline) notes start at frame 0.
    func render(frames n: Int, hostTime: UInt64?, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        liveCount = 0
        liveNext = 0
        let callbackTime = mach_absolute_time()
        if inbox.withLockIfAvailable({ swap(&$0, &commands) }) != nil {
            for c in commands {
                switch c {
                case .noteOn(let note, let velocity, let host):
                    queueLive(note: note, velocity: velocity, on: true, host: host, now: callbackTime, frames: n)
                case .noteOff(let note, let host):
                    queueLive(note: note, velocity: 0, on: false, host: host, now: callbackTime, frames: n)
                case .schedule(let note, let velocity, let tick, let length):
                    schedule(Scheduled(tick: tick, note: note, velocity: velocity, lengthTicks: length))
                case .click(let tick, let velocity):
                    schedule(Scheduled(tick: tick, note: 0, velocity: velocity, lengthTicks: 0, click: true))
                default:
                    apply(c)
                }
            }
            commands.removeAll(keepingCapacity: true)
        }

        var done = 0
        while done < n {
            let count = min(maxChunk, n - done)
            renderChunk(count, hostTime: hostTime.map { $0 + UInt64(Double(done) / sampleRate * hostTicksPerSecond) },
                        outL: outL + done, outR: outR + done)
            done += count
        }
        publish(hostTime: hostTime, frames: n)
    }

    private func queueLive(note: Int, velocity: Float, on: Bool, host: UInt64, now: UInt64, frames n: Int) {
        guard liveCount < live.count else { return }
        var offset = 0
        let period = UInt64(Double(n) / sampleRate * hostTicksPerSecond)
        if host > 0, now > period, host > now - period {
            offset = min(n - 1, Int(Double(host - (now - period)) / hostTicksPerSecond * sampleRate))
        }
        // Keep the list sorted by frame (insertion; a buffer holds a handful at most).
        var i = liveCount
        let item = LiveNote(frame: frame + Int64(offset), note: note, velocity: velocity, on: on)
        while i > 0 && live[i - 1].frame > item.frame {
            live[i] = live[i - 1]
            i -= 1
        }
        live[i] = item
        liveCount += 1
    }

    private func schedule(_ item: Scheduled) {
        guard scheduledCount < scheduled.count else { return }
        var i = scheduledCount
        while i > 0 && scheduled[i - 1].tick > item.tick {
            scheduled[i] = scheduled[i - 1]
            i -= 1
        }
        scheduled[i] = item
        scheduledCount += 1
    }

    private func renderChunk(_ n: Int, hostTime: UInt64?, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        busL.update(repeating: 0, count: maxChunk * 5)
        busR.update(repeating: 0, count: maxChunk * 5)

        let start = frame
        let end = frame + Int64(n)
        var cursor = start
        chunkKickCount = 0
        while true {
            // The next thing to happen in this chunk: a beat, a band event, a scheduled note or a
            // live note. A beat goes before an event on the same tick (a tempo change re-anchors
            // first). Frames are recomputed each pass, so everything after a re-anchor moves with it.
            var at = end
            var what = 0
            if playing {
                let beatTick = Double(nextBeatTick)
                let eventTick = Double(loopBase + events[nextEvent].tick)
                if beatTick <= eventTick {
                    let f = frameFor(tick: beatTick)
                    if f < at { at = f; what = 1 }
                } else {
                    let f = frameFor(tick: eventTick)
                    if f < at { at = f; what = 2 }
                }
                if scheduledCount > 0 {
                    // A note scheduled for a tick already rendered plays at once.
                    let f = max(cursor, frameFor(tick: scheduled[0].tick))
                    if f < at { at = f; what = 4 }
                }
            }
            if liveNext < liveCount, live[liveNext].frame < at {
                at = max(cursor, live[liveNext].frame)
                what = 3
            }
            if what == 0 { break }
            renderVoices(from: Int(cursor - start), to: Int(at - start))
            cursor = at
            switch what {
            case 1: beat(tick: nextBeatTick, at: at, chunkStart: start, hostTime: hostTime)
            case 2: fire(at: at)
            case 4: fireScheduled()
            default:
                let l = live[liveNext]
                liveNext += 1
                l.on ? startLive(l.note, velocity: l.velocity) : stopLive(l.note)
            }
        }
        renderVoices(from: Int(cursor - start), to: n)
        mixDown(n, outL: outL, outR: outR)
        frame = end
    }

    private func fireScheduled() {
        let s = scheduled[0]
        scheduledCount -= 1
        for i in 0..<scheduledCount { scheduled[i] = scheduled[i + 1] }
        age += 1
        if s.click {
            let d = drumSounds[clickSound]
            let p = d.kit.pick(note: 0, velocity: s.velocity)
            // On the monitor's bus: the drums may be muted. Its fader is lower than the drums'.
            monitorVoices[slot(monitorVoices)].start(p.buffer, ratio: 1, gain: 1.8 * d.gain * p.gain * (0.3 + 0.7 * s.velocity),
                                                     heldFrames: .max, releaseSeconds: d.kit.release, group: 0, age: age,
                                                     sampleRate: sampleRate)
            return
        }
        play(monitor, note: s.note, velocity: s.velocity, held: Int(s.lengthTicks * samplesPerTick),
             live: false, in: monitorVoices, bus: .monitor, gain: monitorGain, tick: s.tick)
    }

    /// Publishes the frame → tick mapping after the transport changed it.
    private func reanchor() {
        previousAnchor = anchor
        anchor = playing
            ? .init(frame: anchorFrame, tick: anchorTick, samplesPerTick: samplesPerTick, tempo: tempo)
            : .init(frame: frame, tick: heldTick, samplesPerTick: .infinity, tempo: tempo)
    }

    @inline(__always) private func frameFor(tick: Double) -> Int64 {
        anchorFrame + Int64(((tick - anchorTick) * samplesPerTick).rounded(.up))
    }

    private func tickAt(frame f: Int64) -> Double {
        anchorTick + Double(f - anchorFrame) / samplesPerTick
    }

    private func beat(tick: Int, at: Int64, chunkStart: Int64, hostTime: UInt64?) {
        let beatIndex = tick / ticksPerBeat
        let beatInBar = beatIndex % (ticksPerBar / ticksPerBeat)
        if beatInBar == 0 {
            if pendingTempo > 0 {
                tempo = pendingTempo
                pendingTempo = 0
                anchorFrame = at
                anchorTick = Double(tick)
                samplesPerTick = sampleRate * 60 / (tempo * Double(ticksPerBeat))
                reanchor()
            }
            if pendingUnmute != 0 {
                muted &= ~pendingUnmute
                pendingUnmute = 0
            }
        }
        previousBeat = lastBeat
        var hostAt: UInt64 = 0
        if let hostTime {
            let seconds = Double(at - chunkStart) / sampleRate + latencySeconds
            hostAt = hostTime + UInt64(seconds * hostTicksPerSecond)
        }
        let barIndex = tick / ticksPerBar
        lastBeat = .init(hostTime: hostAt, bar: barIndex % chorusBars, beat: beatInBar, chorus: barIndex / chorusBars)
        nextBeatTick = tick + ticksPerBeat
    }

    private func fire(at frameAt: Int64) {
        let tick = events[nextEvent].tick
        while true {
            let e = events[nextEvent]
            if e.tick != tick { break }
            let at = Double(loopBase + e.tick)
            if muted & e.channel.bit == 0 && !(at >= silenceFrom && at < silenceTo) {
                trigger(e)
                if e.channel == .drums && drumSounds[e.value].kick && chunkKickCount < chunkKicks.count {
                    chunkKicks[chunkKickCount] = frameAt
                    chunkKickCount += 1
                }
            }
            nextEvent += 1
            if nextEvent == events.count {
                nextEvent = 0
                loopBase += loopTicks
                break
            }
        }
    }

    private func trigger(_ e: Event) {
        age += 1
        let held = Int(Double(e.lengthTicks) * samplesPerTick)
        switch e.channel {
        case .drums:
            let s = drumSounds[e.value]
            if s.chokes != 0 {
                for i in drumVoices.indices where drumVoices[i].active && drumVoices[i].group == s.chokes {
                    drumVoices[i].stop(releaseSeconds: 0.012, sampleRate: sampleRate)
                }
            }
            let p = s.kit.pick(note: 0, velocity: e.velocity)
            drumVoices[slot(drumVoices)].start(p.buffer, ratio: 1, gain: s.gain * p.gain * (0.3 + 0.7 * e.velocity), heldFrames: .max,
                                               releaseSeconds: s.kit.release, group: s.group, age: age, sampleRate: sampleRate)
        case .bass:
            // Monophonic: the new note cuts the last one.
            for i in bassVoices.indices where bassVoices[i].active {
                bassVoices[i].stop(releaseSeconds: 0.012, sampleRate: sampleRate)
            }
            play(e.instrument, note: e.value + transpose, velocity: e.velocity, held: held, live: false, in: bassVoices, bus: .bass,
                 gain: e.gain, tick: Double(e.tick))
        case .keys:
            play(e.instrument, note: e.value + transpose, velocity: e.velocity, held: held, live: false, in: keyVoices, bus: .keys,
                 gain: e.gain, tick: Double(e.tick))
        case .horns:
            play(e.instrument, note: e.value + transpose, velocity: e.velocity, held: held, live: false, in: hornVoices, bus: .horns,
                 gain: e.gain, tick: Double(e.tick))
        case .monitor:
            break
        }
    }

    /// Starts a pitched note on instrument `index`: the same note still sounding is damped first
    /// (a key restruck). The live stab reads its breath at `tick` (the song's, from its top).
    private func play(_ index: Int, note: Int, velocity: Float, held: Int, live: Bool,
                      in pool: UnsafeMutableBufferPointer<SampleVoice>, bus: Channel, gain: Float = 1, tick: Double) {
        age += 1
        guard let inst = instruments[index] else {
            guard let stab else { return }
            let b = bus.rawValue
            for i in stabVoices.indices where stabVoices[i].active && stabVoices[i].bus == b && stabVoices[i].note == note {
                stabVoices[i].stop()
                stabVoices[i].note = -1
            }
            let local = (tick.truncatingRemainder(dividingBy: Double(loopTicks)) + Double(loopTicks))
                .truncatingRemainder(dividingBy: Double(loopTicks))
            var slot = 0
            for i in stabVoices.indices {
                if !stabVoices[i].active { slot = i; break }
                if stabVoices[i].age < stabVoices[slot].age { slot = i }
            }
            stabVoices[slot].start(note: note, velocity: velocity, breath: stab.breath(tick: local, ticksPerBar: ticksPerBar), held: held,
                                   gain: gain, bus: b, live: live, age: age, settings: stab, sampleRate: sampleRate)
            return
        }
        for i in pool.indices where pool[i].active && pool[i].note == note {
            pool[i].stop(releaseSeconds: 0.03, sampleRate: sampleRate)
            pool[i].note = -1
        }
        let p = inst.pick(note: note, velocity: velocity)
        // Level follows velocity on top of the layer's own loudness.
        pool[slot(pool)].start(p.buffer, ratio: p.ratio, gain: p.gain * gain * (0.35 + 0.65 * velocity), heldFrames: held,
                               releaseSeconds: inst.release, note: note, live: live, sustain: true, age: age, sampleRate: sampleRate)
    }

    /// A free voice, or the oldest one.
    private func slot(_ pool: UnsafeMutableBufferPointer<SampleVoice>) -> Int {
        var oldest = 0
        for i in pool.indices {
            if !pool[i].active { return i }
            if pool[i].age < pool[oldest].age { oldest = i }
        }
        return oldest
    }

    private func renderVoices(from a: Int, to b: Int) {
        guard b > a else { return }
        let c = maxChunk
        for i in drumVoices.indices where drumVoices[i].active {
            drumVoices[i].render(busL, busR, from: a, to: b)
        }
        for i in bassVoices.indices where bassVoices[i].active {
            bassVoices[i].render(busL + c, busR + c, from: a, to: b)
        }
        for i in keyVoices.indices where keyVoices[i].active {
            keyVoices[i].render(busL + 2 * c, busR + 2 * c, from: a, to: b)
        }
        for i in hornVoices.indices where hornVoices[i].active {
            hornVoices[i].render(busL + 3 * c, busR + 3 * c, from: a, to: b)
        }
        for i in monitorVoices.indices where monitorVoices[i].active {
            monitorVoices[i].render(busL + 4 * c, busR + 4 * c, from: a, to: b)
        }
        for i in stabVoices.indices where stabVoices[i].active {
            let k = stabVoices[i].bus * c
            stabVoices[i].render(busL + k, busR + k, from: a, to: b)
        }
    }

    /// Buses → output: channel gains glide (~5 ms) toward 0 when muted, the sidechain dips the
    /// ducked channels after every kick, the dub send takes its share of each channel after
    /// that and the chamber's return joins the sum, meters take the peak, and a soft knee above
    /// 0.8 keeps the sum under 1.
    private func mixDown(_ n: Int, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        let c = maxChunk
        let glide = Float(1 - exp(-1 / (0.005 * sampleRate)))
        for i in 0..<n {
            outL[i] = 0
            outR[i] = 0
            sendL[i] = 0
            sendR[i] = 0
        }
        // The duck envelope: 1 right after a kick, back toward 0 with the release.
        let chunkStart = frame
        var e = Float(pow(Double(duckDecay), Double(max(0, chunkStart - lastKick))))
        var nextKick = 0
        for i in 0..<n {
            if nextKick < chunkKickCount, chunkKicks[nextKick] - chunkStart <= Int64(i) {
                e = 1
                nextKick += 1
            }
            kickEnv[i] = e
            e *= duckDecay
        }
        let dub = chamber.settings != nil
        for ch in Channel.allCases {
            let k = ch.rawValue
            let l = busL + k * c
            let r = busR + k * c
            let trim = ch == .monitor ? monitorTrim : bandTrim
            let target: Float = muted & ch.bit == 0 ? mix[k] * trim : 0
            var g = gain(ch)
            var level = self.level(ch)
            let depth = duck[k]
            let send = dub ? sends[k] : 0
            for i in 0..<n {
                g += (target - g) * glide
                let d: Float = 1 - depth * kickEnv[i]
                let sl = l[i] * g * d, sr = r[i] * g * d
                outL[i] += sl
                outR[i] += sr
                if send > 0 {
                    sendL[i] += sl * send
                    sendR[i] += sr * send
                }
                level = max(abs(sl), level * levelDecay)
            }
            setGain(ch, g)
            setLevel(ch, level)
        }
        if chunkKickCount > 0 { lastKick = chunkKicks[chunkKickCount - 1] }
        if dub {
            chamber.process(sendL: sendL, sendR: sendR, kick: kickEnv, n: n, samplesPerBeat: samplesPerTick * Double(ticksPerBeat),
                            playing: playing, outL: outL, outR: outR)
        }
        for i in 0..<n {
            outL[i] = Self.softClip(outL[i] * master / knee) * knee
            outR[i] = Self.softClip(outR[i] * master / knee) * knee
        }
    }

    @inline(__always) private static func softClip(_ x: Float) -> Float {
        let a = abs(x)
        if a <= 0.8 { return x }
        let y = 0.8 + 0.2 * tanh((a - 0.8) / 0.2)
        return x < 0 ? -y : y
    }

    private func gain(_ ch: Channel) -> Float {
        switch ch {
        case .drums: channelGain.0
        case .bass: channelGain.1
        case .keys: channelGain.2
        case .horns: channelGain.3
        case .monitor: channelGain.4
        }
    }

    private func setGain(_ ch: Channel, _ v: Float) {
        switch ch {
        case .drums: channelGain.0 = v
        case .bass: channelGain.1 = v
        case .keys: channelGain.2 = v
        case .horns: channelGain.3 = v
        case .monitor: channelGain.4 = v
        }
    }

    private func level(_ ch: Channel) -> Float {
        switch ch {
        case .drums: levels.0
        case .bass: levels.1
        case .keys: levels.2
        case .horns: levels.3
        case .monitor: levels.4
        }
    }

    private func setLevel(_ ch: Channel, _ v: Float) {
        switch ch {
        case .drums: levels.0 = v
        case .bass: levels.1 = v
        case .keys: levels.2 = v
        case .horns: levels.3 = v
        case .monitor: levels.4 = v
        }
    }

    // MARK: Commands

    private func apply(_ c: EngineCommand) {
        switch c {
        case .play:
            guard !playing else { return }
            playing = true
            anchorFrame = frame
            anchorTick = heldTick
            nextBeatTick = Int((heldTick / Double(ticksPerBeat)).rounded(.up)) * ticksPerBeat
            reanchor()
        case .pause:
            guard playing else { return }
            heldTick = tickAt(frame: frame)
            playing = false
            releaseBand()
            reanchor()
        case .stop:
            playing = false
            heldTick = 0
            nextEvent = 0
            loopBase = 0
            nextBeatTick = 0
            // Nothing waiting for a downbeat survives a stop: a lesson's tempo change left
            // pending here used to land on bar 1 of the next song and play it at the lesson's
            // tempo (Slow Burn at 90 instead of 68, 2026-10-31).
            pendingTempo = 0
            pendingUnmute = 0
            previousBeat = .init()
            lastBeat = .init()
            scheduledCount = 0
            epoch += 1
            silenceFrom = 0
            silenceTo = 0
            releaseBand()
            reanchor()
        case .countIn(let beats):
            guard !playing, beats > 0 else { return }
            // The cursor stays where it sits, so the bars before it don't sound under the clicks.
            let from = heldTick
            heldTick = from - Double(beats * ticksPerBeat)
            for b in 0..<beats {
                schedule(Scheduled(tick: from - Double((beats - b) * ticksPerBeat), note: 0, velocity: b == 0 ? 1 : 0.7,
                                   lengthTicks: 0, click: true))
            }
            reanchor()
        case .seek(let tick):
            if playing {
                playing = false
                releaseBand()
            }
            heldTick = tick
            scheduledCount = 0
            nextBeatTick = Int((heldTick / Double(ticksPerBeat)).rounded(.up)) * ticksPerBeat
            repositionCursor()
            reanchor()
        case .tempo(let bpm):
            if playing {
                pendingTempo = bpm == tempo ? 0 : bpm
            } else {
                tempo = bpm
                pendingTempo = 0
                samplesPerTick = sampleRate * 60 / (tempo * Double(ticksPerBeat))
                anchor.tempo = tempo
            }
        case .mute(let ch, let on):
            if on {
                muted |= ch.bit
                pendingUnmute &= ~ch.bit
            } else if playing {
                pendingUnmute |= ch.bit & muted
            } else {
                muted &= ~ch.bit
            }
        case .noteOn, .noteOff, .schedule, .click:
            break  // placed in time by `render`
        case .outputLatency(let s):
            latencySeconds = s
        case .silence(let from, let to):
            silenceFrom = from
            silenceTo = to
        case .trim(let band, let monitor):
            bandTrim = band
            monitorTrim = monitor
        case .transpose(let n):
            transpose = n
        case .band(let e):
            // The new band from the same tick: the event cursor moves to where the transport is.
            // Its kit and instruments come with it; voices still sounding keep their buffers.
            events = e.buffer
            drumSounds = e.drumSounds
            clickSound = e.clickSound
            instruments = e.instruments
            stab = e.stab
            monitor = e.monitor
            monitorGain = e.monitorGain
            duck = e.duck
            duckDecay = Float(exp(-1 / (e.duckRelease * sampleRate)))
            sends = e.sends
            knee = e.knee
            chamber.configure(e.dub)
            loopTicks = e.loopTicks
            chorusBars = e.chorusBars
            repositionCursor()
        }
    }

    /// The band's event cursor moves to where the transport is (a new band, or a seek).
    private func repositionCursor() {
        let t = playing ? tickAt(frame: frame) : heldTick
        let local = ((t.truncatingRemainder(dividingBy: Double(loopTicks))) + Double(loopTicks)).truncatingRemainder(dividingBy: Double(loopTicks))
        loopBase = Int((t - local).rounded())
        var i = 0
        while i < events.count && Double(events[i].tick) < local { i += 1 }
        if i == events.count {
            i = 0
            loopBase += loopTicks
        }
        nextEvent = i
    }

    private func startLive(_ note: Int, velocity: Float) {
        play(monitor, note: note, velocity: velocity, held: .max, live: true, in: monitorVoices, bus: .monitor, gain: monitorGain,
             tick: playing ? tickAt(frame: frame) : heldTick)
    }

    private func stopLive(_ note: Int) {
        let release = instruments[monitor]?.release ?? 0
        for i in monitorVoices.indices where monitorVoices[i].active && monitorVoices[i].live && monitorVoices[i].note == note {
            monitorVoices[i].stop(releaseSeconds: release, sampleRate: sampleRate)
            monitorVoices[i].live = false
        }
        let b = Channel.monitor.rawValue
        for i in stabVoices.indices where stabVoices[i].active && stabVoices[i].live && stabVoices[i].bus == b && stabVoices[i].note == note {
            stabVoices[i].stop()
            stabVoices[i].live = false
        }
    }

    private func releaseBand() {
        for i in drumVoices.indices where drumVoices[i].active { drumVoices[i].stop(releaseSeconds: 0.05, sampleRate: sampleRate) }
        for i in bassVoices.indices where bassVoices[i].active { bassVoices[i].stop(releaseSeconds: 0.03, sampleRate: sampleRate) }
        for i in keyVoices.indices where keyVoices[i].active { keyVoices[i].stop(releaseSeconds: 0.15, sampleRate: sampleRate) }
        for i in hornVoices.indices where hornVoices[i].active { hornVoices[i].stop(releaseSeconds: 0.08, sampleRate: sampleRate) }
        let monitorBus = Channel.monitor.rawValue
        for i in stabVoices.indices where stabVoices[i].active && stabVoices[i].bus != monitorBus { stabVoices[i].stop() }
    }

    private func publish(hostTime: UInt64?, frames: Int) {
        func db(_ x: Float) -> Float { x < 0.000001 ? -120 : 20 * log10(x) }
        _ = published.withLockIfAvailable { s in
            s.playing = playing
            s.epoch = epoch
            s.tempo = tempo
            s.pendingTempo = pendingTempo
            s.lastBeat = lastBeat
            s.previousBeat = previousBeat
            s.levels = (db(levels.0), db(levels.1), db(levels.2), db(levels.3), db(levels.4))
            s.muted = muted
            s.pendingUnmute = pendingUnmute
            s.sampleRate = sampleRate
            if let hostTime {
                // The buffer that just rendered reaches the speaker `latency` after its host time.
                s.refFrame = frame - Int64(frames)
                s.refHostTime = hostTime + UInt64(latencySeconds * hostTicksPerSecond)
            }
            s.anchor = anchor
            s.previousAnchor = previousAnchor
        }
    }
}
