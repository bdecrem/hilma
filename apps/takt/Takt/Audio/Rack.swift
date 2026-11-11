import Foundation

/// The console of a song mixed to a reference render (a band's `rack`): Halbschatten, 2026-11-09
/// (`misc/HALBSCHATTEN.md`, `misc/halbschatten_reference.py`; the write-up is `DUB-TECHNO.md`
/// §8). Everything here is a port of that script's `render`, per sample, at the reference's own
/// signal levels, so every nonlinear stage (the stab's saturator, the echoes' feedback, the
/// master) sees what it saw there:
///
/// - **lanes**: a value by bar, linear between points (the stab's cutoff and decay, the echo's
///   feedback and send, the pad's cutoff and level, the lead's level, the noise, the last fade);
/// - **the stab bus**: the band's hits are the reference's own raw buffers (`hsStab0…3`), your
///   keys and the notes a level leaves to the band are saws synthesized per note; one filter
///   for the whole bus (two state-variable lowpasses a side) whose cutoff every hit kicks open;
/// - **two tape echoes** (the stab's, a dotted eighth, its feedback on a lane, each hit entering
///   on the other side; the lead's, a dotted quarter);
/// - **the lead** (two-operator FM) and **the pad** (a drone of twenty saws, always on);
/// - **drum buses** the kit's sounds are routed to by name (`sounds.<name>.bus`), each with its
///   sends; **the noise bed**, looped;
/// - **the hall and the room**, convolution with the reference's impulses (`Convolver`);
/// - **the master**: a 24 Hz highpass, the fade, tanh, the output level.
///
/// One per loaded band, built on the main thread; the renderer calls it on the render thread
/// and nothing allocates there.
final class Rack {
    // MARK: Settings (the song file's `rack`)

    struct Settings: Decodable {
        struct Bus: Decodable {
            let name: String
            var hall: Float?
            var room: Float?
            var echo: Float?
        }

        struct Stab: Decodable {
            let gain: Float
            let duck: Float
            let hall: Float
            let q: [Float]
            /// Octaves the filter opens at a full hit, and how fast it falls back (seconds).
            let env: Float
            let envTime: Double
            let drive: Float
            /// The level taken back as the filter opens: (ref / cutoff) ^ power.
            let compRef: Float
            let compPower: Float
            let lfoDepth: Float
            let lfoBars: Double
            let min: Float
            let max: Float
            let attack: Double
            /// A hit lasts this many decay times.
            let lengths: Double
            /// A synthesized note: three saws (cents, pan −1…1), a spread of cents fixed per note,
            /// the noise through the same filter, and how many notes the reference's chord has.
            let detune: [Double]
            let pans: [Float]
            let spread: Double
            let noise: Float
            let notes: Float
            /// The raw buffers' files are the reference's × this (a hit's gain is its velocity
            /// over it; the filter's kick wants the velocity).
            let fileScale: Float
        }

        struct Echo: Decodable {
            let beats: Double
            /// Used when no lane names it.
            let feedback: Float
            let lowpass: Double
            let highpass: Double
            let drive: Float
            /// [depth, Hz] pairs.
            let wobble: [[Double]]
            let level: Float
            let duck: Float
            let hall: Float
        }

        struct Lead: Decodable {
            let gain: Float
            let lowpass: Double
            let hall: Float
        }

        struct Pad: Decodable {
            /// [MIDI note, level] pairs; per note two saws a side (`left`, `right`: cents).
            let notes: [[Double]]
            let left: [Double]
            let right: [Double]
            /// The reference's start phases, four a note (left, left, right, right).
            let phases: [Double]
            let q: Float
            let lfoDepth: Float
            let lfoBars: Double
            let lfoPhase: Double
            let rightScale: Float
            let highpass: Double
            let gain: Float
            let duck: Float
            let hall: Float
        }

        struct Reverb: Decodable {
            let ir: String
            let block: Int
            let level: Float
            var duck: Float?
            /// A second-order Butterworth highpass on what goes in, Hz (`MoogRack`, Irrlicht's hall).
            var highpass: Double? = nil
        }

        struct Noise: Decodable {
            let kit: String
            let gain: Float
            let duck: Float
        }

        struct Master: Decodable {
            let highpass: Double
            let drive: Float
            let post: Float
            /// The reference's own last scale, then the app's level under it.
            let scale: Float
            let level: Float
            /// The reference's limiter, its forward pass (the instant gain a peak over `limit`
            /// needs, back over `limitRelease` seconds; the reference smooths the attack with a
            /// second pass backwards in time, which a live render cannot): absent, none.
            var limit: Float? = nil
            var limitRelease: Double? = nil
        }

        let lanes: [String: [[Double]]]
        let buses: [Bus]
        let stab: Stab
        let echo: Echo
        let lead: Lead
        let leadEcho: Echo
        let pad: Pad
        let hall: Reverb
        let room: Reverb
        let noise: Noise
        let master: Master
    }

    // MARK: Pieces

    /// A value by bar, linear between its points, flat outside them.
    struct Lane {
        private let bars: UnsafeMutablePointer<Double>
        private let values: UnsafeMutablePointer<Double>
        private let count: Int
        private var at = 0

        init(_ points: [[Double]]?, default d: Double) {
            let p = (points ?? []).filter { $0.count == 2 }.sorted { $0[0] < $1[0] }
            count = max(1, p.count)
            bars = .allocate(capacity: count)
            values = .allocate(capacity: count)
            bars[0] = 0
            values[0] = d
            for (i, q) in p.enumerated() {
                bars[i] = q[0]
                values[i] = q[1]
            }
        }

        mutating func value(_ bar: Double) -> Float {
            if bar <= bars[0] { return Float(values[0]) }
            if bar >= bars[count - 1] { return Float(values[count - 1]) }
            if bar < bars[at] { at = 0 }
            while at + 1 < count - 1 && bar >= bars[at + 1] { at += 1 }
            let t = (bar - bars[at]) / (bars[at + 1] - bars[at])
            return Float(values[at] + (values[at + 1] - values[at]) * t)
        }
    }

    /// The reference's `svf_lp`: a TPT state-variable lowpass, the cutoff's `g` given per sample.
    struct SVF {
        var ic1: Float = 0, ic2: Float = 0
        let k: Float
        init(q: Float) { k = 1 / q }
        @inline(__always) mutating func low(_ x: Float, g: Float) -> Float {
            let a1 = 1 / (1 + g * (g + k))
            let a2 = g * a1
            let a3 = g * a2
            let v3 = x - ic2
            let v1 = a1 * ic1 + a2 * v3
            let v2 = ic2 + a2 * ic1 + a3 * v3
            ic1 = 2 * v1 - ic1
            ic2 = 2 * v2 - ic2
            return v2
        }
        mutating func clear() { ic1 = 0; ic2 = 0 }
    }

    /// A second-order Butterworth (scipy's `butter(2, fc)`), transposed direct form II.
    struct Biquad {
        var b0: Float = 1, b1: Float = 0, b2: Float = 0, a1: Float = 0, a2: Float = 0
        var z1: Float = 0, z2: Float = 0

        static func lowpass(_ f: Double, sr: Double) -> Biquad { make(f, sr, high: false) }
        static func highpass(_ f: Double, sr: Double) -> Biquad { make(f, sr, high: true) }

        private static func make(_ f: Double, _ sr: Double, high: Bool) -> Biquad {
            let w = 2 * Double.pi * f / sr, cw = cos(w), alpha = sin(w) / (2 * 0.5.squareRoot()), a0 = 1 + alpha
            let e = high ? (1 + cw) / 2 : (1 - cw) / 2
            return Biquad(b0: Float(e / a0), b1: Float((high ? -(1 + cw) : (1 - cw)) / a0), b2: Float(e / a0),
                          a1: Float(-2 * cw / a0), a2: Float((1 - alpha) / a0))
        }

        @inline(__always) mutating func run(_ x: Float) -> Float {
            let y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }
        mutating func clear() { z1 = 0; z2 = 0 }
    }

    /// The reference's `tape_delay`: a ping-pong delay; what is read from each line goes through
    /// a one-pole lowpass and a one-pole highpass, and that is both the output and, saturated,
    /// the other line's feedback.
    struct Tape {
        static let size = 1 << 17
        static let mask = size - 1
        let l: UnsafeMutablePointer<Float> = .allocate(capacity: Tape.size)
        let r: UnsafeMutablePointer<Float> = .allocate(capacity: Tape.size)
        var wp = 0
        var lpL: Float = 0, lpR: Float = 0, hpL: Float = 0, hpR: Float = 0
        let lpA: Float, hpA: Float, drive: Float
        /// The delay in frames, gliding to the tempo's.
        var delay = 0.0
        let wobble: [(depth: Double, step: Double)]
        var phases: [Double]

        init(_ s: Settings.Echo, sampleRate: Double) {
            lpA = Float(1 - exp(-2 * Double.pi * s.lowpass / sampleRate))
            hpA = Float(1 - exp(-2 * Double.pi * s.highpass / sampleRate))
            drive = s.drive
            wobble = s.wobble.filter { $0.count == 2 }.map { ($0[0], 2 * Double.pi * $0[1] / sampleRate) }
            phases = wobble.map { _ in 0 }
            clear()
        }

        mutating func clear() {
            l.update(repeating: 0, count: Tape.size)
            r.update(repeating: 0, count: Tape.size)
            wp = 0
            lpL = 0; lpR = 0; hpL = 0; hpR = 0
            delay = 0
            for i in phases.indices { phases[i] = 0 }
        }

        @inline(__always) mutating func run(_ inL: Float, _ inR: Float, feedback: Float, target: Double, glide: Double,
                                            advance: Bool) -> (Float, Float) {
            delay = delay == 0 ? target : delay + (target - delay) * glide
            var m = 1.0
            for i in wobble.indices {
                m += wobble[i].depth * sin(phases[i])
                if advance { phases[i] += wobble[i].step }
            }
            var rp = Double(wp) - min(delay * m, Double(Tape.size - 8))
            if rp < 0 { rp += Double(Tape.size) }
            let i0 = Int(rp)
            let fr = Float(rp - Double(i0))
            let i1 = (i0 + 1) & Tape.mask
            let j0 = i0 & Tape.mask
            let yL = l[j0] + fr * (l[i1] - l[j0])
            let yR = r[j0] + fr * (r[i1] - r[j0])
            lpL += lpA * (yL - lpL)
            hpL += hpA * (lpL - hpL)
            let fL = lpL - hpL
            lpR += lpA * (yR - lpR)
            hpR += hpA * (lpR - hpR)
            let fR = lpR - hpR
            l[wp] = inL + feedback * tanh(drive * fR) / drive
            r[wp] = inR + feedback * tanh(drive * fL) / drive
            wp = (wp + 1) & Tape.mask
            return (fL, fR)
        }
    }

    /// The reference's `saw_blep`, one sample.
    @inline(__always) static func saw(_ ph: inout Double, _ dt: Double) -> Float {
        var v = 2 * ph - 1
        if ph < dt {
            let t = ph / dt
            v -= t + t - t * t - 1
        } else if ph > 1 - dt {
            let t = (ph - 1) / dt
            v -= t * t + t + t + 1
        }
        ph += dt
        if ph >= 1 { ph -= 1 }
        return Float(v)
    }

    @inline(__always) static func hz(_ note: Double) -> Double { 440 * pow(2, (note - 69) / 12) }

    /// A stab hit from one of the reference's raw buffers.
    struct Hit {
        var active = false
        var buffer = SampleBuffer.empty
        var position = 0.0
        var step = 1.0
        var gain: Float = 0
        var delay = 0
        var started = false
        var frames = 0
        var total = 0
        var env: Float = 1
        var decay: Float = 1
    }

    /// A stab note synthesized: your keys, and the notes a level leaves to the band.
    struct Saws {
        var active = false
        var note = -1
        var live = false
        var gain: Float = 0
        var delay = 0
        var started = false
        var frames = 0
        var total = 0
        var env: Float = 1
        var decay: Float = 1
        var ph: (Double, Double, Double) = (0, 0, 0)
        var dt: (Double, Double, Double) = (0, 0, 0)
        var seed: UInt32 = 1
        var age = 0
    }

    /// A lead note: the reference's `fm_pluck`.
    struct Pluck {
        var active = false
        var note = -1
        var live = false
        var velocity: Float = 0
        var gain: Float = 0
        var delay = 0
        var frames = 0
        /// Frames until the key comes up (Int.max while a key holds it).
        var held = Int.max
        var f = 0.0
        var age = 0
    }

    // MARK: State

    let settings: Settings
    private let sr: Double
    private let maxChunk: Int
    /// The kit's buses, by index (a drum sound's `bus`): what the renderer's voices add into.
    let busNames: [String]
    private let auxL: UnsafeMutablePointer<Float>
    private let auxR: UnsafeMutablePointer<Float>
    private let busHall: [Float], busRoom: [Float], busEcho: [Float]

    private var stabCutoff: Lane, stabDecay: Lane, echoFeedback: Lane, echoSend: Lane
    private var padCutoff: Lane, padLevel: Lane, leadLevel: Lane, noiseLevel: Lane, fade: Lane

    private let hits = UnsafeMutableBufferPointer<Hit>.allocate(capacity: 16)
    private let saws = UnsafeMutableBufferPointer<Saws>.allocate(capacity: 48)
    private let plucks = UnsafeMutableBufferPointer<Pluck>.allocate(capacity: 12)
    private var age = 0
    private let stabL: UnsafeMutablePointer<Float>, stabR: UnsafeMutablePointer<Float>
    private let leadL: UnsafeMutablePointer<Float>, leadR: UnsafeMutablePointer<Float>
    /// The filter envelope's kicks in the chunk (a hit's velocity at its first frame).
    private let kicks: UnsafeMutablePointer<Float>
    /// Each hit's own decay time, read from its lane across the chunk.
    private let taus: UnsafeMutablePointer<Float>
    private var fenv: Float = 0
    private let fenvDecay: Float
    private var s1L: SVF, s2L: SVF, s1R: SVF, s2R: SVF

    private var echo: Tape, leadEcho: Tape
    /// Which side the stab enters the echo on (0 left … 1 right), its target, and the switches
    /// waiting for their frame (a band hit is known a tick ahead: the reference's switch ends
    /// 20 samples before the hit).
    private var side: Float = 0
    private var sideTarget: Float = 0
    private var parity = 0
    private var lastHitFrame: Int64 = .min / 2
    private let switches = UnsafeMutableBufferPointer<(wait: Int, target: Float)>.allocate(capacity: 16)
    private var switchCount = 0
    private let sideStep: Float
    private let sideLead: Int, sideRamp: Int

    private let padPhase: UnsafeMutablePointer<Double>
    private let padStep: UnsafeMutablePointer<Double>
    private let padGain: UnsafeMutablePointer<Float>
    private let padStart: [Double]
    private var padFL: SVF, padFR: SVF
    private var padHL: Biquad, padHR: Biquad
    private var padGate: Float = 0

    private var leadFL: Biquad, leadFR: Biquad
    private var seconds = 0.0

    private let noise: SampleBuffer
    private let noiseScale: Float
    private var noisePos = 0.0

    private let hallL: Convolver, hallR: Convolver, roomL: Convolver, roomR: Convolver
    private var masterL: Biquad, masterR: Biquad
    private var limiter: Float = 1
    private var frame: Int64 = 0

    /// Debug (`-RackSolo chords,hall`, `-RackRaw 1`): only the named buses, before the master.
    private let solo: Set<String>?
    private let raw: Bool
    func passes(_ name: String) -> Bool { solo?.contains(name) ?? true }
    private var busOn: [Bool] = []
    private var on = (chords: true, dub: true, pad: true, lead: true, leadEcho: true, noise: true, hall: true, room: true)

    init(_ s: Settings, sampleRate: Double, maxChunk: Int) {
        settings = s
        sr = sampleRate
        self.maxChunk = maxChunk
        busNames = s.buses.map(\.name)
        let n = max(1, s.buses.count) * maxChunk
        auxL = .allocate(capacity: n)
        auxR = .allocate(capacity: n)
        auxL.initialize(repeating: 0, count: n)
        auxR.initialize(repeating: 0, count: n)
        busHall = s.buses.map { $0.hall ?? 0 }
        busRoom = s.buses.map { $0.room ?? 0 }
        busEcho = s.buses.map { $0.echo ?? 0 }
        stabCutoff = Lane(s.lanes["stabCutoff"], default: 800)
        stabDecay = Lane(s.lanes["stabDecay"], default: 0.15)
        echoFeedback = Lane(s.lanes["echoFeedback"], default: Double(s.echo.feedback))
        echoSend = Lane(s.lanes["echoSend"], default: 1)
        padCutoff = Lane(s.lanes["padCutoff"], default: 500)
        padLevel = Lane(s.lanes["padLevel"], default: 1)
        leadLevel = Lane(s.lanes["leadLevel"], default: 1)
        noiseLevel = Lane(s.lanes["noise"], default: 1)
        fade = Lane(s.lanes["fade"], default: 1)
        hits.initialize(repeating: Hit())
        saws.initialize(repeating: Saws())
        plucks.initialize(repeating: Pluck())
        stabL = .allocate(capacity: maxChunk); stabR = .allocate(capacity: maxChunk)
        leadL = .allocate(capacity: maxChunk); leadR = .allocate(capacity: maxChunk)
        kicks = .allocate(capacity: maxChunk)
        taus = .allocate(capacity: maxChunk)
        fenvDecay = Float(exp(-1 / (s.stab.envTime * sampleRate)))
        precondition(s.stab.q.count == 2 && s.stab.detune.count == 3 && s.stab.pans.count == 3, "rack: the stab's two filters and three saws")
        s1L = SVF(q: s.stab.q[0]); s2L = SVF(q: s.stab.q[1]); s1R = SVF(q: s.stab.q[0]); s2R = SVF(q: s.stab.q[1])
        echo = Tape(s.echo, sampleRate: sampleRate)
        leadEcho = Tape(s.leadEcho, sampleRate: sampleRate)
        switches.initialize(repeating: (wait: 0, target: 0))
        // The reference's 200-sample ramp ending 20 samples before the hit, in its 44.1 kHz frames.
        sideRamp = Int((200.0 / 44100 * sampleRate).rounded())
        sideLead = Int((220.0 / 44100 * sampleRate).rounded())
        sideStep = 1 / Float(sideRamp)
        let voices = s.pad.notes.count * 4
        precondition(s.pad.phases.count == voices && s.pad.left.count == 2 && s.pad.right.count == 2, "rack: four pad saws a note")
        padPhase = .allocate(capacity: voices)
        padStep = .allocate(capacity: voices)
        padGain = .allocate(capacity: voices)
        padStart = s.pad.phases
        for (i, note) in s.pad.notes.enumerated() {
            let f = Rack.hz(note[0])
            for (j, cents) in (s.pad.left + s.pad.right).enumerated() {
                padStep[i * 4 + j] = f * pow(2, cents / 1200) / sampleRate
                padGain[i * 4 + j] = Float(note[1])
                padPhase[i * 4 + j] = s.pad.phases[i * 4 + j]
            }
        }
        padFL = SVF(q: s.pad.q); padFR = SVF(q: s.pad.q)
        padHL = .highpass(s.pad.highpass, sr: sampleRate); padHR = .highpass(s.pad.highpass, sr: sampleRate)
        leadFL = .lowpass(s.lead.lowpass, sr: sampleRate); leadFR = .lowpass(s.lead.lowpass, sr: sampleRate)
        let kit = SampledInstrument.shared(SampledInstrument.rated(s.noise.kit, sampleRate: sampleRate))
        noise = kit.pick(note: 0, velocity: 1).buffer
        noiseScale = 1 / 32768
        hallL = Convolver(.bundled(s.hall.ir, side: 0, sampleRate: sampleRate, block: s.hall.block))
        hallR = Convolver(.bundled(s.hall.ir, side: 1, sampleRate: sampleRate, block: s.hall.block))
        roomL = Convolver(.bundled(s.room.ir, side: 0, sampleRate: sampleRate, block: s.room.block))
        roomR = Convolver(.bundled(s.room.ir, side: 1, sampleRate: sampleRate, block: s.room.block))
        masterL = .highpass(s.master.highpass, sr: sampleRate); masterR = .highpass(s.master.highpass, sr: sampleRate)
        #if DEBUG
        let d = UserDefaults.standard
        solo = d.string(forKey: "RackSolo").map { Set($0.split(separator: ",").map(String.init)) }
        raw = d.bool(forKey: "RackRaw") || solo != nil
        #else
        solo = nil
        raw = false
        #endif
        busOn = busNames.map { passes($0) }
        on = (passes("chords"), passes("dub_delay"), passes("pad"), passes("lead"), passes("lead_echo"), passes("noise"), passes("hall"), passes("room"))
    }

    // MARK: From the renderer

    /// The kit bus a drum voice adds into (`index` from `busNames`).
    func bus(_ index: Int) -> (UnsafeMutablePointer<Float>, UnsafeMutablePointer<Float>) {
        (auxL + index * maxChunk, auxR + index * maxChunk)
    }

    /// The top of a chunk: the kit's buses empty.
    func begin(_ n: Int) {
        for b in 0..<busNames.count {
            (auxL + b * maxChunk).update(repeating: 0, count: n)
            (auxR + b * maxChunk).update(repeating: 0, count: n)
        }
    }

    /// The song from its top (a stop, a seek): every voice, line, tail and phase as at tick 0.
    func reset() {
        for i in hits.indices { hits[i].active = false }
        for i in saws.indices { saws[i].active = false }
        for i in plucks.indices { plucks[i].active = false }
        fenv = 0
        s1L.clear(); s2L.clear(); s1R.clear(); s2R.clear()
        echo.clear(); leadEcho.clear()
        side = 0; sideTarget = 0; parity = 0; switchCount = 0
        lastHitFrame = .min / 2
        for i in padStart.indices { padPhase[i] = padStart[i] }
        padFL.clear(); padFR.clear(); padHL.clear(); padHR.clear()
        leadFL.clear(); leadFR.clear()
        seconds = 0
        noisePos = 0
        hallL.reset(); hallR.reset(); roomL.reset(); roomR.reset()
        masterL.clear(); masterR.clear()
        limiter = 1
    }

    /// The band stops (a pause): what it was playing dies away; the echoes and the hall ring on.
    func releaseBand() {
        for i in hits.indices where hits[i].active { hits[i].total = min(hits[i].total, hits[i].frames + Int(0.05 * sr)) }
        for i in plucks.indices where plucks[i].active && !plucks[i].live { plucks[i].held = min(plucks[i].held, plucks[i].frames) }
    }

    /// A hit enters the echo on the other side from the one before; notes of one chord are one hit.
    private func alternate(offset: Int) {
        let at = frame + Int64(offset)
        guard abs(at - lastHitFrame) > Int64(0.004 * sr) else { return }
        lastHitFrame = at
        let target: Float = parity % 2 == 0 ? 0 : 1
        parity += 1
        guard switchCount < switches.count else { sideTarget = target; return }
        switches[switchCount] = (max(0, offset - sideLead), target)
        switchCount += 1
    }

    /// One of the reference's raw stab buffers, `offset` frames into the chunk being rendered.
    func hit(_ buffer: SampleBuffer, gain: Float, offset: Int) {
        var slot = 0
        for i in hits.indices {
            if !hits[i].active { slot = i; break }
            if hits[i].frames > hits[slot].frames { slot = i }
        }
        hits[slot] = Hit(active: true, buffer: buffer, position: 0, step: buffer.rate / sr, gain: gain / 32768, delay: offset)
        alternate(offset: offset)
    }

    /// A synthesized stab note.
    func note(_ note: Int, velocity: Float, gain: Float, offset: Int, live: Bool) {
        age += 1
        var slot = 0
        for i in saws.indices {
            if !saws[i].active { slot = i; break }
            if saws[i].age < saws[slot].age { slot = i }
        }
        var v = Saws(active: true, note: note, live: live, gain: velocity * gain, delay: offset)
        v.age = age
        var seed = UInt32(truncatingIfNeeded: age &* 2654435761 &+ note &* 40503) | 1
        func next() -> Double {
            seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5
            return Double(seed) / 4294967296
        }
        let f = Rack.hz(Double(note))
        let st = settings.stab
        // A spread of cents drawn like the reference's normal(0, 1.5): two uniforms' sum, scaled.
        func dt(_ cents: Double) -> Double { f * pow(2, (cents + (next() + next() - 1) * st.spread * 2.449) / 1200) / sr }
        v.dt = (dt(st.detune[0]), dt(st.detune[1]), dt(st.detune[2]))
        v.ph = (next(), next(), next())
        v.seed = seed
        saws[slot] = v
        alternate(offset: offset)
    }

    /// A lead note; `held` frames until its key comes up (Int.max: a key holds it).
    func pluck(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        age += 1
        var slot = 0
        for i in plucks.indices {
            if !plucks[i].active { slot = i; break }
            if plucks[i].age < plucks[slot].age { slot = i }
        }
        plucks[slot] = Pluck(active: true, note: note, live: live, velocity: velocity, gain: gain, delay: offset, frames: 0,
                             held: held, f: Rack.hz(Double(note)), age: age)
    }

    /// A key comes up.
    func release(_ note: Int) {
        for i in plucks.indices where plucks[i].active && plucks[i].live && plucks[i].note == note {
            plucks[i].held = plucks[i].frames
            plucks[i].live = false
        }
        for i in saws.indices where saws[i].live && saws[i].note == note { saws[i].live = false }
    }

    // MARK: Render

    /// Adds every rack bus to `outL` / `outR` (which hold the channels the renderer mixed: the
    /// kick and the bass, at the reference's level) and runs the master over the sum. `tick` is
    /// the transport's at the chunk's first frame, `ticksPerFrame` 0 while it holds; `kick` the
    /// duck envelope; `drums` the drums fader (1, or gliding to 0 when muted).
    func process(_ n: Int, tick: Double, ticksPerFrame: Double, ticksPerBar: Int, samplesPerBeat: Double, kick: UnsafePointer<Float>,
                 drums: Float, trim: Float, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        let s = settings
        let playing = ticksPerFrame > 0
        let barsPerFrame = ticksPerFrame / Double(ticksPerBar)
        let bar0 = tick / Double(ticksPerBar)
        let bar1 = bar0 + barsPerFrame * Double(n)
        // The lanes, linear across the chunk.
        func lane(_ l: inout Lane) -> (at: Float, step: Float) {
            let a = l.value(bar0), b = l.value(bar1)
            return (a, (b - a) / Float(n))
        }
        let cutL = lane(&stabCutoff), tauL = lane(&stabDecay), fbL = lane(&echoFeedback), sendL = lane(&echoSend)
        let pCutL = lane(&padCutoff), pLvlL = lane(&padLevel), lLvlL = lane(&leadLevel), nLvlL = lane(&noiseLevel), fdL = lane(&fade)
        var cut = cutL.at, fb = fbL.at, send = sendL.at, pCut = pCutL.at, pLvl = pLvlL.at, lLvl = lLvlL.at, nLvl = nLvlL.at, fd = fdL.at
        let tau = tauL.at, dTau = tauL.step
        for i in 0..<n {
            stabL[i] = 0; stabR[i] = 0; leadL[i] = 0; leadR[i] = 0; kicks[i] = 0
            taus[i] = tau + dTau * Float(i)
        }
        renderHits(n)
        renderSaws(n)
        renderPlucks(n)

        let st = s.stab
        let invSr = Float(1 / sr)
        let glide = 1 - exp(-1 / (0.05 * sr))
        let echoTarget = s.echo.beats * samplesPerBeat, leadTarget = s.leadEcho.beats * samplesPerBeat
        let lfoStab = 2 * Double.pi / st.lfoBars, lfoPad = 2 * Double.pi / s.pad.lfoBars
        let padVoices = padStart.count
        let noiseStep = noise.rate / sr
        let hallOn = on.hall, roomOn = on.room, chordsOn = on.chords, dubOn = on.dub, padOn = on.pad, leadOn = on.lead
        let lechoOn = on.leadEcho, noiseOn = on.noise
        let buses = busNames.count
        let hallG = s.hall.level, roomG = s.room.level
        let hallDuck = s.hall.duck ?? 0
        let m = s.master
        let out = m.scale * m.level * trim
        let limit = m.limit ?? .infinity
        let limitRelease = Float(1 - exp(-1 / ((m.limitRelease ?? 0.12) * sr)))
        var switchAt = 0
        for i in 0..<n {
            let bar = bar0 + barsPerFrame * Double(i)
            let live = playing && bar >= 0
            let k = kick[i]

            // The stab bus: one filter a side, kicked open by every hit.
            fenv = max(fenv * fenvDecay, kicks[i])
            let base = cut
            var fc = base * exp2f(st.env * fenv) * (1 + st.lfoDepth * Float(sin(lfoStab * bar)))
            fc = min(max(fc, st.min), st.max)
            let g = tanf(Float.pi * fc * invSr)
            var cL = s2L.low(s1L.low(stabL[i], g: g), g: g)
            var cR = s2R.low(s1R.low(stabR[i], g: g), g: g)
            let comp = powf(st.compRef / base, st.compPower)
            cL = tanhf(st.drive * cL) / st.drive * comp
            cR = tanhf(st.drive * cR) / st.drive * comp
            let stabDuck = 1 - st.duck * k
            let dryL = cL * st.gain * stabDuck, dryR = cR * st.gain * stabDuck

            // The echo: the stab's mono sum, each hit on the other side; the rim and toms left.
            while switchAt < switchCount {
                if switches[switchAt].wait > i { break }
                sideTarget = switches[switchAt].target
                switchAt += 1
            }
            if side < sideTarget { side = min(sideTarget, side + sideStep) } else if side > sideTarget { side = max(sideTarget, side - sideStep) }
            let dIn = (cL + cR) * 0.5 * send * st.gain
            var extra: Float = 0
            var hallInL: Float = 0, hallInR: Float = 0, roomInL: Float = 0, roomInR: Float = 0
            var sumL: Float = 0, sumR: Float = 0
            for b in 0..<buses {
                let l = auxL[b * maxChunk + i] * drums, r = auxR[b * maxChunk + i] * drums
                if busOn[b] { sumL += l; sumR += r }
                let h = busHall[b], rm = busRoom[b], e = busEcho[b]
                if h != 0 { hallInL += l * h; hallInR += r * h }
                if rm != 0 { roomInL += l * rm; roomInR += r * rm }
                if e != 0 { extra += (l + r) * 0.5 * e }
            }
            let (eL, eR) = echo.run(dIn * (1 - side) + extra, dIn * side, feedback: fb, target: echoTarget, glide: glide, advance: live)
            let dubDuck = s.echo.level * (1 - s.echo.duck * k)
            let dubL = eL * dubDuck, dubR = eR * dubDuck

            // The pad: a drone, on while the song runs.
            padGate += ((live ? 1 : 0) - padGate) * 0.002
            var pL: Float = 0, pR: Float = 0
            if live || padGate > 0.0005 {
                var v = 0
                while v < padVoices {
                    if live {
                        pL += padGain[v] * (Rack.saw(&padPhase[v], padStep[v]) + Rack.saw(&padPhase[v + 1], padStep[v + 1]))
                        pR += padGain[v] * (Rack.saw(&padPhase[v + 2], padStep[v + 2]) + Rack.saw(&padPhase[v + 3], padStep[v + 3]))
                    }
                    v += 4
                }
                let pfc = pCut * (1 + s.pad.lfoDepth * Float(sin(lfoPad * bar + s.pad.lfoPhase)))
                pL = padFL.low(pL, g: tanf(Float.pi * pfc * invSr))
                pR = padFR.low(pR, g: tanf(Float.pi * min(pfc * s.pad.rightScale, Float(sr) * 0.45) * invSr))
                let pg = s.pad.gain * (1 - s.pad.duck * k) * padGate
                pL = padHL.run(pL * pLvl) * pg
                pR = padHR.run(pR * pLvl) * pg
            }

            // The lead and its echo (the echo hears the lead before its gain, as the reference's does).
            let ldL = leadFL.run(leadL[i]) * lLvl, ldR = leadFR.run(leadR[i]) * lLvl
            let (qL, qR) = leadEcho.run(0, (ldL + ldR) * 0.5, feedback: s.leadEcho.feedback, target: leadTarget, glide: glide, advance: live)
            let leG = s.lead.gain * s.leadEcho.level * (1 - s.leadEcho.duck * k)
            let leadOutL = ldL * s.lead.gain, leadOutR = ldR * s.lead.gain
            let leL = qL * leG, leR = qR * leG

            // The noise bed, looped, under its lane.
            var nL: Float = 0, nR: Float = 0
            if live {
                let ip = Int(noisePos)
                let fr = Float(noisePos - Double(ip))
                let ng = s.noise.gain * nLvl * (1 - s.noise.duck * k) * noiseScale
                nL = (Float(noise.left[ip]) + (Float(noise.left[ip + 1]) - Float(noise.left[ip])) * fr) * ng
                nR = (Float(noise.right[ip]) + (Float(noise.right[ip + 1]) - Float(noise.right[ip])) * fr) * ng
                noisePos += noiseStep
                if noisePos >= Double(noise.count - 1) { noisePos -= Double(noise.count - 1) }
                seconds += 1 / sr
            }

            // The hall and the room.
            hallInL += dryL * st.hall + dubL * s.echo.hall + pL * s.pad.hall + leadOutL * s.lead.hall + leL * s.leadEcho.hall
            hallInR += dryR * st.hall + dubR * s.echo.hall + pR * s.pad.hall + leadOutR * s.lead.hall + leR * s.leadEcho.hall
            let hg = hallG * (1 - hallDuck * k)
            let hL = hallL.tick(hallInL) * hg, hR = hallR.tick(hallInR) * hg
            let rL = roomL.tick(roomInL) * roomG, rR = roomR.tick(roomInR) * roomG

            if chordsOn { sumL += dryL; sumR += dryR }
            if dubOn { sumL += dubL; sumR += dubR }
            if padOn { sumL += pL; sumR += pR }
            if leadOn { sumL += leadOutL; sumR += leadOutR }
            if lechoOn { sumL += leL; sumR += leR }
            if noiseOn { sumL += nL; sumR += nR }
            if hallOn { sumL += hL; sumR += hR }
            if roomOn { sumL += rL; sumR += rR }
            let xL = outL[i] + sumL, xR = outR[i] + sumR
            if raw {
                outL[i] = xL
                outR[i] = xR
            } else {
                let yL = tanhf(masterL.run(xL) * fd * m.drive) * m.post
                let yR = tanhf(masterR.run(xR) * fd * m.drive) * m.post
                let peak = max(abs(yL), abs(yR))
                let want: Float = peak > limit ? limit / peak : 1
                limiter = want < limiter ? want : limiter + (want - limiter) * limitRelease
                outL[i] = yL * limiter * out
                outR[i] = yR * limiter * out
            }

            cut += cutL.step; fb += fbL.step; send += sendL.step; pCut += pCutL.step; pLvl += pLvlL.step
            lLvl += lLvlL.step; nLvl += nLvlL.step; fd += fdL.step
        }
        // The switches still waiting move into the next chunk.
        var kept = 0
        for j in switchAt..<switchCount {
            switches[kept] = (switches[j].wait - n, switches[j].target)
            kept += 1
        }
        switchCount = kept
        frame += Int64(n)
    }

    /// The hit's envelope, as the reference's: a linear attack times e^(−t/decay), the decay read
    /// from its lane where the hit starts, `lengths` decay times long.
    private func renderHits(_ n: Int) {
        let st = settings.stab
        let attack = Float(st.attack * sr)
        for v in hits.indices where hits[v].active {
            var h = hits[v]
            var i = min(h.delay, n)
            h.delay -= i
            if i < n && !h.started {
                h.started = true
                let tau = Double(taus[i])
                h.decay = Float(exp(-1 / (tau * sr)))
                h.total = min(Int(Double(h.buffer.count - 2) / h.step), Int(tau * st.lengths * sr))
                h.env = 1
                kicks[i] = max(kicks[i], h.gain * 32768 * st.fileScale)
            }
            let bl = h.buffer.left, br = h.buffer.right
            while i < n {
                if h.frames >= h.total { h.active = false; break }
                let ip = Int(h.position)
                let fr = Float(h.position - Double(ip))
                let a = min(Float(h.frames) / attack, 1) * h.env * h.gain
                stabL[i] += (Float(bl[ip]) + (Float(bl[ip + 1]) - Float(bl[ip])) * fr) * a
                stabR[i] += (Float(br[ip]) + (Float(br[ip + 1]) - Float(br[ip])) * fr) * a
                h.env *= h.decay
                h.position += h.step
                h.frames += 1
                i += 1
            }
            hits[v] = h
        }
    }

    private func renderSaws(_ n: Int) {
        let st = settings.stab
        let attack = Float(st.attack * sr)
        // One note of the chord: the reference divides the chord by its notes, and its noise
        // (0.10 a side, once a chord) is shared out so a whole chord adds up to it.
        let level = 1 / st.notes
        let hiss = st.noise / st.notes.squareRoot() * 1.7320508
        let gl: (Float, Float, Float) = ((1 - st.pans[0]) / 2, (1 - st.pans[1]) / 2, (1 - st.pans[2]) / 2)
        let gr: (Float, Float, Float) = ((1 + st.pans[0]) / 2, (1 + st.pans[1]) / 2, (1 + st.pans[2]) / 2)
        for v in saws.indices where saws[v].active {
            var h = saws[v]
            var i = min(h.delay, n)
            h.delay -= i
            if i < n && !h.started {
                h.started = true
                let tau = Double(taus[i])
                h.decay = Float(exp(-1 / (tau * sr)))
                h.total = Int(tau * st.lengths * sr)
                h.env = 1
                kicks[i] = max(kicks[i], h.gain)
            }
            while i < n {
                if h.frames >= h.total { h.active = false; break }
                let a = min(Float(h.frames) / attack, 1) * h.env * h.gain
                let s0 = Rack.saw(&h.ph.0, h.dt.0), s1 = Rack.saw(&h.ph.1, h.dt.1), s2 = Rack.saw(&h.ph.2, h.dt.2)
                h.seed ^= h.seed << 13; h.seed ^= h.seed >> 17; h.seed ^= h.seed << 5
                let n0 = Float(Int32(bitPattern: h.seed)) / 2147483648
                h.seed ^= h.seed << 13; h.seed ^= h.seed >> 17; h.seed ^= h.seed << 5
                let n1 = Float(Int32(bitPattern: h.seed)) / 2147483648
                stabL[i] += ((s0 * gl.0 + s1 * gl.1 + s2 * gl.2) * level + n0 * hiss) * a
                stabR[i] += ((s0 * gr.0 + s1 * gr.1 + s2 * gr.2) * level + n1 * hiss) * a
                h.env *= h.decay
                h.frames += 1
                i += 1
            }
            saws[v] = h
        }
    }

    /// `fm_pluck`: index = 2.4·vel·e^(−t/0.11) + 0.35; a = sin(2πft + index·sin(2π·2f·t));
    /// b = sin(2π·1.004f·t + 0.6·index·sin(2π·3·1.004f·t)); left a + 0.35b, right 0.9a + 0.5b;
    /// 4 ms attack, e^(−t/0.55), after the key e^(−t/0.25), 1.2 s of tail.
    private func renderPlucks(_ n: Int) {
        let tail = Int(1.2 * sr)
        for v in plucks.indices where plucks[v].active {
            var p = plucks[v]
            var i = min(p.delay, n)
            p.delay -= i
            let w = 2 * Double.pi * p.f, w2 = 2 * Double.pi * p.f * 1.004
            let vel = Double(p.velocity)
            while i < n {
                if p.held != .max && p.frames >= p.held + tail { p.active = false; break }
                let t = Double(p.frames) / sr
                let idx = 2.4 * vel * exp(-t / 0.11) + 0.35
                let a = sin(w * t + idx * sin(2 * w * t))
                let b = sin(w2 * t + 0.6 * idx * sin(3 * w2 * t))
                var env = min(t / 0.004, 1) * exp(-t / 0.55)
                if p.frames >= p.held { env *= exp(-Double(p.frames - p.held) / sr / 0.25) }
                let g = Float(env * vel) * p.gain
                leadL[i] += Float(a + 0.35 * b) * g
                leadR[i] += Float(0.9 * a + 0.5 * b) * g
                p.frames += 1
                i += 1
            }
            plucks[v] = p
        }
    }
}
