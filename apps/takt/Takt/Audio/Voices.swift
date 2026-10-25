import AVFoundation

// Voices run on the render thread: plain structs over preallocated memory, no allocation,
// no locks. They add into channel buses between two frame offsets of the current buffer.

/// A recorded note or hit held in memory at its own sample rate, stereo (mono files point
/// both sides at one channel), as 16-bit integers: the piano alone is ~70 MB as floats.
/// The memory is allocated once at load and never freed.
struct SampleBuffer {
    let left: UnsafeMutablePointer<Int16>
    let right: UnsafeMutablePointer<Int16>
    let count: Int
    let rate: Double

    static let empty: SampleBuffer = {
        let p = UnsafeMutablePointer<Int16>.allocate(capacity: 2)
        p.initialize(repeating: 0, count: 2)
        return SampleBuffer(left: p, right: p, count: 1, rate: 48000)
    }()

    /// Loads a bundled CAF from Takt/Sounds. Missing sounds trap: they are part of the build.
    static func bundled(_ name: String) -> SampleBuffer {
        guard let url = Bundle.main.url(forResource: name, withExtension: "caf") else {
            fatalError("sound \(name).caf is not in the bundle")
        }
        do {
            let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatInt16, interleaved: false)
            let format = file.processingFormat
            let frames = AVAudioFrameCount(file.length)
            guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else {
                fatalError("sound \(name): no buffer")
            }
            try file.read(into: buf)
            let n = Int(buf.frameLength)
            let stereo = format.channelCount > 1
            let ch = buf.int16ChannelData!
            // One guard sample so interpolation never reads past the end.
            let l = UnsafeMutablePointer<Int16>.allocate(capacity: n + 1)
            l.update(from: ch[0], count: n)
            l[n] = 0
            var r = l
            if stereo {
                r = .allocate(capacity: n + 1)
                r.update(from: ch[1], count: n)
                r[n] = 0
            }
            return SampleBuffer(left: l, right: r, count: n, rate: format.sampleRate)
        } catch {
            fatalError("sound \(name): \(error)")
        }
    }
}

/// Plays a SampleBuffer at a pitch ratio, with a gate (frames until release) and a release.
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
    /// The MIDI note (pitched instruments), and whether a key holds it (monitor).
    var note = -1
    var live = false

    private static let scale: Float = 1 / 32768

    mutating func start(_ buffer: SampleBuffer, ratio: Double, gain: Float, heldFrames: Int,
                        releaseSeconds: Double, group: Int = 0, note: Int = -1, live: Bool = false,
                        age: Int, sampleRate: Double) {
        self.buffer = buffer
        active = true
        position = 0
        step = ratio * buffer.rate / sampleRate
        self.gain = gain * Self.scale
        self.heldFrames = heldFrames
        release = 1
        releasing = false
        releaseCoef = Float(exp(-1 / (releaseSeconds * sampleRate)))
        self.group = group
        self.note = note
        self.live = live
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
            let l0 = Float(bl[ip]), l1 = Float(bl[ip + 1])
            let r0 = Float(br[ip]), r1 = Float(br[ip + 1])
            l[i] += (l0 + (l1 - l0) * fr) * g
            r[i] += (r0 + (r1 - r0) * fr) * g
            position += step
        }
    }
}
