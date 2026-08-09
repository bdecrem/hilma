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

    static func lowpass(sr: Double, freq: Double, q: Double = 0.7071) -> Biquad {
        let f = min(max(freq, 10), sr * 0.45)
        let w = 2 * Double.pi * f / sr
        let alpha = sin(w) / (2 * q), cw = cos(w)
        let a0 = 1 + alpha
        return Biquad(
            b0: ((1 - cw) / 2) / a0, b1: (1 - cw) / a0, b2: ((1 - cw) / 2) / a0,
            a1: (-2 * cw) / a0, a2: (1 - alpha) / a0, z1: 0, z2: 0)
    }

    static func highpass(sr: Double, freq: Double, q: Double = 0.7071) -> Biquad {
        let f = min(max(freq, 10), sr * 0.45)
        let w = 2 * Double.pi * f / sr
        let alpha = sin(w) / (2 * q), cw = cos(w)
        let a0 = 1 + alpha
        return Biquad(
            b0: ((1 + cw) / 2) / a0, b1: (-(1 + cw)) / a0, b2: ((1 + cw) / 2) / a0,
            a1: (-2 * cw) / a0, a2: (1 - alpha) / a0, z1: 0, z2: 0)
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
