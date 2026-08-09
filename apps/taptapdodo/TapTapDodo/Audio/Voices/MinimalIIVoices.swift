import Foundation

// ttd·08 "minimal ii" — exact port of reference/tap-tap-dodo-minimal-ii.html.
// F minor, 128, swing 0.06 beats. Chords and the drone live on the engine's
// duck bus; chords and tick taps feed the dub delay; hats pan right, the
// polymeter rim pans left. Every constant below is the web file's.

/// Kick: 120→40 Hz sine sweep (0.13s) + 6ms noise click through HP 3000.
/// The duck itself is engine-side (EngineConfig.duck from kickTimes).
struct KickIIVoice: Voice {
    let startSongTime: Double
    let amp: Double

    private var phase = 0.0
    private var env: Double
    private var envFactor = 0.0
    private var noise: NoiseGen
    private var hp = Biquad()
    private var started = false
    private let duration = 0.3

    init(at t: Double, accent: Bool, seed: UInt64 = 13) {
        startSongTime = t
        amp = accent ? 1.0 : 0.92
        env = amp
        noise = NoiseGen(seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: amp, seconds: 0.3, sr: sr)
            hp = .highpass(sr: sr, freq: 3000)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            let f = expSweep(f0: 120, f1: 40, t: t, sweep: 0.13)
            phase += f * dt
            var sample = sin(phase * 2 * .pi) * env
            env *= envFactor
            if t < 0.006 {
                sample += hp.process(noise.next() * (1 - t / 0.006)) * 0.25
            }
            out[i] += Float(sample)
        }
        return t < duration
    }
}

/// Hat with caller-set volume (offbeats 0.14, peak ghosts 0.045), panned right.
struct HatIIVoice: Voice {
    let startSongTime: Double
    let length, vol: Double
    var pan: Double { 0.22 }

    private var noise: NoiseGen
    private var hp = Biquad()
    private var started = false

    init(at t: Double, vol: Double, open: Bool, seed: UInt64) {
        startSongTime = t
        length = open ? 0.16 : 0.035
        self.vol = vol
        noise = NoiseGen(seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            hp = .highpass(sr: sr, freq: 8500)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < length else { continue }
            let shape = pow(1 - t / length, 2)
            out[i] += Float(hp.process(noise.next() * shape) * vol)
        }
        return t < length
    }
}

/// Soft clap: 3 bursts, 12ms apart, 70ms each (^1.7), BP 1200 Q1.6, gain 0.10.
struct ClapSoftVoice: Voice {
    let startSongTime: Double

    // Three independent noise streams, like the web's three fresh buffers —
    // summing one stream by a summed envelope is +4.5 dB coherent, wrong.
    private var noise0: NoiseGen
    private var noise1: NoiseGen
    private var noise2: NoiseGen
    private var bp = Biquad()
    private var started = false
    private let duration = 0.024 + 0.07

    init(at t: Double, seed: UInt64) {
        startSongTime = t
        noise0 = NoiseGen(seed: seed)
        noise1 = NoiseGen(seed: seed &* 31 &+ 7)
        noise2 = NoiseGen(seed: seed &* 131 &+ 13)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            bp = .bandpass(sr: sr, freq: 1200, q: 1.6)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var mix = 0.0
            let t0 = t, t1 = t - 0.012, t2 = t - 0.024
            if t0 >= 0, t0 < 0.07 { mix += noise0.next() * pow(1 - t0 / 0.07, 1.7) }
            if t1 >= 0, t1 < 0.07 { mix += noise1.next() * pow(1 - t1 / 0.07, 1.7) }
            if t2 >= 0, t2 < 0.07 { mix += noise2.next() * pow(1 - t2 / 0.07, 1.7) }
            out[i] += Float(bp.process(mix) * 0.10)
        }
        return t < duration
    }
}

/// The 3-against-4 rim: square 1046 → BP 1900 Q8, 45ms, panned left.
struct RimIIVoice: Voice {
    let startSongTime: Double
    let vol: Double
    var pan: Double { -0.3 }

    private var phase = 0.0
    private var env: Double
    private var envFactor = 0.0
    private var bp = Biquad()
    private var started = false
    private let duration = 0.05

    init(at t: Double, vol: Double) {
        startSongTime = t
        self.vol = vol
        env = vol
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: vol, seconds: 0.045, sr: sr)
            bp = .bandpass(sr: sr, freq: 1900, q: 8)
            started = true
        }
        let dPhase = 1046.0 * dt
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            phase += dPhase
            if phase >= 1 { phase -= 1 }
            let onset = min(1.0, t * 1046.0 * 2)
            out[i] += Float(bp.process(blSquare(phase, dPhase) * onset) * env)
            env *= envFactor
        }
        return t < duration
    }
}

/// Dub chord stab: saws (±4 cents seeded) → BP 750 Q1.1, 0.055·vel, 0.34s.
/// Dry on the duck bus, full send into the dub delay — the delay does the rest.
struct ChordIIVoice: Voice {
    let startSongTime: Double
    let freqs: [Double]
    let vel: Double
    var bus: MixBus { .duck }
    var delaySend: Double { 1.0 }

    private var phases: [Double]
    private var detunes: [Double]
    private var env: Double
    private var envFactor = 0.0
    private var bp = Biquad()
    private var started = false
    private let duration = 0.36

    init(at t: Double, freqs: [Double], vel: Double, seed: UInt64) {
        startSongTime = t
        self.freqs = freqs
        self.vel = vel
        env = 0.055 * vel
        var rng = SplitMix64(seed: seed)
        phases = freqs.map { _ in 0.5 }   // WebAudio saw start (value 0)
        detunes = freqs.map { _ in Double.random(in: -4...4, using: &rng) }
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: env, seconds: 0.34, sr: sr)
            bp = .bandpass(sr: sr, freq: 750, q: 1.1)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var mix = 0.0
            for v in 0..<freqs.count {
                let f = freqs[v] * pow(2, detunes[v] / 1200)
                let dp = f * dt
                phases[v] += dp
                if phases[v] >= 1 { phases[v] -= 1 }
                mix += blSaw(phases[v], dp)
            }
            out[i] += Float(bp.process(mix) * env)
            env *= envFactor
        }
        return t < duration
    }
}

/// The drone: F1 saw + F2 triangle (half level) → LP with an 8-bar breath
/// (90→170→90) and section-level gain automation. One voice, whole track,
/// living on the duck bus. Breakpoints are (song seconds, value), linear.
struct DroneIIVoice: Voice {
    let startSongTime: Double
    let dur: Double
    let gainArc: [(Double, Double)]
    let filterArc: [(Double, Double)]
    var bus: MixBus { .duck }

    // WebAudio oscillator start phases: saw begins at value 0 (ramp phase
    // 0.5), triangle at 0 rising (phase 0.25). Peak summation depends on it.
    private var phase1 = 0.5
    private var phase2 = 0.25
    private var lp = Biquad()
    private var started = false
    private var sinceRetune = 0

    init(dur: Double, gainArc: [(Double, Double)], filterArc: [(Double, Double)]) {
        startSongTime = 0
        self.dur = dur
        self.gainArc = gainArc
        self.filterArc = filterArc
    }

    private func value(_ arc: [(Double, Double)], at t: Double) -> Double {
        guard let first = arc.first else { return 0 }
        if t <= first.0 { return first.1 }
        for k in 1..<arc.count where t <= arc[k].0 {
            let (t0, v0) = arc[k - 1]
            let (t1, v1) = arc[k]
            let span = t1 - t0
            if span <= 0 { return v1 }
            return v0 + (v1 - v0) * (t - t0) / span
        }
        return arc[arc.count - 1].1
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            lp = .lowpass(sr: sr, freq: value(filterArc, at: max(0, bufferStart)))
            started = true
        }
        let f1 = 43.65, f2 = 87.31
        let dp1 = f1 * dt
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < dur else { continue }
            sinceRetune += 1
            if sinceRetune >= 64 {
                sinceRetune = 0
                lp.retune(.lowpass(sr: sr, freq: value(filterArc, at: t)))
            }
            phase1 += dp1
            if phase1 >= 1 { phase1 -= 1 }
            phase2 += f2 * dt
            if phase2 >= 1 { phase2 -= 1 }
            let tri = phase2 < 0.5 ? (4 * phase2 - 1) : (3 - 4 * phase2)
            let mix = blSaw(phase1, dp1) + tri * 0.5
            out[i] += Float(lp.process(mix) * value(gainArc, at: t))
        }
        return t < dur
    }
}

/// Lane voices. sub: F sine 174.6→87.3 · click: square 880 → BP 1800 Q6 ·
/// tick: squares 2093+2960 → HP 2500, half-send into the dub delay.
struct MinimalIITapVoice: Voice {
    let startSongTime: Double
    let lane: Int
    let vol: Double
    var delaySend: Double { lane == 2 ? 0.5 : 0 }

    private var phase = 0.0
    private var phase2 = 0.0
    private var env: Double
    private var envFactor = 0.0
    private var filter = Biquad()
    private var started = false
    private let duration: Double
    private let decay: Double

    init(at t: Double, lane: Int, vol: Double) {
        startSongTime = t
        self.lane = lane
        self.vol = vol
        switch lane {
        case 0: decay = 0.14; duration = 0.16; env = vol
        case 1: decay = 0.05; duration = 0.06; env = vol * 0.9
        default: decay = 0.08; duration = 0.09; env = vol * 0.5
        }
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: env, seconds: decay, sr: sr)
            switch lane {
            case 1: filter = .bandpass(sr: sr, freq: 1800, q: 6)
            case 2: filter = .highpass(sr: sr, freq: 2500)
            default: break
            }
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var sample = 0.0
            switch lane {
            case 0:
                let f = expSweep(f0: 174.6, f1: 87.3, t: t, sweep: 0.06)
                phase += f * dt
                sample = sin(phase * 2 * .pi) * env
            case 1:
                let dp = 880.0 * dt
                phase += dp
                if phase >= 1 { phase -= 1 }
                sample = filter.process(blSquare(phase, dp) * min(1.0, t * 880 * 2)) * env
            default:
                let dp1 = 2093.0 * dt, dp2 = 2960.0 * dt
                phase += dp1
                if phase >= 1 { phase -= 1 }
                phase2 += dp2
                if phase2 >= 1 { phase2 -= 1 }
                let onset = min(1.0, t * 2093 * 2)
                sample = filter.process((blSquare(phase, dp1) + blSquare(phase2, dp2)) * onset) * env
            }
            env *= envFactor
            out[i] += Float(sample)
        }
        return t < duration
    }
}
