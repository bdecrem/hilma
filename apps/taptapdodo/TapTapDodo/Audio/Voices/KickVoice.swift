import Foundation

/// Sine kick with exponential pitch sweep.
/// origin: 150→45 Hz, 0.22s. minimal: 135→38 Hz, 0.3s + lowpassed noise rumble
/// tail. gabber: the same sweep driven hard into a tanh waveshaper.
struct KickVoice: Voice {
    let startSongTime: Double
    let f0, f1, sweep, decay, amp: Double
    /// tanh drive for the gabber set; nil = clean.
    let drive: Double?
    /// minimal-set sub rumble tail (110 Hz lowpassed noise, 0.35s).
    let rumble: Bool

    private var phase = 0.0
    private var env: Double
    private var envFactor = 0.0
    private var noise: NoiseGen
    private var rumbleLP: Biquad
    private var started = false
    private let duration: Double

    init(at t: Double, f0: Double, f1: Double, sweep: Double, decay: Double,
         amp: Double, drive: Double? = nil, rumble: Bool = false, seed: UInt64 = 7) {
        startSongTime = t
        self.f0 = f0; self.f1 = f1; self.sweep = sweep; self.decay = decay
        self.amp = amp; self.drive = drive; self.rumble = rumble
        env = amp
        noise = NoiseGen(seed: seed)
        rumbleLP = Biquad()
        duration = max(decay + 0.05, rumble ? 0.02 + 0.35 : 0)
    }

    static func origin(at t: Double) -> KickVoice {
        KickVoice(at: t, f0: 150, f1: 45, sweep: 0.11, decay: 0.22, amp: 0.9)
    }
    static func minimal(at t: Double, accent: Bool, seed: UInt64 = 7) -> KickVoice {
        KickVoice(at: t, f0: 135, f1: 38, sweep: 0.14, decay: 0.3, amp: accent ? 1.0 : 0.9, rumble: true, seed: seed)
    }
    static func detroit(at t: Double) -> KickVoice {
        KickVoice(at: t, f0: 140, f1: 42, sweep: 0.12, decay: 0.26, amp: 0.85)
    }
    static func gabber(at t: Double, accent: Bool) -> KickVoice {
        KickVoice(at: t, f0: 160, f1: 40, sweep: 0.09, decay: 0.28, amp: accent ? 1.0 : 0.92, drive: 10)
    }

    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool {
        let dt = 1.0 / sr
        var t = bufferStart - startSongTime
        if t + Double(frames) * dt < 0 { return true }
        if !started {
            envFactor = expDecayPerSample(start: amp, seconds: decay, sr: sr)
            rumbleLP = .lowpass(sr: sr, freq: 110)
            started = true
        }
        for i in 0..<frames {
            defer { t += dt }
            guard t >= 0, t < duration else { continue }
            var sample = 0.0
            if t < decay + 0.05 {
                let f = expSweep(f0: f0, f1: f1, t: t, sweep: sweep)
                phase += f * dt
                var body = sin(phase * 2 * .pi) * env
                if let drive { body = tanh(body * drive) * 0.85 }
                sample += body
                env *= envFactor
            }
            if rumble {
                let tr = t - 0.02
                if tr >= 0, tr < 0.35 {
                    let shape = pow(1 - tr / 0.35, 3)
                    sample += rumbleLP.process(noise.next() * shape) * 0.5
                }
            }
            out[i] += Float(sample)
        }
        return t < duration
    }
}
