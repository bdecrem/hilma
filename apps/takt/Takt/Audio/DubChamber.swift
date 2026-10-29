import Foundation

/// The dub send (a band's `dub`), ported line for line from `dub_delay` and `dattorro` in
/// misc/dub_reference.py (misc/DUB_TECHNO_FIXES.md). The channels named in `sends` feed it:
/// the send is filtered first (so even the first echo is darker and thinner than the dry
/// stab), then a ping-pong delay synced to the tempo whose feedback runs through gentle
/// one-pole filters (6 dB/oct, like tape: a long trail, each repeat thinner and darker) and a
/// soft saturator, the time wobbling slightly; the echoes cross-feed a little so they bounce
/// without sitting hard in one ear. A Dattorro plate hears the dry send and the echoes, with
/// the low end cut from its input. The return ducks a little to the kick; tape hiss runs
/// under it while the band plays. Kick and sub are never sent: they stay mono and dry.
/// Render thread only; every buffer is allocated up front.
final class DubChamber {
    struct Settings {
        /// The reference's level against the engine's buses: the send is divided by it on the
        /// way in and the return multiplied on the way out, so the saturator in the loop works
        /// at the level it was tuned at.
        var level: Float
        /// Delay time in beats (0.75 = a dotted eighth), feedback 0...0.95.
        var beats: Double
        var feedback: Float
        /// The feedback path's one-pole filters (Hz) and saturation (1 = gentle).
        var highpass: Double
        var lowpass: Double
        var drive: Float
        /// Delay-time wobble: depth as a fraction (0.004 = ±0.4%) and rate in Hz.
        var wobble: Double
        var wobbleRate: Double
        /// The send's own one-pole filters before the delay (Hz), and the echoes' crossfeed.
        var sendHighpass: Double
        var sendLowpass: Double
        var cross: Float
        /// Return levels: the echoes, the plate.
        var echo: Float
        var reverb: Float
        /// The plate's input: the dry send and the echoes, each at this level.
        var reverbDry: Float
        var reverbEcho: Float
        /// The plate: decay (tank gain), damping, input bandwidth, predelay (s), input highpass (Hz).
        var decay: Float
        var damping: Float
        var bandwidth: Float
        var predelay: Double
        var reverbHighpass: Double
        /// How far the return dips on a kick (0...1), with the band's duck envelope.
        var duck: Float
        /// Tape hiss (noise highpassed at 3 kHz), at this level, while the band plays.
        var hiss: Float
    }

    /// A one-pole lowpass: y = a·y + (1 − a)·x, a = e^(−2π·fc/sr). The highpass is x − lowpass(x).
    private struct OnePole {
        var a: Float = 0
        var y: Float = 0

        init() {}
        init(_ hz: Double, sampleRate: Double) { a = Float(exp(-2 * Double.pi * hz / sampleRate)) }

        @inline(__always) mutating func low(_ x: Float) -> Float {
            y = a * y + (1 - a) * x
            return y
        }

        @inline(__always) mutating func high(_ x: Float) -> Float { x - low(x) }
    }

    /// The hiss's highpass (RBJ, TDF-II).
    private struct Biquad {
        var b0: Float = 1, b1: Float = 0, b2: Float = 0, a1: Float = 0, a2: Float = 0
        var z1: Float = 0, z2: Float = 0

        static func highpass(_ hz: Double, sampleRate sr: Double) -> Biquad {
            let w = 2 * Double.pi * hz / sr
            let alpha = sin(w) / (2 * 0.707), c = cos(w)
            let a0 = 1 + alpha
            var f = Biquad()
            f.b0 = Float((1 + c) / 2 / a0); f.b1 = Float(-(1 + c) / a0); f.b2 = f.b0
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

    /// A circular buffer: `w` is the next write, advanced after every write as in the reference.
    private struct Line {
        let p: UnsafeMutablePointer<Float>
        let n: Int
        var w = 0

        init(_ n: Int) {
            self.n = max(1, n)
            p = .allocate(capacity: self.n)
            p.initialize(repeating: 0, count: self.n)
        }

        func clear() { p.update(repeating: 0, count: n) }

        /// Writes `x` and moves on; the read after it is the oldest sample (a delay of `n`).
        @inline(__always) mutating func push(_ x: Float) {
            p[w] = x
            w += 1
            if w == n { w = 0 }
        }

        @inline(__always) var oldest: Float { p[w] }

        /// `ap_step`: an allpass of length `n` with gain `g`.
        @inline(__always) mutating func allpass(_ x: Float, _ g: Float) -> Float {
            let d = p[w]
            let y = -g * x + d
            p[w] = x + g * y
            w += 1
            if w == n { w = 0 }
            return y
        }

        /// `tap`: the sample `off` before the write position.
        @inline(__always) func tap(_ off: Int) -> Float {
            var i = w - off
            while i < 0 { i += n }
            return p[i]
        }

        /// The sample `d` (fractional) behind the write position, interpolated.
        @inline(__always) func read(_ d: Double) -> Float {
            var rp = Double(w) - d
            while rp < 0 { rp += Double(n) }
            let i0 = Int(rp), i1 = (i0 + 1) % n
            let f = Float(rp - Double(i0))
            return p[i0] * (1 - f) + p[i1] * f
        }
    }

    let sampleRate: Double
    private(set) var settings: Settings?

    // The delay.
    private var lineL: Line
    private var lineR: Line
    private var delay = 0.0
    private var phase = 0.0
    private var sendHP = OnePole(), sendLP = OnePole()
    private var hpL = OnePole(), lpL = OnePole(), hpR = OnePole(), lpR = OnePole()

    // The plate (Dattorro 1997), its lengths at 29761 Hz scaled to the sample rate.
    private let sc: Double
    private var pre: Line
    private var ap1: Line, ap2: Line, ap3: Line, ap4: Line
    private var mapL: Line, mapR: Line
    private let lenL: Double, lenR: Double, excursion: Double
    private var dL1: Line, dR1: Line, apL2: Line, apR2: Line, dL2: Line, dR2: Line
    private var bw: Float = 0, dampL: Float = 0, dampR: Float = 0
    private var endL: Float = 0, endR: Float = 0
    private var plateHP = OnePole()
    private var lfo = 0.0
    /// The output taps' offsets (no array on the render thread).
    private let taps = UnsafeMutablePointer<Int>.allocate(capacity: 14)

    // The hiss.
    private var hissL = Biquad(), hissR = Biquad()
    private var seedL: UInt32 = 0x9E37_79B9, seedR: UInt32 = 0x85EB_CA6B

    init(sampleRate: Double) {
        self.sampleRate = sampleRate
        lineL = Line(Int(sampleRate * 2.5))
        lineR = Line(Int(sampleRate * 2.5))
        let sc = sampleRate / 29761
        self.sc = sc
        func sl(_ x: Double) -> Int { max(1, Int(x * sc)) }
        pre = Line(Int(0.1 * sampleRate) + 1)
        ap1 = Line(sl(142)); ap2 = Line(sl(107)); ap3 = Line(sl(379)); ap4 = Line(sl(277))
        excursion = 16 * sc
        lenL = Double(sl(672)); lenR = Double(sl(908))
        mapL = Line(sl(672) + Int(excursion) + 4); mapR = Line(sl(908) + Int(excursion) + 4)
        dL1 = Line(sl(4453)); dR1 = Line(sl(4217))
        apL2 = Line(sl(1800)); apR2 = Line(sl(2656))
        dL2 = Line(sl(3720)); dR2 = Line(sl(3163))
        for (i, x) in [266.0, 2974, 1913, 1996, 1990, 187, 1066, 353, 3627, 1228, 2673, 2111, 335, 121].enumerated() {
            taps[i] = sl(x)
        }
    }

    /// New settings (a band swap): filters recomputed, the tails cleared when it switches on.
    func configure(_ s: Settings?) {
        defer { settings = s }
        guard let s else { return }
        if settings == nil {
            lineL.clear(); lineR.clear(); pre.clear()
            ap1.clear(); ap2.clear(); ap3.clear(); ap4.clear(); mapL.clear(); mapR.clear()
            dL1.clear(); dR1.clear(); apL2.clear(); apR2.clear(); dL2.clear(); dR2.clear()
            delay = 0
            bw = 0; dampL = 0; dampR = 0; endL = 0; endR = 0
        }
        sendHP = OnePole(s.sendHighpass, sampleRate: sampleRate)
        sendLP = OnePole(s.sendLowpass, sampleRate: sampleRate)
        hpL = OnePole(s.highpass, sampleRate: sampleRate); hpR = hpL
        lpL = OnePole(s.lowpass, sampleRate: sampleRate); lpR = lpL
        plateHP = OnePole(s.reverbHighpass, sampleRate: sampleRate)
        hissL = .highpass(3000, sampleRate: sampleRate); hissR = hissL
    }

    /// White noise, RMS 1 (uniform, scaled by √3).
    @inline(__always) private static func noise(_ seed: inout UInt32) -> Float {
        seed ^= seed << 13
        seed ^= seed >> 17
        seed ^= seed << 5
        return (Float(seed) / Float(UInt32.max) * 2 - 1) * 1.7320508
    }

    /// Mixes the chamber's return for `n` frames into `outL`/`outR`: `sendL`/`sendR` are what
    /// the channels sent, `kick` the band's duck envelope (0...1), `samplesPerBeat` the tempo,
    /// `playing` whether the hiss runs.
    func process(sendL: UnsafePointer<Float>, sendR: UnsafePointer<Float>, kick: UnsafePointer<Float>, n: Int,
                 samplesPerBeat: Double, playing: Bool, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
        guard let s = settings else { return }
        let target = min(Double(lineL.n - 4), s.beats * samplesPerBeat)
        if delay == 0 { delay = target }
        let glide = 1 - exp(-1 / (0.05 * sampleRate))
        let dphase = 2 * Double.pi * s.wobbleRate / sampleRate
        let dlfo = 2 * Double.pi * 0.9 / sampleRate
        let drive = max(0.1, s.drive)
        let inGain = 1 / s.level
        // `read(d)` after the write is d − 1 samples back.
        let preDelay = min(Double(pre.n - 1), s.predelay * sampleRate + 1)
        let damping = s.damping, decay = s.decay
        let t = taps
        for i in 0..<n {
            // The send, filtered: even the first echo is darker and thinner than the dry stab.
            let dry = (sendL[i] + sendR[i]) * 0.5 * inGain
            let x = sendLP.low(sendHP.high(dry))
            delay += (target - delay) * glide
            phase += dphase
            if phase > 2 * Double.pi { phase -= 2 * Double.pi }
            let d = delay * (1 + s.wobble * sin(phase))
            let yL = lineL.read(d), yR = lineR.read(d)
            // Ping-pong: each side's repeat comes back on the other, thinner, darker, saturated.
            let fromR = tanh(drive * lpL.low(hpL.high(yR))) / drive
            let fromL = tanh(drive * lpR.low(hpR.high(yL))) / drive
            lineL.push(x + s.feedback * fromR)
            lineR.push(s.feedback * fromL)
            let eL = yL + s.cross * yR, eR = yR + s.cross * yL

            // The plate hears the dry send and the echoes.
            var p = ((dry + dry) * s.reverbDry + (eL + eR) * s.reverbEcho) * 0.5
            p = plateHP.high(p)
            pre.push(p)
            p = pre.read(preDelay)
            bw += s.bandwidth * (p - bw)
            p = ap1.allpass(bw, 0.75)
            p = ap2.allpass(p, 0.75)
            p = ap3.allpass(p, 0.625)
            p = ap4.allpass(p, 0.625)
            lfo += dlfo
            if lfo > 2 * Double.pi { lfo -= 2 * Double.pi }
            let modL = excursion * sin(lfo), modR = excursion * cos(lfo)
            // The left tank.
            let vL = p + decay * endR
            var y = 0.7 * vL + mapL.read(lenL + modL)
            mapL.push(vL - 0.7 * y)
            dL1.push(y)
            dampL = dL1.oldest * (1 - damping) + dampL * damping
            var u = apL2.allpass(dampL * decay, 0.5)
            dL2.push(u)
            let endLNew = dL2.oldest
            // The right tank.
            let vR = p + decay * endL
            y = 0.7 * vR + mapR.read(lenR + modR)
            mapR.push(vR - 0.7 * y)
            dR1.push(y)
            dampR = dR1.oldest * (1 - damping) + dampR * damping
            u = apR2.allpass(dampR * decay, 0.5)
            dR2.push(u)
            endR = dR2.oldest
            endL = endLNew
            // The output taps.
            let oL = dR1.tap(t[0]) + dR1.tap(t[1]) - apR2.tap(t[2]) + dR2.tap(t[3]) - dL1.tap(t[4]) - apL2.tap(t[5]) - dL2.tap(t[6])
            let oR = dL1.tap(t[7]) + dL1.tap(t[8]) - apL2.tap(t[9]) + dL2.tap(t[10]) - dR1.tap(t[11]) - apR2.tap(t[12]) - dR2.tap(t[13])

            let g = (1 - s.duck * kick[i]) * s.level
            var hl: Float = 0, hr: Float = 0
            if playing {
                hl = hissL.run(Self.noise(&seedL)) * s.hiss
                hr = hissR.run(Self.noise(&seedR)) * s.hiss
            }
            outL[i] += (eL * s.echo + 0.6 * oL * s.reverb) * g + hl * s.level
            outR[i] += (eR * s.echo + 0.6 * oR * s.reverb) * g + hr * s.level
        }
    }
}
