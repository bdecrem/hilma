import AVFoundation

/// Tiny chiptune synth for the Flash game — square-ish blips generated in
/// code (no audio assets). Plays through .ambient so it respects the silent
/// switch and mixes with any music.
@MainActor
final class FlashSFX {
    static let shared = FlashSFX()

    enum Effect {
        case tap        // node / button select
        case start      // level launch arpeggio
        case correct    // coin: two rising notes
        case wrong      // low buzz
        case advance    // soft tick to the next card
        case fanfare    // perfect round / star earned
        case done       // round complete, non-perfect
        case ding       // toast notification
        // Jelly sounds (2026-10-02) — soft, wobbly, bubbly, for the mascot
        // and the Peck map, where the chip blips fought the jelly look.
        case boing      // the dodo, tapped: a wobbly jelly bounce
        case pop        // a stone, a sign, a bubble: one soft bubble pop
        case squish     // a critter poked: a wet little squash
        case chest      // a chest opening: three rising pops and a soft chime
        case splash     // the launch landing: a plop with a thump
        case hop        // a happy hop: a small rising boing
        case nope       // locked: two low jelly wobbles
    }

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format: AVAudioFormat
    private var buffers: [Effect: AVAudioPCMBuffer] = [:]

    /// `-NoSFX 1` (simulator only): never touch the audio engine. The
    /// simulator's audio server can time out its RPC the first time the
    /// engine's output node is created and abort the whole process — fatal
    /// for the headless screenshot runs in scripts/dodo-scenes.
    private let muted: Bool = {
        #if targetEnvironment(simulator)
        return UserDefaults.standard.bool(forKey: "NoSFX")
        #else
        return false
        #endif
    }()

    private init() {
        format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
        if !muted {
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            engine.mainMixerNode.outputVolume = 0.6
        }

        // Note frequencies (Hz): C5 523, E5 659, G5 784, C6 1047, E6 1319.
        buffers[.tap] = tone([(659, 0.055)])
        buffers[.start] = tone([(523, 0.07), (659, 0.07), (784, 0.10)])
        buffers[.correct] = tone([(784, 0.07), (1319, 0.12)])
        buffers[.wrong] = tone([(196, 0.18)], wave: .buzz)
        buffers[.advance] = tone([(880, 0.04)])
        buffers[.fanfare] = tone([(523, 0.09), (659, 0.09), (784, 0.09), (1047, 0.22)])
        buffers[.done] = tone([(659, 0.09), (523, 0.16)])
        buffers[.ding] = tone([(1047, 0.06), (1319, 0.14)])

        // The jelly set: sines and triangles with pitch bends and a decaying
        // wobble, filtered noise for the wet part. Nothing above ~2 kHz.
        buffers[.boing] = jelly([
            Part(wave: .sine, f0: 330, f1: 250, dur: 0.26, peak: 0.55, wobRate: 12, wobDepth: 0.18),
            Part(wave: .sine, f0: 660, f1: 500, dur: 0.12, peak: 0.12, wobRate: 12, wobDepth: 0.18),
        ])
        buffers[.pop] = jelly([
            Part(wave: .sine, f0: 820, f1: 420, dur: 0.07, peak: 0.5),
            Part(wave: .noise, dur: 0.03, peak: 0.25, lowpass: 2600),
        ])
        buffers[.squish] = jelly([
            Part(wave: .tri, f0: 240, f1: 110, dur: 0.14, peak: 0.45, lowpass: 1200),
            Part(wave: .noise, dur: 0.09, peak: 0.3, lowpass: 900),
        ])
        buffers[.chest] = jelly([
            Part(wave: .sine, f0: 520, f1: 420, dur: 0.08, peak: 0.4),
            Part(wave: .sine, f0: 660, f1: 540, dur: 0.08, peak: 0.4, delay: 0.09),
            Part(wave: .sine, f0: 880, f1: 720, dur: 0.10, peak: 0.4, delay: 0.18),
            Part(wave: .sine, f0: 1320, f1: 1320, dur: 0.60, peak: 0.22, delay: 0.30, attack: 0.01),
            Part(wave: .sine, f0: 1980, f1: 1980, dur: 0.45, peak: 0.08, delay: 0.30, attack: 0.01),
        ])
        buffers[.splash] = jelly([
            Part(wave: .sine, f0: 150, f1: 60, dur: 0.22, peak: 0.6),
            Part(wave: .noise, dur: 0.30, peak: 0.35, lowpass: 1400),
            Part(wave: .sine, f0: 520, f1: 380, dur: 0.20, peak: 0.2, delay: 0.05, wobRate: 10, wobDepth: 0.2),
        ])
        buffers[.hop] = jelly([
            Part(wave: .sine, f0: 300, f1: 560, dur: 0.16, peak: 0.4, wobRate: 9, wobDepth: 0.08),
            Part(wave: .sine, f0: 560, f1: 480, dur: 0.14, peak: 0.3, delay: 0.17, wobRate: 12, wobDepth: 0.15),
        ])
        buffers[.nope] = jelly([
            Part(wave: .tri, f0: 180, f1: 150, dur: 0.12, peak: 0.4, lowpass: 900, wobRate: 14, wobDepth: 0.1),
            Part(wave: .tri, f0: 160, f1: 130, dur: 0.14, peak: 0.4, delay: 0.14, lowpass: 900, wobRate: 14, wobDepth: 0.1),
        ])
    }

    // MARK: - Jelly synthesis

    private enum JellyWave { case sine, tri, noise }

    /// One voice of a jelly sound: an exponential pitch sweep f0 → f1 over
    /// `dur`, an optional decaying pitch wobble, a one-pole lowpass, and a
    /// fast-attack / exponential-decay envelope that reaches zero at the end.
    private struct Part {
        var wave: JellyWave = .sine
        var f0: Double = 1
        var f1: Double = 1
        var dur: Double
        var peak: Double
        var delay: Double = 0
        var attack: Double = 0.004
        var lowpass: Double = 0      // Hz; 0 = off
        var wobRate: Double = 0      // Hz
        var wobDepth: Double = 0     // fraction of the pitch
    }

    /// Render the parts into one buffer (summed, soft-clipped).
    private func jelly(_ parts: [Part]) -> AVAudioPCMBuffer? {
        let sr = format.sampleRate
        let total = parts.reduce(0.0) { max($0, $1.delay + $1.dur) } + 0.02
        let frames = AVAudioFrameCount(total * sr)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        buffer.frameLength = frames
        guard let out = buffer.floatChannelData?[0] else { return nil }
        let count = Int(frames)
        for i in 0..<count { out[i] = 0 }
        var rng: UInt32 = 0x9E37_79B9
        for p in parts {
            let start = Int(p.delay * sr)
            let n = Int(p.dur * sr)
            var phase = 0.0
            var lp = 0.0
            let lpk = p.lowpass > 0 ? 1 - exp(-2 * .pi * p.lowpass / sr) : 1
            for i in 0..<n {
                let idx = start + i
                if idx >= count { break }
                let t = Double(i) / sr
                let u = t / p.dur
                var f = p.f0 * pow(p.f1 / p.f0, u)
                if p.wobRate > 0 { f *= 1 + p.wobDepth * exp(-3 * u) * sin(2 * .pi * p.wobRate * t) }
                phase += 2 * .pi * f / sr
                var s: Double
                switch p.wave {
                case .sine: s = sin(phase)
                case .tri: s = 2 / .pi * asin(sin(phase))
                case .noise:
                    rng = rng &* 1_664_525 &+ 1_013_904_223
                    s = Double(Int32(bitPattern: rng)) / Double(Int32.max)
                }
                if p.lowpass > 0 { lp += lpk * (s - lp); s = lp }
                let env = min(1, t / p.attack) * exp(-t / (p.dur * 0.3)) * (1 - u * u)
                out[idx] += Float(s * env * p.peak)
            }
        }
        for i in 0..<count { out[i] = Float(tanh(Double(out[i]) * 1.2)) * 0.65 }
        return buffer
    }

    func play(_ effect: Effect) {
        guard !muted, let buffer = buffers[effect] else { return }
        // Ambient: silent-switch aware, never interrupts other audio. But a
        // voice session owns `.playAndRecord` while its engine is up (LiveKit
        // keeps it warm after a conversation ends): switching the category out
        // from under it breaks that engine and the next voice session fails
        // to start (2026-09-22). Play through whatever it set instead.
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord {
            try? session.setCategory(.ambient, options: [.mixWithOthers])
        }
        try? session.setActive(true)
        if !engine.isRunning {
            try? engine.start()
        }
        guard engine.isRunning else { return }
        player.stop()
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
        player.play()
    }

    // MARK: - Synthesis

    private enum Wave { case chip, buzz }

    /// Render a sequence of notes into one PCM buffer. "chip" is a rounded
    /// square wave (sine + clipped sine) with a fast decay — the NES-adjacent
    /// timbre. "buzz" is a sawtooth-ish rumble for misses.
    private func tone(_ notes: [(freq: Double, dur: Double)], wave: Wave = .chip) -> AVAudioPCMBuffer? {
        let sr = format.sampleRate
        let totalFrames = AVAudioFrameCount(notes.reduce(0) { $0 + $1.dur } * sr) + 1
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: totalFrames) else {
            return nil
        }
        buffer.frameLength = totalFrames
        guard let samples = buffer.floatChannelData?[0] else { return nil }

        var frame = 0
        for note in notes {
            let frames = Int(note.dur * sr)
            for i in 0..<frames where frame < Int(totalFrames) {
                let t = Double(i) / sr
                let phase = 2.0 * .pi * note.freq * t
                let raw: Double
                switch wave {
                case .chip:
                    // Sine pushed toward square: softer than a pure square,
                    // still reads as "video game".
                    raw = max(-1, min(1, sin(phase) * 2.2))
                case .buzz:
                    let saw = 2.0 * (note.freq * t - (note.freq * t).rounded(.down)) - 1.0
                    raw = saw * 0.8
                }
                // Per-note envelope: 5ms attack, exponential decay.
                let attack = min(1.0, t / 0.005)
                let decay = exp(-t / (note.dur * 0.55))
                samples[frame] = Float(raw * attack * decay * 0.22)
                frame += 1
            }
        }
        return buffer
    }
}
