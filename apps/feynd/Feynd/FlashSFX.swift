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
    }

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format: AVAudioFormat
    private var buffers: [Effect: AVAudioPCMBuffer] = [:]

    private init() {
        format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.6

        // Note frequencies (Hz): C5 523, E5 659, G5 784, C6 1047, E6 1319.
        buffers[.tap] = tone([(659, 0.055)])
        buffers[.start] = tone([(523, 0.07), (659, 0.07), (784, 0.10)])
        buffers[.correct] = tone([(784, 0.07), (1319, 0.12)])
        buffers[.wrong] = tone([(196, 0.18)], wave: .buzz)
        buffers[.advance] = tone([(880, 0.04)])
        buffers[.fanfare] = tone([(523, 0.09), (659, 0.09), (784, 0.09), (1047, 0.22)])
        buffers[.done] = tone([(659, 0.09), (523, 0.16)])
        buffers[.ding] = tone([(1047, 0.06), (1319, 0.14)])
    }

    func play(_ effect: Effect) {
        guard let buffer = buffers[effect] else { return }
        // Ambient: silent-switch aware, never interrupts other audio. Re-set
        // each time — a voice session may have claimed .playAndRecord since.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
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
