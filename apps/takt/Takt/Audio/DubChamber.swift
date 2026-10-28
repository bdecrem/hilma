import Foundation

/// The dub send (a band's `dub`, misc/TRACKS_README.md "Fixing the dub techno sound"), built the
/// way a hardware chain is: the channels named in `sends` feed a ping-pong delay synced to the
/// tempo whose feedback runs through a highpass, a lowpass and a soft saturator, so every repeat
/// comes back thinner and darker, with the delay time wobbling slightly like tape; the delay's
/// output feeds a reverb whose input is highpassed, so the low end never reaches the tail. The
/// return ducks a little to the kick. Kick and sub are never sent: they stay mono and dry.
/// Render thread only; every buffer is allocated up front.
final class DubChamber {
    struct Settings {
        /// Delay time in beats (0.75 = a dotted eighth), feedback 0...0.95.
        var beats: Double
        var feedback: Float
        /// The feedback path's filters (Hz) and saturation (1 = gentle).
        var highpass: Double
        var lowpass: Double
        var drive: Float
        /// Delay-time wobble: depth as a fraction (0.003 = ±0.3%) and rate in Hz.
        var wobble: Double
        var wobbleRate: Double
        /// Return levels: the echoes, the reverb (fed by the echoes).
        var echo: Float
        var reverb: Float
        /// Reverb decay (seconds to −60 dB) and its input highpass (Hz).
        var decay: Double
        var reverbHighpass: Double
        /// How far the return dips on a kick (0...1), with the band's duck envelope.
        var duck: Float
    }

    private struct Biquad {
        var b0: Float = 1, b1: Float = 0, b2: Float = 0, a1: Float = 0, a2: Float = 0
        var z1: Float = 0, z2: Float = 0

        static func lowpass(_ hz: Double, q: Double = 0.707, sampleRate: Double) -> Biquad { make(hz, q, sampleRate, high: false) }
        static func highpass(_ hz: Double, q: Double = 0.707, sampleRate: Double) -> Biquad { make(hz, q, sampleRate, high: true) }

        private static func make(_ hz: Double, _ q: Double, _ sr: Double, high: Bool) -> Biquad {
            let w = 2 * Double.pi * min(hz, sr * 0.45) / sr
            let alpha = sin(w) / (2 * q), c = cos(w)
            let a0 = 1 + alpha
            var f = Biquad()
            if high {
                f.b0 = Float((1 + c) / 2 / a0); f.b1 = Float(-(1 + c) / a0); f.b2 = f.b0
            } else {
                f.b0 = Float((1 - c) / 2 / a0); f.b1 = Float((1 - c) / a0); f.b2 = f.b0
            }
            f.a1 = Float(-2 * c / a0); f.a2 = Float((1 - alpha) / a0)
            return f
        }

        @inline(__always) mutating func run(_ x: Float) -> Float {
            let y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }
    }

    let sampleRate: Double
    private(set) var settings: Settings?

    // The delay: two lines (left, right), the read position glides toward its target.
    private let size: Int
    private let lineL: UnsafeMutablePointer<Float>
    private let lineR: UnsafeMutablePointer<Float>
    private var write = 0
    private var delay = 0.0
    private var phase = 0.0
    private var hpL = Biquad(), hpR = Biquad(), lpL = Biquad(), lpR = Biquad()

    // The reverb: eight feedback delay lines mixed by a Hadamard matrix, damped in the loop.
    private static let fdnMs: [Double] = [29.7, 37.1, 41.1, 43.7, 53.9, 61.7, 71.3, 79.3]
    private let fdn: [UnsafeMutablePointer<Float>]
    private let fdnLength: [Int]
    private var fdnPos = [Int](repeating: 0, count: 8)
    private var fdnGain = [Float](repeating: 0, count: 8)
    private var fdnDamp = [Float](repeating: 0, count: 8)
    private var damp: Float = 0.5
    private var reverbIn = Biquad()
    /// The lines' outputs and their mix, per sample (no allocation on the render thread).
    private let lines = UnsafeMutablePointer<Float>.allocate(capacity: 8)
    private let mixed = UnsafeMutablePointer<Float>.allocate(capacity: 8)

    init(sampleRate: Double) {
        self.sampleRate = sampleRate
        size = Int(sampleRate * 2.5)
        lineL = .allocate(capacity: size)
        lineR = .allocate(capacity: size)
        lineL.initialize(repeating: 0, count: size)
        lineR.initialize(repeating: 0, count: size)
        fdnLength = Self.fdnMs.map { Int($0 / 1000 * sampleRate) }
        fdn = fdnLength.map { n in
            let p = UnsafeMutablePointer<Float>.allocate(capacity: n)
            p.initialize(repeating: 0, count: n)
            return p
        }
    }

    /// New settings (a band swap): filters recomputed, the tails cleared when it switches on.
    func configure(_ s: Settings?) {
        defer { settings = s }
        guard let s else { return }
        if settings == nil {
            lineL.update(repeating: 0, count: size)
            lineR.update(repeating: 0, count: size)
            for (p, n) in zip(fdn, fdnLength) { p.update(repeating: 0, count: n) }
            delay = 0
        }
        hpL = .highpass(s.highpass, sampleRate: sampleRate); hpR = hpL
        lpL = .lowpass(s.lowpass, sampleRate: sampleRate); lpR = lpL
        reverbIn = .highpass(s.reverbHighpass, sampleRate: sampleRate)
        for i in 0..<8 {
            fdnGain[i] = Float(pow(10, -3 * Double(fdnLength[i]) / (s.decay * sampleRate)))
        }
        // The tail darkens: a one-pole lowpass around 4.5 kHz in every line.
        damp = Float(exp(-2 * Double.pi * 4500 / sampleRate))
    }

    /// Mixes the chamber's return for `n` frames into `outL`/`outR`: `sendL`/`sendR` are what
    /// the channels sent, `kick` the band's duck envelope (0...1), `samplesPerBeat` the tempo.
    func process(sendL: UnsafePointer<Float>, sendR: UnsafePointer<Float>, kick: UnsafePointer<Float>, n: Int,
                 samplesPerBeat: Double, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        guard let s = settings else { return }
        let target = min(Double(size - 4), s.beats * samplesPerBeat)
        if delay == 0 { delay = target }
        let glide = 1 - exp(-1 / (0.05 * sampleRate))
        let dphase = 2 * Double.pi * s.wobbleRate / sampleRate
        let drive = max(0.1, s.drive)
        let norm: Float = 1 / Float(8).squareRoot()
        for i in 0..<n {
            delay += (target - delay) * glide
            phase += dphase
            if phase > 2 * Double.pi { phase -= 2 * Double.pi }
            let d = delay * (1 + s.wobble * sin(phase))
            // Fractional read d samples back.
            var r = Double(write) - d
            if r < 0 { r += Double(size) }
            let i0 = Int(r), frac = Float(r - Double(i0)), i1 = (i0 + 1) % size
            let yL = lineL[i0] + (lineL[i1] - lineL[i0]) * frac
            let yR = lineR[i0] + (lineR[i1] - lineR[i0]) * frac
            // Ping-pong: the input enters left, each side's repeat comes back on the other,
            // thinner (highpass), darker (lowpass) and a little saturated.
            let fromR = tanh(drive * lpL.run(hpL.run(yR))) / drive
            let fromL = tanh(drive * lpR.run(hpR.run(yL))) / drive
            let input = (sendL[i] + sendR[i]) * 0.5
            lineL[write] = input + s.feedback * fromR
            lineR[write] = s.feedback * fromL
            write += 1
            if write == size { write = 0 }

            // The reverb hears the echoes, highpassed.
            let rin = reverbIn.run((yL + yR) * 0.5) * 0.35
            for k in 0..<8 { lines[k] = fdn[k][fdnPos[k]]; mixed[k] = lines[k] }
            // Hadamard 8: three butterfly stages.
            let h = mixed
            var span = 1
            while span < 8 {
                var j = 0
                while j < 8 {
                    for m in j..<(j + span) {
                        let a = h[m], b = h[m + span]
                        h[m] = a + b
                        h[m + span] = a - b
                    }
                    j += 2 * span
                }
                span *= 2
            }
            for k in 0..<8 {
                let fb = h[k] * norm * fdnGain[k]
                fdnDamp[k] = fb + (fdnDamp[k] - fb) * damp
                fdn[k][fdnPos[k]] = fdnDamp[k] + (k % 2 == 0 ? rin : -rin)
                fdnPos[k] += 1
                if fdnPos[k] == fdnLength[k] { fdnPos[k] = 0 }
            }
            let revL = (lines[0] + lines[2] + lines[4] + lines[6]) * 0.5
            let revR = (lines[1] + lines[3] + lines[5] + lines[7]) * 0.5
            let g = 1 - s.duck * kick[i]
            outL[i] += (yL * s.echo + revL * s.reverb) * g
            outR[i] += (yR * s.echo + revR * s.reverb) * g
        }
    }
}
