import Accelerate
import Foundation

/// Gegenlicht's console (a band's `acidRack`), 2026-11-10: a port of
/// `misc/gegenlicht_reference.py`'s `render`, per sample, at the reference's own signal levels
/// (`misc/GEGENLICHT.md` is the brief, `DUB-TECHNO.md` §10 the write-up). What `Rack` does for
/// the dub techno records, this does for the techno one; the pieces they share (lanes, the
/// state-variable filter, the Butterworths, the tape echo, the saw, the convolver) are `Rack`'s.
///
/// - **the kick bus**: the kicks into a lowpass whose cutoff walks open over the first 8 bars and
///   shut over the last 8, a level lane, the centre;
/// - **the rumble**: the kick bus and its echoes 2 and 3 sixteenths late, through a dark 0.9 s
///   room (an impulse with no predelay: its first block is a direct FIR beside the convolver),
///   34 Hz highpass, 105 Hz lowpass, tanh, 260 Hz lowpass, ducked by its own longer envelope;
/// - **the acid voice**: one mono 303 (`acid_ctrl` + `saw_var` + two state-variable lowpasses +
///   tanh + 75 Hz highpass) that runs from the top of the song and never stops: the gate is only
///   the amp. Slide when a note starts while the gate is open, accent on a hard key;
/// - **the acid echo**: a tape echo three sixteenths late whose input side swaps every half bar;
/// - **the ping bus**: the pings (a pan each), a lowpass a side, their mono sum into a tape echo
///   two sixteenths late;
/// - **the pad**: eight notes of four saws each, free-running from the reference's phases, each
///   behind a gate smoothed by two one-pole lowpasses (the band's notes open them, and so do your
///   keys on the chords part);
/// - **drum buses** with their ducks and sends, **the noise bed** looped, **the hall and the
///   room** by convolution, **the master** (25 Hz highpass, the fade, tanh, the limiter).
final class AcidRack: Console {
    // MARK: Settings (the song file's `acidRack`)

    struct Settings: Decodable {
        struct Bus: Decodable {
            let name: String
            var hall: Float?
            var room: Float?
            var duck: Float?
        }

        struct Kick: Decodable {
            let bus: String
            let q: Float
            let gain: Float
        }

        struct Rumble: Decodable {
            let ir: String
            let block: Int
            /// [sixteenths after the kick, gain]: what of the kick bus goes in, and when.
            let taps: [[Double]]
            let highpass: Double
            let lowpass: Double
            /// tanh(drive · x / norm): the norm is the reference's percentile of the whole signal.
            let drive: Double
            let norm: Double
            let smooth: Double
            let gain: Float
        }

        struct Acid: Decodable {
            /// Hz the pitch sits at before the first note.
            let start: Double
            /// Seconds: the slide's time constant, the attack, the fall to `sustain`, the release.
            let glide: Double
            let attack: Double
            let decay: Double
            let sustain: Double
            let release: Double
            /// An accent: the amp × (1 + accentLevel), the filter envelope 1 + accentEnv.
            let accentLevel: Double
            let accentEnv: Double
            let osc: Float
            let lfoDepth: Double
            let lfoBars: Double
            let min: Double
            let max: Double
            /// The second filter: the first's cutoff × ratio2, at most max2, Q q2.
            let q2: Float
            let ratio2: Double
            let max2: Double
            let highpass: Double
            let gain: Float
            let duck: Float
            let hall: Float
            /// A key this hard or harder is an accent (a band note's velocity is 1 or under it).
            let accentVelocity: Float
        }

        struct Ping: Decodable {
            let bus: String
            let q: Float
            let echo: Rack.Settings.Echo
            let gain: Float
            let duck: Float
            let hall: Float
        }

        struct Pad: Decodable {
            /// The record's notes, and four start phases a note (left, left, right, right).
            let notes: [Int]
            let phases: [Double]
            let left: [Double]
            let right: [Double]
            /// Hz of each of the gate's two one-pole lowpasses.
            let smooth: Double
            let q: Float
            let rightScale: Float
            let lfoDepth: Double
            let lfoBars: Double
            let lfoPhase: Double
            let highpass: Double
            let gain: Float
            let duck: Float
            let hall: Float
        }

        let lanes: [String: [[Double]]]
        let buses: [Bus]
        let kick: Kick
        let rumble: Rumble
        let acid: Acid
        let acidEcho: Rack.Settings.Echo
        /// The acid echo's input side: it swaps every `sideBars` bars, smoothed by a centred
        /// boxcar `sideWindow` seconds long.
        let sideBars: Double
        let sideWindow: Double
        let ping: Ping
        let pad: Pad
        let hall: Rack.Settings.Reverb
        let room: Rack.Settings.Reverb
        let noise: Rack.Settings.Noise
        let master: Rack.Settings.Master
    }

    // MARK: Pieces

    /// The reference's `svf_lp` with its Q given per sample (k = 1/Q).
    struct SVF {
        var ic1: Double = 0, ic2: Double = 0
        @inline(__always) mutating func low(_ x: Double, g: Double, k: Double) -> Double {
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

    /// A second-order section in double precision (the rumble's low corners), a Butterworth
    /// stage of Q `q`: scipy's `butter(4)` is two of them, Q 0.5412 and 1.3066.
    struct Biquad {
        var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
        var z1 = 0.0, z2 = 0.0

        init(_ f: Double, sr: Double, q: Double = 0.5.squareRoot(), high: Bool) {
            let w = 2 * Double.pi * f / sr, cw = cos(w), alpha = sin(w) / (2 * q), a0 = 1 + alpha
            let e = high ? (1 + cw) / 2 : (1 - cw) / 2
            b0 = e / a0
            b1 = (high ? -(1 + cw) : (1 - cw)) / a0
            b2 = e / a0
            a1 = -2 * cw / a0
            a2 = (1 - alpha) / a0
        }

        @inline(__always) mutating func run(_ x: Double) -> Double {
            let y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }
        mutating func clear() { z1 = 0; z2 = 0 }
    }

    /// An acid note waiting for its frame in the chunk.
    struct Pending {
        var offset = 0
        var note = 0
        var accent = false
        var held = 0
        var gain: Float = 1
        var live = false
    }

    /// One side of a pad note's gate: opens `wait` frames into the chunk it was set in, closes
    /// `left` frames after that chunk's top (Int.max: when the key comes up).
    struct Gate {
        var on = false
        var wait = -1
        var left = Int.max

        mutating func set(offset: Int, held: Int) {
            wait = offset
            left = held == .max ? .max : held + offset
        }

        @inline(__always) mutating func tick() {
            if wait == 0 { on = true }
            if wait >= 0 { wait -= 1 }
            if left != .max {
                if left <= 0 { on = false; left = .max; wait = -1 } else { left -= 1 }
            }
        }
    }

    /// A pad note: four saws and a gate through two one-pole lowpasses.
    struct PadVoice {
        var note = -1
        var ph: (Double, Double, Double, Double) = (0, 0, 0, 0)
        var dt: (Double, Double, Double, Double) = (0, 0, 0, 0)
        var start: (Double, Double, Double, Double) = (0, 0, 0, 0)
        /// The band's gate (the keys channel's notes), and your side's (your keys, and the notes
        /// a level leaves out, played for you); the gate is open while either is.
        var band = Gate()
        var key = Gate()
        var g1 = 0.0, g2 = 0.0
        var gain: Float = 1
        /// A record note (it free-runs from the top) or one of your keys' (it starts at the key).
        var fixed = false
        var age = 0
    }

    // MARK: State

    let settings: Settings
    private let sr: Double
    private let maxChunk: Int
    let busNames: [String]
    private let auxL: UnsafeMutablePointer<Float>
    private let auxR: UnsafeMutablePointer<Float>
    private let busHall: [Float], busRoom: [Float], busDuck: [Float]
    /// The buses the console handles itself: the kick's and the ping's.
    private let kickBus: Int, pingBus: Int
    private let plain: [Int]

    private var kickCutoff: Rack.Lane, kickGain: Rack.Lane, rumbleLevel: Rack.Lane
    private var acidTau: Rack.Lane, acidBase: Rack.Lane, acidAmount: Rack.Lane, acidQ: Rack.Lane, acidDrive: Rack.Lane
    private var acidFeedback: Rack.Lane, pingCutoff: Rack.Lane, padCutoff: Rack.Lane, padLevel: Rack.Lane
    private var noiseLevel: Rack.Lane, fade: Rack.Lane

    // The kick bus and the rumble.
    private var kickSVF = SVF()
    private let kickK: Double
    private static let ringSize = 1 << 15
    private let ring: UnsafeMutablePointer<Float>
    private var ringPos = 0
    private let tapGains: [Float]
    private let tapSteps: [Double]
    private let fir: UnsafeMutablePointer<Float>
    private let firHistory: UnsafeMutablePointer<Float>
    private var firPos = 0
    private let firLength: Int
    private let rumbleConv: Convolver
    private var rumbleHP: Biquad, rumbleLP1: Biquad, rumbleLP2: Biquad, rumbleSmooth: Biquad

    // The acid voice.
    private let pending = UnsafeMutableBufferPointer<Pending>.allocate(capacity: 32)
    private var pendingCount = 0
    private var cur = 0.0, tgt = 0.0
    private var gate = false
    private var gateEnd: Int64 = .max
    private var lvl = 0.0
    private var attacking = false
    private var fe = 0.0
    private var accent = 0.0
    private var level: Float = 1
    private var acidNote = -1
    private var acidLive = false
    private var oscPhase = 0.0
    private var a1 = SVF(), a2 = SVF()
    private var acidHP: Rack.Biquad
    private let glideK: Double, attackStep: Double, decayK: Double, releaseK: Double

    // The echoes.
    private var acidEcho: Rack.Tape
    private var pingEcho: Rack.Tape
    private var pingL = SVF(), pingR = SVF()
    private let pingK: Double

    // The pad.
    private let pads = UnsafeMutableBufferPointer<PadVoice>.allocate(capacity: 16)
    private let fixedPads: Int
    private var padFL = SVF(), padFR = SVF()
    private let padK: Double
    private var padHL: Rack.Biquad, padHR: Rack.Biquad
    private let padSmooth: Double
    private var age = 0

    private let noise: SampleBuffer
    private var noisePos = 0.0

    private let hallL: Convolver, hallR: Convolver, roomL: Convolver, roomR: Convolver
    private var masterL: Rack.Biquad, masterR: Rack.Biquad
    private var limiter: Float = 1
    private var frame: Int64 = 0

    private let solo: Set<String>?
    private let raw: Bool
    func passes(_ name: String) -> Bool { solo?.contains(name) ?? true }
    private var busOn: [Bool] = []
    private var on = (kick: true, rumble: true, acid: true, echo: true, ping: true, pad: true, noise: true, hall: true, room: true)

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
        busDuck = s.buses.map { $0.duck ?? 0 }
        guard let k = busNames.firstIndex(of: s.kick.bus), let p = busNames.firstIndex(of: s.ping.bus) else {
            fatalError("acid rack: the kick's and the ping's buses are not among its buses")
        }
        kickBus = k
        pingBus = p
        plain = busNames.indices.filter { $0 != k && $0 != p }

        func lane(_ name: String) -> Rack.Lane {
            guard let points = s.lanes[name] else { fatalError("acid rack: no lane \(name)") }
            return Rack.Lane(points, default: 0)
        }
        kickCutoff = lane("kickCutoff"); kickGain = lane("kickGain"); rumbleLevel = lane("rumble")
        acidTau = lane("acidTau"); acidBase = lane("acidBase"); acidAmount = lane("acidAmount"); acidQ = lane("acidQ")
        acidDrive = lane("acidDrive"); acidFeedback = lane("acidFeedback"); pingCutoff = lane("pingCutoff")
        padCutoff = lane("padCutoff"); padLevel = lane("padLevel"); noiseLevel = lane("noise"); fade = lane("fade")

        kickK = 1 / Double(s.kick.q)
        ring = .allocate(capacity: Self.ringSize)
        ring.initialize(repeating: 0, count: Self.ringSize)
        tapSteps = s.rumble.taps.map { $0[0] }
        tapGains = s.rumble.taps.map { Float($0[1]) }
        let kernel = Convolver.Kernel.bundled(s.rumble.ir, side: 0, sampleRate: sampleRate, block: s.rumble.block)
        firLength = kernel.block
        fir = .allocate(capacity: firLength)
        for m in 0..<firLength { fir[m] = kernel.head[firLength - 1 - m] }
        firHistory = .allocate(capacity: 2 * firLength)
        firHistory.initialize(repeating: 0, count: 2 * firLength)
        rumbleConv = Convolver(kernel)
        rumbleHP = Biquad(s.rumble.highpass, sr: sampleRate, high: true)
        rumbleLP1 = Biquad(s.rumble.lowpass, sr: sampleRate, q: 1 / (2 * cos(Double.pi / 8)), high: false)
        rumbleLP2 = Biquad(s.rumble.lowpass, sr: sampleRate, q: 1 / (2 * cos(3 * Double.pi / 8)), high: false)
        rumbleSmooth = Biquad(s.rumble.smooth, sr: sampleRate, high: false)

        pending.initialize(repeating: Pending())
        let a = s.acid
        glideK = exp(-1 / (a.glide * sampleRate))
        attackStep = 1 / (a.attack * sampleRate)
        decayK = exp(-1 / (a.decay * sampleRate))
        releaseK = exp(-1 / (a.release * sampleRate))
        acidHP = .highpass(a.highpass, sr: sampleRate)
        acidEcho = Rack.Tape(s.acidEcho, sampleRate: sampleRate)
        pingEcho = Rack.Tape(s.ping.echo, sampleRate: sampleRate)
        pingK = 1 / Double(s.ping.q)

        precondition(s.pad.phases.count == s.pad.notes.count * 4 && s.pad.left.count == 2 && s.pad.right.count == 2, "acid rack: four pad saws a note")
        precondition(s.pad.notes.count <= 8, "acid rack: eight record notes at most")
        fixedPads = s.pad.notes.count
        pads.initialize(repeating: PadVoice())
        padK = 1 / Double(s.pad.q)
        padHL = .highpass(s.pad.highpass, sr: sampleRate); padHR = .highpass(s.pad.highpass, sr: sampleRate)
        padSmooth = 1 - exp(-2 * Double.pi * s.pad.smooth / sampleRate)

        let kit = SampledInstrument.shared(SampledInstrument.rated(s.noise.kit, sampleRate: sampleRate))
        noise = kit.pick(note: 0, velocity: 1).buffer
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
        on = (passes("kick"), passes("rumble"), passes("acid"), passes("acid_delay"), passes("ping"), passes("pad"), passes("noise"),
              passes("hall"), passes("room"))
        reset()
    }

    // MARK: From the renderer

    func bus(_ index: Int) -> (UnsafeMutablePointer<Float>, UnsafeMutablePointer<Float>) {
        (auxL + index * maxChunk, auxR + index * maxChunk)
    }

    func begin(_ n: Int) {
        for b in 0..<busNames.count {
            (auxL + b * maxChunk).update(repeating: 0, count: n)
            (auxR + b * maxChunk).update(repeating: 0, count: n)
        }
    }

    func reset() {
        kickSVF.clear()
        ring.update(repeating: 0, count: Self.ringSize)
        ringPos = 0
        firHistory.update(repeating: 0, count: 2 * firLength)
        firPos = 0
        rumbleConv.reset()
        rumbleHP.clear(); rumbleLP1.clear(); rumbleLP2.clear(); rumbleSmooth.clear()
        pendingCount = 0
        cur = settings.acid.start; tgt = cur
        gate = false; gateEnd = .max; lvl = 0; attacking = false; fe = 0; accent = 0; level = 1
        acidNote = -1; acidLive = false
        oscPhase = 0
        a1.clear(); a2.clear(); acidHP.clear()
        acidEcho.clear(); pingEcho.clear()
        pingL.clear(); pingR.clear()
        let s = settings.pad
        for i in pads.indices { pads[i] = PadVoice() }
        for (i, note) in s.notes.enumerated() {
            let f = Rack.hz(Double(note))
            let d = (s.left + s.right).map { f * pow(2, $0 / 1200) / sr }
            let p = (s.phases[i * 4], s.phases[i * 4 + 1], s.phases[i * 4 + 2], s.phases[i * 4 + 3])
            pads[i] = PadVoice(note: note, ph: p, dt: (d[0], d[1], d[2], d[3]), start: p, fixed: true)
        }
        padFL.clear(); padFR.clear(); padHL.clear(); padHR.clear()
        noisePos = 0
        hallL.reset(); hallR.reset(); roomL.reset(); roomR.reset()
        masterL.clear(); masterR.clear()
        limiter = 1
    }

    func releaseBand() {
        for i in pads.indices { pads[i].band = Gate() }
        if !acidLive { gateEnd = min(gateEnd, frame) }
        pendingCount = 0
    }

    func acid(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        guard pendingCount < pending.count else { return }
        var i = pendingCount
        let p = Pending(offset: offset, note: note, accent: velocity >= settings.acid.accentVelocity, held: held, gain: gain, live: live)
        while i > 0 && pending[i - 1].offset > offset {
            pending[i] = pending[i - 1]
            i -= 1
        }
        pending[i] = p
        pendingCount += 1
    }

    func pad(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        // The record's note when it is one of them, else a voice of its own.
        var slot = -1
        for i in 0..<fixedPads where pads[i].note == note { slot = i }
        if slot < 0 {
            for i in fixedPads..<pads.count where pads[i].note == note { slot = i }
        }
        if slot < 0 {
            // A free voice (its gate shut and settled), or the oldest.
            slot = fixedPads
            for i in fixedPads..<pads.count {
                if pads[i].note < 0 || (!pads[i].band.on && !pads[i].key.on && pads[i].key.wait < 0 && pads[i].g2 < 1e-5) { slot = i; break }
                if pads[i].age < pads[slot].age { slot = i }
            }
            let f = Rack.hz(Double(note))
            let d = (settings.pad.left + settings.pad.right).map { f * pow(2, $0 / 1200) / sr }
            var seed = UInt32(truncatingIfNeeded: note &* 2654435761) | 1
            func next() -> Double {
                seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5
                return Double(seed) / 4294967296
            }
            let ph = (next(), next(), next(), next())
            pads[slot] = PadVoice(note: note, ph: ph, dt: (d[0], d[1], d[2], d[3]), start: ph, fixed: false)
        }
        age += 1
        pads[slot].age = age
        pads[slot].gain = gain
        // The gate opens at the note's frame and closes `held` frames later (a frame either way
        // is −70 dB through the gate's 0.14 s lowpasses; a chunk is not); a key holds it open
        // until it comes up.
        if live { pads[slot].key.set(offset: offset, held: held) } else { pads[slot].band.set(offset: offset, held: held) }
    }

    func release(_ note: Int, offset: Int) {
        if acidLive && acidNote == note { gateEnd = min(gateEnd, frame + Int64(offset)) }
        for i in pads.indices where pads[i].note == note && pads[i].key.left == .max {
            pads[i].key.on = false
            pads[i].key.wait = -1
        }
    }

    // MARK: Render

    func process(_ n: Int, tick: Double, ticksPerFrame: Double, ticksPerBar: Int, samplesPerBeat: Double, kick: UnsafePointer<Float>,
                 kick2: UnsafePointer<Float>, drums: Float, keys: Float, trim: Float,
                 outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        let s = settings
        let playing = ticksPerFrame > 0
        let barsPerFrame = ticksPerFrame / Double(ticksPerBar)
        let bar0 = tick / Double(ticksPerBar)
        // Gegenlicht is in four.
        let samplesPerBar = samplesPerBeat * 4
        let invSr = 1 / sr
        let centre = Float(0.5.squareRoot())
        let a = s.acid
        let glide = 1 - exp(-1 / (0.05 * sr))
        let acidTarget = s.acidEcho.beats * samplesPerBeat, pingTarget = s.ping.echo.beats * samplesPerBeat
        let taps = tapSteps.map { Int(($0 * samplesPerBeat / 4).rounded()) }
        let lfoAcid = 2 * Double.pi / a.lfoBars, lfoPad = 2 * Double.pi / s.pad.lfoBars
        // The side's window, and the length of the half bars it swaps on, in frames.
        let half = s.sideWindow * sr / 2, sideSpan = s.sideBars * samplesPerBar
        let noiseStep = noise.rate / sr
        let hallG = s.hall.level, roomG = s.room.level, hallDuck = s.hall.duck ?? 0
        let m = s.master
        let out = m.scale * m.level * trim
        let limit = m.limit ?? .infinity
        let limitRelease = Float(1 - exp(-1 / ((m.limitRelease ?? 0.12) * sr)))
        let bandPads = keys > 0.5
        var next = 0
        for i in 0..<n {
            let bar = bar0 + barsPerFrame * Double(i)
            let live = playing && bar >= 0
            let k = kick[i], k2 = kick2[i]
            let now = frame + Int64(i)
            var sumL: Float = 0, sumR: Float = 0
            var hallIn: (Float, Float) = (0, 0), roomIn: (Float, Float) = (0, 0)

            // The kick bus: a lowpass that walks open and shut, a level, the centre.
            let kIn = Double((auxL[kickBus * maxChunk + i] + auxR[kickBus * maxChunk + i]) * 0.5 * drums)
            let kfc = exp(Double(kickCutoff.value(bar)))
            let kb = kickSVF.low(kIn, g: tan(Double.pi * kfc * invSr), k: kickK) * Double(kickGain.value(bar))
            let kickOut = Float(kb) * s.kick.gain * centre
            if on.kick { sumL += kickOut; sumR += kickOut }

            // The rumble: the bus now and a step or two back, the dark room, the low band, tanh.
            ring[ringPos] = Float(kb)
            var x: Float = 0
            for j in taps.indices { x += tapGains[j] * ring[(ringPos - taps[j] + Self.ringSize) & (Self.ringSize - 1)] }
            ringPos = (ringPos + 1) & (Self.ringSize - 1)
            firHistory[firPos] = x
            firHistory[firPos + firLength] = x
            var head: Float = 0
            vDSP_dotpr(firHistory + firPos + 1, 1, fir, 1, &head, vDSP_Length(firLength))
            firPos = (firPos + 1) % firLength
            var r = Double(head + rumbleConv.tick(x))
            r = rumbleLP2.run(rumbleLP1.run(rumbleHP.run(r)))
            r = tanh(s.rumble.drive * r / s.rumble.norm)
            let rum = Float(rumbleSmooth.run(r)) * (1 - k2) * rumbleLevel.value(bar) * s.rumble.gain * centre
            if on.rumble { sumL += rum; sumR += rum }

            // The acid voice: the notes due now, then the control signals, the oscillator, the
            // two filters, the saturator.
            while next < pendingCount && pending[next].offset <= i {
                let p = pending[next]
                next += 1
                tgt = Rack.hz(Double(p.note))
                if !gate {
                    cur = tgt
                    attacking = true
                    fe = 1 + a.accentEnv * (p.accent ? 1 : 0)
                }
                accent = p.accent ? 1 : 0
                level = p.gain
                acidNote = p.note
                acidLive = p.live
                gate = true
                gateEnd = p.live || p.held == .max ? .max : now + Int64(p.held)
            }
            if gate && now >= gateEnd { gate = false }
            cur = tgt + (cur - tgt) * glideK
            if gate {
                if attacking {
                    lvl += attackStep
                    if lvl >= 1 { lvl = 1; attacking = false }
                } else {
                    lvl = a.sustain + (lvl - a.sustain) * decayK
                }
            } else {
                lvl *= releaseK
                attacking = false
            }
            let amp = lvl * (1 + a.accentLevel * accent) * Double(level)
            let env = fe
            fe *= exp(-1 / (Double(acidTau.value(bar)) * sr))
            let osc = Double(Rack.saw(&oscPhase, cur * invSr) * a.osc)
            let fc = Swift.min(Swift.max(exp(Double(acidBase.value(bar))) * pow(2, Double(acidAmount.value(bar)) * env)
                                         * (1 + a.lfoDepth * sin(lfoAcid * bar)), a.min), a.max)
            let y1 = a1.low(osc, g: tan(Double.pi * fc * invSr), k: 1 / Double(acidQ.value(bar)))
            let y2 = a2.low(y1, g: tan(Double.pi * Swift.min(fc * a.ratio2, a.max2) * invSr), k: 1 / Double(a.q2))
            let drive = Double(acidDrive.value(bar))
            let acidRaw = acidHP.run(Float(tanh(drive * y2 * amp) / drive)) * a.gain
            let acidOut = acidRaw * (1 - a.duck * k) * centre
            if on.acid { sumL += acidOut; sumR += acidOut }
            hallIn.0 += acidOut * a.hall; hallIn.1 += acidOut * a.hall

            // The acid echo: its input on one side, then the other, every half bar.
            let at = bar * samplesPerBar
            let edge = (at / sideSpan).rounded()
            let boundary = (edge * sideSpan).rounded(.up)
            let before: Float = edge > 0 ? Float(Int(edge - 1) & 1) : 0, after: Float = Float(Int(edge) & 1)
            let share = Float(Swift.min(Swift.max(at.rounded() + half - boundary, 0), 2 * half) / (2 * half))
            let side = before + (after - before) * share
            let (eL, eR) = acidEcho.run(acidRaw * (1 - side), acidRaw * side, feedback: acidFeedback.value(bar), target: acidTarget,
                                        glide: glide, advance: live)
            let eg = s.acidEcho.level * (1 - s.acidEcho.duck * k)
            let echoL = eL * eg, echoR = eR * eg
            if on.echo { sumL += echoL; sumR += echoR }
            hallIn.0 += echoL * s.acidEcho.hall; hallIn.1 += echoR * s.acidEcho.hall

            // The ping: a lowpass a side, the mono sum into its echo.
            let pg = tan(Double.pi * exp(Double(pingCutoff.value(bar))) * invSr)
            let pl = Float(pingL.low(Double(auxL[pingBus * maxChunk + i] * drums), g: pg, k: pingK))
            let pr = Float(pingR.low(Double(auxR[pingBus * maxChunk + i] * drums), g: pg, k: pingK))
            let (qL, qR) = pingEcho.run((pl + pr) * 0.5, 0, feedback: s.ping.echo.feedback, target: pingTarget, glide: glide, advance: live)
            let pgain = s.ping.gain * (1 - s.ping.duck * k)
            let pingOutL = (pl + s.ping.echo.level * qL) * pgain, pingOutR = (pr + s.ping.echo.level * qR) * pgain
            if on.ping { sumL += pingOutL; sumR += pingOutR }
            hallIn.0 += pingOutL * s.ping.hall; hallIn.1 += pingOutR * s.ping.hall

            // The pad: every gate through its two lowpasses, the saws free-running from the top.
            var padL = 0.0, padR = 0.0
            for v in pads.indices where pads[v].note >= 0 {
                var p = pads[v]
                p.band.tick()
                p.key.tick()
                let open = (p.band.on && bandPads) || p.key.on
                p.g1 += padSmooth * ((open ? 1 : 0) - p.g1)
                p.g2 += padSmooth * (p.g1 - p.g2)
                if p.fixed ? live : (p.g2 > 1e-7 || open) {
                    let g = p.g2 * Double(p.gain)
                    padL += g * Double(Rack.saw(&p.ph.0, p.dt.0) + Rack.saw(&p.ph.1, p.dt.1))
                    padR += g * Double(Rack.saw(&p.ph.2, p.dt.2) + Rack.saw(&p.ph.3, p.dt.3))
                }
                pads[v] = p
            }
            let pfc = Double(padCutoff.value(bar)) * (1 + s.pad.lfoDepth * sin(lfoPad * bar + s.pad.lfoPhase))
            let plvl = padLevel.value(bar)
            let fL = Float(padFL.low(padL, g: tan(Double.pi * pfc * invSr), k: padK))
            let fR = Float(padFR.low(padR, g: tan(Double.pi * Swift.min(pfc * Double(s.pad.rightScale), sr * 0.45) * invSr), k: padK))
            let pd = s.pad.gain * (1 - s.pad.duck * k)
            let padOutL = padHL.run(fL * plvl) * pd, padOutR = padHR.run(fR * plvl) * pd
            if on.pad { sumL += padOutL; sumR += padOutR }
            hallIn.0 += padOutL * s.pad.hall; hallIn.1 += padOutR * s.pad.hall

            // The kit's buses, each with its duck and its sends.
            for b in plain {
                let d = drums * (1 - busDuck[b] * k)
                let l = auxL[b * maxChunk + i] * d, r = auxR[b * maxChunk + i] * d
                if busOn[b] { sumL += l; sumR += r }
                let h = busHall[b], rm = busRoom[b]
                if h != 0 { hallIn.0 += l * h; hallIn.1 += r * h }
                if rm != 0 { roomIn.0 += l * rm; roomIn.1 += r * rm }
            }

            // The noise bed, looped, under its lane.
            if live {
                let ip = Int(noisePos)
                let fr = Float(noisePos - Double(ip))
                let ng = s.noise.gain * noiseLevel.value(bar) * (1 - s.noise.duck * k) / 32768
                let nL = (Float(noise.left[ip]) + (Float(noise.left[ip + 1]) - Float(noise.left[ip])) * fr) * ng
                let nR = (Float(noise.right[ip]) + (Float(noise.right[ip + 1]) - Float(noise.right[ip])) * fr) * ng
                noisePos += noiseStep
                if noisePos >= Double(noise.count - 1) { noisePos -= Double(noise.count - 1) }
                if on.noise { sumL += nL; sumR += nR }
            }

            // The hall and the room.
            let hg = hallG * (1 - hallDuck * k)
            let hL = hallL.tick(hallIn.0) * hg, hR = hallR.tick(hallIn.1) * hg
            let rL = roomL.tick(roomIn.0) * roomG, rR = roomR.tick(roomIn.1) * roomG
            if on.hall { sumL += hL; sumR += hR }
            if on.room { sumL += rL; sumR += rR }

            let xL = outL[i] + sumL, xR = outR[i] + sumR
            if raw {
                outL[i] = xL
                outR[i] = xR
            } else {
                let fd = fade.value(bar)
                let yL = tanhf(masterL.run(xL) * fd * m.drive) * m.post
                let yR = tanhf(masterR.run(xR) * fd * m.drive) * m.post
                let peak = Swift.max(abs(yL), abs(yR))
                let want: Float = peak > limit ? limit / peak : 1
                limiter = want < limiter ? want : limiter + (want - limiter) * limitRelease
                outL[i] = yL * limiter * out
                outR[i] = yR * limiter * out
            }
        }
        // The notes still waiting move into the next chunk.
        var kept = 0
        for j in next..<pendingCount {
            var p = pending[j]
            p.offset -= n
            pending[kept] = p
            kept += 1
        }
        pendingCount = kept
        frame += Int64(n)
    }
}
