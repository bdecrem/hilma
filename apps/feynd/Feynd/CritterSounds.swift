import AVFoundation

/// Each critter's voice when it is poked on the Peck map (2026-10-19). Same
/// jelly synth as the rest of the map (`JellySynth`): sines, triangles and a
/// soft saw with pitch bends and wobbles, lowpassed noise for breath and
/// splash. Kept under ~2 kHz like the other jelly sounds, so nothing reads as
/// a high-pitched dot.
enum CritterSounds {
    typealias Part = JellySynth.Part

    /// The critter's sound, rendered and brought to one loudness (RMS 0.09,
    /// peak at most 0.6), so a bat's chirps sit as loud as a blob's bloop.
    static func buffer(_ critter: JellyCritter, sampleRate: Double) -> AVAudioPCMBuffer? {
        guard let b = JellySynth.render(parts(critter), sampleRate: sampleRate),
              let s = b.floatChannelData?[0], b.frameLength > 0 else { return nil }
        let n = Int(b.frameLength)
        var peak: Float = 0, sum: Float = 0
        for i in 0..<n { peak = max(peak, abs(s[i])); sum += s[i] * s[i] }
        let rms = (sum / Float(n)).squareRoot()
        guard rms > 0 else { return b }
        let gain = min(0.09 / rms, 0.6 / peak)
        for i in 0..<n { s[i] *= gain }
        return b
    }

    static func parts(_ critter: JellyCritter) -> [Part] {
        switch critter {
        // The dodo family: eight coos, one per flavour.
        case .dodo: // a cheerful "doo-dee!"
            return [
                Part(wave: .sine, f0: 392, f1: 440, dur: 0.13, peak: 0.5, wobRate: 12, wobDepth: 0.06),
                Part(wave: .sine, f0: 587, f1: 660, dur: 0.22, peak: 0.5, delay: 0.12, wobRate: 10, wobDepth: 0.08, decay: 0.4),
            ]
        case .dodoPink: // a three-step giggle
            return [
                Part(wave: .tri, f0: 620, f1: 700, dur: 0.08, peak: 0.4, lowpass: 1800, wobRate: 20, wobDepth: 0.05),
                Part(wave: .tri, f0: 700, f1: 790, dur: 0.08, peak: 0.4, delay: 0.09, lowpass: 1800, wobRate: 20, wobDepth: 0.05),
                Part(wave: .tri, f0: 800, f1: 920, dur: 0.12, peak: 0.42, delay: 0.18, lowpass: 1800, wobRate: 20, wobDepth: 0.06),
            ]
        case .dodoPeach: // a soft low "hoo-hoo"
            return [
                Part(wave: .sine, f0: 300, f1: 255, dur: 0.16, peak: 0.55, attack: 0.02, decay: 0.45),
                Part(wave: .sine, f0: 290, f1: 220, dur: 0.24, peak: 0.55, delay: 0.17, attack: 0.02, decay: 0.45),
            ]
        case .dodoMint: // a slide whistle, up
            return [
                Part(wave: .sine, f0: 300, f1: 1150, dur: 0.26, peak: 0.45, attack: 0.01, wobRate: 7, wobDepth: 0.03, wobDecay: 0, decay: 0.6),
            ]
        case .dodoLemon: // a bright "bink!" with an echo
            return [
                Part(wave: .sine, f0: 940, f1: 860, dur: 0.12, peak: 0.45),
                Part(wave: .sine, f0: 1410, f1: 1290, dur: 0.08, peak: 0.12),
                Part(wave: .sine, f0: 940, f1: 860, dur: 0.12, peak: 0.2, delay: 0.14),
                Part(wave: .sine, f0: 940, f1: 860, dur: 0.12, peak: 0.08, delay: 0.28),
            ]
        case .dodoGrape: // a deep wobbly "bwomp"
            return [
                Part(wave: .tri, f0: 150, f1: 85, dur: 0.34, peak: 0.6, lowpass: 900, wobRate: 7, wobDepth: 0.25, wobDecay: 1.5, decay: 0.4),
                Part(wave: .sine, f0: 300, f1: 170, dur: 0.22, peak: 0.25, wobRate: 7, wobDepth: 0.25),
            ]
        case .dodoCherry: // a kiss: "mwah"
            return [
                Part(wave: .noise, dur: 0.03, peak: 0.35, lowpass: 2000),
                Part(wave: .sine, f0: 480, f1: 900, dur: 0.18, peak: 0.45, delay: 0.02, wobRate: 9, wobDepth: 0.05),
                Part(wave: .sine, f0: 960, f1: 1500, dur: 0.12, peak: 0.1, delay: 0.03),
            ]
        case .dodoLime: // a spring: "boing-oing-oing"
            return [
                Part(wave: .sine, f0: 220, f1: 340, dur: 0.5, peak: 0.55, wobRate: 16, wobDepth: 0.32, wobDecay: 1.2, decay: 0.4),
                Part(wave: .sine, f0: 440, f1: 680, dur: 0.3, peak: 0.12, wobRate: 16, wobDepth: 0.32, wobDecay: 1.2),
            ]

        // Everyone else.
        case .bunny: // hop, hop, hop
            return [
                Part(wave: .sine, f0: 380, f1: 720, dur: 0.07, peak: 0.45),
                Part(wave: .sine, f0: 460, f1: 880, dur: 0.07, peak: 0.42, delay: 0.1),
                Part(wave: .sine, f0: 560, f1: 1080, dur: 0.09, peak: 0.38, delay: 0.2),
                Part(wave: .noise, dur: 0.02, peak: 0.15, delay: 0.3, lowpass: 800),
            ]
        case .peach: // a juicy plop
            return [
                Part(wave: .sine, f0: 720, f1: 170, dur: 0.14, peak: 0.6),
                Part(wave: .noise, dur: 0.08, peak: 0.3, delay: 0.02, lowpass: 1600),
                Part(wave: .sine, f0: 900, f1: 1300, dur: 0.07, peak: 0.15, delay: 0.12),
            ]
        case .cat: // "mrrr-ow"
            return [
                Part(wave: .tri, f0: 330, f1: 360, dur: 0.12, peak: 0.25, attack: 0.02, lowpass: 900, wobRate: 30, wobDepth: 0.08, wobDecay: 0),
                Part(wave: .tri, f0: 440, f1: 680, dur: 0.16, peak: 0.45, delay: 0.1, attack: 0.02, lowpass: 1700, decay: 0.6),
                Part(wave: .tri, f0: 680, f1: 420, dur: 0.26, peak: 0.45, delay: 0.24, lowpass: 1500, wobRate: 6, wobDepth: 0.03, decay: 0.45),
            ]
        case .dragon: // a little roar with a puff of fire
            return [
                Part(wave: .saw, f0: 170, f1: 95, dur: 0.42, peak: 0.45, attack: 0.02, lowpass: 900, wobRate: 24, wobDepth: 0.2, wobDecay: 0.5, decay: 0.45),
                Part(wave: .noise, dur: 0.4, peak: 0.35, delay: 0.08, attack: 0.05, lowpass: 1500, decay: 0.4),
            ]
        case .gummy: // stretchy rubber: "boy-oy-oying"
            return [
                Part(wave: .sine, f0: 170, f1: 380, dur: 0.55, peak: 0.55, wobRate: 9, wobDepth: 0.4, wobDecay: 1, decay: 0.45),
                Part(wave: .tri, f0: 340, f1: 760, dur: 0.4, peak: 0.12, lowpass: 1400, wobRate: 9, wobDepth: 0.4, wobDecay: 1),
            ]
        case .penguin: // "wenk wenk"
            return [
                Part(wave: .saw, f0: 520, f1: 470, dur: 0.1, peak: 0.35, lowpass: 1300, decay: 0.5),
                Part(wave: .sine, f0: 260, f1: 235, dur: 0.1, peak: 0.2, decay: 0.5),
                Part(wave: .saw, f0: 540, f1: 450, dur: 0.13, peak: 0.35, delay: 0.14, lowpass: 1300, decay: 0.5),
                Part(wave: .sine, f0: 270, f1: 225, dur: 0.13, peak: 0.2, delay: 0.14, decay: 0.5),
            ]
        case .octo: // blub-blub-blub, bubbles rising
            return [
                Part(wave: .sine, f0: 280, f1: 620, dur: 0.06, peak: 0.45),
                Part(wave: .sine, f0: 340, f1: 760, dur: 0.06, peak: 0.42, delay: 0.07),
                Part(wave: .sine, f0: 260, f1: 580, dur: 0.06, peak: 0.4, delay: 0.13),
                Part(wave: .sine, f0: 420, f1: 940, dur: 0.07, peak: 0.4, delay: 0.21),
                Part(wave: .noise, dur: 0.3, peak: 0.1, lowpass: 500, decay: 0.5),
            ]
        case .panda: // a red panda's squeaky chirp
            return [
                Part(wave: .sine, f0: 900, f1: 1400, dur: 0.06, peak: 0.4),
                Part(wave: .sine, f0: 1000, f1: 1600, dur: 0.07, peak: 0.4, delay: 0.08),
                Part(wave: .sine, f0: 1500, f1: 1100, dur: 0.09, peak: 0.3, delay: 0.17),
            ]
        case .blob: // a deep gloopy "bloop"
            return [
                Part(wave: .sine, f0: 240, f1: 70, dur: 0.32, peak: 0.65, wobRate: 5, wobDepth: 0.2, decay: 0.4),
                Part(wave: .noise, dur: 0.18, peak: 0.25, lowpass: 450),
                Part(wave: .sine, f0: 500, f1: 1000, dur: 0.06, peak: 0.2, delay: 0.26),
            ]
        case .hamster: // squeak-squeak chatter
            return [
                Part(wave: .sine, f0: 1150, f1: 1450, dur: 0.045, peak: 0.32),
                Part(wave: .sine, f0: 1200, f1: 1500, dur: 0.045, peak: 0.3, delay: 0.06),
                Part(wave: .sine, f0: 1100, f1: 1400, dur: 0.045, peak: 0.28, delay: 0.12),
                Part(wave: .sine, f0: 1300, f1: 1650, dur: 0.06, peak: 0.32, delay: 0.18),
            ]
        case .bat: // echolocation: chirps falling away
            return [
                Part(wave: .sine, f0: 1900, f1: 1100, dur: 0.045, peak: 0.35),
                Part(wave: .sine, f0: 1900, f1: 1100, dur: 0.045, peak: 0.22, delay: 0.08),
                Part(wave: .sine, f0: 1900, f1: 1100, dur: 0.045, peak: 0.13, delay: 0.16),
                Part(wave: .sine, f0: 1900, f1: 1100, dur: 0.045, peak: 0.07, delay: 0.24),
            ]
        case .bee: // bzzzz, swerving
            return [
                Part(wave: .saw, f0: 210, f1: 250, dur: 0.45, peak: 0.35, attack: 0.03, lowpass: 1400, wobRate: 32, wobDepth: 0.05, wobDecay: 0, decay: 0.6),
                Part(wave: .saw, f0: 213, f1: 246, dur: 0.45, peak: 0.25, attack: 0.03, lowpass: 1400, wobRate: 5, wobDepth: 0.06, wobDecay: 0, decay: 0.6),
            ]
        case .cloud: // a soft whoosh and a high, airy chime
            return [
                Part(wave: .noise, dur: 0.45, peak: 0.3, attack: 0.1, lowpass: 700, decay: 0.5),
                Part(wave: .sine, f0: 660, f1: 660, dur: 0.6, peak: 0.18, delay: 0.08, attack: 0.02, decay: 0.5),
                Part(wave: .sine, f0: 990, f1: 990, dur: 0.5, peak: 0.1, delay: 0.14, attack: 0.02, decay: 0.5),
            ]
        case .mushroom: // a spore puff with a sparkle
            return [
                Part(wave: .noise, dur: 0.22, peak: 0.35, attack: 0.01, lowpass: 1100),
                Part(wave: .sine, f0: 200, f1: 140, dur: 0.12, peak: 0.35),
                Part(wave: .sine, f0: 1050, f1: 1050, dur: 0.18, peak: 0.12, delay: 0.1, decay: 0.5),
                Part(wave: .sine, f0: 1400, f1: 1400, dur: 0.22, peak: 0.1, delay: 0.17, decay: 0.5),
            ]
        case .sprite: // a magic arpeggio up the scale
            return [
                Part(wave: .sine, f0: 784, f1: 784, dur: 0.3, peak: 0.3, decay: 0.4),
                Part(wave: .sine, f0: 988, f1: 988, dur: 0.3, peak: 0.28, delay: 0.06, decay: 0.4),
                Part(wave: .sine, f0: 1175, f1: 1175, dur: 0.3, peak: 0.26, delay: 0.12, decay: 0.4),
                Part(wave: .sine, f0: 1568, f1: 1568, dur: 0.45, peak: 0.24, delay: 0.18, decay: 0.5),
            ]
        }
    }
}
