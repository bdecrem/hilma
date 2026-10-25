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
    /// Seconds from render to the speaker; beat times the UI sees include it.
    case outputLatency(Double)
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

    var playing = false
    var tempo = 0.0
    /// The tempo waiting for the next downbeat, 0 when none.
    var pendingTempo = 0.0
    var lastBeat = Beat()
    var previousBeat = Beat()
    /// Peak level per channel in dBFS, smoothed.
    var levels: (Float, Float, Float, Float, Float) = (-120, -120, -120, -120, -120)
    var muted: UInt8 = 0
    var pendingUnmute: UInt8 = 0

    // Clock mapping: host time → frame → transport tick.
    var sampleRate = 48000.0
    var refFrame: Int64 = 0
    var refHostTime: UInt64 = 0
    var anchorFrame: Int64 = 0
    var anchorTick = 0.0
    var samplesPerTick = 0.0

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
    let loopTicks: Int

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

    private struct Event {
        var tick: Int
        var channel: Channel
        /// Drum: index into `drumSounds`. Otherwise the MIDI note.
        var value: Int
        var velocity: Float
        var lengthTicks: Int
    }

    private struct DrumSound {
        var buffer: SampleBuffer
        var gain: Float
        var group: Int
        var chokes: Int
    }

    private let events: UnsafeMutableBufferPointer<Event>
    private let drumSounds: UnsafeMutableBufferPointer<DrumSound>
    private let subs: UnsafeMutableBufferPointer<(root: Int, buffer: SampleBuffer)>

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
    private var hostTicksPerSecond: Double

    private let maxChunk = 4096
    private let busL: UnsafeMutablePointer<Float>
    private let busR: UnsafeMutablePointer<Float>
    private var channelGain: (Float, Float, Float, Float, Float) = (1, 1, 1, 1, 1)
    private var levels: (Float, Float, Float, Float, Float) = (0, 0, 0, 0, 0)
    /// Channel faders: drums, bass, keys, horns, monitor.
    private let mix: [Float] = [1.0, 0.5, 0.22, 0.18, 0.5]
    /// Headroom: kick and sub land together on the downbeats.
    private let master: Float = 0.8
    private let levelDecay: Float

    private let drumVoices = UnsafeMutableBufferPointer<SampleVoice>.allocate(capacity: 24)
    private let bassVoices = UnsafeMutableBufferPointer<SampleVoice>.allocate(capacity: 4)
    private let keyVoices = UnsafeMutableBufferPointer<FMVoice>.allocate(capacity: 16)
    private let hornVoices = UnsafeMutableBufferPointer<FMVoice>.allocate(capacity: 8)
    private let monitorVoices = UnsafeMutableBufferPointer<FMVoice>.allocate(capacity: 16)
    private var age = 0

    init(band: BandData, sampleRate: Double, tempo: Double) {
        self.sampleRate = sampleRate
        self.tempo = tempo
        ticksPerBeat = band.ticksPerBeat
        ticksPerBar = band.ticksPerBar
        loopTicks = band.loopTicks
        samplesPerTick = sampleRate * 60 / (tempo * Double(band.ticksPerBeat))

        var mach = mach_timebase_info_data_t()
        mach_timebase_info(&mach)
        hostTicksPerSecond = 1e9 * Double(mach.denom) / Double(mach.numer)

        // Drum sounds by name; "ch" chokes "oh".
        let names = band.sounds.keys.sorted()
        drumSounds = .allocate(capacity: names.count)
        for (i, name) in names.enumerated() {
            let s = band.sounds[name]!
            drumSounds[i] = DrumSound(buffer: .bundled(s.file), gain: Float(pow(10, s.gainDb / 20)),
                                      group: name == "oh" ? 1 : 0, chokes: name == "ch" ? 1 : 0)
        }
        subs = .allocate(capacity: band.subs.count)
        for (i, s) in band.subs.enumerated() { subs[i] = (s.root, .bundled(s.file)) }

        var list: [Event] = []
        for h in band.channels.drums {
            guard let i = names.firstIndex(of: h.s) else { fatalError("band: unknown drum sound \(h.s)") }
            list.append(Event(tick: h.t, channel: .drums, value: i, velocity: Float(h.v), lengthTicks: 0))
        }
        for (channel, notes) in [(Channel.bass, band.channels.bass), (.keys, band.channels.keys), (.horns, band.channels.horns)] {
            for n in notes {
                list.append(Event(tick: n.t, channel: channel, value: n.n, velocity: Float(n.v), lengthTicks: n.len))
            }
        }
        list.sort { $0.tick < $1.tick }
        events = .allocate(capacity: list.count)
        _ = events.initialize(from: list)

        busL = .allocate(capacity: maxChunk * 5)
        busR = .allocate(capacity: maxChunk * 5)
        levelDecay = Float(exp(-Double(1) / (0.25 * sampleRate)))
        drumVoices.initialize(repeating: SampleVoice())
        bassVoices.initialize(repeating: SampleVoice())
        keyVoices.initialize(repeating: FMVoice())
        hornVoices.initialize(repeating: FMVoice())
        monitorVoices.initialize(repeating: FMVoice())
        commands.reserveCapacity(256)
        inbox.withLock { $0.reserveCapacity(256) }
        _ = sineTable[0]
        publish(hostTime: nil, frames: 0)
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

    private func renderChunk(_ n: Int, hostTime: UInt64?, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        busL.update(repeating: 0, count: maxChunk * 5)
        busR.update(repeating: 0, count: maxChunk * 5)

        let start = frame
        let end = frame + Int64(n)
        var cursor = start
        while true {
            // The next thing to happen in this chunk: a beat, a band event or a live note.
            // A beat goes before an event on the same tick (a tempo change re-anchors first).
            var at = end
            var what = 0
            if playing {
                let beatTick = Double(nextBeatTick)
                let eventTick = Double(loopBase + events[nextEvent].tick)
                if beatTick <= eventTick {
                    at = min(at, frameFor(tick: beatTick)); what = at < end ? 1 : 0
                } else {
                    at = min(at, frameFor(tick: eventTick)); what = at < end ? 2 : 0
                }
            }
            if liveNext < liveCount, live[liveNext].frame < (what == 0 ? end : at) {
                at = max(cursor, live[liveNext].frame)
                what = 3
            }
            if what == 0 { break }
            renderVoices(from: Int(cursor - start), to: Int(at - start))
            cursor = at
            switch what {
            case 1: beat(tick: nextBeatTick, at: at, chunkStart: start, hostTime: hostTime)
            case 2: fire(at: at)
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
        let barsPerLoop = loopTicks / ticksPerBar
        let barIndex = tick / ticksPerBar
        lastBeat = .init(hostTime: hostAt, bar: barIndex % barsPerLoop, beat: beatInBar, chorus: barIndex / barsPerLoop)
        nextBeatTick = tick + ticksPerBeat
    }

    private func fire(at: Int64) {
        let tick = events[nextEvent].tick
        while true {
            let e = events[nextEvent]
            if e.tick != tick { break }
            if muted & e.channel.bit == 0 { trigger(e) }
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
            drumVoices[slot(drumVoices)].start(s.buffer, ratio: 1, gain: s.gain * e.velocity, heldFrames: .max,
                                               releaseSeconds: 0.01, group: s.group, age: age, sampleRate: sampleRate)
        case .bass:
            // Monophonic: the new note cuts the last one.
            for i in bassVoices.indices where bassVoices[i].active {
                bassVoices[i].stop(releaseSeconds: 0.008, sampleRate: sampleRate)
            }
            var best = 0
            for i in 1..<subs.count where abs(subs[i].root - e.value) < abs(subs[best].root - e.value) { best = i }
            let ratio = pow(2, Double(e.value - subs[best].root) / 12)
            bassVoices[slot(bassVoices)].start(subs[best].buffer, ratio: ratio, gain: e.velocity, heldFrames: held,
                                               releaseSeconds: 0.015, group: 0, age: age, sampleRate: sampleRate)
        case .keys:
            keyVoices[slot(keyVoices)].start(note: e.value, velocity: e.velocity, patch: .rhodes, heldFrames: held,
                                             live: false, age: age, sampleRate: sampleRate)
        case .horns:
            hornVoices[slot(hornVoices)].start(note: e.value, velocity: e.velocity, patch: .brass, heldFrames: held,
                                               live: false, age: age, sampleRate: sampleRate)
        case .monitor:
            break
        }
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

    private func slot(_ pool: UnsafeMutableBufferPointer<FMVoice>) -> Int {
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
            keyVoices[i].render(busL + 2 * c, from: a, to: b, gain: 1)
        }
        for i in hornVoices.indices where hornVoices[i].active {
            hornVoices[i].render(busL + 3 * c, from: a, to: b, gain: 1)
        }
        for i in monitorVoices.indices where monitorVoices[i].active {
            monitorVoices[i].render(busL + 4 * c, from: a, to: b, gain: 1)
        }
    }

    /// Buses → output: mono FM buses go to both sides, channel gains glide (~5 ms) toward
    /// 0 when muted, meters take the peak, and a soft knee above 0.8 keeps the sum under 1.
    private func mixDown(_ n: Int, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        let c = maxChunk
        let glide = Float(1 - exp(-1 / (0.005 * sampleRate)))
        for i in 0..<n {
            outL[i] = 0
            outR[i] = 0
        }
        for ch in Channel.allCases {
            let k = ch.rawValue
            let stereo = ch == .drums || ch == .bass
            let l = busL + k * c
            let r = stereo ? busR + k * c : l
            let target: Float = muted & ch.bit == 0 ? mix[k] : 0
            var g = gain(ch)
            var level = self.level(ch)
            for i in 0..<n {
                g += (target - g) * glide
                let sl = l[i] * g, sr = r[i] * g
                outL[i] += sl
                outR[i] += sr
                level = max(abs(sl), level * levelDecay)
            }
            setGain(ch, g)
            setLevel(ch, level)
        }
        for i in 0..<n {
            outL[i] = Self.softClip(outL[i] * master)
            outR[i] = Self.softClip(outR[i] * master)
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
        case .pause:
            guard playing else { return }
            heldTick = tickAt(frame: frame)
            playing = false
            releaseBand()
        case .stop:
            playing = false
            heldTick = 0
            nextEvent = 0
            loopBase = 0
            nextBeatTick = 0
            previousBeat = .init()
            lastBeat = .init()
            releaseBand()
        case .tempo(let bpm):
            if playing {
                pendingTempo = bpm == tempo ? 0 : bpm
            } else {
                tempo = bpm
                samplesPerTick = sampleRate * 60 / (tempo * Double(ticksPerBeat))
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
        case .noteOn, .noteOff:
            break  // placed in time by `render`
        case .outputLatency(let s):
            latencySeconds = s
        }
    }

    private func startLive(_ note: Int, velocity: Float) {
        for i in monitorVoices.indices where monitorVoices[i].active && monitorVoices[i].note == note {
            monitorVoices[i].noteOff()
        }
        age += 1
        monitorVoices[slot(monitorVoices)].start(note: note, velocity: velocity, patch: .rhodes, heldFrames: .max,
                                                 live: true, age: age, sampleRate: sampleRate)
    }

    private func stopLive(_ note: Int) {
        for i in monitorVoices.indices where monitorVoices[i].active && monitorVoices[i].live && monitorVoices[i].note == note {
            monitorVoices[i].noteOff()
            monitorVoices[i].live = false
        }
    }

    private func releaseBand() {
        for i in drumVoices.indices where drumVoices[i].active { drumVoices[i].stop(releaseSeconds: 0.05, sampleRate: sampleRate) }
        for i in bassVoices.indices where bassVoices[i].active { bassVoices[i].stop(releaseSeconds: 0.03, sampleRate: sampleRate) }
        for i in keyVoices.indices where keyVoices[i].active { keyVoices[i].noteOff() }
        for i in hornVoices.indices where hornVoices[i].active { hornVoices[i].noteOff() }
    }

    private func publish(hostTime: UInt64?, frames: Int) {
        func db(_ x: Float) -> Float { x < 0.000001 ? -120 : 20 * log10(x) }
        _ = published.withLockIfAvailable { s in
            s.playing = playing
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
            s.anchorFrame = playing ? anchorFrame : frame
            s.anchorTick = playing ? anchorTick : heldTick
            s.samplesPerTick = playing ? samplesPerTick : .infinity
        }
    }
}
