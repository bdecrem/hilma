import Foundation

/// The origin lane voice — square through a lowpass with a triangle octave
/// shimmer. Fires at full volume when the player hits the note: the player
/// literally plays the lead line. (Detroit reuses it warmer and longer.)
struct PluckVoice: Voice {
    let startSongTime: Double
    let freq: Double
    let cutoff: Double
    let mainGain, mainDecay: Double
    let shimmerGain, shimmerDecay: Double

    private var phase = 0.0
    private var phase2 = 0.25   // WebAudio triangle start (value 0, rising)
    private var env: Double
    private var env2: Double
    private var envFactor = 0.0
    private var env2Factor = 0.0
    private var lp = Biquad()
    private var started = false
    private var duration: Double { max(mainDecay, shimmerDecay) + 0.02 }

    init(at t: Double, freq: Double, cutoff: Double = 2600,
         mainGain: Double = 0.16, mainDecay: Double = 0.3,
         shimmerGain: Double = 0.07, shimmerDecay: Double = 0.22) {
        startSongTime = t
        self.freq = freq
        self.cutoff = cutoff
        self.mainGain = mainGain; self.mainDecay = mainDecay
        self.shimmerGain = shimmerGain; self.shimmerDecay = shimmerDecay
        env = mainGain
        env2 = shimmerGain
    }

    static func origin(at t: Double, freq: Double) -> PluckVoice {
        PluckVoice(at: t, freq: freq)
    }
    /// Warmer, rounder key for the detroit set.
    static func detroit(at t: Double, freq: Double) -> PluckVoice {
        PluckVoice(at: t, freq: freq, cutoff: 1900, mainGain: 0.15, mainDecay: 0.35,
                   shimmerGain: 0.05, shimmerDecay: 0.28)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: mainGain, seconds: mainDecay, sr: sr)
            env2Factor = expDecayPerSample(start: shimmerGain, seconds: shimmerDecay, sr: sr)
            lp = .lowpass(sr: sr, freq: cutoff)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var sample = 0.0
            if t < mainDecay {
                let dp = freq * dt
                phase += dp
                if phase >= 1 { phase -= 1 }
                sample += lp.process(blSquare(phase, dp)) * env
                env *= envFactor
            }
            if t < shimmerDecay {
                phase2 += freq * 2 * dt
                let p = phase2 - floor(phase2)
                let tri = p < 0.5 ? (4 * p - 1) : (3 - 4 * p)
                sample += tri * env2
                env2 *= env2Factor
            }
            out[i] += Float(sample)
        }
        return t < duration
    }
}

/// The quiet sine ghost that keeps the melody intact when a note is missed.
struct GhostVoice: Voice {
    let startSongTime: Double
    let freq: Double
    private var phase = 0.0
    private var env = 0.04
    private var envFactor = 0.0
    private var started = false

    init(at t: Double, freq: Double) {
        startSongTime = t
        self.freq = freq
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: 0.04, seconds: 0.15, sr: sr)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < 0.16 else { continue }
            phase += freq * dt
            out[i] += Float(sin(phase * 2 * .pi) * env)
            env *= envFactor
        }
        return t < 0.16
    }
}
