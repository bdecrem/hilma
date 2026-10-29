import Foundation

/// The dub stab, synthesized live (misc/DUB_TECHNO_FIXES.md §4, `render_stab` in
/// misc/dub_reference.py): per note three band-limited (PolyBLEP) saws, detuned, through a
/// state-variable lowpass (Cytomic/TPT) whose cutoff opens on the hit and settles on the
/// breath: the band's sweep over `sweepBars`, read at the exact tick the note starts, from
/// `low` to `high` on a log scale. So the filter moves continuously, not in layers, and your
/// keys sweep with the record's. A band names it as the instrument `liveStab`.
enum DubStab {
    static let name = "liveStab"

    struct Settings {
        /// The saws' pitch ratios.
        var detune: (Float, Float, Float)
        /// Filter resonance (0.707 is flat) and the hit: cutoff × (1 + env · e^(−t/envTime)).
        var q: Float
        var env: Float
        var envTime: Double
        /// Amp: attack, exponential decay, the release at the end, and how long a band note
        /// sounds at most (seconds).
        var attack: Double
        var decay: Double
        var release: Double
        var length: Double
        /// The breath: cutoff from `low` (breath 0) to `high` (1), one cycle every `sweepBars`.
        var low: Double
        var high: Double
        var sweepBars: Double

        /// 0...1 at a tick (dark at bar 0, brightest half a cycle in).
        func breath(tick: Double, ticksPerBar: Int) -> Double {
            0.5 - 0.5 * cos(2 * Double.pi * tick / Double(ticksPerBar) / sweepBars)
        }
    }

    /// One note. Render thread only; a plain struct in a preallocated pool.
    struct Voice {
        var active = false
        /// The channel bus it plays into (keys, horns, monitor).
        var bus = 0
        var note = -1
        var live = false
        var age = 0
        private var phase: (Float, Float, Float) = (0, 0, 0)
        private var inc: (Float, Float, Float) = (0, 0, 0)
        private var ic1: Float = 0, ic2: Float = 0
        private var k: Float = 1
        private var base: Float = 0
        private var envAmount: Float = 0
        private var env: Float = 1, envMul: Float = 1
        private var amp: Float = 1, ampMul: Float = 1
        private var attackStep: Float = 1, attack: Float = 0
        private var gain: Float = 0
        private var held = Int.max
        private var releaseStep: Float = 1, fade: Float = 1
        private var releasing = false
        private var nyquist: Float = 0, piOverSR: Float = 0

        /// `held` frames before the release (`.max` for a key held down); `breath` 0...1.
        mutating func start(note: Int, velocity: Float, breath: Double, held: Int, gain: Float, bus: Int, live: Bool, age: Int,
                            settings s: Settings, sampleRate sr: Double) {
            let f = Float(440 * pow(2, Double(note - 69) / 12) / sr)
            inc = (f * s.detune.0, f * s.detune.1, f * s.detune.2)
            phase = (0, 0, 0)
            ic1 = 0
            ic2 = 0
            k = 1 / s.q
            base = Float(s.low * pow(s.high / s.low, breath))
            envAmount = s.env
            env = 1
            envMul = Float(exp(-1 / (s.envTime * sr)))
            amp = 1
            ampMul = Float(exp(-1 / (s.decay * sr)))
            attack = 0
            attackStep = Float(1 / max(1, s.attack * sr))
            // A chord is five of these: the reference sums 5 notes × 3 saws and divides by 15.
            self.gain = gain * velocity * Float(0.6 + 0.4 * breath) / 15
            let release = max(1, Int(s.release * sr))
            self.held = min(held, max(0, Int(s.length * sr) - release))
            releaseStep = 1 / Float(release)
            fade = 1
            releasing = false
            nyquist = Float(0.45 * sr)
            piOverSR = Float(Double.pi / sr)
            self.note = note
            self.bus = bus
            self.live = live
            self.age = age
            active = true
        }

        /// The 20 ms fade (a key let go, a restruck note, the band stopping).
        mutating func stop() {
            releasing = true
        }

        @inline(__always) private static func blep(_ t: Float, _ dt: Float) -> Float {
            if t < dt {
                let x = t / dt
                return x + x - x * x - 1
            }
            if t > 1 - dt {
                let x = (t - 1) / dt
                return x * x + x + x + 1
            }
            return 0
        }

        @inline(__always) private static func saw(_ p: inout Float, _ dt: Float) -> Float {
            let y = (2 * p - 1) - blep(p, dt)
            p += dt
            if p >= 1 { p -= 1 }
            return y
        }

        mutating func render(_ l: UnsafeMutablePointer<Float>, _ r: UnsafeMutablePointer<Float>, from a: Int, to b: Int) {
            for i in a..<b {
                if held == 0 { releasing = true }
                held -= 1
                if releasing {
                    fade -= releaseStep
                    if fade <= 0 { active = false; return }
                }
                if amp < 0.0001 { active = false; return }
                let s = Self.saw(&phase.0, inc.0) + Self.saw(&phase.1, inc.1) + Self.saw(&phase.2, inc.2)
                let fc = min(nyquist, base * (1 + envAmount * env))
                env *= envMul
                let g = tanf(piOverSR * fc)
                let a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2
                let v3 = s - ic2
                let v1 = a1 * ic1 + a2 * v3
                let v2 = ic2 + a2 * ic1 + a3 * v3
                ic1 = 2 * v1 - ic1
                ic2 = 2 * v2 - ic2
                attack = min(1, attack + attackStep)
                let y = v2 * attack * amp * gain * fade
                amp *= ampMul
                l[i] += y
                r[i] += y
            }
        }
    }
}
