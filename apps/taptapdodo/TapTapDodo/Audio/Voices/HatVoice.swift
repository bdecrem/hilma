import Foundation

/// White noise through a highpass. origin: 7 kHz, 50ms closed / 180ms open.
/// minimal: 8.5 kHz, 35ms closed / 140ms open.
struct HatVoice: Voice {
    let startSongTime: Double
    let length, gain, cutoff: Double

    private var noise: NoiseGen
    private var hp = Biquad()
    private var started = false

    init(at t: Double, open: Bool, cutoff: Double, closedLen: Double, openLen: Double,
         closedGain: Double, openGain: Double, seed: UInt64) {
        startSongTime = t
        length = open ? openLen : closedLen
        gain = open ? openGain : closedGain
        self.cutoff = cutoff
        noise = NoiseGen(seed: seed)
    }

    static func origin(at t: Double, open: Bool, seed: UInt64) -> HatVoice {
        HatVoice(at: t, open: open, cutoff: 7000, closedLen: 0.05, openLen: 0.18,
                 closedGain: 0.16, openGain: 0.22, seed: seed)
    }
    static func minimal(at t: Double, open: Bool, seed: UInt64) -> HatVoice {
        HatVoice(at: t, open: open, cutoff: 8500, closedLen: 0.035, openLen: 0.14,
                 closedGain: 0.12, openGain: 0.16, seed: seed)
    }
    /// afters: same 8.5k character as minimal, velocity-shaped per hit.
    static func afters(at t: Double, open: Bool, velocity: Double, seed: UInt64) -> HatVoice {
        HatVoice(at: t, open: open, cutoff: 8500, closedLen: 0.032, openLen: 0.12,
                 closedGain: 0.12 * velocity, openGain: 0.16 * velocity, seed: seed)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            hp = .highpass(sr: sr, freq: cutoff)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < length else { continue }
            let shape = pow(1 - t / length, 2)
            out[i] += Float(hp.process(noise.next() * shape) * gain)
        }
        return t < length
    }
}
