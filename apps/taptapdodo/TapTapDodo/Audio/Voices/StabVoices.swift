import Foundation

/// minimal-set lane percussion (fires on hit; a quiet ghost on drift):
/// lane 0 sub blip · lane 1 rimshot · lane 2 metallic tick.
struct StabVoice: Voice {
    enum Kind { case sub, rim, tick }

    let startSongTime: Double
    let kind: Kind
    let vol: Double

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
        self.vol = vol
        switch lane {
        case 0: kind = .sub; decay = 0.12; duration = 0.14; env = vol
        case 1: kind = .rim; decay = 0.05; duration = 0.06; env = vol * 0.9
        default: kind = .tick; decay = 0.08; duration = 0.09; env = vol * 0.5
        }
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: env, seconds: decay, sr: sr)
            switch kind {
            case .sub: break
            case .rim: filter = .bandpass(sr: sr, freq: 1800, q: 6)
            case .tick: filter = .highpass(sr: sr, freq: 2500)
            }
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var sample = 0.0
            switch kind {
            case .sub:
                let f = expSweep(f0: 220, f1: 110, t: t, sweep: 0.07)
                phase += f * dt
                sample = sin(phase * 2 * .pi) * env
            case .rim:
                let dp = 880 * dt
                phase += dp
                if phase >= 1 { phase -= 1 }
                sample = filter.process(blSquare(phase, dp)) * env
            case .tick:
                let dp1 = 2093 * dt, dp2 = 2960 * dt
                phase += dp1
                if phase >= 1 { phase -= 1 }
                phase2 += dp2
                if phase2 >= 1 { phase2 -= 1 }
                sample = filter.process(blSquare(phase, dp1) + blSquare(phase2, dp2)) * env
            }
            env *= envFactor
            out[i] += Float(sample)
        }
        return t < duration
    }
}

/// detroit chord stab — a short minor-9th bite (saws through a lowpass).
struct ChordStabVoice: Voice {
    let startSongTime: Double
    let freqs: [Double]
    let vol: Double

    private var phases: [Double]
    private var env: Double
    private var envFactor = 0.0
    private var lp = Biquad()
    private var started = false
    private let decay = 0.18

    init(at t: Double, freqs: [Double], vol: Double = 0.12) {
        startSongTime = t
        self.freqs = freqs
        self.vol = vol
        env = vol
        phases = Array(repeating: 0.5, count: freqs.count)   // WebAudio saw start
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: vol, seconds: decay, sr: sr)
            lp = .lowpass(sr: sr, freq: 2000)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < decay + 0.02 else { continue }
            var mix = 0.0
            for v in 0..<freqs.count {
                let dp = freqs[v] * dt
                phases[v] += dp
                if phases[v] >= 1 { phases[v] -= 1 }
                mix += blSaw(phases[v], dp)
            }
            out[i] += Float(lp.process(mix / Double(freqs.count)) * env)
            env *= envFactor
        }
        return t < decay + 0.02
    }
}

/// gabber lane stab — a distorted square bark.
struct GabberStabVoice: Voice {
    let startSongTime: Double
    let lane: Int
    let vol: Double

    private var phase = 0.0
    private var env: Double
    private var envFactor = 0.0
    private var hp = Biquad()
    private var started = false
    private let decay = 0.1

    init(at t: Double, lane: Int, vol: Double) {
        startSongTime = t
        self.lane = lane
        self.vol = vol
        env = vol
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: vol, seconds: decay, sr: sr)
            hp = .highpass(sr: sr, freq: 500)
            started = true
        }
        let freq = [220.0, 330.0, 495.0][lane]
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < decay + 0.02 else { continue }
            let dp = freq * dt
            phase += dp
            if phase >= 1 { phase -= 1 }
            out[i] += Float(hp.process(tanh(blSquare(phase, dp) * 4)) * env)
            env *= envFactor
        }
        return t < decay + 0.02
    }
}
