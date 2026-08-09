import Foundation

// MARK: - Biquad filter (RBJ cookbook), transposed direct form II

struct Biquad {
    var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    var z1 = 0.0, z2 = 0.0

    mutating func process(_ x: Double) -> Double {
        let y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }

    /// Re-tune coefficients in place, preserving filter state (for sweeps).
    mutating func retune(_ fresh: Biquad) {
        b0 = fresh.b0; b1 = fresh.b1; b2 = fresh.b2; a1 = fresh.a1; a2 = fresh.a2
    }

    // Lowpass/highpass use Chromium's (Blink's) exact filter design — the
    // WebAudio spec interprets Q for these types as resonance in dB, and the
    // coefficient math differs from RBJ. Every ported voice depends on this
    // shape; the RBJ version made everything measurably brighter/louder near
    // cutoff. `q` is in dB here (WebAudio default: 1).

    static func lowpass(sr: Double, freq: Double, q resonanceDb: Double = 1) -> Biquad {
        let cutoff = min(max(freq / (sr / 2), 0.0001), 0.9999)
        // Chromium clamps resonance to >= 0 dB; below that the design's
        // sqrt goes negative and the filter emits NaN.
        let g = pow(10.0, 0.05 * max(0, resonanceDb))
        let d = sqrt((4 - sqrt(16 - 16 / (g * g))) / 2)
        let theta = Double.pi * cutoff
        let sn = 0.5 * d * sin(theta)
        let beta = 0.5 * (1 - sn) / (1 + sn)
        let gamma = (0.5 + beta) * cos(theta)
        let alpha = 0.25 * (0.5 + beta - gamma)
        return Biquad(b0: 2 * alpha, b1: 4 * alpha, b2: 2 * alpha,
                      a1: 2 * (-gamma), a2: 2 * beta, z1: 0, z2: 0)
    }

    static func highpass(sr: Double, freq: Double, q resonanceDb: Double = 1) -> Biquad {
        let cutoff = min(max(freq / (sr / 2), 0.0001), 0.9999)
        let g = pow(10.0, 0.05 * max(0, resonanceDb))
        let d = sqrt((4 - sqrt(16 - 16 / (g * g))) / 2)
        let theta = Double.pi * cutoff
        let sn = 0.5 * d * sin(theta)
        let beta = 0.5 * (1 - sn) / (1 + sn)
        let gamma = (0.5 + beta) * cos(theta)
        let alpha = 0.25 * (0.5 + beta + gamma)
        return Biquad(b0: 2 * alpha, b1: -4 * alpha, b2: 2 * alpha,
                      a1: 2 * (-gamma), a2: 2 * beta, z1: 0, z2: 0)
    }

    static func bandpass(sr: Double, freq: Double, q: Double) -> Biquad {
        let f = min(max(freq, 10), sr * 0.45)
        let w = 2 * Double.pi * f / sr
        let alpha = sin(w) / (2 * q), cw = cos(w)
        let a0 = 1 + alpha
        return Biquad(
            b0: alpha / a0, b1: 0, b2: -alpha / a0,
            a1: (-2 * cw) / a0, a2: (1 - alpha) / a0, z1: 0, z2: 0)
    }
}

// MARK: - Noise (xorshift64*, per-voice deterministic)

struct NoiseGen {
    var state: UInt64
    init(seed: UInt64 = 0x9E3779B97F4A7C15) { state = seed == 0 ? 1 : seed }
    mutating func next() -> Double {
        state ^= state >> 12
        state ^= state << 25
        state ^= state >> 27
        let v = state &* 0x2545F4914F6CDD1D
        return Double(Int64(bitPattern: v)) / Double(Int64.max)
    }
}

// MARK: - Envelope helpers

/// Per-sample multiplier replicating WebAudio's exponentialRampToValueAtTime
/// from `start` down to `floor` over `seconds`.
func expDecayPerSample(start: Double, floor: Double = 0.001, seconds: Double, sr: Double) -> Double {
    guard start > 0, seconds > 0 else { return 0 }
    return pow(floor / start, 1.0 / (seconds * sr))
}

/// Exponential frequency sweep value, WebAudio-style: f0 → f1 over `sweep`.
func expSweep(f0: Double, f1: Double, t: Double, sweep: Double) -> Double {
    guard t < sweep else { return f1 }
    guard t > 0 else { return f0 }
    return f0 * pow(f1 / f0, t / sweep)
}

// MARK: - Band-limited oscillators (polyBLEP)
// WebAudio's oscillators are band-limited; naive saws/squares alias audibly,
// especially the high metallic squares. These match the web sound.

@inline(__always) func polyBlep(_ t: Double, _ dt: Double) -> Double {
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

/// Band-limited saw. `phase` in [0,1), `dt` = freq/sampleRate.
@inline(__always) func blSaw(_ phase: Double, _ dt: Double) -> Double {
    2 * phase - 1 - polyBlep(phase, dt)
}

/// Band-limited square. `phase` in [0,1), `dt` = freq/sampleRate.
@inline(__always) func blSquare(_ phase: Double, _ dt: Double) -> Double {
    var v: Double = phase < 0.5 ? 1 : -1
    v += polyBlep(phase, dt)
    var t2 = phase + 0.5
    if t2 >= 1 { t2 -= 1 }
    v -= polyBlep(t2, dt)
    return v
}

// MARK: - Compressor (WebAudio DynamicsCompressor-style)
// Soft knee (30 dB), 3ms attack / 250ms release, and the implicit makeup gain
// Chromium applies. This replaces the old tanh master — the glue the web
// prototypes always had.

struct Compressor {
    let thresholdDb: Double
    let ratio: Double
    let kneeDb: Double

    // Static in→out curves MEASURED from Chromium's DynamicsCompressor for
    // the three configs the sets use (steady-state, 440 Hz, offline render).
    // Chromium's actual knee is far softer than the spec quadratic and its
    // makeup differs; matching the measurement beats deriving from the spec.
    private static let measuredCurves: [String: [(Double, Double)]] = [
        "-16/5": [(-40, -39.07), (-16, -15.07), (-12, -11.14), (-8, -7.38), (-4, -3.82), (0, -0.56)],
        "-24/12": [(-40, -36.34), (-24, -20.34), (-16, -12.78), (-8, -6.45), (-4, -4.03), (0, -2.30)],
        "-18/6": [(-40, -38.65), (-24, -22.65), (-18, -16.65), (-10, -8.98), (-4, -3.82), (-2, -2.27), (0, -0.83)],
    ]

    private var curve: [(Double, Double)]
    private var gainDb = 0.0            // smoothed gain state, dB
    private var env = 0.0               // fast |x| follower
    private var envSlow = 0.0           // slower follower gating fast recovery
    private var atkCoef = 0.0
    private var slowCoef = 0.0
    private var relCoef = 0.0
    private var downCoef = 0.0
    private var upFastCoef = 0.0
    private var upSlowCoef = 0.0
    private var idleCoef = 0.0
    private var delayL: [Float] = []
    private var delayR: [Float] = []
    private var delayIdx = 0

    init(thresholdDb: Double, ratio: Double, kneeDb: Double = 30) {
        self.thresholdDb = thresholdDb
        self.ratio = ratio
        self.kneeDb = kneeDb
        let key = "\(Int(thresholdDb))/\(Int(ratio))"
        curve = Compressor.measuredCurves[key] ?? Compressor.measuredCurves["-16/5"]!
    }

    /// Static output level for an input level (dB), interpolating the
    /// measured Chromium curve; linear extension on both ends.
    private func staticOutDb(_ x: Double) -> Double {
        guard let first = curve.first, let last = curve.last else { return x }
        if x <= first.0 { return x + (first.1 - first.0) }        // slope 1 + makeup
        if x >= last.0 { return last.1 + (x - last.0) / ratio }   // ratio slope
        for k in 1..<curve.count where x <= curve[k].0 {
            let (x0, y0) = curve[k - 1]
            let (x1, y1) = curve[k]
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        }
        return x
    }

    mutating func prepare(sr: Double) {
        atkCoef = exp(-1 / (0.0015 * sr))    // detector rise
        slowCoef = exp(-1 / (0.004 * sr))    // gate follower rise
        relCoef = exp(-1 / (0.25 * sr))      // detector fall
        downCoef = exp(-1 / (0.001 * sr))    // gain reduction: fast
        upFastCoef = exp(-1 / (0.002 * sr))  // gain recovery, near full scale
        upSlowCoef = exp(-1 / (0.05 * sr))   // gain recovery, everything else
        idleCoef = exp(-1 / (0.03 * sr))     // ease toward idle in silence
        env = 0
        envSlow = 0
        gainDb = -5                          // Chromium idles low from silence
        let lookahead = max(1, Int(0.006 * sr))
        delayL = [Float](repeating: 0, count: lookahead)
        delayR = [Float](repeating: 0, count: lookahead)
        delayIdx = 0
    }

    /// Process one stereo sample in place (linked detector, delayed signal).
    mutating func process(_ l: inout Float, _ r: inout Float) {
        let peak = Double(max(abs(l), abs(r)))
        let coef = peak > env ? atkCoef : relCoef
        env = peak + (env - peak) * coef
        let sCoef = peak > envSlow ? slowCoef : relCoef
        envSlow = peak + (envSlow - peak) * sCoef

        if env < 1e-3 {   // silence: ease down to the idle floor (−5 dB)
            gainDb = -5 + (gainDb + 5) * idleCoef
        } else {
            let inDb = 20 * log10(env)
            let target = staticOutDb(inDb) - inDb
            if target < gainDb {
                gainDb = target + (gainDb - target) * downCoef
            } else {
                // Exponential recovery, τ≈50ms (matches Chromium's measured
                // release trajectory); only SUSTAINED near-full-scale signal
                // snaps fast — a single low-frequency crest must stay caught.
                let slowDb = envSlow > 1e-6 ? 20 * log10(envSlow) : -120
                let x = min(1, max(0, (slowDb + 6) / 6))
                let coefUp = upSlowCoef + (upFastCoef - upSlowCoef) * x
                gainDb = target + (gainDb - target) * coefUp
            }
        }

        let g = Float(pow(10, gainDb / 20))
        let outL = delayL[delayIdx] * g
        let outR = delayR[delayIdx] * g
        delayL[delayIdx] = l
        delayR[delayIdx] = r
        delayIdx = (delayIdx + 1) % delayL.count
        l = outL
        r = outR
    }
}
