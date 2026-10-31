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
    /// The sustain loop (since 0.1 (64)): a pitched note held past the file's end loops its
    /// tail, `loopStart ..< loopEnd` in buffer frames, crossfading over the last `xfade`
    /// frames of the loop into its start, and every pass is `loopDecay` times quieter (the
    /// tail's own decay measured over the loop), so a held piano note fades the way the
    /// piano does instead of stopping where the recording was cut. `loopEnd` 0 = no loop
    /// (a file under a second, or a tail already at silence).
    var loopStart = 0
    var loopEnd = 0
    var xfade = 0
    var loopDecay: Float = 1

    static let empty: SampleBuffer = {
        let p = UnsafeMutablePointer<Int16>.allocate(capacity: 2)
        p.initialize(repeating: 0, count: 2)
        return SampleBuffer(left: p, right: p, count: 1, rate: 48000)
    }()

    /// Finds the loop in the file's tail: the last 40 ms are the cutter's fade, the loop is
    /// up to a second before that (40% of the file at most), the crossfade up to 300 ms.
    /// The decay is the RMS of the loop's last 100 ms over its first 100 ms, clamped so a
    /// pass never gets louder.
    private static func withLoop(_ b: SampleBuffer) -> SampleBuffer {
        var b = b
        let r = b.rate
        guard Double(b.count) >= r * 1.0 else { return b }
        let fade = Int(0.04 * r)
        let end = b.count - fade - 2
        let len = min(Int(1.0 * r), Int(Double(end) * 0.4))
        let start = end - len
        let xf = min(Int(0.3 * r), len / 2)
        guard start - xf > 0, xf > 0 else { return b }
        func rms(_ from: Int, _ to: Int) -> Double {
            var sum = 0.0
            for i in from..<to {
                let v = Double(b.left[i]) / 32768
                sum += v * v
            }
            return (sum / Double(to - from)).squareRoot()
        }
        let w = Int(0.1 * r)
        let head = rms(start, start + w)
        let tail = rms(end - w, end)
        // A tail already at silence (the cutter's -60 dB rule) has nothing to sustain.
        guard tail > 1e-4, head > 1e-4 else { return b }
        b.loopStart = start
        b.loopEnd = end
        b.xfade = xf
        b.loopDecay = Float(min(1, max(0.05, tail / head)))
        return b
    }

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
            return withLoop(SampleBuffer(left: l, right: r, count: n, rate: format.sampleRate))
        } catch {
            fatalError("sound \(name): \(error)")
        }
    }
}

/// Plays a SampleBuffer at a pitch ratio, with a gate (frames until release) and a release.
/// A pitched voice (`sustain`) loops the buffer's tail while it sounds, so a held key keeps
/// playing after the recording's end; a drum never does.
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
    /// Loops the tail while sounding (pitched instruments), and the level the passes have come down to.
    var sustain = false
    var sus: Float = 1

    private static let scale: Float = 1 / 32768

    mutating func start(_ buffer: SampleBuffer, ratio: Double, gain: Float, heldFrames: Int,
                        releaseSeconds: Double, group: Int = 0, note: Int = -1, live: Bool = false,
                        sustain: Bool = false, age: Int, sampleRate: Double) {
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
        self.sustain = sustain && buffer.loopEnd > 0
        sus = 1
        self.age = age
    }

    mutating func stop(releaseSeconds: Double, sampleRate: Double) {
        releasing = true
        releaseCoef = Float(exp(-1 / (releaseSeconds * sampleRate)))
    }

    mutating func render(_ l: UnsafeMutablePointer<Float>, _ r: UnsafeMutablePointer<Float>, from a: Int, to b: Int) {
        let bl = buffer.left, br = buffer.right, count = buffer.count
        // The loop: from `zone` on, the tail crossfades into the loop's start (read `span`
        // frames back, a pass quieter); at `loopEnd` the position wraps and the level steps down.
        let loopEnd = buffer.loopEnd, span = buffer.loopEnd - buffer.loopStart
        let zone = loopEnd - buffer.xfade, xfade = Float(max(1, buffer.xfade)), decay = buffer.loopDecay
        for i in a..<b {
            var ip = Int(position)
            if sustain, ip >= loopEnd {
                position -= Double(span)
                sus *= decay
                if sus < 0.0005 { active = false; return }
                ip = Int(position)
            }
            if ip >= count - 1 { active = false; return }
            if heldFrames == 0 { releasing = true }
            heldFrames -= 1
            var g = gain * sus
            if releasing {
                release *= releaseCoef
                if release < 0.0001 { active = false; return }
                g *= release
            }
            let fr = Float(position - Double(ip))
            let l0 = Float(bl[ip]), l1 = Float(bl[ip + 1])
            let r0 = Float(br[ip]), r1 = Float(br[ip + 1])
            var sl = l0 + (l1 - l0) * fr
            var sr = r0 + (r1 - r0) * fr
            if sustain, ip >= zone {
                let t = Float(position - Double(zone)) / xfade
                let q = position - Double(span)
                let iq = Int(q)
                let fq = Float(q - Double(iq))
                let ml = (Float(bl[iq]) + (Float(bl[iq + 1]) - Float(bl[iq])) * fq) * decay
                let mr = (Float(br[iq]) + (Float(br[iq + 1]) - Float(br[iq])) * fq) * decay
                sl += (ml - sl) * t
                sr += (mr - sr) * t
            }
            l[i] += sl * g
            r[i] += sr * g
            position += step
        }
    }
}
