import Foundation

/// Streulicht's console (a band's `moogRack`), 2026-11-10: a port of
/// `misc/streulicht_reference.py`'s `render`, per sample, at the reference's own signal levels
/// (`misc/STREULICHT.md` is the brief, `DUB-TECHNO.md` §12 the write-up). Every pitched voice
/// here is Moog-shaped, which the other consoles are not:
///
/// - **the ladder** (`ladder`): four one-pole lowpasses in a feedback loop, zero-delay form, a
///   tanh at the input; cutoff and resonance per sample;
/// - **the oscillator** (`osc_moog`): a PolyBLEP saw and a PolyBLEP pulse off one phase, pitch and
///   pulse width per sample;
/// - **the control** (`seq_ctrl`): pitch, amp and filter envelope for one mono voice; a velocity
///   per note, the decay, sustain, release, envelope and glide each a number or a lane; a note
///   that starts while the gate is still open is legato (no new attack, the envelope and the
///   velocity stay);
/// - **three voices** of those: the **line** (the record's carrier, the horns channel and your
///   keys on the melody part: three oscillators, lanes on nearly everything), the **bass**
///   (sixteenths on E, a saw and a pulse an octave down, a slid note glides for the length of
///   its gate) and the **lead** (the visitor: three oscillators, legato, a vibrato that comes
///   up on long notes). Each runs from the top of the song and never stops: the gate is only
///   the amp;
/// - **drift**: six slow wanders of pitch and cutoff the reference drew from numpy's generator,
///   read from `sl-drift.json` (a unit curve at 100 Hz and a depth in cents each);
/// - **two tape echoes**: the line's (three sixteenths, its input side swapping every eighth,
///   its send and its feedback on lanes) and the lead's (six sixteenths, left in);
/// - **the pad**: four notes of six saws each, free-running from the reference's phases, each
///   behind a gate smoothed by two one-pole lowpasses, a ladder a side;
/// - **drum buses** with their sends (the closed hats' bus has a lowpass: its hits are slices of
///   noise under their own envelopes, `BandData.Hit.o / n / d`), **the noise bed** looped, **the
///   hall and the room** by convolution, **the master**.
final class MoogRack: Console {
    // MARK: Settings (the song file's `moogRack`)

    struct Settings: Decodable {
        struct Bus: Decodable {
            let name: String
            var hall: Float?
            var room: Float?
            var duck: Float?
            /// A second-order Butterworth lowpass on the bus, Hz.
            var lowpass: Double?
        }

        struct Osc: Decodable {
            /// The voice's pitch × this (octaves and cents in it).
            let ratio: Double
            let phase: Double
            /// The pulse's width, when the voice has no `widthLfo`.
            var width: Double?
            /// The saw's and the pulse's level; a lane by name replaces the number.
            var saw: Double?
            var pulse: Double?
            var sawLane: String?
            var pulseLane: String?
            /// A drift on this oscillator's pitch alone (a key of the drift file).
            var drift: String?
        }

        struct Vibrato: Decodable {
            let rate: Double
            let depth: Double
            /// The vibrato's own phase wanders: + wobbleDepth · sin(2π · wobbleRate · t).
            let wobbleRate: Double
            let wobbleDepth: Double
            /// On while the amp is over `gate`, through a one-pole lowpass at `smooth` Hz; the
            /// depth is that × scale − offset, clipped to 0…1.
            let gate: Double
            let smooth: Double
            let scale: Double
            let offset: Double
        }

        struct Voice: Decodable {
            /// Lanes named `<prefix>Decay`, `…Sustain`, `…Release`, `…Envelope`, `…Glide`,
            /// `…Base`, `…Amount`, `…Resonance`, `…Drive`, `…Level`, `…Hall` and `…Send` replace
            /// the numbers below when the song has them.
            let prefix: String
            /// The MIDI note the pitch sits at before the first note.
            let start: Double
            /// Seconds: the attack, and the time constants of the decay toward `sustain`, the
            /// release, the filter envelope and the glide (0: the pitch jumps).
            let attack: Double
            let decay: Double
            let sustain: Double
            let release: Double
            let envelope: Double
            let glide: Double
            /// The glide's time constant for the length of a legato note's gate (the bass).
            var slideGlide: Double?
            /// An accent: the amp × (1 + accentLevel), the filter envelope 1 + accentEnv.
            let accentLevel: Double
            let accentEnv: Double
            /// A drift on the voice's pitch.
            var drift: String?
            /// The pulse width of every oscillator: 0.5 + depth · sin(2π · bar / bars).
            var widthLfo: [Double]?
            let oscs: [Osc]
            /// The oscillators' sum × this into the ladder.
            let input: Double
            /// The cutoff: base (Hz; a `…Base` lane is of logs when `baseLog`) × 2^(amount ×
            /// envelope) × (pitch / track[0]) ^ track[1] × a drift, clipped to min…max.
            let base: Double
            var baseLog: Bool?
            let amount: Double
            var track: [Double]?
            var cutoffDrift: String?
            let min: Double
            let max: Double
            let resonance: Double
            let ladderDrive: Double
            /// After the ladder: tanh(drive × y × amp × boost) / drive, a highpass, the gain.
            let drive: Double
            let boost: Double
            let highpass: Double
            let gain: Float
            let level: Float
            let duck: Float
            let pan: Double
            let hall: Float
            /// What of it goes into its echo, mono, before its duck and pan.
            let send: Float
            var vibrato: Vibrato?
            /// A key this hard or harder is an accent (a band note's velocity is 1 or under it).
            let accentVelocity: Float
        }

        struct Pad: Decodable {
            /// The record's notes, and six start phases a note (three saws a side).
            let notes: [Int]
            let phases: [Double]
            /// [cents, harmonic, level] per saw.
            let left: [[Double]]
            let right: [[Double]]
            /// Hz of each of the gate's two one-pole lowpasses.
            let smooth: Double
            let input: Double
            let resonance: Double
            let ladderDrive: Double
            let rightScale: Double
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
        let line: Voice
        let bass: Voice
        let lead: Voice
        let lineEcho: Rack.Settings.Echo
        let leadEcho: Rack.Settings.Echo
        /// The line echo's input side: it swaps every `sideBars` bars, smoothed by a centred
        /// boxcar `sideWindow` seconds long.
        let sideBars: Double
        let sideWindow: Double
        let pad: Pad
        /// The drift file (a bundled JSON): `{key: {cents, rate, curve}}`.
        let drift: String
        let hall: Rack.Settings.Reverb
        let room: Rack.Settings.Reverb
        let noise: Rack.Settings.Noise
        let master: Rack.Settings.Master
    }

    // MARK: Pieces

    /// The reference's `ladder`.
    struct Ladder {
        var s1 = 0.0, s2 = 0.0, s3 = 0.0, s4 = 0.0

        @inline(__always) mutating func run(_ x: Double, cutoff: Double, resonance k: Double, drive: Double, sr: Double) -> Double {
            let f = Swift.min(cutoff, 0.45 * sr)
            let g = tan(Double.pi * f / sr)
            let G = g / (1 + g)
            let S = (G * G * G * s1 + G * G * s2 + G * s3 + s4) * (1 - G)
            var u = (x * (1 + 0.5 * k) - k * S) / (1 + k * G * G * G * G)
            u = tanh(drive * u) / drive
            var v = (u - s1) * G
            let y1 = v + s1
            s1 = y1 + v
            v = (y1 - s2) * G
            let y2 = v + s2
            s2 = y2 + v
            v = (y2 - s3) * G
            let y3 = v + s3
            s3 = y3 + v
            v = (y3 - s4) * G
            let y4 = v + s4
            s4 = y4 + v
            return y4
        }

        mutating func clear() { s1 = 0; s2 = 0; s3 = 0; s4 = 0 }
    }

    /// The reference's `_blep`.
    @inline(__always) static func blep(_ t: Double, _ dt: Double) -> Double {
        if t < dt {
            let x = t / dt
            return x + x - x * x - 1
        }
        if t > 1 - dt {
            let x = (t - 1) / dt
            return x * x + x + x + 1
        }
        return 0
    }

    /// One of the reference's drifts: a unit curve at `rate` Hz, already in octaves.
    struct Drift {
        let curve: UnsafeMutablePointer<Double>
        let count: Int
        let rate: Double

        /// The frequency ratio at `time` seconds from the top of the song.
        @inline(__always) func value(_ time: Double) -> Double {
            let x = Swift.min(Swift.max(time * rate, 0), Double(count - 1))
            let i = Swift.min(Int(x), count - 2)
            let v = curve[i] + (curve[i + 1] - curve[i]) * (x - Double(i))
            return exp2(v)
        }
    }

    private struct DriftFile: Decodable {
        let cents: Double
        let rate: Double
        let curve: [Double]
    }

    /// One mono voice: the control, its oscillators, the ladder, the saturator, the highpass.
    final class Voice {
        struct OscState {
            var phase = 0.0
            var ratio = 1.0
            var width = 0.5
            var saw = 0.0
            var pulse = 0.0
            var hasSawLane = false
            var hasPulseLane = false
            var hasDrift = false
        }

        let s: Settings.Voice
        private let sr: Double
        private let pending = UnsafeMutableBufferPointer<AcidRack.Pending>.allocate(capacity: 32)
        private var count = 0
        private var next = 0

        private var decayLane: Rack.Lane, sustainLane: Rack.Lane, releaseLane: Rack.Lane, envelopeLane: Rack.Lane, glideLane: Rack.Lane
        private var baseLane: Rack.Lane, amountLane: Rack.Lane, resonanceLane: Rack.Lane, driveLane: Rack.Lane, levelLane: Rack.Lane
        var hallLane: Rack.Lane, sendLane: Rack.Lane
        private let decayIsLane: Bool, releaseIsLane: Bool, envelopeIsLane: Bool, glideIsLane: Bool, baseIsLane: Bool
        private let attackStep: Double, decayK: Double, releaseK: Double, envelopeK: Double, glideK: Double, slideK: Double
        private let hasSlide: Bool

        private let oscs: UnsafeMutableBufferPointer<OscState>
        private let sawLanes: UnsafeMutableBufferPointer<Rack.Lane>
        private let pulseLanes: UnsafeMutableBufferPointer<Rack.Lane>
        private let oscDrifts: UnsafeMutableBufferPointer<Drift>
        private let pitchDrift: Drift?
        private let cutoffDrift: Drift?
        private let startHz: Double

        private var cur = 0.0, tgt = 0.0
        private var gate = false
        private var gateEnd: Int64 = .max
        private var lvl = 0.0
        private var attacking = false
        private var fe = 0.0
        private var accent = 0.0
        private var vel = 1.0
        private var sliding = false
        private var note = -1
        private var live = false
        private var held = 0.0
        private let vibratoK: Double
        private var ladder = Ladder()
        private var highpass: AcidRack.Biquad
        let panL: Float, panR: Float

        init(_ s: Settings.Voice, lanes: [String: [[Double]]], drifts: [String: Drift], sampleRate: Double) {
            self.s = s
            sr = sampleRate
            pending.initialize(repeating: AcidRack.Pending())
            func lane(_ name: String, _ d: Double) -> Rack.Lane { Rack.Lane(lanes[s.prefix + name], default: d) }
            func has(_ name: String) -> Bool { lanes[s.prefix + name] != nil }
            func coef(_ tau: Double) -> Double { tau > 1e-5 ? exp(-1 / (tau * sampleRate)) : 0 }
            decayLane = lane("Decay", s.decay); sustainLane = lane("Sustain", s.sustain); releaseLane = lane("Release", s.release)
            envelopeLane = lane("Envelope", s.envelope); glideLane = lane("Glide", s.glide)
            baseLane = lane("Base", s.base); amountLane = lane("Amount", s.amount); resonanceLane = lane("Resonance", s.resonance)
            driveLane = lane("Drive", s.drive); levelLane = lane("Level", Double(s.level))
            hallLane = lane("Hall", Double(s.hall)); sendLane = lane("Send", Double(s.send))
            decayIsLane = has("Decay"); releaseIsLane = has("Release"); envelopeIsLane = has("Envelope"); glideIsLane = has("Glide")
            baseIsLane = has("Base")
            attackStep = 1 / (s.attack * sampleRate)
            decayK = coef(s.decay); releaseK = coef(s.release); envelopeK = coef(s.envelope); glideK = coef(s.glide)
            hasSlide = s.slideGlide != nil
            slideK = coef(s.slideGlide ?? 0)
            startHz = Rack.hz(s.start)

            let n = s.oscs.count
            oscs = .allocate(capacity: n)
            sawLanes = .allocate(capacity: n)
            pulseLanes = .allocate(capacity: n)
            oscDrifts = .allocate(capacity: n)
            let none = Drift(curve: .allocate(capacity: 2), count: 2, rate: 1)
            none.curve[0] = 0; none.curve[1] = 0
            for (i, o) in s.oscs.enumerated() {
                oscs.initializeElement(at: i, to: OscState(phase: o.phase, ratio: o.ratio, width: o.width ?? 0.5, saw: o.saw ?? 0, pulse: o.pulse ?? 0,
                                                           hasSawLane: o.sawLane != nil, hasPulseLane: o.pulseLane != nil,
                                                           hasDrift: o.drift != nil))
                sawLanes.initializeElement(at: i, to: Rack.Lane(o.sawLane.flatMap { lanes[$0] }, default: o.saw ?? 0))
                pulseLanes.initializeElement(at: i, to: Rack.Lane(o.pulseLane.flatMap { lanes[$0] }, default: o.pulse ?? 0))
                if let key = o.drift {
                    guard let d = drifts[key] else { fatalError("moog rack: no drift \(key)") }
                    oscDrifts.initializeElement(at: i, to: d)
                } else {
                    oscDrifts.initializeElement(at: i, to: none)
                }
            }
            func drift(_ key: String?) -> Drift? {
                guard let key else { return nil }
                guard let d = drifts[key] else { fatalError("moog rack: no drift \(key)") }
                return d
            }
            pitchDrift = drift(s.drift)
            cutoffDrift = drift(s.cutoffDrift)
            vibratoK = 1 - exp(-2 * Double.pi * (s.vibrato?.smooth ?? 1) / sampleRate)
            highpass = AcidRack.Biquad(s.highpass, sr: sampleRate, high: true)
            let angle = (s.pan + 1) * Double.pi / 4
            panL = Float(cos(angle))
            panR = Float(sin(angle))
            reset()
        }

        func reset() {
            count = 0; next = 0
            cur = startHz; tgt = startHz
            gate = false; gateEnd = .max; lvl = 0; attacking = false; fe = 0; accent = 0; vel = 1; sliding = false
            note = -1; live = false; held = 0
            for i in oscs.indices { oscs[i].phase = s.oscs[i].phase.truncatingRemainder(dividingBy: 1) }
            ladder.clear()
            highpass.clear()
        }

        func queue(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
            guard count < pending.count else { return }
            var i = count
            let p = AcidRack.Pending(offset: offset, note: note, accent: velocity >= s.accentVelocity, held: held, gain: gain, live: live)
            while i > 0 && pending[i - 1].offset > offset {
                pending[i] = pending[i - 1]
                i -= 1
            }
            pending[i] = p
            count += 1
        }

        /// The band stops: its note dies away; a key's does not.
        func releaseBand(at frame: Int64) {
            if !live { gateEnd = Swift.min(gateEnd, frame) }
            count = 0
            next = 0
        }

        func release(_ key: Int, at frame: Int64) {
            if live && note == key { gateEnd = Swift.min(gateEnd, frame) }
        }

        /// The top of a chunk, and its end: the notes still waiting move into the next one.
        func begin() { next = 0 }

        func end(_ n: Int) {
            var kept = 0
            for j in next..<count {
                var p = pending[j]
                p.offset -= n
                pending[kept] = p
                kept += 1
            }
            count = kept
            next = 0
        }

        @inline(__always) private func coef(_ tau: Double) -> Double { tau > 1e-5 ? exp(-1 / (tau * sr)) : 0 }

        /// One sample, mono, at its gain and level, before its duck and its pan.
        @inline(__always) func tick(_ i: Int, now: Int64, bar: Double, time: Double) -> Float {
            // The notes due now. A note that starts while the gate is still open is legato; one
            // that starts on the frame the gate ends is not.
            while next < count && pending[next].offset <= i {
                let p = pending[next]
                next += 1
                tgt = Rack.hz(Double(p.note))
                let legato = gate && now < gateEnd
                if !legato {
                    attacking = true
                    fe = 1 + s.accentEnv * (p.accent ? 1 : 0)
                    vel = Double(p.gain)
                }
                sliding = legato && hasSlide
                accent = p.accent ? 1 : 0
                note = p.note
                live = p.live
                gate = true
                gateEnd = p.live || p.held == .max ? .max : now + Int64(p.held)
            }
            if gate && now >= gateEnd { gate = false }
            let gl = sliding && gate ? slideK : glideIsLane ? coef(Double(glideLane.value(bar))) : glideK
            cur = tgt + (cur - tgt) * gl
            if gate {
                if attacking {
                    lvl += attackStep
                    if lvl >= 1 { lvl = 1; attacking = false }
                } else {
                    let sustain = Double(sustainLane.value(bar))
                    lvl = sustain + (lvl - sustain) * (decayIsLane ? coef(Double(decayLane.value(bar))) : decayK)
                }
            } else {
                lvl *= releaseIsLane ? coef(Double(releaseLane.value(bar))) : releaseK
                attacking = false
            }
            let amp = lvl * vel * (1 + s.accentLevel * accent)
            let env = fe
            fe *= envelopeIsLane ? coef(Double(envelopeLane.value(bar))) : envelopeK

            // The pitch: the vibrato, the drift.
            var f = cur
            if let v = s.vibrato {
                held += vibratoK * ((amp > v.gate ? 1 : 0) - held)
                let depth = Swift.min(Swift.max(v.scale * held - v.offset, 0), 1)
                f *= 1 + v.depth * sin(2 * Double.pi * v.rate * time + v.wobbleDepth * sin(2 * Double.pi * v.wobbleRate * time)) * depth
            }
            if let d = pitchDrift { f *= d.value(time) }

            // The oscillators: a saw and a pulse off each phase.
            var width = 0.5
            let lfo = s.widthLfo != nil
            if let w = s.widthLfo { width = 0.5 + w[0] * sin(2 * Double.pi * bar / w[1]) }
            var mix = 0.0
            for j in oscs.indices {
                var o = oscs[j]
                var fo = f * o.ratio
                if o.hasDrift { fo *= oscDrifts[j].value(time) }
                let dt = fo / sr
                let ph = o.phase
                let sawLevel = o.hasSawLane ? Double(sawLanes[j].value(bar)) : o.saw
                let pulseLevel = o.hasPulseLane ? Double(pulseLanes[j].value(bar)) : o.pulse
                if sawLevel != 0 { mix += sawLevel * (2 * ph - 1 - MoogRack.blep(ph, dt)) }
                if pulseLevel != 0 {
                    let w = lfo ? width : o.width
                    var p = ph < w ? 1.0 : -1.0
                    p += MoogRack.blep(ph, dt)
                    var ph2 = ph - w
                    if ph2 < 0 { ph2 += 1 }
                    p -= MoogRack.blep(ph2, dt)
                    mix += pulseLevel * p
                }
                o.phase = ph + dt
                if o.phase >= 1 { o.phase -= 1 }
                oscs[j] = o
            }

            // The ladder, the saturator, the highpass.
            let base = baseIsLane ? (s.baseLog == true ? exp(Double(baseLane.value(bar))) : Double(baseLane.value(bar))) : s.base
            var fc = base * pow(2, Double(amountLane.value(bar)) * env)
            if let t = s.track { fc *= pow(f / t[0], t[1]) }
            if let d = cutoffDrift { fc *= d.value(time) }
            fc = Swift.min(Swift.max(fc, s.min), s.max)
            let y = ladder.run(mix * s.input, cutoff: fc, resonance: Double(resonanceLane.value(bar)), drive: s.ladderDrive, sr: sr)
            let drive = Double(driveLane.value(bar))
            let x = highpass.run(tanh(drive * y * amp * s.boost) / drive)
            return Float(x) * s.gain * levelLane.value(bar)
        }
    }

    /// A pad note: three saws a side and a gate through two one-pole lowpasses.
    struct PadVoice {
        var note = -1
        var ph: (Double, Double, Double, Double, Double, Double) = (0, 0, 0, 0, 0, 0)
        var dt: (Double, Double, Double, Double, Double, Double) = (0, 0, 0, 0, 0, 0)
        var band = AcidRack.Gate()
        var key = AcidRack.Gate()
        var g1 = 0.0, g2 = 0.0
        var gain: Float = 1
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
    private let busHall: [Float], busRoom: [Float], busDuck: [Float], busFiltered: [Bool]
    private let busLP: UnsafeMutableBufferPointer<Rack.Biquad>

    private let lineVoice: Voice, bassVoice: Voice, leadVoice: Voice
    private var lineFeedback: Rack.Lane, padCutoff: Rack.Lane, padLevel: Rack.Lane, noiseLevel: Rack.Lane, fade: Rack.Lane
    private var lineEcho: Rack.Tape, leadEcho: Rack.Tape

    private let pads = UnsafeMutableBufferPointer<PadVoice>.allocate(capacity: 16)
    private let fixedPads: Int
    private let padLevels: (Double, Double, Double, Double, Double, Double)
    private var padLadderL = Ladder(), padLadderR = Ladder()
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
    private var on = (line: true, bass: true, lead: true, echo: true, leadEcho: true, pad: true, noise: true, hall: true, room: true)

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
        busFiltered = s.buses.map { $0.lowpass != nil }
        busLP = .allocate(capacity: max(1, s.buses.count) * 2)
        busLP.initialize(repeating: Rack.Biquad())
        for (i, b) in s.buses.enumerated() {
            if let f = b.lowpass {
                busLP[i * 2] = .lowpass(f, sr: sampleRate)
                busLP[i * 2 + 1] = .lowpass(f, sr: sampleRate)
            }
        }

        // The drifts: the reference's curves, in octaves.
        guard let url = Bundle.main.url(forResource: s.drift, withExtension: "json"), let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode([String: DriftFile].self, from: data) else {
            fatalError("moog rack: drift file \(s.drift).json is not in the bundle")
        }
        var drifts: [String: Drift] = [:]
        for (key, d) in file {
            let p = UnsafeMutablePointer<Double>.allocate(capacity: max(2, d.curve.count))
            p.initialize(repeating: 0, count: max(2, d.curve.count))
            for (i, v) in d.curve.enumerated() { p[i] = v * d.cents / 1200 }
            drifts[key] = Drift(curve: p, count: max(2, d.curve.count), rate: d.rate)
        }
        lineVoice = Voice(s.line, lanes: s.lanes, drifts: drifts, sampleRate: sampleRate)
        bassVoice = Voice(s.bass, lanes: s.lanes, drifts: drifts, sampleRate: sampleRate)
        leadVoice = Voice(s.lead, lanes: s.lanes, drifts: drifts, sampleRate: sampleRate)

        func lane(_ name: String) -> Rack.Lane {
            guard let points = s.lanes[name] else { fatalError("moog rack: no lane \(name)") }
            return Rack.Lane(points, default: 0)
        }
        lineFeedback = lane("lineFeedback"); padCutoff = lane("padCutoff"); padLevel = lane("padLevel")
        noiseLevel = lane("noise"); fade = lane("fade")
        lineEcho = Rack.Tape(s.lineEcho, sampleRate: sampleRate)
        leadEcho = Rack.Tape(s.leadEcho, sampleRate: sampleRate)

        let p = s.pad
        precondition(p.left.count == 3 && p.right.count == 3 && p.phases.count == p.notes.count * 6, "moog rack: three pad saws a side")
        precondition(p.notes.count <= 8, "moog rack: eight record notes at most")
        fixedPads = p.notes.count
        pads.initialize(repeating: PadVoice())
        padLevels = (p.left[0][2], p.left[1][2], p.left[2][2], p.right[0][2], p.right[1][2], p.right[2][2])
        padHL = .highpass(p.highpass, sr: sampleRate); padHR = .highpass(p.highpass, sr: sampleRate)
        padSmooth = 1 - exp(-2 * Double.pi * p.smooth / sampleRate)

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
        on = (passes("line"), passes("bass"), passes("lead"), passes("echo"), passes("lead_echo"), passes("pad"), passes("noise"),
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

    private func padSteps(_ note: Int) -> (Double, Double, Double, Double, Double, Double) {
        let f = Rack.hz(Double(note))
        let d = (settings.pad.left + settings.pad.right).map { f * $0[1] * pow(2, $0[0] / 1200) / sr }
        return (d[0], d[1], d[2], d[3], d[4], d[5])
    }

    func reset() {
        lineVoice.reset(); bassVoice.reset(); leadVoice.reset()
        lineEcho.clear(); leadEcho.clear()
        for i in busLP.indices { busLP[i].clear() }
        let s = settings.pad
        for i in pads.indices { pads[i] = PadVoice() }
        for (i, note) in s.notes.enumerated() {
            let p = (s.phases[i * 6], s.phases[i * 6 + 1], s.phases[i * 6 + 2], s.phases[i * 6 + 3], s.phases[i * 6 + 4], s.phases[i * 6 + 5])
            pads[i] = PadVoice(note: note, ph: p, dt: padSteps(note), fixed: true)
        }
        padLadderL.clear(); padLadderR.clear(); padHL.clear(); padHR.clear()
        noisePos = 0
        hallL.reset(); hallR.reset(); roomL.reset(); roomR.reset()
        masterL.clear(); masterR.clear()
        limiter = 1
    }

    func releaseBand() {
        for i in pads.indices { pads[i].band = AcidRack.Gate() }
        lineVoice.releaseBand(at: frame); bassVoice.releaseBand(at: frame); leadVoice.releaseBand(at: frame)
    }

    /// A note of the line (the renderer's `rackAcid`).
    func acid(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        lineVoice.queue(note, velocity: velocity, gain: gain, held: held, offset: offset, live: live)
    }

    /// A bass note (the renderer's `rackBass`).
    func bass(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        bassVoice.queue(note, velocity: velocity, gain: gain, held: held, offset: offset, live: live)
    }

    /// A note of the lead (the renderer's `rackLead`).
    func pluck(_ note: Int, velocity: Float, gain: Float, held: Int, offset: Int, live: Bool) {
        leadVoice.queue(note, velocity: velocity, gain: gain, held: held, offset: offset, live: live)
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
            var seed = UInt32(truncatingIfNeeded: note &* 2654435761) | 1
            func next() -> Double {
                seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5
                return Double(seed) / 4294967296
            }
            pads[slot] = PadVoice(note: note, ph: (next(), next(), next(), next(), next(), next()), dt: padSteps(note), fixed: false)
        }
        age += 1
        pads[slot].age = age
        pads[slot].gain = gain
        if live { pads[slot].key.set(offset: offset, held: held) } else { pads[slot].band.set(offset: offset, held: held) }
    }

    func release(_ note: Int, offset: Int) {
        let at = frame + Int64(offset)
        lineVoice.release(note, at: at); bassVoice.release(note, at: at); leadVoice.release(note, at: at)
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
        // Streulicht is in four.
        let samplesPerBar = samplesPerBeat * 4
        let invSr = 1 / sr
        let barSeconds = samplesPerBar * invSr
        let tapeGlide = 1 - exp(-1 / (0.05 * sr))
        let lineTarget = s.lineEcho.beats * samplesPerBeat, leadTarget = s.leadEcho.beats * samplesPerBeat
        let lfoPad = 2 * Double.pi / s.pad.lfoBars
        let half = s.sideWindow * sr / 2, sideSpan = s.sideBars * samplesPerBar
        let noiseStep = noise.rate / sr
        let hallG = s.hall.level, roomG = s.room.level, hallDuck = s.hall.duck ?? 0
        let m = s.master
        let out = m.scale * m.level * trim
        let limit = m.limit ?? .infinity
        let limitRelease = Float(1 - exp(-1 / ((m.limitRelease ?? 0.12) * sr)))
        let bandPads = keys > 0.5
        let pl = padLevels
        let line = lineVoice, bass = bassVoice, lead = leadVoice
        line.begin(); bass.begin(); lead.begin()
        for i in 0..<n {
            let bar = bar0 + barsPerFrame * Double(i)
            let live = playing && bar >= 0
            let time = bar * barSeconds
            let k = kick[i]
            let now = frame + Int64(i)
            var sumL: Float = 0, sumR: Float = 0
            var hallIn: (Float, Float) = (0, 0), roomIn: (Float, Float) = (0, 0)

            // The bass.
            let bassMono = bass.tick(i, now: now, bar: bar, time: time) * (1 - s.bass.duck * k)
            let bassL = bassMono * bass.panL, bassR = bassMono * bass.panR
            if on.bass { sumL += bassL; sumR += bassR }
            let bassHall = bass.hallLane.value(bar)
            if bassHall != 0 { hallIn.0 += bassL * bassHall; hallIn.1 += bassR * bassHall }

            // The line, and its echo: its input on one side, then the other, every eighth.
            let lineMono = line.tick(i, now: now, bar: bar, time: time)
            let lineDucked = lineMono * (1 - s.line.duck * k)
            let lineL = lineDucked * line.panL, lineR = lineDucked * line.panR
            if on.line { sumL += lineL; sumR += lineR }
            let lineHall = line.hallLane.value(bar)
            hallIn.0 += lineL * lineHall; hallIn.1 += lineR * lineHall
            let echoIn = lineMono * line.sendLane.value(bar)
            let at = bar * samplesPerBar
            let edge = (at / sideSpan).rounded()
            let boundary = (edge * sideSpan).rounded(.up)
            let before: Float = edge > 0 ? Float(Int(edge - 1) & 1) : 0, after: Float = Float(Int(edge) & 1)
            let share = Float(Swift.min(Swift.max(at.rounded() + half - boundary, 0), 2 * half) / (2 * half))
            let side = before + (after - before) * share
            let (eL, eR) = lineEcho.run(echoIn * (1 - side), echoIn * side, feedback: lineFeedback.value(bar), target: lineTarget,
                                        glide: tapeGlide, advance: live)
            let eg = s.lineEcho.level * (1 - s.lineEcho.duck * k)
            let echoL = eL * eg, echoR = eR * eg
            if on.echo { sumL += echoL; sumR += echoR }
            hallIn.0 += echoL * s.lineEcho.hall; hallIn.1 += echoR * s.lineEcho.hall

            // The lead, and its echo: left in.
            let leadMono = lead.tick(i, now: now, bar: bar, time: time)
            let leadDucked = leadMono * (1 - s.lead.duck * k)
            let leadL = leadDucked * lead.panL, leadR = leadDucked * lead.panR
            if on.lead { sumL += leadL; sumR += leadR }
            let leadHall = lead.hallLane.value(bar)
            hallIn.0 += leadL * leadHall; hallIn.1 += leadR * leadHall
            let (vL, vR) = leadEcho.run(leadMono * lead.sendLane.value(bar), 0, feedback: s.leadEcho.feedback, target: leadTarget,
                                        glide: tapeGlide, advance: live)
            let vg = s.leadEcho.level * (1 - s.leadEcho.duck * k)
            let leadEchoL = vL * vg, leadEchoR = vR * vg
            if on.leadEcho { sumL += leadEchoL; sumR += leadEchoR }
            hallIn.0 += leadEchoL * s.leadEcho.hall; hallIn.1 += leadEchoR * s.leadEcho.hall

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
                    let l0 = Double(Rack.saw(&p.ph.0, p.dt.0)), l1 = Double(Rack.saw(&p.ph.1, p.dt.1)), l2 = Double(Rack.saw(&p.ph.2, p.dt.2))
                    let r0 = Double(Rack.saw(&p.ph.3, p.dt.3)), r1 = Double(Rack.saw(&p.ph.4, p.dt.4)), r2 = Double(Rack.saw(&p.ph.5, p.dt.5))
                    padL += g * (pl.0 * l0 + pl.1 * l1 + pl.2 * l2)
                    padR += g * (pl.3 * r0 + pl.4 * r1 + pl.5 * r2)
                }
                pads[v] = p
            }
            let pfc = Double(padCutoff.value(bar)) * (1 + s.pad.lfoDepth * sin(lfoPad * bar + s.pad.lfoPhase))
            let plvl = padLevel.value(bar)
            let fL = Float(padLadderL.run(padL * s.pad.input, cutoff: pfc, resonance: s.pad.resonance, drive: s.pad.ladderDrive, sr: sr))
            let fR = Float(padLadderR.run(padR * s.pad.input, cutoff: pfc * s.pad.rightScale, resonance: s.pad.resonance,
                                          drive: s.pad.ladderDrive, sr: sr))
            let pd = s.pad.gain * (1 - s.pad.duck * k)
            let padOutL = padHL.run(fL * plvl) * pd, padOutR = padHR.run(fR * plvl) * pd
            if on.pad { sumL += padOutL; sumR += padOutR }
            hallIn.0 += padOutL * s.pad.hall; hallIn.1 += padOutR * s.pad.hall

            // The kit's buses, each with its lowpass, its duck and its sends.
            for b in 0..<busNames.count {
                let d = drums * (1 - busDuck[b] * k)
                var l = auxL[b * maxChunk + i], r = auxR[b * maxChunk + i]
                if busFiltered[b] {
                    l = busLP[b * 2].run(l)
                    r = busLP[b * 2 + 1].run(r)
                }
                l *= d
                r *= d
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
        line.end(n); bass.end(n); lead.end(n)
        frame += Int64(n)
    }
}
