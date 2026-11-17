# The same sounds in a SwiftUI app

Use the kit's design, not system beeps: the felt voice (a sine with one quiet partial at 3.9 times
the pitch that dies first, a 6 ms attack, an exponential decay), D major, peaks near -18 dBFS. Use
the `.ambient` audio session so the app respects the silent switch and mixes with the person's music,
and keep a Sound setting (on by default only when the app is about sound; respect Reduce Motion).

```swift
import AVFoundation

/// Ola's interface sounds for an app: one engine, made once, played from taps only.
final class OlaSound {
    static let shared = OlaSound()
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    var isOn = UserDefaults.standard.object(forKey: "ola-sound-on") as? Bool ?? !UIAccessibility.isReduceMotionEnabled {
        didSet { UserDefaults.standard.set(isOn, forKey: "ola-sound-on") }
    }

    private init() {
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.5          // interface sounds sit 6 dB under music
    }

    /// The felt voice: notes as (semitones from D5, start in seconds, decay in seconds).
    private func render(_ notes: [(Double, Double, Double)], amp: Float = 0.2) -> AVAudioPCMBuffer {
        let sr = format.sampleRate
        let length = (notes.map { $0.1 + $0.2 }.max() ?? 0.5) + 0.05
        let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(length * sr))!
        buf.frameLength = buf.frameCapacity
        let out = buf.floatChannelData![0]
        for (semi, start, decay) in notes {
            let f = 587.33 * pow(2, semi / 12)
            let s0 = Int(start * sr)
            for i in 0..<Int(decay * sr) where s0 + i < Int(buf.frameLength) {
                let t = Double(i) / sr
                let attack = min(1, t / 0.006)
                let env = attack * exp(-t * 6.9 / decay)            // down 60 dB at `decay`
                let partial = 0.12 * exp(-t * 6.9 / min(0.12, decay * 0.4)) * sin(2 * .pi * f * 3.9 * t)
                out[s0 + i] += amp * Float(env * (sin(2 * .pi * f * t) + partial))
            }
        }
        return buf
    }

    enum Sound { case tap, notify, success, error, celebrate }

    func play(_ s: Sound) {
        guard isOn else { return }
        if !engine.isRunning { try? engine.start() }
        let notes: [(Double, Double, Double)]
        switch s {
        case .tap: notes = [(7, 0, 0.07)]                                   // A5, very short
        case .notify: notes = [(0, 0, 0.6), (7, 0.11, 0.8)]                  // D5 then A5
        case .success: notes = [(0, 0, 0.5), (4, 0.07, 0.5), (7, 0.14, 0.9)] // D F# A
        case .error: notes = [(-5, 0, 0.35), (-8, 0.12, 0.5)]                // A4 then F#4, low and soft
        case .celebrate: notes = [(0, 0, 0.5), (4, 0.075, 0.5), (7, 0.15, 0.5), (12, 0.225, 1.3)]
        }
        player.scheduleBuffer(render(notes), at: nil, options: [], completionHandler: nil)
        player.play()
    }
}
```

In SwiftUI: `Button("Save") { save(); OlaSound.shared.play(.success) }`, and a `Toggle("Sound", isOn: ...)`
in Settings bound to `OlaSound.shared.isOn`. To check the levels, write the same buffer to a .wav
(`AVAudioFile`) from a test and run the numbers in `levels.md` on it.
