import AVFoundation

/// AVAudioEngine graph with a single stereo source node. All actual mixing —
/// buses, dub delay, sidechain duck, compressor — lives in MixCore, which the
/// offline harness exercises identically on macOS. The app ships no audio
/// files: everything audible comes out of this render block.
final class SynthEngine {
    static let shared = SynthEngine()

    private let engine = AVAudioEngine()
    private var srcNode: AVAudioSourceNode!
    private(set) var sampleRate: Double = 48000

    private var lock = os_unfair_lock_s()
    private var pending: [any Voice] = []
    private var clearRequested = false
    private var pendingConfig: EngineConfig?
    private var active: [any Voice] = []
    private var core: MixCore

    /// The clock. Swapped per run (and for the calibration metronome).
    var conductor: Conductor?

    /// Audio is rendered this much EARLY so it reaches the ear at its nominal
    /// song time: hardware output latency (AirPods: 150ms+!) plus the
    /// compressor's 6ms lookahead. Refreshed on start and route changes.
    private var latencyComp: Double = 0.006

    private init() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setPreferredIOBufferDuration(0.005)
        try? session.setActive(true)
        var sr = session.sampleRate
        if sr <= 0 { sr = 48000 }
        sampleRate = sr
        core = MixCore(sampleRate: sr)
        let format = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 2)!

        srcNode = AVAudioSourceNode(format: format) { [weak self] _, timestamp, frameCount, audioBufferList -> OSStatus in
            guard let self else { return noErr }
            let abl = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard abl.count >= 2, let rawL = abl[0].mData, let rawR = abl[1].mData else { return noErr }
            let outL = rawL.assumingMemoryBound(to: Float.self)
            let outR = rawR.assumingMemoryBound(to: Float.self)
            let n = Int(frameCount)
            for i in 0..<n { outL[i] = 0; outR[i] = 0 }
            self.renderBlock(outL: outL, outR: outR, frames: n, timestamp: timestamp)
            return noErr
        }

        engine.attach(srcNode)
        engine.connect(srcNode, to: engine.mainMixerNode, format: format)

        NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.refreshLatency() }
        refreshLatency()
    }

    private func refreshLatency() {
        let latency = AVAudioSession.sharedInstance().outputLatency
        os_unfair_lock_lock(&lock)
        latencyComp = latency + 0.006
        os_unfair_lock_unlock(&lock)
    }

    func start() {
        guard !engine.isRunning else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        try? engine.start()
        refreshLatency()
    }

    func pause() {
        engine.pause()
    }

    /// Apply a run's routing config (master gain, compressor, delay, duck).
    /// Takes effect on the next render callback, with cleared FX state.
    func apply(_ newConfig: EngineConfig) {
        os_unfair_lock_lock(&lock)
        pendingConfig = newConfig
        os_unfair_lock_unlock(&lock)
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

    private func renderBlock(outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>,
                             frames: Int, timestamp: UnsafePointer<AudioTimeStamp>) {
        os_unfair_lock_lock(&lock)
        if let newConfig = pendingConfig {
            core.config = newConfig
            pendingConfig = nil
        }
        if clearRequested { active.removeAll(); clearRequested = false }
        let hasClock = conductor?.running ?? false
        if hasClock, !pending.isEmpty { active.append(contentsOf: pending) }
        if !pending.isEmpty { pending.removeAll() }
        os_unfair_lock_unlock(&lock)

        guard let conductor, hasClock else { return }

        let ts = timestamp.pointee
        var bufferStart: Double
        if ts.mFlags.contains(.hostTimeValid) {
            bufferStart = conductor.songTime(atHostTime: ts.mHostTime)
        } else {
            bufferStart = conductor.songTime
        }
        bufferStart += latencyComp   // render early → lands on time at the ear

        core.render(voices: &active, outL: outL, outR: outR, frames: frames, bufferStart: bufferStart)
    }
}
