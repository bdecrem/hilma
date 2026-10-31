import Foundation

/// A tonewheel organ, synthesized live: the second instrument your keys can play
/// (Settings → Sound → Your instrument, the default since 0.1 (65)). It is built the way the
/// instrument is, stage by stage, so it reads as a Hammond through a Leslie and not as a preset:
///
/// - **Tonewheels.** Nine drawbars at the harmonic ratios of the real bars (16' 5⅓' 8' 4' 2⅔'
///   2' 1⅗' 1⅓' 1'), each a near-sine from a table, 3 dB a step, with the generator's fold-back
///   (a harmonic above the top wheel plays an octave down, one under the bottom wheel an octave
///   up). The registration is 88 8400 000, the blues and soul setting.
/// - **Percussion** on the third harmonic, normal volume and fast (τ 0.2 s), single-trigger as on the
///   instrument: a key struck while another is held gets none.
/// - **Key click**: a few milliseconds of noise at key-on and, quieter, at key-off (the busbar
///   contacts), the attack and release otherwise instant (2 / 6 ms).
/// - **Scanner vibrato / chorus (C3)**: the signal mixed with a copy whose delay a 6.87 Hz LFO
///   sweeps, the Hammond wobble.
/// - **The amp**: a soft tube curve.
/// - **The Leslie, chorale**: the sound split at 800 Hz; the horn (0.83 Hz) with its doppler,
///   its loudness swell and its sweep across the stereo field; the drum (0.67 Hz) swelling and
///   leaning with it, slower.
///
/// Velocity sets the level a little (the swell pedal following your hand; the instrument itself
/// has no touch). Voices are plain structs in a preallocated pool; the cabinet owns its delay
/// lines; nothing allocates on the render thread.
enum Organ {
    static let tableSize = 4096
    /// A sine over `tableSize` points, with a guard point for the interpolation.
    static let table: UnsafeMutablePointer<Float> = {
        let p = UnsafeMutablePointer<Float>.allocate(capacity: tableSize + 1)
        for i in 0...tableSize { p[i] = Float(sin(2 * Double.pi * Double(i) / Double(tableSize))) }
        return p
    }()

    static let ratios: [Float] = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8]
    static let drawbars: [Int] = [8, 8, 8, 4, 0, 0, 0, 0, 0]
    static func level(_ bar: Int) -> Float { bar == 0 ? 0 : powf(10, -Float(8 - bar) * 3 / 20) }
    static let percussionRatio: Float = 3
    static let percussionLevel: Float = 1.6
    static let percussionDecay = 0.2
    static let clickLevel: Float = 0.1
    static let topWheel: Float = 5924.6
    static let bottomWheel: Float = 32.7
    /// The organ's level against the piano's at the same velocity (set from offline renders:
    /// a held G3 at 0.8 reads about −27 dBFS RMS steady, where the piano's first second averages
    /// −26 and its second −33; over the Slow Burn band at −24.5 it sits on top without clipping).
    static let trim: Float = 0.085

    /// A wheel frequency for a harmonic of `f`, folded into the generator's range.
    static func wheel(_ f: Float) -> Float {
        var f = f
        while f > topWheel { f /= 2 }
        while f < bottomWheel { f *= 2 }
        return f
    }

    /// One key. Render thread only.
    struct Voice {
        var active = false
        var note = -1
        var live = false
        /// The key is down (not yet released), for the percussion's single trigger.
        var keyed = false
        var age = 0
        var startFrame: Int64 = 0
        private var phase = SIMD16<Float>(repeating: 0)
        private var inc = SIMD16<Float>(repeating: 0)
        private var amp = SIMD16<Float>(repeating: 0)
        private var partials = 0
        private var percPhase: Float = 0, percInc: Float = 0, percAmp: Float = 0, percCoef: Float = 1
        private var click: Float = 0, clickCoef: Float = 1
        private var noise: UInt32 = 0x9E3779B9
        private var env: Float = 0, attackStep: Float = 1, releaseCoef: Float = 1
        private var releasing = false
        private var held = Int.max
        private var gain: Float = 0

        /// `held` frames before the release (`.max` for a key held down); `percussion` only for a
        /// key struck with none held.
        mutating func start(note: Int, velocity: Float, held: Int, gain: Float, live: Bool, percussion: Bool,
                            age: Int, frame: Int64, sampleRate: Double) {
            let sr = Float(sampleRate)
            let f = 440 * powf(2, Float(note - 69) / 12)
            let scale = Float(Organ.tableSize) / sr
            partials = 0
            for (i, r) in Organ.ratios.enumerated() where Organ.drawbars[i] > 0 {
                inc[partials] = Organ.wheel(f * r) * scale
                amp[partials] = Organ.level(Organ.drawbars[i])
                // Every wheel starts at its own place in the cycle, as the spinning wheels do.
                phase[partials] = Float(Organ.tableSize) * Float((Double(note) * 0.618 * Double(i + 1)).truncatingRemainder(dividingBy: 1))
                partials += 1
            }
            percInc = Organ.wheel(f * Organ.percussionRatio) * scale
            percPhase = 0
            percAmp = percussion ? Organ.percussionLevel : 0
            percCoef = Float(exp(-1 / (Organ.percussionDecay * sampleRate)))
            click = Organ.clickLevel
            clickCoef = Float(exp(-1 / (0.0015 * sampleRate)))
            env = 0
            attackStep = 1 / (0.002 * sr)
            releaseCoef = Float(exp(-1 / (0.006 * sampleRate)))
            releasing = false
            self.held = held
            self.gain = gain * (0.7 + 0.3 * velocity)
            self.note = note
            self.live = live
            keyed = true
            self.age = age
            startFrame = frame
            active = true
        }

        mutating func stop() {
            guard keyed else { return }
            keyed = false
            releasing = true
            click = Organ.clickLevel * 0.6
        }

        /// Adds the key's mono signal into `out` between two frame offsets.
        mutating func render(_ out: UnsafeMutablePointer<Float>, from a: Int, to b: Int) {
            let table = Organ.table
            let size = Float(Organ.tableSize)
            for i in a..<b {
                if held == 0 { stop() }
                held -= 1
                if releasing {
                    env *= releaseCoef
                    if env < 0.0001 && click < 0.0001 { active = false; return }
                } else if env < 1 {
                    env = min(1, env + attackStep)
                }
                var s: Float = 0
                for k in 0..<partials {
                    let p = phase[k]
                    let ip = Int(p)
                    let fr = p - Float(ip)
                    s += (table[ip] + (table[ip + 1] - table[ip]) * fr) * amp[k]
                    var np = p + inc[k]
                    if np >= size { np -= size }
                    phase[k] = np
                }
                if percAmp > 0.0005 {
                    let ip = Int(percPhase)
                    s += table[ip] * percAmp
                    percAmp *= percCoef
                    percPhase += percInc
                    if percPhase >= size { percPhase -= size }
                }
                var v = s * env
                if click > 0.0001 {
                    noise = noise &* 1664525 &+ 1013904223
                    v += (Float(noise >> 8) / 8388608 - 1) * click
                    click *= clickCoef
                }
                out[i] += v * gain
            }
        }
    }

    /// The scanner vibrato, the amp and the Leslie, in that order. One per renderer.
    final class Cabinet {
        private let sr: Float
        private let vib: UnsafeMutablePointer<Float>
        private let vibLen: Int
        private var vibWrite = 0
        private var scan: Float = 0
        private let scanInc: Float
        private let vibCenter: Float, vibDepth: Float
        private let horn: UnsafeMutablePointer<Float>
        private let hornLen: Int
        private var hornWrite = 0
        private var hornPhase: Float = 0, drumPhase: Float = 1.3
        private let hornInc: Float, drumInc: Float
        private let hornCenter: Float, hornDepth: Float
        private var lp: Float = 0
        private let lpCoef: Float

        init(sampleRate: Double) {
            sr = Float(sampleRate)
            vibLen = Int(0.01 * sampleRate) + 8
            vib = .allocate(capacity: vibLen)
            vib.initialize(repeating: 0, count: vibLen)
            scanInc = 6.87 / sr
            vibCenter = 0.0012 * sr
            vibDepth = 0.0009 * sr
            hornLen = Int(0.01 * sampleRate) + 8
            horn = .allocate(capacity: hornLen)
            horn.initialize(repeating: 0, count: hornLen)
            hornInc = 2 * .pi * 0.83 / sr
            drumInc = 2 * .pi * 0.67 / sr
            hornCenter = 0.0006 * sr
            hornDepth = 0.00035 * sr
            lpCoef = 1 - expf(-2 * .pi * 800 / sr)
        }

        private func read(_ line: UnsafeMutablePointer<Float>, _ len: Int, _ write: Int, delay: Float) -> Float {
            let d = max(1, min(Float(len - 2), delay))
            var pos = Float(write) - d
            if pos < 0 { pos += Float(len) }
            let ip = Int(pos)
            let fr = pos - Float(ip)
            let i1 = ip + 1 == len ? 0 : ip + 1
            return line[ip] + (line[i1] - line[ip]) * fr
        }

        /// Reads the organ's mono signal from `x` between two frame offsets and adds the cabinet's
        /// stereo into `outL` / `outR`.
        func process(_ x: UnsafeMutablePointer<Float>, from a: Int, to b: Int,
                     outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>) {
            let table = Organ.table
            let size = Float(Organ.tableSize)
            for i in a..<b {
                // Scanner: dry plus the swept copy.
                vib[vibWrite] = x[i]
                let sweep = table[Int(scan * size) & (Organ.tableSize - 1)]
                let wet = read(vib, vibLen, vibWrite, delay: vibCenter + vibDepth * sweep)
                vibWrite += 1
                if vibWrite == vibLen { vibWrite = 0 }
                scan += scanInc
                if scan >= 1 { scan -= 1 }
                let c = 0.5 * (x[i] + wet)
                // The amp: a soft tube curve, warmer the harder it is driven.
                let s = tanhf(c * 1.6) / 1.6
                // The Leslie: horn above 800 Hz, drum under it.
                lp += lpCoef * (s - lp)
                let hp = s - lp
                horn[hornWrite] = hp
                let h = read(horn, hornLen, hornWrite, delay: hornCenter + hornDepth * sinf(hornPhase))
                hornWrite += 1
                if hornWrite == hornLen { hornWrite = 0 }
                let hornAM = 0.65 + 0.35 * (0.5 + 0.5 * cosf(hornPhase))
                let hornPan = 0.5 + 0.35 * sinf(hornPhase)
                let drumAM = 0.8 + 0.2 * (0.5 + 0.5 * cosf(drumPhase))
                let drumPan = 0.5 + 0.12 * sinf(drumPhase)
                let hv = h * hornAM
                let dv = lp * drumAM
                outL[i] += hv * sqrtf(1 - hornPan) + dv * sqrtf(1 - drumPan)
                outR[i] += hv * sqrtf(hornPan) + dv * sqrtf(drumPan)
                hornPhase += hornInc
                if hornPhase >= 2 * .pi { hornPhase -= 2 * .pi }
                drumPhase += drumInc
                if drumPhase >= 2 * .pi { drumPhase -= 2 * .pi }
            }
        }
    }
}
