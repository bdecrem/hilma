import Foundation

/// Which mix bus a voice renders into.
enum MixBus {
    /// Straight to the master (with pan).
    case dry
    /// The sidechain bus: drone/chords/delay-return, ducked by every kick.
    case duck
}

/// One synthesized voice. Voices render additively into the engine's mix on
/// the audio thread; all timing is in song seconds from the Conductor.
protocol Voice {
    /// Render `frames` samples. `bufferStart` is the song time of the first
    /// sample. Add into `out`. Return false once the voice has finished.
    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool

    // Routing. These MUST be protocol requirements (not extension-only
    // members): on `any Voice` an extension member dispatches statically and
    // conformers' overrides would be silently ignored.
    /// Stereo position, -1 (left) to +1 (right); 0 = no panner (unity).
    var pan: Double { get }
    var bus: MixBus { get }
    /// How much of this voice feeds the dub delay (0 = none).
    var delaySend: Double { get }
}

extension Voice {
    var pan: Double { 0 }
    var bus: MixBus { .dry }
    var delaySend: Double { 0 }
}

/// Per-run engine routing/config, carried on the BackingPlan so gameplay and
/// previews sound identical: master gain and compressor per set family, plus
/// the optional dub-delay and sidechain-duck buses (minimal ii).
struct EngineConfig {
    var masterGain: Float = 0.8
    var compThreshold: Double = -24
    var compRatio: Double = 12
    /// (delay seconds, wet level, feedback breakpoints in song time)
    var delay: (time: Double, wet: Double, feedback: [(Double, Double)])? = nil
    /// (kick song-times, duck floor, linear recovery seconds)
    var duck: (times: [Double], floor: Double, recover: Double)? = nil
}

/// The platform-neutral heart of the synth: voices → pan/buses → dub delay →
/// sidechain duck → master gain → compressor, one stereo block at a time.
/// SynthEngine drives this on the audio thread; the offline test harness
/// drives the very same code on macOS, so what we verify is what ships.
struct MixCore {
    var config = EngineConfig() {
        didSet { reset() }
    }
    private(set) var sampleRate: Double
    private var compressor: Compressor
    private var scratch: [Float]
    private var duckBuf: [Float]
    private var delayInBuf: [Float]
    private var delayRing: [Float]
    private var delayWrite = 0
    let maxFrames: Int

    init(sampleRate: Double, maxFrames: Int = 4096) {
        self.sampleRate = sampleRate
        self.maxFrames = maxFrames
        compressor = Compressor(thresholdDb: -24, ratio: 12)
        compressor.prepare(sr: sampleRate)
        scratch = [Float](repeating: 0, count: maxFrames)
        duckBuf = [Float](repeating: 0, count: maxFrames)
        delayInBuf = [Float](repeating: 0, count: maxFrames)
        delayRing = [Float](repeating: 0, count: Int(sampleRate * 2))
    }

    mutating func reset() {
        compressor = Compressor(thresholdDb: config.compThreshold, ratio: config.compRatio)
        compressor.prepare(sr: sampleRate)
        for i in 0..<delayRing.count { delayRing[i] = 0 }
        delayWrite = 0
    }

    private func feedback(at t: Double) -> Float {
        guard let delay = config.delay else { return 0 }
        let points = delay.feedback
        guard let first = points.first else { return 0 }
        if t <= first.0 { return Float(first.1) }
        for k in 1..<points.count where t <= points[k].0 {
            let (t0, v0) = points[k - 1]
            let (t1, v1) = points[k]
            let span = t1 - t0
            if span <= 0 { return Float(v1) }
            return Float(v0 + (v1 - v0) * (t - t0) / span)
        }
        return Float(points[points.count - 1].1)
    }

    private func duckGain(at t: Double) -> Float {
        guard let duck = config.duck, !duck.times.isEmpty else { return 1 }
        var lo = 0, hi = duck.times.count - 1, found = -1
        while lo <= hi {
            let mid = (lo + hi) / 2
            if duck.times[mid] <= t { found = mid; lo = mid + 1 } else { hi = mid - 1 }
        }
        guard found >= 0 else { return 1 }
        let age = t - duck.times[found]
        if age >= duck.recover { return 1 }
        return Float(duck.floor + (1 - duck.floor) * (age / duck.recover))
    }

    /// Render one block. Adds into outL/outR (caller zeroes them). Mutates
    /// `voices` in place, removing finished ones.
    mutating func render(voices: inout [any Voice],
                         outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>,
                         frames: Int, bufferStart: Double) {
        let n = min(frames, maxFrames)
        for i in 0..<n { duckBuf[i] = 0; delayInBuf[i] = 0 }

        var i = 0
        while i < voices.count {
            for s in 0..<n { scratch[s] = 0 }
            let voice = voices[i]
            let alive = scratch.withUnsafeMutableBufferPointer { buf in
                voices[i].render(into: buf.baseAddress!, frames: n, bufferStart: bufferStart, sr: sampleRate)
            }
            // WebAudio semantics: an unpanned mono voice upmixes to stereo at
            // unity per channel; only voices routed through a StereoPanner get
            // the equal-power law.
            let gL: Float, gR: Float
            if voice.pan == 0 {
                gL = 1; gR = 1
            } else {
                let angle = (voice.pan + 1) * .pi / 4
                gL = Float(cos(angle)); gR = Float(sin(angle))
            }
            switch voice.bus {
            case .dry:
                for s in 0..<n { outL[s] += scratch[s] * gL; outR[s] += scratch[s] * gR }
            case .duck:
                for s in 0..<n { duckBuf[s] += scratch[s] }
            }
            let send = voice.delaySend
            if send > 0, config.delay != nil {
                let g = Float(send)
                for s in 0..<n { delayInBuf[s] += scratch[s] * g }
            }
            if alive { i += 1 } else { voices.remove(at: i) }
        }

        let dt = 1.0 / sampleRate
        if let delay = config.delay {
            let dSamples = max(1, min(delayRing.count - 1, Int(delay.time * sampleRate)))
            let wet = Float(delay.wet)
            let ringCount = delayRing.count
            for s in 0..<n {
                let t = bufferStart + Double(s) * dt
                let readIdx = (delayWrite - dSamples + ringCount) % ringCount
                let echo = delayRing[readIdx]
                delayRing[delayWrite] = delayInBuf[s] + echo * feedback(at: t)
                delayWrite = (delayWrite + 1) % ringCount
                duckBuf[s] += echo * wet
            }
        }
        if config.duck != nil {
            for s in 0..<n { duckBuf[s] *= duckGain(at: bufferStart + Double(s) * dt) }
        }
        // duck bus → master, unity per channel (web: duckBus.connect(master))
        for s in 0..<n {
            outL[s] += duckBuf[s]
            outR[s] += duckBuf[s]
        }

        let g = config.masterGain
        for s in 0..<n {
            var l = outL[s] * g
            var r = outR[s] * g
            compressor.process(&l, &r)
            outL[s] = l
            outR[s] = r
        }
    }
}
