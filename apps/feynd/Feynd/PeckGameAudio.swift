import AVFoundation
import AudioToolbox
import CoreAudio
import os

// Peck or Perish, the sound. No audio files: a stompy marimba loop that
// speeds up as the years go by, crunchy pecks, chomps, a foghorn for the
// ship and a sad slide whistle for the end. One AVAudioSourceNode; the
// sequencer runs inside the render callback so the beat never drifts.
final class PeckGameAudio {
    static let shared = PeckGameAudio()

    enum Wave { case sine, triangle, square, saw, noise }
    enum FilterKind { case none, lowpass, bandpass, highpass }

    struct Voice {
        var wave: Wave
        var f0: Double
        var f1: Double
        var sweep: Double        // seconds for f0 → f1
        var attack: Double
        var hold: Double = 0
        var decay: Double
        var peak: Double
        var delay: Double = 0    // seconds before it starts
        var music = false
        var filter: FilterKind = .none
        var cutoff: Double = 1000
        var q: Double = 1
        var vibRate: Double = 0
        var vibDepth: Double = 0
        // render state
        var t: Double = 0
        var phase: Double = 0
        var lp: Double = 0
        var bp: Double = 0
        var noiseState: UInt32 = 0x9E37_79B9
    }

    private let engine = AVAudioEngine()
    private var node: AVAudioSourceNode?
    private var sampleRate: Double = 44_100
    private var lock = os_unfair_lock_s()
    private var pending: [Voice] = []
    private var musicOn = false
    private var bpm = 112.0
    private var master = 0.8
    // Render-thread only.
    private var voices: [Voice] = []
    private var stepLeft: Double = 0
    private var step = 0

    private let disabled: Bool = {
        #if targetEnvironment(simulator)
        return UserDefaults.standard.bool(forKey: "NoSFX")
        #else
        return false
        #endif
    }()

    var muted: Bool {
        get { UserDefaults.standard.bool(forKey: "peckGameMuted") }
        set {
            UserDefaults.standard.set(newValue, forKey: "peckGameMuted")
            os_unfair_lock_lock(&lock); master = newValue ? 0 : 0.8; os_unfair_lock_unlock(&lock)
        }
    }

    private init() {
        master = UserDefaults.standard.bool(forKey: "peckGameMuted") ? 0 : 0.8
    }

    func start() {
        guard !disabled else { return }
        // Ambient: respects the silent switch and mixes with other audio. A
        // live voice session owns .playAndRecord; never switch it out from
        // under it (same rule as FlashSFX).
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord {
            try? session.setCategory(.ambient, options: [.mixWithOthers])
        }
        try? session.setActive(true)
        if node == nil {
            let sr = session.sampleRate > 0 ? session.sampleRate : 44_100
            sampleRate = sr
            let format = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 1)!
            let n = AVAudioSourceNode(format: format) { [unowned self] _, _, frameCount, abl -> OSStatus in
                let buffers = UnsafeMutableAudioBufferListPointer(abl)
                guard let raw = buffers[0].mData else { return noErr }
                self.render(raw.assumingMemoryBound(to: Float.self), Int(frameCount))
                return noErr
            }
            engine.attach(n)
            engine.connect(n, to: engine.mainMixerNode, format: format)
            node = n
        }
        if !engine.isRunning { try? engine.start() }
    }

    func stop() {
        setMusic(false, bpm: 112)
        if engine.isRunning { engine.pause() }
        os_unfair_lock_lock(&lock); pending.removeAll(); os_unfair_lock_unlock(&lock)
    }

    func setMusic(_ on: Bool, bpm: Double) {
        os_unfair_lock_lock(&lock)
        if on && !musicOn { stepLeft = 0; step = 0 }
        musicOn = on
        self.bpm = bpm
        os_unfair_lock_unlock(&lock)
    }

    // MARK: sounds

    private static func mtof(_ m: Double) -> Double { 440 * pow(2, (m - 69) / 12) }

    private func marimba(_ m: Double, _ v: Double, delay: Double = 0, music: Bool = false) -> [Voice] {
        let f = Self.mtof(m)
        return [
            Voice(wave: .sine, f0: f, f1: f, sweep: 1, attack: 0.003, decay: 0.32, peak: v, delay: delay, music: music),
            Voice(wave: .sine, f0: f * 3.98, f1: f * 3.98, sweep: 1, attack: 0.001, decay: 0.06, peak: v * 0.22, delay: delay, music: music),
        ]
    }
    private func tone(_ w: Wave, _ f0: Double, _ f1: Double, _ dur: Double, _ peak: Double, delay: Double = 0,
                      attack: Double = 0.004, lowpass: Double? = nil) -> Voice {
        var v = Voice(wave: w, f0: f0, f1: f1, sweep: dur, attack: attack, decay: dur, peak: peak, delay: delay)
        if let lowpass { v.filter = .lowpass; v.cutoff = lowpass; v.q = 0.8 }
        return v
    }
    private func noise(_ dur: Double, _ peak: Double, _ kind: FilterKind, _ freq: Double, q: Double = 1, delay: Double = 0, music: Bool = false) -> Voice {
        Voice(wave: .noise, f0: 0, f1: 0, sweep: 1, attack: 0.002, decay: dur, peak: peak, delay: delay, music: music,
              filter: kind, cutoff: freq, q: q, noiseState: UInt32.random(in: 1...UInt32.max))
    }

    func play(_ s: PGSound) {
        guard !disabled else { return }
        var v: [Voice] = []
        switch s {
        case .start:
            for (i, m) in [62.0, 66, 69, 74].enumerated() { v += marimba(m + 12, 0.3, delay: Double(i) * 0.07) }
        case .peck(let c):
            let k = Double(min(c, 8))
            v = [noise(0.045, 0.8, .bandpass, 1700 + k * 170, q: 1.3), tone(.triangle, 1100 + k * 90, 240, 0.05, 0.45)]
        case .thud:
            v = [tone(.sine, 170, 70, 0.08, 0.35), noise(0.05, 0.2, .lowpass, 500, q: 0.7)]
        case .chomp:
            v = [noise(0.09, 0.6, .lowpass, 1300), tone(.square, 150, 60, 0.1, 0.12),
                 noise(0.08, 0.5, .lowpass, 1100, delay: 0.11), tone(.square, 130, 55, 0.09, 0.1, delay: 0.11)]
        case .oink:
            v = [tone(.saw, 320, 210, 0.08, 0.3, lowpass: 700), tone(.saw, 260, 170, 0.1, 0.3, delay: 0.09, lowpass: 700)]
        case .squeak:
            v = [tone(.sine, 1500, 2300, 0.07, 0.25), tone(.sine, 2100, 800, 0.14, 0.22, delay: 0.08)]
        case .horn:
            v = [tone(.saw, 73, 71, 1.2, 0.5, attack: 0.12, lowpass: 700), tone(.saw, 110, 108, 1.2, 0.35, attack: 0.12, lowpass: 700)]
        case .boom:
            v = [noise(0.4, 0.8, .lowpass, 280, q: 0.7), tone(.sine, 95, 30, 0.4, 0.8)]
        case .burst:
            v = [noise(0.14, 0.55, .bandpass, 900, q: 0.8), tone(.square, 210, 90, 0.07, 0.1)]
        case .crack:
            v = [noise(0.08, 0.8, .highpass, 2500, q: 0.7), noise(0.2, 0.5, .bandpass, 700, delay: 0.05)]
        case .fanfare:
            for (i, m) in [74.0, 78, 81, 86, 86].enumerated() { v += marimba(m, 0.35, delay: Double(i) * 0.09) }
        case .whistle:
            var w = Voice(wave: .sine, f0: 1500, f1: 240, sweep: 1.4, attack: 0.05, hold: 1.05, decay: 0.4, peak: 0.32)
            w.vibRate = 7; w.vibDepth = 22
            v = [w]
        }
        os_unfair_lock_lock(&lock)
        pending += v
        os_unfair_lock_unlock(&lock)
    }

    // MARK: render

    private static let lead: [Double] = [74, 0, 69, 72, 74, 0, 77, 74, 72, 0, 69, 0, 67, 69, 72, 0]
    private static let lead2: [Double] = [77, 0, 74, 72, 74, 0, 69, 72, 74, 0, 77, 79, 77, 74, 72, 0]
    private static let bass: [Double] = [50, 0, 0, 0, 0, 0, 45, 0, 48, 0, 0, 0, 43, 0, 45, 0]

    private func musicStep(_ s: Int) {
        let i = s % 16, bar = (s / 16) % 4
        let l = (bar == 3 ? Self.lead2 : Self.lead)[i]
        if l > 0 { voices += marimba(l, 0.2, music: true) }
        if Self.bass[i] > 0 { voices += marimba(Self.bass[i], 0.45, music: true) }
        if i % 4 == 0 {
            var k = Voice(wave: .sine, f0: 150, f1: 42, sweep: 0.22, attack: 0.002, decay: 0.22, peak: 0.9, music: true)
            k.t = 0
            voices.append(k)
            voices.append(noise(0.03, 0.25, .lowpass, 900, q: 0.7, music: true))
        }
        if i % 8 == 4 { voices.append(noise(0.07, 0.35, .bandpass, 1500, q: 0.9, music: true)) }
        if i % 2 == 1 { voices.append(noise(0.025, 0.07, .highpass, 6000, q: 0.7, music: true)) }
    }

    private func render(_ out: UnsafeMutablePointer<Float>, _ frames: Int) {
        os_unfair_lock_lock(&lock)
        if !pending.isEmpty { voices += pending; pending.removeAll(keepingCapacity: true) }
        let on = musicOn, tempo = bpm, gain = master
        os_unfair_lock_unlock(&lock)
        let sr = sampleRate
        let dt = 1 / sr
        let stepLen = 60 / tempo / 2 * sr
        for f in 0..<frames {
            if on {
                stepLeft -= 1
                if stepLeft <= 0 { musicStep(step); step += 1; stepLeft += stepLen }
            }
            var mix = 0.0
            var i = 0
            while i < voices.count {
                if voices[i].delay > 0 { voices[i].delay -= dt; i += 1; continue }
                let s = sample(&voices[i], dt)
                mix += voices[i].music ? s * 0.34 : s * 0.7
                i += 1
            }
            out[f] = Float(tanh(mix * gain))
        }
        voices.removeAll { $0.delay <= 0 && $0.t > $0.attack + $0.hold + $0.decay + 0.01 }
    }

    @inline(__always) private func sample(_ v: inout Voice, _ dt: Double) -> Double {
        let t = v.t
        v.t += dt
        // Envelope: exponential attack, hold, exponential decay.
        let env: Double
        if t < v.attack {
            env = 0.0001 * pow(v.peak / 0.0001, t / v.attack)
        } else if t < v.attack + v.hold {
            env = v.peak
        } else {
            let u = min(1, (t - v.attack - v.hold) / v.decay)
            env = v.peak * pow(0.0001 / v.peak, u)
        }
        var x: Double
        if v.wave == .noise {
            v.noiseState ^= v.noiseState << 13
            v.noiseState ^= v.noiseState >> 17
            v.noiseState ^= v.noiseState << 5
            x = Double(v.noiseState) / Double(UInt32.max) * 2 - 1
        } else {
            let u = min(1, t / v.sweep)
            var f = v.f0 * pow(v.f1 / v.f0, u)
            if v.vibDepth > 0 { f += sin(t * v.vibRate * 2 * .pi) * v.vibDepth }
            v.phase += f * dt
            v.phase -= floor(v.phase)
            let p = v.phase
            switch v.wave {
            case .sine: x = sin(p * 2 * .pi)
            case .triangle: x = 4 * abs(p - 0.5) - 1
            case .square: x = p < 0.5 ? 1 : -1
            case .saw: x = 2 * p - 1
            case .noise: x = 0
            }
        }
        if v.filter != .none {
            // Chamberlin state-variable filter.
            let fc = min(0.45, v.cutoff / sampleRate)
            let k = 2 * sin(.pi * fc)
            let damp = 1 / max(0.5, v.q)
            v.lp += k * v.bp
            let hp = x - v.lp - damp * v.bp
            v.bp += k * hp
            switch v.filter {
            case .lowpass: x = v.lp
            case .bandpass: x = v.bp
            case .highpass: x = hp
            case .none: break
            }
        }
        return x * env
    }
}
