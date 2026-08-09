import AVFoundation

/// One synthesized voice. Voices render additively into the engine's mono mix
/// on the audio thread; all timing is in song seconds from the Conductor.
protocol Voice {
    /// Render `frames` samples. `bufferStart` is the song time of the first
    /// sample. Add into `out`. Return false once the voice has finished.
    mutating func render(into out: UnsafeMutablePointer<Float>, frames: Int, bufferStart: Double, sr: Double) -> Bool
}

/// AVAudioEngine graph with a single source node that mixes every scheduled
/// voice, sample-accurately, against the Conductor's clock. The app ships no
/// audio files: everything audible comes out of this render block.
final class SynthEngine {
    static let shared = SynthEngine()

    private let engine = AVAudioEngine()
    private var srcNode: AVAudioSourceNode!
    private(set) var sampleRate: Double = 48000

    private var lock = os_unfair_lock_s()
    private var pending: [any Voice] = []
    private var clearRequested = false
    private var active: [any Voice] = []

    /// The clock. Swapped per run (and for the calibration metronome).
    var conductor: Conductor?

    var masterGain: Float = 0.85

    private init() {
        configureSession()
        sampleRate = AVAudioSession.sharedInstance().sampleRate
        if sampleRate <= 0 { sampleRate = 48000 }
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!

        srcNode = AVAudioSourceNode(format: format) { [weak self] _, timestamp, frameCount, audioBufferList -> OSStatus in
            guard let self else { return noErr }
            let abl = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard let raw = abl[0].mData else { return noErr }
            let out = raw.assumingMemoryBound(to: Float.self)
            let n = Int(frameCount)
            for i in 0..<n { out[i] = 0 }
            self.renderVoices(out: out, frames: n, timestamp: timestamp)
            return noErr
        }

        engine.attach(srcNode)
        engine.connect(srcNode, to: engine.mainMixerNode, format: format)
    }

    private func configureSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setPreferredIOBufferDuration(0.005)
        try? session.setActive(true)
    }

    func start() {
        guard !engine.isRunning else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        try? engine.start()
    }

    func pause() {
        engine.pause()
    }

    /// Schedule a voice at an absolute song time (encoded in the voice itself).
    func schedule(_ voice: any Voice) {
        os_unfair_lock_lock(&lock)
        pending.append(voice)
        os_unfair_lock_unlock(&lock)
    }

    /// Drop everything scheduled and sounding (track end, run abort).
    func stopAllVoices() {
        os_unfair_lock_lock(&lock)
        pending.removeAll()
        clearRequested = true
        os_unfair_lock_unlock(&lock)
    }

    private func renderVoices(out: UnsafeMutablePointer<Float>, frames: Int, timestamp: UnsafePointer<AudioTimeStamp>) {
        guard let conductor, conductor.running else {
            // Keep the graph warm but silent between runs.
            os_unfair_lock_lock(&lock)
            if clearRequested { active.removeAll(); clearRequested = false }
            if !pending.isEmpty { pending.removeAll() }
            os_unfair_lock_unlock(&lock)
            return
        }

        // Song time of this buffer's first sample, from the host clock the
        // hardware stamped on the buffer. Falls back to "now" if unstamped.
        let ts = timestamp.pointee
        let bufferStart: Double
        if ts.mFlags.contains(.hostTimeValid) {
            bufferStart = conductor.songTime(atHostTime: ts.mHostTime)
        } else {
            bufferStart = conductor.songTime
        }

        os_unfair_lock_lock(&lock)
        if clearRequested { active.removeAll(); clearRequested = false }
        if !pending.isEmpty { active.append(contentsOf: pending); pending.removeAll() }
        os_unfair_lock_unlock(&lock)

        guard !active.isEmpty else { return }

        var i = 0
        while i < active.count {
            let alive = active[i].render(into: out, frames: frames, bufferStart: bufferStart, sr: sampleRate)
            if alive { i += 1 } else { active.remove(at: i) }
        }

        // Gentle master saturation in place of the prototypes' compressor.
        let g = masterGain
        for s in 0..<frames {
            out[s] = tanhf(out[s] * g)
        }
    }
}
