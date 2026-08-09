import Foundation

/// Saw through a lowpass sweeping 900→200 Hz over the beat (origin patch).
struct BassVoice: Voice {
    let startSongTime: Double
    let freq: Double
    let spb: Double

    private var phase = 0.5   // WebAudio saw start (value 0)
    private var env = 0.28
    private var envFactor = 0.0
    private var lp = Biquad()
    private var started = false
    private var sinceRetune = 0
    private var duration: Double { spb }

    init(at t: Double, freq: Double, spb: Double) {
        startSongTime = t
        self.freq = freq
        self.spb = spb
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: 0.28, seconds: spb * 0.95, sr: sr)
            lp = .lowpass(sr: sr, freq: 900)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            // Filter sweep, retuned in small blocks (cheap, inaudible steps).
            sinceRetune += 1
            if sinceRetune >= 32 {
                sinceRetune = 0
                let cutoff = expSweep(f0: 900, f1: 200, t: t, sweep: spb * 0.9)
                lp.retune(.lowpass(sr: sr, freq: cutoff))
            }
            let dp = freq * dt
            phase += dp
            if phase >= 1 { phase -= 1 }
            out[i] += Float(lp.process(blSaw(phase, dp)) * env)
            env *= envFactor
        }
        return t < duration
    }
}
