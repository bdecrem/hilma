import Foundation

/// origin pad: detuned saws, lowpass 1.1 kHz, 4-beat swells every 2 bars.
struct PadVoice: Voice {
    let startSongTime: Double
    let freqs: [Double]
    let detunes: [Double]   // cents, seeded per swell
    let dur: Double

    private var phases: [Double]
    private var lp = Biquad()
    private var started = false

    init(at t: Double, freqs: [Double], dur: Double, seed: UInt64) {
        startSongTime = t
        self.freqs = freqs
        self.dur = dur
        var rng = SplitMix64(seed: seed)
        detunes = freqs.map { _ in Double.random(in: -5...5, using: &rng) }
        phases = Array(repeating: 0, count: freqs.count)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            lp = .lowpass(sr: sr, freq: 1100)
            started = true
        }
        let attack = dur * 0.3
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < dur else { continue }
            let env: Double = t < attack
                ? 0.05 * (t / attack)
                : 0.05 * (1 - (t - attack) / (dur - attack))
            var mix = 0.0
            for v in 0..<freqs.count {
                let f = freqs[v] * pow(2, detunes[v] / 1200)
                phases[v] += f * dt
                mix += 2.0 * (phases[v] - floor(phases[v])) - 1.0
            }
            out[i] += Float(lp.process(mix) * env)
        }
        return t < dur
    }
}

/// minimal drone: saw A1 through a lowpass sweeping 90→160→90 over the cycle.
struct DroneVoice: Voice {
    let startSongTime: Double
    let dur: Double

    private var phase = 0.0
    private var lp = Biquad()
    private var started = false
    private var sinceRetune = 0

    init(at t: Double, dur: Double) {
        startSongTime = t
        self.dur = dur
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            lp = .lowpass(sr: sr, freq: 90)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < dur else { continue }
            sinceRetune += 1
            if sinceRetune >= 64 {
                sinceRetune = 0
                let half = dur / 2
                let cutoff = t < half
                    ? 90 + (160 - 90) * (t / half)
                    : 160 - (160 - 90) * ((t - half) / half)
                lp.retune(.lowpass(sr: sr, freq: cutoff))
            }
            let env: Double
            if t < 0.5 { env = 0.11 * (t / 0.5) }
            else if t > dur - 0.5 { env = 0.11 * ((dur - t) / 0.5) }
            else { env = 0.11 }
            phase += 55.0 * dt
            let saw = 2.0 * (phase - floor(phase)) - 1.0
            out[i] += Float(lp.process(saw) * env)
        }
        return t < dur
    }
}

/// detroit strings: 3 detuned saws per chord tone, slow attack, chorus via
/// the detune spread. Minor 9ths held for bars.
struct StringsVoice: Voice {
    let startSongTime: Double
    let freqs: [Double]
    let dur: Double
    let gain: Double

    private var phases: [Double]
    private var detunes: [Double]
    private var lp = Biquad()
    private var started = false

    init(at t: Double, freqs: [Double], dur: Double, gain: Double = 0.045, seed: UInt64 = 11) {
        startSongTime = t
        self.freqs = freqs
        self.dur = dur
        self.gain = gain
        var rng = SplitMix64(seed: seed)
        var ph: [Double] = [], det: [Double] = []
        for _ in freqs {
            for spread in [-7.0, 0.0, 7.0] {
                ph.append(Double.random(in: 0..<1, using: &rng))
                det.append(spread + Double.random(in: -1...1, using: &rng))
            }
        }
        phases = ph
        detunes = det
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            lp = .lowpass(sr: sr, freq: 1400)
            started = true
        }
        let attack = dur * 0.25
        let release = dur * 0.3
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < dur else { continue }
            let env: Double
            if t < attack { env = gain * (t / attack) }
            else if t > dur - release { env = gain * ((dur - t) / release) }
            else { env = gain }
            var mix = 0.0
            for v in 0..<phases.count {
                let f = freqs[v / 3] * pow(2, detunes[v] / 1200)
                phases[v] += f * dt
                mix += 2.0 * (phases[v] - floor(phases[v])) - 1.0
            }
            out[i] += Float(lp.process(mix / 3) * env)
        }
        return t < dur
    }
}
