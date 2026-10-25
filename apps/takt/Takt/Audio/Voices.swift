import AVFoundation

// Voices run on the render thread: plain structs over preallocated memory, no allocation,
// no locks. They add into channel buses between two frame offsets of the current buffer.

/// A one-shot held in memory at its own sample rate, stereo (mono files are duplicated).
/// The memory is allocated once at load and never freed.
struct SampleBuffer {
    let left: UnsafeMutablePointer<Float>
    let right: UnsafeMutablePointer<Float>
    let count: Int
    let rate: Double

    static let empty: SampleBuffer = {
        let p = UnsafeMutablePointer<Float>.allocate(capacity: 2)
        p.initialize(repeating: 0, count: 2)
        return SampleBuffer(left: p, right: p, count: 1, rate: 48000)
    }()

    /// Loads a bundled WAV from Takt/Sounds. Missing sounds trap: they are part of the build.
    static func bundled(_ name: String) -> SampleBuffer {
        guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else {
            fatalError("sound \(name).wav is not in the bundle")
        }
        do {
            let file = try AVAudioFile(forReading: url)
            let format = AVAudioFormat(standardFormatWithSampleRate: file.fileFormat.sampleRate,
                                       channels: file.fileFormat.channelCount)!
            let frames = AVAudioFrameCount(file.length)
            guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else {
                fatalError("sound \(name): no buffer")
            }
            try file.read(into: buf)
            let n = Int(buf.frameLength)
            let l = UnsafeMutablePointer<Float>.allocate(capacity: n + 1)
            let r = UnsafeMutablePointer<Float>.allocate(capacity: n + 1)
            let ch = buf.floatChannelData!
            l.update(from: ch[0], count: n)
            r.update(from: ch[format.channelCount > 1 ? 1 : 0], count: n)
            // One guard sample so interpolation never reads past the end.
            l[n] = 0
            r[n] = 0
            return SampleBuffer(left: l, right: r, count: n, rate: format.sampleRate)
        } catch {
            fatalError("sound \(name): \(error)")
        }
    }
}

/// Plays a SampleBuffer at a pitch ratio, with a gate (frames until release) and a short release.
struct SampleVoice {
    var active = false
    var buffer = SampleBuffer.empty
    var position = 0.0
    var step = 1.0
    var gain: Float = 0
    var heldFrames = Int.max
    var release: Float = 1
    var releasing = false
    var releaseCoef: Float = 0.999
    /// Choke group: starting a voice in a group can cut others (closed hat chokes open hat).
    var group = 0
    var age = 0

    mutating func start(_ buffer: SampleBuffer, ratio: Double, gain: Float, heldFrames: Int,
                        releaseSeconds: Double, group: Int, age: Int, sampleRate: Double) {
        self.buffer = buffer
        active = true
        position = 0
        step = ratio * buffer.rate / sampleRate
        self.gain = gain
        self.heldFrames = heldFrames
        release = 1
        releasing = false
        releaseCoef = Float(exp(-1 / (releaseSeconds * sampleRate)))
        self.group = group
        self.age = age
    }

    mutating func stop(releaseSeconds: Double, sampleRate: Double) {
        releasing = true
        releaseCoef = Float(exp(-1 / (releaseSeconds * sampleRate)))
    }

    mutating func render(_ l: UnsafeMutablePointer<Float>, _ r: UnsafeMutablePointer<Float>, from a: Int, to b: Int) {
        let bl = buffer.left, br = buffer.right, count = buffer.count
        for i in a..<b {
            let ip = Int(position)
            if ip >= count - 1 { active = false; return }
            if heldFrames == 0 { releasing = true }
            heldFrames -= 1
            var g = gain
            if releasing {
                release *= releaseCoef
                if release < 0.0001 { active = false; return }
                g *= release
            }
            let fr = Float(position - Double(ip))
            l[i] += (bl[ip] + (bl[ip + 1] - bl[ip]) * fr) * g
            r[i] += (br[ip] + (br[ip + 1] - br[ip]) * fr) * g
            position += step
        }
    }
}

/// sin(2πx) from a 4096-point table. Warmed on the main thread before audio starts.
let sineTable: UnsafeMutablePointer<Float> = {
    let n = 4096
    let t = UnsafeMutablePointer<Float>.allocate(capacity: n + 1)
    for i in 0...n { t[i] = Float(sin(2 * Double.pi * Double(i) / Double(n))) }
    return t
}()

@inline(__always) func sinT(_ x: Double) -> Float {
    let f = x - x.rounded(.down)
    let p = f * 4096
    let i = Int(p)
    let fr = Float(p - Double(i))
    return sineTable[i] + (sineTable[i + 1] - sineTable[i]) * fr
}

enum FMPatch {
    /// DX-style electric piano: a 1:1 body pair, a detuned body for width, a 14:1 tine on the attack.
    case rhodes
    /// Two detuned 1:1 pairs whose index swells on the attack: a short horn-section stab.
    case brass
}

/// Phase-modulation voice. Indices are in radians; `k` turns them into table cycles.
struct FMVoice {
    var active = false
    var patch = FMPatch.rhodes
    var note = -1
    /// Held by a key (monitor): released by note off, not by a gate.
    var live = false
    var heldFrames = Int.max
    var age = 0

    var ph1 = 0.0, ph2 = 0.0, ph3 = 0.0
    var inc1 = 0.0, inc2 = 0.0, inc3 = 0.0
    var frame = 0
    var attackFrames = 1
    var peak: Float = 0
    var env: Float = 0
    var ampCoef: Float = 1
    var index: Float = 0
    var indexTarget: Float = 0
    var indexSustain: Float = 0
    var indexCoef: Float = 1
    var swellFrames = 0
    var tineAmp: Float = 0
    var tineCoef: Float = 1
    var tineIndex: Float = 0
    var tineIndexCoef: Float = 1
    var release: Float = 1
    var releasing = false
    var releaseCoef: Float = 1

    private static let k: Float = 1 / (2 * .pi)

    mutating func start(note: Int, velocity: Float, patch: FMPatch, heldFrames: Int, live: Bool,
                        age: Int, sampleRate sr: Double) {
        let f = 440 * pow(2, Double(note - 69) / 12)
        let v = max(0, min(1, velocity))
        self.patch = patch
        self.note = note
        self.live = live
        self.heldFrames = heldFrames
        self.age = age
        active = true
        frame = 0
        ph1 = 0; ph2 = 0.25; ph3 = 0
        env = 0
        release = 1
        releasing = false

        func coef(_ seconds: Double) -> Float { Float(exp(-1 / (seconds * sr))) }

        switch patch {
        case .rhodes:
            inc1 = f / sr
            inc2 = f * 1.0017 / sr
            inc3 = f * 14 / sr
            peak = 0.2 + 0.8 * pow(v, 1.3)
            attackFrames = max(1, Int(0.0015 * sr))
            // Low notes ring longer: ~1.6 s at A4, clamped to 0.6...5 s.
            ampCoef = coef(min(5, max(0.6, 1.6 * pow(440 / f, 0.45))))
            index = 0.6 + 2.2 * v
            indexSustain = 0.25 + 0.6 * v
            indexTarget = indexSustain
            indexCoef = coef(0.35)
            swellFrames = 0
            tineAmp = 0.25 + 0.35 * v
            tineCoef = coef(0.18)
            tineIndex = 2.5 + 3 * v
            tineIndexCoef = coef(0.05)
            releaseCoef = coef(0.06)
        case .brass:
            inc1 = f / sr
            inc2 = f * 1.004 / sr
            inc3 = 0
            peak = 0.3 + 0.7 * v
            attackFrames = max(1, Int(0.035 * sr))
            ampCoef = coef(4)
            index = 0.4
            indexTarget = 3.2 * (0.6 + 0.4 * v)
            indexSustain = 2.0 * (0.6 + 0.4 * v)
            indexCoef = coef(0.03)
            swellFrames = Int(0.08 * sr)
            tineAmp = 0
            releaseCoef = coef(0.09)
        }
    }

    mutating func noteOff() {
        releasing = true
    }

    mutating func render(_ out: UnsafeMutablePointer<Float>, from a: Int, to b: Int, gain: Float) {
        let k = Self.k
        for i in a..<b {
            if frame < attackFrames {
                env = peak * Float(frame + 1) / Float(attackFrames)
            } else {
                env *= ampCoef
            }
            if heldFrames == 0 { releasing = true }
            heldFrames -= 1
            if releasing {
                release *= releaseCoef
            }
            let amp = env * release
            if frame > attackFrames && amp < 0.00005 { active = false; return }

            let s: Float
            switch patch {
            case .rhodes:
                let m = Double(index * k)
                let body = sinT(ph1 + m * Double(sinT(ph1)))
                let body2 = sinT(ph2 + m * Double(sinT(ph2)))
                let tine = sinT(ph1 + Double(tineIndex * k) * Double(sinT(ph3)))
                s = (0.62 * body + 0.38 * body2) * amp + 0.5 * tine * tineAmp * release
                index = indexSustain + (index - indexSustain) * indexCoef
                tineAmp *= tineCoef
                tineIndex = 0.4 + (tineIndex - 0.4) * tineIndexCoef
            case .brass:
                if frame == swellFrames { indexTarget = indexSustain }
                index = indexTarget + (index - indexTarget) * indexCoef
                let m = Double(index * k)
                let a1 = sinT(ph1 + m * Double(sinT(ph1)))
                let a2 = sinT(ph2 + m * Double(sinT(ph2)))
                s = (a1 + a2) * 0.5 * amp
            }
            out[i] += s * gain

            ph1 += inc1; if ph1 >= 1 { ph1 -= 1 }
            ph2 += inc2; if ph2 >= 1 { ph2 -= 1 }
            ph3 += inc3; if ph3 >= 1 { ph3 -= 1 }
            frame += 1
        }
    }
}
