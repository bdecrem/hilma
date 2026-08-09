import Foundation

/// Three stacked noise bursts, 11ms apart, through a bandpass (1.3 kHz).
struct ClapVoice: Voice {
    let startSongTime: Double
    private let burstLen = 0.08
    private let spread = 0.011
    private let gain: Double
    private var noise0: NoiseGen
    private var noise1: NoiseGen
    private var noise2: NoiseGen
    private var bp = Biquad()
    private var started = false
    private var duration: Double { spread * 2 + burstLen }

    init(at t: Double, gain: Double = 0.14, seed: UInt64) {
        startSongTime = t
        self.gain = gain
        noise0 = NoiseGen(seed: seed)
        noise1 = NoiseGen(seed: seed &* 31 &+ 7)
        noise2 = NoiseGen(seed: seed &* 131 &+ 13)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            bp = .bandpass(sr: sr, freq: 1300, q: 1.4)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var mix = 0.0
            let t0 = t, t1 = t - spread, t2 = t - spread * 2
            if t0 >= 0, t0 < burstLen { mix += noise0.next() * pow(1 - t0 / burstLen, 1.6) }
            if t1 >= 0, t1 < burstLen { mix += noise1.next() * pow(1 - t1 / burstLen, 1.6) }
            if t2 >= 0, t2 < burstLen { mix += noise2.next() * pow(1 - t2 / burstLen, 1.6) }
            out[i] += Float(bp.process(mix) * gain)
        }
        return t < duration
    }
}
