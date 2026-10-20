import AVFoundation

/// Each critter's voice when it is poked on the Peck map (2026-10-19). Every
/// critter is a character with its own little voice and three lines, played
/// in turn so repeated taps don't repeat: the cat says "mrrow?", the penguin
/// honks "wenk!", the mushroom sneezes its spores, the baby dragon's roar
/// cracks into a squeak.
///
/// The voice is a small formant synth: a saw "vocal cord" with breath,
/// vibrato, jitter and growl, shaped by three resonant filters that glide
/// between vowels, so one syllable can say "m-i-a-u". A small creature gets a
/// short vocal tract (`tract` scales the formants up). Effects around the
/// voice (thumps, bubbles, fire, chimes) are `JellySynth` parts. Every line
/// is brought to one loudness.
enum CritterSounds {
    typealias Part = JellySynth.Part

    /// The vocal cords: who is speaking.
    struct Voice {
        var tract: Double = 1.3      // formant scale; 1 = an adult, 1.8 = a hamster
        var breath: Double = 0.08    // noise mixed into the source
        var growl: Double = 0        // subharmonic roughness, 0…1
        var vibRate: Double = 5.5    // Hz
        var vibDepth: Double = 0.015 // fraction of the pitch
        var jitter: Double = 0.01    // random pitch drift, fraction
    }

    /// A vowel as three formants (Hz) and their levels.
    struct Vowel {
        var f: (Double, Double, Double)
        var g: (Double, Double, Double)
        init(_ f1: Double, _ f2: Double, _ f3: Double, _ g1: Double, _ g2: Double, _ g3: Double) {
            f = (f1, f2, f3); g = (g1, g2, g3)
        }
    }

    /// One syllable: a pitch contour and a vowel glide over `dur`.
    struct Syl {
        var at: Double
        var dur: Double
        var pitch: [Double]
        var vowels: [Vowel]
        var amp: Double = 1
        var trill: Double = 0        // Hz of amplitude flutter (a rolled r, a purr, a bleat)
        var attack: Double = 0.012
        var release: Double = 0.05
    }

    struct Line {
        var voice: Voice
        var syls: [Syl]
        var fx: [Part] = []
    }

    // Vowels (adult values; `tract` scales them).
    static let A = Vowel(730, 1090, 2440, 1, 0.5, 0.25)
    static let E = Vowel(530, 1840, 2480, 1, 0.45, 0.3)
    static let I = Vowel(300, 2250, 2950, 1, 0.32, 0.22)
    static let O = Vowel(570, 840, 2410, 1, 0.45, 0.12)
    static let U = Vowel(320, 800, 2240, 1, 0.3, 0.06)
    static let M = Vowel(260, 1000, 2200, 1, 0.05, 0.02)
    static let N = Vowel(280, 1600, 2500, 1, 0.07, 0.03)
    static let R = Vowel(490, 1350, 1690, 1, 0.5, 0.35)
    static let H = Vowel(600, 1300, 2400, 1, 0.4, 0.2) // "uh"

    // MARK: - Rendering

    static func lineCount(_ critter: JellyCritter) -> Int { lines(critter).count }

    /// Line `index` of the critter, rendered and brought to one loudness
    /// (RMS 0.09, peak at most 0.6).
    static func buffer(_ critter: JellyCritter, line index: Int, sampleRate sr: Double) -> AVAudioPCMBuffer? {
        let all = lines(critter)
        guard !all.isEmpty else { return nil }
        let line = all[index % all.count]
        let voiceEnd = line.syls.reduce(0.0) { max($0, $1.at + $1.dur) }
        let fxEnd = line.fx.reduce(0.0) { max($0, $1.delay + $1.dur) }
        let count = Int((max(voiceEnd, fxEnd) + 0.03) * sr)
        var mix = [Double](repeating: 0, count: count)

        var rng = SplitMix(seed: UInt64(index + 1) &* 0x2545_F491_4F6C_DD1D)
        for syl in line.syls { voice(syl, line.voice, sr: sr, rng: &rng, into: &mix) }
        if !line.fx.isEmpty, let fx = JellySynth.render(line.fx, sampleRate: sr), let s = fx.floatChannelData?[0] {
            for i in 0..<min(count, Int(fx.frameLength)) { mix[i] += Double(s[i]) * 0.5 }
        }

        guard let format = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 1),
              let b = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)),
              let out = b.floatChannelData?[0] else { return nil }
        b.frameLength = AVAudioFrameCount(count)
        // A gentle lowpass over everything (the tiny voices' top formants
        // stay soft), then level.
        let k = 1 - exp(-2 * .pi * 4500 / sr)
        var lp = 0.0, peak = 0.0, sum = 0.0
        for i in 0..<count {
            lp += k * (mix[i] - lp)
            mix[i] = lp
            peak = max(peak, abs(lp)); sum += lp * lp
        }
        let rms = (sum / Double(max(count, 1))).squareRoot()
        let gain = rms > 0 ? min(0.09 / rms, 0.6 / peak) : 0
        for i in 0..<count { out[i] = Float(tanh(mix[i] * gain * 1.1) / 1.1) }
        return b
    }

    private struct SplitMix {
        var state: UInt64
        init(seed: UInt64) { state = seed }
        mutating func next() -> Double { // -1…1
            state &+= 0x9E37_79B9_7F4A_7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
            z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
            z ^= z >> 31
            return Double(z >> 11) / Double(UInt64(1) << 52) - 1
        }
    }

    /// A two-pole bandpass (constant 0 dB peak).
    private struct Band {
        var b0 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
        var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0
        mutating func tune(_ f: Double, sr: Double) {
            let q = f / (70 + f * 0.09)
            let w = 2 * .pi * f / sr
            let alpha = sin(w) / (2 * q)
            let a0 = 1 + alpha
            b0 = alpha / a0; b2 = -alpha / a0
            a1 = -2 * cos(w) / a0; a2 = (1 - alpha) / a0
        }
        mutating func run(_ x: Double) -> Double {
            let y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            return y
        }
    }

    private static func smooth(_ s: Double) -> Double { s * s * (3 - 2 * s) }

    private static func glide(_ pts: [Double], _ u: Double) -> Double {
        guard pts.count > 1 else { return pts.first ?? 220 }
        let pos = min(max(u, 0), 1) * Double(pts.count - 1)
        let i = min(Int(pos), pts.count - 2)
        let s = smooth(pos - Double(i))
        return exp(log(pts[i]) * (1 - s) + log(pts[i + 1]) * s)
    }

    private static func vowel(_ vs: [Vowel], _ u: Double) -> Vowel {
        guard vs.count > 1 else { return vs.first ?? H }
        let pos = min(max(u, 0), 1) * Double(vs.count - 1)
        let i = min(Int(pos), vs.count - 2)
        let s = smooth(pos - Double(i))
        let a = vs[i], b = vs[i + 1]
        func mixd(_ x: Double, _ y: Double) -> Double { x + (y - x) * s }
        return Vowel(mixd(a.f.0, b.f.0), mixd(a.f.1, b.f.1), mixd(a.f.2, b.f.2),
                     mixd(a.g.0, b.g.0), mixd(a.g.1, b.g.1), mixd(a.g.2, b.g.2))
    }

    private static func voice(_ syl: Syl, _ v: Voice, sr: Double, rng: inout SplitMix, into out: inout [Double]) {
        let start = Int(syl.at * sr)
        let n = Int(syl.dur * sr)
        var phase = 0.0, sub = 0.0, drift = 0.0
        var b0 = Band(), b1 = Band(), b2 = Band()
        var gains = (0.0, 0.0, 0.0)
        let top = min(4200, sr * 0.45)
        for i in 0..<n {
            let idx = start + i
            if idx >= out.count { break }
            let t = Double(i) / sr
            let u = Double(i) / Double(n)
            drift = drift * 0.998 + rng.next() * 0.04
            let vib = v.vibDepth * min(1, t / 0.09) * sin(2 * .pi * v.vibRate * t)
            let f = glide(syl.pitch, u) * (1 + vib + v.jitter * drift)
            let dt = f / sr
            phase += dt; if phase >= 1 { phase -= 1 }
            // A saw with its step smoothed (polyBLEP), so high voices stay clean.
            var src = 2 * phase - 1
            if phase < dt { let x = phase / dt; src -= x + x - x * x - 1 }
            else if phase > 1 - dt { let x = (phase - 1) / dt; src -= x * x + x + x + 1 }
            if v.growl > 0 {
                sub += dt * 0.5; if sub >= 1 { sub -= 1 }
                src *= 1 - v.growl + v.growl * (0.5 + 0.5 * sin(2 * .pi * sub))
                src += v.growl * 0.25 * rng.next()
            }
            src = src * (1 - v.breath) + rng.next() * v.breath * 1.6
            if i % 16 == 0 {
                let w = vowel(syl.vowels, u)
                b0.tune(min(w.f.0 * v.tract, top), sr: sr)
                b1.tune(min(w.f.1 * v.tract, top), sr: sr)
                b2.tune(min(w.f.2 * v.tract, top), sr: sr)
                gains = w.g
            }
            var y = b0.run(src) * gains.0 + b1.run(src) * gains.1 + b2.run(src) * gains.2
            let rise = smooth(min(1, t / syl.attack))
            let fall = smooth(max(0, min(1, (syl.dur - t) / syl.release)))
            y *= rise * fall * syl.amp
            if syl.trill > 0 { y *= 0.35 + 0.65 * (0.5 + 0.5 * sin(2 * .pi * syl.trill * t)) }
            out[idx] += y
        }
    }

    // MARK: - Effects

    private static func thump(_ at: Double, _ peak: Double = 0.5) -> Part {
        Part(wave: .sine, f0: 110, f1: 55, dur: 0.09, peak: peak, delay: at)
    }
    private static func click(_ at: Double, _ peak: Double = 0.3) -> Part {
        Part(wave: .noise, dur: 0.012, peak: peak, delay: at, attack: 0.001, lowpass: 2500)
    }
    private static func puff(_ at: Double, _ dur: Double, _ peak: Double = 0.45, lowpass: Double = 1500) -> Part {
        Part(wave: .noise, dur: dur, peak: peak, delay: at, attack: dur * 0.15, lowpass: lowpass, decay: 0.4)
    }
    private static func bubble(_ at: Double, _ f: Double, _ peak: Double = 0.4) -> Part {
        Part(wave: .sine, f0: f, f1: f * 2.2, dur: 0.06, peak: peak, delay: at)
    }
    private static func chime(_ at: Double, _ f: Double, _ peak: Double = 0.25, dur: Double = 0.5) -> Part {
        Part(wave: .sine, f0: f, f1: f, dur: dur, peak: peak, delay: at, attack: 0.003, decay: 0.35)
    }
    private static func spring(_ at: Double, _ f: Double, _ dur: Double = 0.5, peak: Double = 0.5) -> Part {
        Part(wave: .sine, f0: f, f1: f * 1.5, dur: dur, peak: peak, delay: at, wobRate: 16, wobDepth: 0.35, wobDecay: 1.2, decay: 0.4)
    }
    private static func buzz(_ at: Double, _ dur: Double, _ f0: Double, _ f1: Double, swerve: Double = 5) -> [Part] {
        [Part(wave: .saw, f0: f0, f1: f1, dur: dur, peak: 0.45, delay: at, attack: 0.03, lowpass: 1600, wobRate: 31, wobDepth: 0.05, wobDecay: 0, decay: 0.7),
         Part(wave: .saw, f0: f0 * 1.01, f1: f1 * 1.01, dur: dur, peak: 0.3, delay: at, attack: 0.03, lowpass: 1600, wobRate: swerve, wobDepth: 0.08, wobDecay: 0, decay: 0.7)]
    }

    // MARK: - The cast

    static func lines(_ critter: JellyCritter) -> [Line] {
        switch critter {

        // Sky dodo, the hero: warm, friendly, happy to see you.
        case .dodo:
            let v = Voice(tract: 1.25, breath: 0.06, vibDepth: 0.02)
            return [
                Line(voice: v, syls: [  // "hoo-EE!"
                    Syl(at: 0, dur: 0.15, pitch: [300, 340], vowels: [U]),
                    Syl(at: 0.15, dur: 0.3, pitch: [440, 640, 560], vowels: [I, I]),
                ]),
                Line(voice: v, syls: [  // "doo-dee-doo!"
                    Syl(at: 0, dur: 0.11, pitch: [392, 400], vowels: [U]),
                    Syl(at: 0.12, dur: 0.11, pitch: [523, 530], vowels: [I]),
                    Syl(at: 0.24, dur: 0.24, pitch: [440, 470, 420], vowels: [U, O]),
                ]),
                Line(voice: v, syls: [  // "hm? hi!"
                    Syl(at: 0, dur: 0.14, pitch: [320, 400], vowels: [M]),
                    Syl(at: 0.2, dur: 0.24, pitch: [520, 660, 560], vowels: [A, I]),
                ]),
            ]

        // Pink dodo: the giggler.
        case .dodoPink:
            let v = Voice(tract: 1.45, breath: 0.2, vibRate: 7, vibDepth: 0.02)
            return [
                Line(voice: v, syls: [  // "hee-hee-hee!"
                    Syl(at: 0, dur: 0.08, pitch: [540, 600], vowels: [I]),
                    Syl(at: 0.1, dur: 0.08, pitch: [600, 680], vowels: [I]),
                    Syl(at: 0.2, dur: 0.14, pitch: [700, 820, 760], vowels: [I, E]),
                ]),
                Line(voice: v, syls: [  // "oooh~"
                    Syl(at: 0, dur: 0.48, pitch: [480, 820, 620], vowels: [U, O, U], attack: 0.04),
                ]),
                Line(voice: v, syls: [  // "tee-hee!"
                    Syl(at: 0.02, dur: 0.08, pitch: [660, 680], vowels: [I]),
                    Syl(at: 0.13, dur: 0.18, pitch: [760, 900, 820], vowels: [I, E]),
                ], fx: [click(0, 0.25)]),
            ]

        // Peach dodo: always half asleep.
        case .dodoPeach:
            let v = Voice(tract: 1.15, breath: 0.25, vibRate: 4, vibDepth: 0.01)
            return [
                Line(voice: v, syls: [  // a big yawn: "haaaa-mm"
                    Syl(at: 0, dur: 0.6, pitch: [250, 340, 300, 200], vowels: [A, A, O, M], attack: 0.08, release: 0.15),
                ]),
                Line(voice: v, syls: [  // "mm… hoo?"
                    Syl(at: 0, dur: 0.2, pitch: [220, 235], vowels: [M], attack: 0.04),
                    Syl(at: 0.25, dur: 0.3, pitch: [240, 300], vowels: [U], attack: 0.04),
                ]),
                Line(voice: v, syls: [  // a contented sigh
                    Syl(at: 0.05, dur: 0.45, pitch: [260, 200], vowels: [H, M], attack: 0.05, release: 0.2),
                ], fx: [puff(0, 0.3, 0.3, lowpass: 900)]),
            ]

        // Mint dodo: over-excited about everything.
        case .dodoMint:
            let v = Voice(tract: 1.4, breath: 0.08, vibRate: 9, vibDepth: 0.025)
            return [
                Line(voice: v, syls: [  // "ooh! ooh!"
                    Syl(at: 0, dur: 0.12, pitch: [600, 820], vowels: [U, O]),
                    Syl(at: 0.16, dur: 0.15, pitch: [700, 980], vowels: [U, O]),
                ]),
                Line(voice: v, syls: [  // "wheee!"
                    Syl(at: 0, dur: 0.38, pitch: [450, 1100, 1000], vowels: [U, I, I]),
                ]),
                Line(voice: v, syls: [  // "yay-yay-YAY!"
                    Syl(at: 0, dur: 0.08, pitch: [700, 740], vowels: [I, A]),
                    Syl(at: 0.1, dur: 0.08, pitch: [760, 800], vowels: [I, A]),
                    Syl(at: 0.2, dur: 0.18, pitch: [900, 1050, 950], vowels: [I, A, E]),
                ]),
            ]

        // Lemon dodo: sassy.
        case .dodoLemon:
            let v = Voice(tract: 1.3, breath: 0.1, vibDepth: 0.01)
            return [
                Line(voice: v, syls: [  // "eh?"
                    Syl(at: 0, dur: 0.26, pitch: [380, 350, 640], vowels: [E, E]),
                ]),
                Line(voice: v, syls: [  // "hmph!"
                    Syl(at: 0, dur: 0.16, pitch: [380, 260], vowels: [M]),
                ], fx: [puff(0.13, 0.08, 0.4, lowpass: 2000)]),
                Line(voice: v, syls: [  // "uh-HUH."
                    Syl(at: 0, dur: 0.12, pitch: [420, 380], vowels: [H]),
                    Syl(at: 0.17, dur: 0.2, pitch: [460, 560, 520], vowels: [H, H]),
                ]),
            ]

        // Grape dodo: the gentle giant.
        case .dodoGrape:
            let v = Voice(tract: 0.95, breath: 0.12, growl: 0.3, vibRate: 4.5, vibDepth: 0.02)
            return [
                Line(voice: v, syls: [  // "ho-ho-ho"
                    Syl(at: 0, dur: 0.12, pitch: [150, 145], vowels: [O]),
                    Syl(at: 0.15, dur: 0.12, pitch: [140, 135], vowels: [O]),
                    Syl(at: 0.3, dur: 0.22, pitch: [130, 112], vowels: [O, U]),
                ]),
                Line(voice: v, syls: [  // "bwohhh"
                    Syl(at: 0, dur: 0.45, pitch: [110, 155, 95], vowels: [U, O, O], attack: 0.03),
                ]),
                Line(voice: v, syls: [  // "hmmm?"
                    Syl(at: 0, dur: 0.42, pitch: [115, 105, 170], vowels: [M, M], attack: 0.04),
                ]),
            ]

        // Cherry dodo: the romantic.
        case .dodoCherry:
            let v = Voice(tract: 1.3, breath: 0.12, vibRate: 6, vibDepth: 0.025)
            return [
                Line(voice: v, syls: [  // "mwah!"
                    Syl(at: 0.03, dur: 0.24, pitch: [420, 580, 480], vowels: [M, U, A]),
                ], fx: [click(0, 0.5), click(0.012, 0.3)]),
                Line(voice: v, syls: [  // "oo-la-la!"
                    Syl(at: 0, dur: 0.14, pitch: [440, 520], vowels: [U]),
                    Syl(at: 0.16, dur: 0.1, pitch: [560, 570], vowels: [N, A]),
                    Syl(at: 0.28, dur: 0.24, pitch: [600, 680, 540], vowels: [N, A, A]),
                ]),
                Line(voice: v, syls: [  // "awww"
                    Syl(at: 0, dur: 0.5, pitch: [480, 640, 430], vowels: [A, O], attack: 0.04),
                ]),
            ]

        // Lime dodo: the goof.
        case .dodoLime:
            let v = Voice(tract: 1.2, breath: 0.08, vibDepth: 0.02)
            return [
                Line(voice: v, syls: [  // boing… "ya-HOO!"
                    Syl(at: 0.22, dur: 0.1, pitch: [420, 500], vowels: [I, A]),
                    Syl(at: 0.33, dur: 0.28, pitch: [620, 760, 520], vowels: [H, U]),
                ], fx: [spring(0, 220, 0.3, peak: 0.6)]),
                Line(voice: v, syls: [  // "hyuk-hyuk!"
                    Syl(at: 0, dur: 0.09, pitch: [340, 300], vowels: [I, H]),
                    Syl(at: 0.14, dur: 0.1, pitch: [320, 280], vowels: [I, H]),
                ], fx: [click(0.08, 0.25), click(0.23, 0.25)]),
                Line(voice: Voice(tract: 1.2, breath: 0.06, vibRate: 7, vibDepth: 0.09), syls: [  // a yodel
                    Syl(at: 0, dur: 0.55, pitch: [340, 620, 420, 600], vowels: [U, A, U, I]),
                ]),
            ]

        // Bunny: shy, twitchy, tiny.
        case .bunny:
            let v = Voice(tract: 1.75, breath: 0.22, vibDepth: 0.01)
            return [
                Line(voice: v, syls: [  // "eep!" thump thump
                    Syl(at: 0, dur: 0.1, pitch: [900, 1180], vowels: [I]),
                ], fx: [thump(0.16), thump(0.28, 0.4)]),
                Line(voice: v, syls: [  // nibble-nibble
                    Syl(at: 0, dur: 0.045, pitch: [820], vowels: [N, I], amp: 0.8),
                    Syl(at: 0.07, dur: 0.045, pitch: [860], vowels: [N, I], amp: 0.8),
                    Syl(at: 0.14, dur: 0.045, pitch: [820], vowels: [N, I], amp: 0.8),
                    Syl(at: 0.21, dur: 0.07, pitch: [900, 980], vowels: [N, I], amp: 0.9),
                ], fx: [click(0.04, 0.2), click(0.11, 0.2), click(0.18, 0.2)]),
                Line(voice: v, syls: [  // sniff-sniff… "eep?"
                    Syl(at: 0.3, dur: 0.12, pitch: [880, 1250], vowels: [I]),
                ], fx: [puff(0, 0.05, 0.3, lowpass: 2200), puff(0.08, 0.05, 0.3, lowpass: 2200), puff(0.16, 0.05, 0.3, lowpass: 2200)]),
            ]

        // Peach: juicy and jolly.
        case .peach:
            let v = Voice(tract: 1.35, breath: 0.12, vibDepth: 0.015)
            return [
                Line(voice: v, syls: [  // plop! "hee!"
                    Syl(at: 0.13, dur: 0.16, pitch: [600, 820, 700], vowels: [I]),
                ], fx: [Part(wave: .sine, f0: 720, f1: 170, dur: 0.14, peak: 0.6), puff(0.02, 0.07, 0.3, lowpass: 1600)]),
                Line(voice: v, syls: [  // squish… giggle
                    Syl(at: 0.1, dur: 0.07, pitch: [650], vowels: [I]),
                    Syl(at: 0.19, dur: 0.07, pitch: [720], vowels: [I]),
                    Syl(at: 0.28, dur: 0.14, pitch: [800, 920], vowels: [I, E]),
                ], fx: [Part(wave: .tri, f0: 240, f1: 110, dur: 0.12, peak: 0.45, lowpass: 1200), puff(0, 0.09, 0.3, lowpass: 900)]),
                Line(voice: v, syls: [  // "ooo~" and a drip
                    Syl(at: 0, dur: 0.34, pitch: [440, 660, 500], vowels: [U, O]),
                ], fx: [Part(wave: .sine, f0: 1400, f1: 700, dur: 0.06, peak: 0.3, delay: 0.38)]),
            ]

        // Cat: knows exactly what it wants.
        case .cat:
            let v = Voice(tract: 1.45, breath: 0.1, growl: 0.08, vibRate: 5, vibDepth: 0.015)
            return [
                Line(voice: v, syls: [  // "mrrow?"
                    Syl(at: 0, dur: 0.48, pitch: [420, 640, 520, 600], vowels: [M, I, A, U], attack: 0.03),
                ]),
                Line(voice: v, syls: [  // "mrrrp!"
                    Syl(at: 0, dur: 0.2, pitch: [460, 600], vowels: [M, R], trill: 28, attack: 0.02),
                ]),
                Line(voice: v, syls: [  // purr… "mew"
                    Syl(at: 0, dur: 0.4, pitch: [65, 62], vowels: [M, M], amp: 1.6, trill: 24, attack: 0.05),
                    Syl(at: 0.4, dur: 0.2, pitch: [640, 820, 700], vowels: [I, U]),
                ]),
            ]

        // Dragon: a baby who wants very badly to be scary.
        case .dragon:
            let v = Voice(tract: 1.0, breath: 0.25, growl: 0.75, vibDepth: 0.01)
            return [
                Line(voice: v, syls: [  // "RAWR—eek!" puff
                    Syl(at: 0, dur: 0.36, pitch: [120, 165, 140], vowels: [R, A, O], trill: 22),
                    Syl(at: 0.34, dur: 0.12, pitch: [700, 940], vowels: [I], amp: 0.7),
                ], fx: [puff(0.48, 0.3, 0.4, lowpass: 1300)]),
                Line(voice: v, syls: [  // "grrr… ah… CHOO!" FWOOSH
                    Syl(at: 0, dur: 0.24, pitch: [110, 120], vowels: [R], trill: 30),
                    Syl(at: 0.3, dur: 0.14, pitch: [300, 480], vowels: [A], amp: 0.8),
                    Syl(at: 0.47, dur: 0.12, pitch: [420, 250], vowels: [U]),
                ], fx: [puff(0.45, 0.05, 0.6, lowpass: 2500), puff(0.5, 0.45, 0.5, lowpass: 1200)]),
                Line(voice: Voice(tract: 1.15, breath: 0.2, growl: 0.5), syls: [  // a proud little "rar!"
                    Syl(at: 0, dur: 0.24, pitch: [220, 340, 260], vowels: [R, A]),
                ], fx: [Part(wave: .noise, dur: 0.2, peak: 0.25, delay: 0.22, lowpass: 2200, wobRate: 30, wobDepth: 0.5)]),
            ]

        // Gummy: made of rubber, loves it.
        case .gummy:
            let v = Voice(tract: 1.2, breath: 0.08, vibRate: 9, vibDepth: 0.06)
            return [
                Line(voice: v, syls: [  // boyoyoing… "wheee"
                    Syl(at: 0.3, dur: 0.32, pitch: [400, 900, 720], vowels: [U, I]),
                ], fx: [spring(0, 170, 0.5, peak: 0.6)]),
                Line(voice: v, syls: [  // "heh-heh" boing
                    Syl(at: 0, dur: 0.1, pitch: [420, 500], vowels: [E]),
                    Syl(at: 0.14, dur: 0.12, pitch: [380, 460], vowels: [E]),
                ], fx: [spring(0.24, 260, 0.3, peak: 0.4)]),
                Line(voice: v, syls: [  // "uh-oh…"
                    Syl(at: 0, dur: 0.15, pitch: [420, 440], vowels: [H, O]),
                    Syl(at: 0.22, dur: 0.28, pitch: [340, 250], vowels: [O, U]),
                ]),
            ]

        // Penguin: honks, shivers.
        case .penguin:
            let v = Voice(tract: 1.1, breath: 0.08, growl: 0.15, vibDepth: 0.008)
            return [
                Line(voice: v, syls: [  // "wenk!"
                    Syl(at: 0, dur: 0.16, pitch: [330, 380, 320], vowels: [U, E, N]),
                ]),
                Line(voice: v, syls: [  // "wenk-wenk!"
                    Syl(at: 0, dur: 0.13, pitch: [340, 370, 330], vowels: [U, E, N]),
                    Syl(at: 0.17, dur: 0.16, pitch: [360, 400, 330], vowels: [U, E, N]),
                ]),
                Line(voice: v, syls: [  // "brrrrr" teeth chattering
                    Syl(at: 0, dur: 0.45, pitch: [210, 190], vowels: [U, R], trill: 18),
                ], fx: [click(0.05, 0.2), click(0.12, 0.2), click(0.19, 0.2), click(0.26, 0.2), click(0.33, 0.2)]),
            ]

        // Octo: always underwater, always playful.
        case .octo:
            let v = Voice(tract: 1.05, breath: 0.3, vibRate: 12, vibDepth: 0.05)
            return [
                Line(voice: v, syls: [  // "blub-blub-bloo"
                    Syl(at: 0, dur: 0.1, pitch: [260, 300], vowels: [U, O]),
                    Syl(at: 0.13, dur: 0.1, pitch: [280, 330], vowels: [U, O]),
                    Syl(at: 0.26, dur: 0.22, pitch: [300, 420, 360], vowels: [U]),
                ], fx: [bubble(0.1, 380), bubble(0.24, 450), bubble(0.46, 520)]),
                Line(voice: v, syls: [  // "oo-oo-OOO!"
                    Syl(at: 0, dur: 0.1, pitch: [340], vowels: [U]),
                    Syl(at: 0.12, dur: 0.1, pitch: [400], vowels: [U]),
                    Syl(at: 0.24, dur: 0.26, pitch: [470, 560, 500], vowels: [U, O]),
                ]),
                Line(voice: v, syls: [  // gurgle… "hi!"
                    Syl(at: 0, dur: 0.26, pitch: [220, 240], vowels: [O, U], trill: 20),
                    Syl(at: 0.32, dur: 0.16, pitch: [420, 540], vowels: [A, I]),
                ], fx: [bubble(0.05, 320, 0.3), bubble(0.12, 400, 0.3), bubble(0.2, 360, 0.3)]),
            ]

        // Red panda: huffs, squeaks, bleats.
        case .panda:
            let v = Voice(tract: 1.6, breath: 0.18, vibDepth: 0.01)
            return [
                Line(voice: v, syls: [  // huff! squeak
                    Syl(at: 0.12, dur: 0.12, pitch: [950, 1300, 1100], vowels: [I]),
                ], fx: [puff(0, 0.1, 0.5, lowpass: 1400)]),
                Line(voice: v, syls: [  // a bleat: "eee-eh"
                    Syl(at: 0, dur: 0.3, pitch: [880, 980, 820], vowels: [I, E], trill: 14),
                ]),
                Line(voice: v, syls: [  // chirp-chirp-chirp
                    Syl(at: 0, dur: 0.06, pitch: [950, 1150], vowels: [I]),
                    Syl(at: 0.09, dur: 0.06, pitch: [1000, 1200], vowels: [I]),
                    Syl(at: 0.18, dur: 0.09, pitch: [1050, 1300, 1150], vowels: [I]),
                ]),
            ]

        // Blob: slow, deep, a bit gross.
        case .blob:
            let v = Voice(tract: 0.9, breath: 0.15, vibRate: 4, vibDepth: 0.03)
            return [
                Line(voice: v, syls: [  // "blorp?"
                    Syl(at: 0, dur: 0.34, pitch: [130, 110, 185], vowels: [U, O, R]),
                ], fx: [Part(wave: .sine, f0: 240, f1: 70, dur: 0.3, peak: 0.4, wobRate: 5, wobDepth: 0.2)]),
                Line(voice: Voice(tract: 0.9, breath: 0.2, growl: 0.85), syls: [  // a burp… "heh"
                    Syl(at: 0, dur: 0.3, pitch: [95, 85], vowels: [A, O], trill: 34),
                    Syl(at: 0.38, dur: 0.1, pitch: [220, 200], vowels: [E], amp: 0.8),
                ]),
                Line(voice: v, syls: [  // "ooooh" in wonder
                    Syl(at: 0, dur: 0.5, pitch: [120, 175, 140], vowels: [O, U], attack: 0.05),
                ]),
            ]

        // Hamster: chatters, stuffs its cheeks.
        case .hamster:
            let v = Voice(tract: 1.8, breath: 0.15, vibDepth: 0.01)
            return [
                Line(voice: v, syls: [  // chatter
                    Syl(at: 0, dur: 0.04, pitch: [1000], vowels: [I], amp: 0.8),
                    Syl(at: 0.05, dur: 0.04, pitch: [1150], vowels: [E], amp: 0.8),
                    Syl(at: 0.1, dur: 0.04, pitch: [1050], vowels: [I], amp: 0.8),
                    Syl(at: 0.15, dur: 0.04, pitch: [1200], vowels: [E], amp: 0.8),
                    Syl(at: 0.2, dur: 0.04, pitch: [1100], vowels: [I], amp: 0.8),
                    Syl(at: 0.25, dur: 0.08, pitch: [1250, 1350], vowels: [I]),
                ]),
                Line(voice: v, syls: [  // "squee!"
                    Syl(at: 0, dur: 0.22, pitch: [950, 1500, 1300], vowels: [U, I]),
                ]),
                Line(voice: v, syls: [  // "mmf-mmf" (cheeks full) pop! "eep"
                    Syl(at: 0, dur: 0.08, pitch: [600], vowels: [M]),
                    Syl(at: 0.11, dur: 0.08, pitch: [640], vowels: [M]),
                    Syl(at: 0.32, dur: 0.1, pitch: [1100, 1350], vowels: [I]),
                ], fx: [Part(wave: .sine, f0: 820, f1: 420, dur: 0.07, peak: 0.6, delay: 0.22)]),
            ]

        // Bat: a mischievous night flyer.
        case .bat:
            let v = Voice(tract: 1.7, breath: 0.15, vibDepth: 0.01)
            let flaps: [Part] = [puff(0.22, 0.05, 0.4, lowpass: 1200), puff(0.3, 0.05, 0.35, lowpass: 1200), puff(0.38, 0.05, 0.3, lowpass: 1200)]
            return [
                Line(voice: v, syls: [  // "eek-eek!" and off it flaps
                    Syl(at: 0, dur: 0.07, pitch: [1250, 1400], vowels: [I]),
                    Syl(at: 0.1, dur: 0.09, pitch: [1350, 1500], vowels: [I]),
                ], fx: flaps),
                Line(voice: v, syls: [  // sonar, then a snicker
                    Syl(at: 0.3, dur: 0.06, pitch: [900, 950], vowels: [I, H], amp: 0.8),
                    Syl(at: 0.39, dur: 0.06, pitch: [850, 900], vowels: [I, H], amp: 0.8),
                ], fx: [
                    Part(wave: .sine, f0: 1900, f1: 1100, dur: 0.045, peak: 0.35),
                    Part(wave: .sine, f0: 1900, f1: 1100, dur: 0.045, peak: 0.2, delay: 0.08),
                    Part(wave: .sine, f0: 1900, f1: 1100, dur: 0.045, peak: 0.1, delay: 0.16),
                ]),
                Line(voice: Voice(tract: 1.4, breath: 0.2, growl: 0.2), syls: [  // "bleh!"
                    Syl(at: 0, dur: 0.24, pitch: [620, 680, 480], vowels: [N, E, H]),
                ], fx: [puff(0.26, 0.05, 0.35, lowpass: 1200)]),
            ]

        // Bee: busy, buzzy, says hi on the way past.
        case .bee:
            let v = Voice(tract: 1.7, breath: 0.1, vibRate: 30, vibDepth: 0.02)
            return [
                Line(voice: v, syls: [], fx: buzz(0, 0.55, 200, 260, swerve: 5) + [  // a swoop past
                    Part(wave: .saw, f0: 270, f1: 180, dur: 0.3, peak: 0.35, delay: 0.3, lowpass: 1400, wobRate: 31, wobDepth: 0.05, wobDecay: 0, decay: 0.5),
                ]),
                Line(voice: v, syls: [  // bzz… "hi!"
                    Syl(at: 0.28, dur: 0.16, pitch: [760, 960], vowels: [A, I]),
                ], fx: buzz(0, 0.26, 220, 230)),
                Line(voice: v, syls: [], fx: buzz(0, 0.5, 210, 220, swerve: 9)),  // a zig-zag
            ]

        // Cloud: dreamy, floaty, a little choir.
        case .cloud:
            let v = Voice(tract: 1.3, breath: 0.45, vibRate: 4.5, vibDepth: 0.02)
            return [
                Line(voice: v, syls: [  // "ahhh" in a fifth
                    Syl(at: 0, dur: 0.65, pitch: [440, 440], vowels: [A, O], amp: 0.8, attack: 0.12, release: 0.25),
                    Syl(at: 0.06, dur: 0.6, pitch: [660, 660], vowels: [A, O], amp: 0.6, attack: 0.12, release: 0.25),
                ], fx: [chime(0.15, 1320, 0.15, dur: 0.6)]),
                Line(voice: Voice(tract: 1.3, breath: 0.7, vibDepth: 0.01), syls: [  // "fwoo" sigh
                    Syl(at: 0.05, dur: 0.45, pitch: [400, 300], vowels: [U, U], attack: 0.08, release: 0.2),
                ], fx: [puff(0, 0.5, 0.35, lowpass: 700)]),
                Line(voice: v, syls: [  // "hmmm~" content, with sparkle
                    Syl(at: 0, dur: 0.55, pitch: [392, 440, 392], vowels: [M, M], attack: 0.06, release: 0.2),
                ], fx: [chime(0.2, 1175, 0.12, dur: 0.4), chime(0.3, 1568, 0.1, dur: 0.4)]),
            ]

        // Mushroom: shy, sneezes spores.
        case .mushroom:
            let v = Voice(tract: 1.5, breath: 0.12, vibDepth: 0.01)
            return [
                Line(voice: v, syls: [  // "ah… ah… CHOO!" spores
                    Syl(at: 0, dur: 0.11, pitch: [600, 660], vowels: [A]),
                    Syl(at: 0.17, dur: 0.13, pitch: [660, 780], vowels: [A]),
                    Syl(at: 0.36, dur: 0.12, pitch: [820, 480], vowels: [U]),
                ], fx: [puff(0.34, 0.06, 0.6, lowpass: 2600), chime(0.48, 1050, 0.12, dur: 0.25), chime(0.54, 1400, 0.1, dur: 0.25), chime(0.6, 1250, 0.08, dur: 0.25)]),
                Line(voice: v, syls: [  // poof! "hee-hee"
                    Syl(at: 0.16, dur: 0.07, pitch: [820], vowels: [I]),
                    Syl(at: 0.26, dur: 0.1, pitch: [900, 980], vowels: [I]),
                ], fx: [puff(0, 0.2, 0.45, lowpass: 1100), Part(wave: .sine, f0: 200, f1: 140, dur: 0.12, peak: 0.35)]),
                Line(voice: v, syls: [  // "boop?"
                    Syl(at: 0, dur: 0.2, pitch: [480, 720], vowels: [U]),
                ], fx: [Part(wave: .sine, f0: 820, f1: 420, dur: 0.07, peak: 0.4, delay: 0.2)]),
            ]

        // Sprite: a fairy made of glitter.
        case .sprite:
            let v = Voice(tract: 1.6, breath: 0.25, vibRate: 7, vibDepth: 0.02)
            return [
                Line(voice: v, syls: [  // "tee-hee!" + glitter
                    Syl(at: 0, dur: 0.08, pitch: [900, 940], vowels: [I]),
                    Syl(at: 0.11, dur: 0.16, pitch: [1000, 1150, 1050], vowels: [I, E]),
                ], fx: [chime(0.22, 1175, 0.15, dur: 0.35), chime(0.27, 1397, 0.13, dur: 0.35), chime(0.32, 1568, 0.12, dur: 0.4)]),
                Line(voice: v, syls: [  // sparkle up… "wheee"
                    Syl(at: 0.22, dur: 0.34, pitch: [700, 1200, 1000], vowels: [U, I]),
                ], fx: [chime(0, 784, 0.18, dur: 0.3), chime(0.05, 988, 0.17, dur: 0.3), chime(0.1, 1175, 0.16, dur: 0.3), chime(0.15, 1568, 0.15, dur: 0.4)]),
                Line(voice: v, syls: [  // "ooh~" and a chime cascade down
                    Syl(at: 0, dur: 0.38, pitch: [800, 1050, 900], vowels: [U, O], attack: 0.03),
                ], fx: [chime(0.3, 1568, 0.14, dur: 0.3), chime(0.36, 1319, 0.13, dur: 0.3), chime(0.42, 1047, 0.12, dur: 0.3), chime(0.48, 784, 0.12, dur: 0.4)]),
            ]
        }
    }
}
