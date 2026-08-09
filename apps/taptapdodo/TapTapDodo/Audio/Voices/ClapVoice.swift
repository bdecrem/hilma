import Foundation

/// Three stacked noise bursts, 11ms apart, through a bandpass (1.3 kHz).
struct ClapVoice: Voice {
    let startSongTime: Double
    private let burstLen = 0.08
    private let spread = 0.011
    private let gain: Double
    private var noise: NoiseGen
    private var bp = Biquad()
    private var started = false
    private var duration: Double { spread * 2 + burstLen }

    init(at t: Double, gain: Double = 0.14, seed: UInt64) {
        startSongTime = t
        self.gain = gain
        noise = NoiseGen(seed: seed)
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
            var shape = 0.0
            for j in 0..<3 {
                let tb = t - Double(j) * spread
                if tb >= 0, tb < burstLen { shape += pow(1 - tb / burstLen, 1.6) }
            }
            out[i] += Float(bp.process(noise.next() * shape) * gain)
        }
        return t < duration
    }
}
