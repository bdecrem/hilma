import AVFoundation

/// Deep Dive's sound: a lagoon pad looping under the dive (its lowpass
/// closes with depth) and jelly one-shots on four rotating players, so a
/// run of pearls overlaps instead of cutting itself off. Buffers come from
/// JellySynth, the renderer behind the map's jelly sounds (FlashSFX.swift).
/// Ambient session, like FlashSFX: silent-switch aware, never switches a
/// live `.playAndRecord` out from under a voice session.
final class DeepDiveAudio {
    static let shared = DeepDiveAudio()

    private let engine = AVAudioEngine()
    private let pad = AVAudioPlayerNode()
    private let padEQ = AVAudioUnitEQ(numberOfBands: 1)
    private let shots = (0..<4).map { _ in AVAudioPlayerNode() }
    private var next = 0
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    private var buffers: [DDSound: AVAudioPCMBuffer] = [:]
    private var padBuffer: AVAudioPCMBuffer?

    /// `-NoSFX 1` (simulator only): never touch the audio engine — see FlashSFX.
    let muted: Bool = {
        #if targetEnvironment(simulator)
        return UserDefaults.standard.bool(forKey: "NoSFX")
        #else
        return false
        #endif
    }()

    private init() {
        guard !muted else { return }
        engine.attach(pad)
        engine.attach(padEQ)
        let band = padEQ.bands[0]
        band.filterType = .lowPass
        band.frequency = 320
        band.bandwidth = 0.8
        band.bypass = false
        engine.connect(pad, to: padEQ, format: format)
        engine.connect(padEQ, to: engine.mainMixerNode, format: format)
        for s in shots {
            engine.attach(s)
            engine.connect(s, to: engine.mainMixerNode, format: format)
        }
        engine.mainMixerNode.outputVolume = 0.7
        pad.volume = 0.16
        build()
    }

    // MARK: the sounds

    private typealias Part = JellySynth.Part
    private static let penta: [Double] = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7]

    private func build() {
        let sr = format.sampleRate
        for n in 0..<Self.penta.count {
            let f = Self.penta[n]
            buffers[.pearl(n)] = JellySynth.render([
                Part(wave: .sine, f0: f, f1: f * 1.003, dur: 0.55, peak: 0.36),
                Part(wave: .sine, f0: f * 2, f1: f * 2, dur: 0.25, peak: 0.09),
                Part(wave: .noise, dur: 0.04, peak: 0.12, lowpass: 2500),
            ], sampleRate: sr)
        }
        buffers[.bump] = JellySynth.render([
            Part(wave: .sine, f0: 345, f1: 180, dur: 0.14, peak: 0.36),
            Part(wave: .noise, dur: 0.05, peak: 0.2, lowpass: 900),
        ], sampleRate: sr)
        buffers[.pop] = JellySynth.render([
            Part(wave: .noise, dur: 0.03, peak: 0.2, lowpass: 1600),
            Part(wave: .sine, f0: 640, f1: 470, dur: 0.05, peak: 0.12),
        ], sampleRate: sr)
        buffers[.air] = JellySynth.render([
            Part(wave: .sine, f0: 392, f1: 396, dur: 0.4, peak: 0.27),
            Part(wave: .sine, f0: 523.25, f1: 528, dur: 0.4, peak: 0.27, delay: 0.07),
            Part(wave: .sine, f0: 659.25, f1: 666, dur: 0.4, peak: 0.27, delay: 0.14),
            Part(wave: .sine, f0: 783.99, f1: 792, dur: 0.4, peak: 0.27, delay: 0.21),
            Part(wave: .noise, dur: 0.5, peak: 0.2, lowpass: 2200),
        ], sampleRate: sr)
        buffers[.sting] = JellySynth.render([
            Part(wave: .tri, f0: 190, f1: 120, dur: 0.35, peak: 0.45),
            Part(wave: .sine, f0: 260, f1: 150, dur: 0.3, peak: 0.18),
            Part(wave: .noise, dur: 0.12, peak: 0.3, lowpass: 400),
        ], sampleRate: sr)
        buffers[.warn] = JellySynth.render([Part(wave: .sine, f0: 220, f1: 200, dur: 0.12, peak: 0.18)], sampleRate: sr)
        buffers[.exhale] = JellySynth.render([Part(wave: .noise, dur: 0.08, peak: 0.08, lowpass: 2000)], sampleRate: sr)
        buffers[.surface] = JellySynth.render([
            Part(wave: .noise, dur: 1.2, peak: 0.4, lowpass: 3000),
            Part(wave: .sine, f0: 523.25, f1: 523.25, dur: 1.1, peak: 0.24, delay: 0.7, attack: 0.01),
            Part(wave: .sine, f0: 659.25, f1: 659.25, dur: 1.1, peak: 0.24, delay: 0.82, attack: 0.01),
            Part(wave: .sine, f0: 783.99, f1: 783.99, dur: 1.1, peak: 0.24, delay: 0.94, attack: 0.01),
        ], sampleRate: sr)
        buffers[.start] = JellySynth.render([
            Part(wave: .sine, f0: 420, f1: 520, dur: 0.1, peak: 0.3, wobRate: 10, wobDepth: 0.1),
            Part(wave: .sine, f0: 560, f1: 680, dur: 0.1, peak: 0.3, delay: 0.1, wobRate: 10, wobDepth: 0.1),
            Part(wave: .sine, f0: 760, f1: 900, dur: 0.16, peak: 0.3, delay: 0.2, wobRate: 10, wobDepth: 0.1),
            Part(wave: .noise, dur: 0.3, peak: 0.12, lowpass: 1800),
        ], sampleRate: sr)
        padBuffer = renderPad(seconds: 6, sampleRate: sr)
    }

    /// The lagoon pad: two detuned triangles an octave and a fifth apart,
    /// two quiet sines above, each breathing on its own slow LFO whose period
    /// divides the loop so the seam is silent. The EQ band lowpasses it.
    private func renderPad(seconds: Double, sampleRate sr: Double) -> AVAudioPCMBuffer? {
        let frames = AVAudioFrameCount(seconds * sr)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        buffer.frameLength = frames
        guard let out = buffer.floatChannelData?[0] else { return nil }
        let cent = pow(2.0, 1.0 / 1200.0)
        // (frequency, triangle?, gain, LFO period s, LFO phase)
        let voices: [(Double, Bool, Double, Double, Double)] = [
            (41.2 * pow(cent, -6), true, 0.5, 6, 0), (61.7 * pow(cent, 7), true, 0.5, 3, 1.3),
            (123.5 * pow(cent, -6), false, 0.18, 6, 2.1), (185 * pow(cent, 7), false, 0.18, 3, 0.7),
        ]
        var peak = 0.0
        let n = Int(frames)
        for i in 0..<n {
            let t = Double(i) / sr
            var s = 0.0
            for v in voices {
                let ph = 2 * Double.pi * v.0 * t
                let w = v.1 ? 2 / Double.pi * asin(sin(ph)) : sin(ph)
                let lfo = 1 + 0.5 * sin(2 * Double.pi * t / v.3 + v.4)
                s += w * v.2 * lfo
            }
            out[i] = Float(s)
            peak = max(peak, abs(s))
        }
        let norm = Float(peak > 0 ? 0.6 / peak : 1)
        for i in 0..<n { out[i] *= norm }
        return buffer
    }

    // MARK: playing

    private func ensureRunning() -> Bool {
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord {
            try? session.setCategory(.ambient, options: [.mixWithOthers])
        }
        try? session.setActive(true)
        if !engine.isRunning { try? engine.start() }
        return engine.isRunning
    }

    /// Start the pad (call when the game screen appears).
    func start() {
        guard !muted, let padBuffer, ensureRunning() else { return }
        pad.stop()
        pad.scheduleBuffer(padBuffer, at: nil, options: .loops)
        pad.play()
    }

    func stop() {
        guard !muted else { return }
        pad.stop()
        for s in shots { s.stop() }
        engine.stop()
    }

    /// 0 at the surface … 1 at 70 m: the pad's lowpass closes 320 → 130 Hz.
    func setDepth(_ k: Double) {
        guard !muted else { return }
        padEQ.bands[0].frequency = Float(320 - 190 * max(0, min(1, k)))
    }

    func play(_ s: DDSound) {
        guard !muted, let buffer = buffers[s], ensureRunning() else { return }
        let node = shots[next]
        next = (next + 1) % shots.count
        node.stop()
        node.scheduleBuffer(buffer, at: nil, options: .interrupts)
        node.play()
    }
}
