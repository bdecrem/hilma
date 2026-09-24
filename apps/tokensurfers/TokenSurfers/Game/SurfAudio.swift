import AVFoundation
import CoreAudio

/// Synthesized game sounds: one AVAudioSourceNode, a handful of voices.
/// Coins are a two-note ping whose pitch climbs with the streak.
final class SurfAudio {
    static let shared = SurfAudio()

    private struct Voice {
        var freq: Double
        var freqEnd: Double
        var dur: Double
        var t: Double = 0
        var gain: Double
        var noise: Double = 0     // 0 = pure tone, 1 = pure noise
        var square = false
    }

    private let engine = AVAudioEngine()
    private var node: AVAudioSourceNode!
    private var voices: [Voice] = []
    private let lock = NSLock()
    private var sampleRate = 44100.0
    private var phase: [Double] = Array(repeating: 0, count: 16)
    private var noiseState: UInt32 = 22222
    private var started = false
    private var coinStep = 0

    var muted: Bool {
        get { UserDefaults.standard.bool(forKey: "muted") }
        set { UserDefaults.standard.set(newValue, forKey: "muted") }
    }

    func start() {
        guard !started else { return }
        started = true
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
        sampleRate = engine.outputNode.outputFormat(forBus: 0).sampleRate
        if sampleRate <= 0 { sampleRate = 44100 }
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        node = AVAudioSourceNode(format: format) { [unowned self] _, _, frameCount, abl in
            let buffers = UnsafeMutableAudioBufferListPointer(abl)
            guard let out = buffers[0].mData?.assumingMemoryBound(to: Float.self) else { return noErr }
            self.render(out, Int(frameCount))
            return noErr
        }
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.55
        try? engine.start()
    }

    func play(_ s: SurfSound) {
        guard !muted else { return }
        if !started { start() }
        var add: [Voice] = []
        switch s {
        case .coin:
            coinStep = (coinStep + 1) % 8
            let base = 1046.5 * pow(2, Double([0, 2, 4, 5, 7, 9, 11, 12][coinStep]) / 12)
            add = [Voice(freq: base, freqEnd: base, dur: 0.06, gain: 0.16, square: true),
                   Voice(freq: base * 1.5, freqEnd: base * 1.5, dur: 0.12, t: -0.05, gain: 0.12, square: true)]
        case .jump: add = [Voice(freq: 300, freqEnd: 900, dur: 0.16, gain: 0.18)]
        case .land: add = [Voice(freq: 120, freqEnd: 60, dur: 0.07, gain: 0.2)]
        case .roll: add = [Voice(freq: 500, freqEnd: 180, dur: 0.14, gain: 0.08, noise: 0.6)]
        case .swipe: add = [Voice(freq: 900, freqEnd: 500, dur: 0.07, gain: 0.05, noise: 0.8)]
        case .crash: add = [Voice(freq: 90, freqEnd: 40, dur: 0.35, gain: 0.45),
                            Voice(freq: 400, freqEnd: 100, dur: 0.3, gain: 0.25, noise: 1)]
        case .stomp: add = [Voice(freq: 700, freqEnd: 200, dur: 0.1, gain: 0.25, square: true)]
        case .celebrate:
            add = [0, 4, 7, 12, 16].enumerated().map { i, st in
                let f = 523.25 * pow(2, Double(st) / 12)
                return Voice(freq: f, freqEnd: f, dur: 0.18, t: -Double(i) * 0.08, gain: 0.14, square: true)
            }
        case .tick: add = [Voice(freq: 2000, freqEnd: 2000, dur: 0.015, gain: 0.05)]
        }
        lock.lock()
        voices.append(contentsOf: add)
        if voices.count > 16 { voices.removeFirst(voices.count - 16) }
        lock.unlock()
    }

    private func render(_ out: UnsafeMutablePointer<Float>, _ n: Int) {
        lock.lock()
        defer { lock.unlock() }
        let dt = 1.0 / sampleRate
        for i in 0..<n { out[i] = 0 }
        for v in voices.indices {
            var voice = voices[v]
            for i in 0..<n {
                voice.t += dt
                guard voice.t >= 0, voice.t < voice.dur else { continue }
                let k = voice.t / voice.dur
                let f = voice.freq * pow(voice.freqEnd / voice.freq, k)
                phase[v] += f * dt
                if phase[v] > 1 { phase[v] -= 1 }
                let tone = voice.square ? (phase[v] < 0.5 ? 1.0 : -1.0) * 0.5 : sin(phase[v] * 2 * .pi)
                noiseState = noiseState &* 1664525 &+ 1013904223
                let noise = Double(Int32(bitPattern: noiseState)) / Double(Int32.max)
                let env = min(1, voice.t / 0.004) * pow(1 - k, 2)
                out[i] += Float((tone * (1 - voice.noise) + noise * voice.noise) * env * voice.gain)
            }
            voices[v] = voice
        }
        voices.removeAll { $0.t >= $0.dur }
    }
}
