import Foundation

/// A guitar amp on a band channel (a band's `amp`, by channel): the electric guitar's grit,
/// 2026-11-07. The samples are clean DI (Emilyguitar, `scripts/eguitar.py`); the channel's
/// whole signal goes through one amp, so a chord distorts as one signal, the way six strings
/// into one amp do (per-note distortion would sound clean on chords).
///
/// The chain, mono: a one-pole high-pass that tightens the low end into the clipper, a mid
/// push (the screamer hump), two tube-ish stages at 2x oversampling (an asymmetric tanh, then
/// a softer symmetric one), the cabinet (a high-pass at 90 Hz, a low bump, the presence peak at
/// 2.6 kHz, two low-passes from `tone`: a 12-inch speaker rolling off), the output level, and a short room: two early
/// reflections, one per side, so the amp sits in a room and not inside the head.
/// Render thread only; nothing allocates after init.
final class GuitarAmp {
    struct Settings: Decodable {
        /// Pre-gain into the first stage, dB (0 = clean-ish, 18 = crunch, 30 = filthy).
        var drive: Double = 18
        /// The first stage's asymmetry (even harmonics, the tube's), 0...0.5.
        var bias: Double = 0.2
        /// The input high-pass (Hz): how tight the low end is before the clip.
        var tight: Double = 140
        /// The mid push before the clip, dB at 800 Hz.
        var mid: Double = 6
        /// The cabinet's top (Hz): darker below 4k, fizzier above 7k.
        var tone: Double = 5500
        /// The speaker's presence peak, dB at 2.6 kHz: the bite.
        var presence: Double = 5
        /// Output level, dB, after the stages (they sit near full scale).
        var level: Double = -10
        /// The room's share, 0...1.
        var room: Double = 0.18

        init() {}

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            drive = try c.decodeIfPresent(Double.self, forKey: .drive) ?? drive
            bias = try c.decodeIfPresent(Double.self, forKey: .bias) ?? bias
            tight = try c.decodeIfPresent(Double.self, forKey: .tight) ?? tight
            mid = try c.decodeIfPresent(Double.self, forKey: .mid) ?? mid
            tone = try c.decodeIfPresent(Double.self, forKey: .tone) ?? tone
            presence = try c.decodeIfPresent(Double.self, forKey: .presence) ?? presence
            level = try c.decodeIfPresent(Double.self, forKey: .level) ?? level
            room = try c.decodeIfPresent(Double.self, forKey: .room) ?? room
        }

        private enum CodingKeys: String, CodingKey { case drive, bias, tight, mid, tone, presence, level, room }
    }

    /// RBJ biquad, transposed direct form II.
    struct Biquad {
        var b0: Float = 1, b1: Float = 0, b2: Float = 0, a1: Float = 0, a2: Float = 0
        var z1: Float = 0, z2: Float = 0

        static func lowpass(_ f: Double, q: Double, sr: Double) -> Biquad {
            let w = 2 * Double.pi * f / sr, cw = cos(w), alpha = sin(w) / (2 * q), a0 = 1 + alpha
            return Biquad(b0: Float((1 - cw) / 2 / a0), b1: Float((1 - cw) / a0), b2: Float((1 - cw) / 2 / a0),
                          a1: Float(-2 * cw / a0), a2: Float((1 - alpha) / a0))
        }

        static func highpass(_ f: Double, q: Double, sr: Double) -> Biquad {
            let w = 2 * Double.pi * f / sr, cw = cos(w), alpha = sin(w) / (2 * q), a0 = 1 + alpha
            return Biquad(b0: Float((1 + cw) / 2 / a0), b1: Float(-(1 + cw) / a0), b2: Float((1 + cw) / 2 / a0),
                          a1: Float(-2 * cw / a0), a2: Float((1 - alpha) / a0))
        }

        static func peak(_ f: Double, q: Double, db: Double, sr: Double) -> Biquad {
            let a = pow(10, db / 40), w = 2 * Double.pi * f / sr, cw = cos(w), alpha = sin(w) / (2 * q)
            let a0 = 1 + alpha / a
            return Biquad(b0: Float((1 + alpha * a) / a0), b1: Float(-2 * cw / a0), b2: Float((1 - alpha * a) / a0),
                          a1: Float(-2 * cw / a0), a2: Float((1 - alpha / a) / a0))
        }

        @inline(__always) mutating func run(_ x: Float) -> Float {
            let y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }
    }

    private let sampleRate: Double
    private(set) var active = false
    private var drive: Float = 1, bias: Float = 0, biasOut: Float = 0, level: Float = 1, room: Float = 0
    private var tight = Biquad(), mid = Biquad()
    /// The anti-alias low-passes around the 2x stages (at the doubled rate).
    private var up = Biquad(), down = Biquad()
    private var cabLow = Biquad(), cabBump = Biquad(), cabBite = Biquad(), cabTop1 = Biquad(), cabTop2 = Biquad()
    private var last: Float = 0
    /// The room: a short delay line, two taps.
    private let roomLine: UnsafeMutablePointer<Float>
    private let roomSize = 4096
    private var roomPos = 0
    private var tapL = 0, tapR = 0
    private var roomTone = Biquad()

    init(sampleRate: Double) {
        self.sampleRate = sampleRate
        roomLine = .allocate(capacity: roomSize)
        roomLine.initialize(repeating: 0, count: roomSize)
    }

    deinit { roomLine.deallocate() }

    func configure(_ s: Settings?) {
        guard let s else {
            active = false
            return
        }
        let sr = sampleRate
        drive = Float(pow(10, s.drive / 20))
        bias = Float(max(0, min(0.5, s.bias)))
        biasOut = tanh(bias)
        level = Float(pow(10, s.level / 20))
        room = Float(max(0, min(1, s.room)))
        tight = .highpass(s.tight, q: 0.6, sr: sr)
        mid = .peak(800, q: 0.8, db: s.mid, sr: sr)
        up = .lowpass(sr * 0.45, q: 0.7, sr: sr * 2)
        down = .lowpass(sr * 0.45, q: 0.7, sr: sr * 2)
        cabLow = .highpass(90, q: 0.7, sr: sr)
        cabBump = .peak(120, q: 1.0, db: 2, sr: sr)
        cabBite = .peak(2600, q: 0.9, db: s.presence, sr: sr)
        cabTop1 = .lowpass(s.tone, q: 0.8, sr: sr)
        cabTop2 = .lowpass(s.tone * 1.5, q: 0.5, sr: sr)
        roomTone = .lowpass(3000, q: 0.7, sr: sr)
        tapL = min(roomSize - 1, Int(0.011 * sr))
        tapR = min(roomSize - 1, Int(0.017 * sr))
        active = true
    }

    @inline(__always) private func stages(_ x: Float) -> Float {
        let a = tanh(x * drive + bias) - biasOut
        return tanh(a * 1.8) * 0.75
    }

    /// The channel's bus in place: the sum of both sides through the amp, then the room.
    func process(_ l: UnsafeMutablePointer<Float>, _ r: UnsafeMutablePointer<Float>, n: Int) {
        guard active else { return }
        for i in 0..<n {
            var x = (l[i] + r[i]) * 0.5
            x = mid.run(tight.run(x))
            // 2x: the midpoint, then the sample, through the stages; keep the second.
            let m = up.run((last + x) * 0.5)
            let s = up.run(x)
            last = x
            _ = down.run(stages(m))
            var y = down.run(stages(s))
            y = cabTop2.run(cabTop1.run(cabBite.run(cabBump.run(cabLow.run(y))))) * level
            roomLine[roomPos] = roomTone.run(y)
            let rl = roomLine[(roomPos - tapL + roomSize) % roomSize]
            let rr = roomLine[(roomPos - tapR + roomSize) % roomSize]
            roomPos = (roomPos + 1) % roomSize
            l[i] = y + room * rl
            r[i] = y + room * rr
        }
    }
}
