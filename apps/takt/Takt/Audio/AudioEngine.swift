import AVFoundation
#if canImport(CoreAudio)
import CoreAudio  // UnsafeMutableAudioBufferListPointer on Mac Catalyst
#endif
import os

/// AVAudioEngine with one stereo source node: the BandRenderer, which is the transport,
/// the band and the monitor. Everything audible comes out of that render block.
final class AudioEngine {
    let renderer: BandRenderer
    let band: BandData
    private let engine = AVAudioEngine()
    private let source: AVAudioSourceNode
    private let format: AVAudioFormat
    private let log = Logger(subsystem: "takt", category: "audio")

    var sampleRate: Double { format.sampleRate }

    init(band: BandData, tempo: Double) {
        // The Keystation makes no sound: the monitor is the instrument, so keep the buffer small
        // (~5 ms). Catalyst runs the iOS audio stack, so the session does this on the Mac too.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setPreferredIOBufferDuration(0.005)
        try? session.setActive(true)
        var sr = engine.outputNode.outputFormat(forBus: 0).sampleRate
        if sr <= 0 { sr = 48000 }
        format = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 2)!
        self.band = band
        let renderer = BandRenderer(band: band, sampleRate: sr, tempo: tempo)
        self.renderer = renderer

        source = AVAudioSourceNode(format: format) { _, timestamp, frameCount, abl -> OSStatus in
            let list = UnsafeMutableAudioBufferListPointer(abl)
            guard list.count >= 2, let l = list[0].mData, let r = list[1].mData else { return noErr }
            let ts = timestamp.pointee
            renderer.render(frames: Int(frameCount),
                            hostTime: ts.mFlags.contains(.hostTimeValid) ? ts.mHostTime : nil,
                            outL: l.assumingMemoryBound(to: Float.self),
                            outR: r.assumingMemoryBound(to: Float.self))
            return noErr
        }
        engine.attach(source)
        engine.connect(source, to: engine.mainMixerNode, format: format)

        NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine,
                                               queue: .main) { [weak self] _ in self?.restart() }
    }

    func send(_ command: EngineCommand) { renderer.send(command) }
    func snapshot() -> EngineSnapshot { renderer.snapshot() }

    /// Starts realtime output. `silent` keeps the speakers quiet (headless checks) while the
    /// render, the clock and any recording tap run as normal.
    func start(silent: Bool) {
        engine.mainMixerNode.outputVolume = silent ? 0 : 1
        do {
            try engine.start()
        } catch {
            log.error("engine start failed: \(error.localizedDescription, privacy: .public)")
            return
        }
        updateLatency()
        log.info("engine started at \(self.sampleRate) Hz, buffer \(self.bufferFrames) frames")
    }

    /// The output buffer size, for the log.
    private var bufferFrames: Int {
        Int((AVAudioSession.sharedInstance().ioBufferDuration * sampleRate).rounded())
    }

    private func restart() {
        log.info("engine configuration changed; restarting")
        guard !engine.isRunning else { return }
        try? engine.start()
        updateLatency()
    }

    private func updateLatency() {
        let session = AVAudioSession.sharedInstance()
        let seconds = session.outputLatency + session.ioBufferDuration
        renderer.send(.outputLatency(seconds))
        log.info("output latency \(Int(seconds * 1000)) ms")
    }

    // MARK: Checks

    /// Renders `seconds` offline (no device, as fast as possible) to a WAV, applying `script`
    /// commands at their times. The engine must not have been started.
    func renderOffline(seconds: Double, script: [(at: Double, command: EngineCommand)], to url: URL) throws {
        let chunk: AVAudioFrameCount = 1024
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: chunk)
        try engine.start()
        let file = try AVAudioFile(forWriting: url, settings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: 2, AVLinearPCMBitDepthKey: 24,
        ], commonFormat: .pcmFormatFloat32, interleaved: false)
        let buffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: chunk)!
        let total = AVAudioFramePosition(seconds * format.sampleRate)
        var pending = script.sorted { $0.at < $1.at }
        while engine.manualRenderingSampleTime < total {
            let now = Double(engine.manualRenderingSampleTime) / format.sampleRate
            while let next = pending.first, next.at <= now {
                renderer.send(next.command)
                pending.removeFirst()
            }
            let frames = min(chunk, AVAudioFrameCount(total - engine.manualRenderingSampleTime))
            guard try engine.renderOffline(frames, to: buffer) == .success else { break }
            try file.write(from: buffer)
        }
        engine.stop()
    }

    /// Records the live render (before the output volume) to a WAV for `seconds`, then calls `done`.
    func record(seconds: Double, to url: URL, done: @escaping () -> Void) throws {
        let file = try AVAudioFile(forWriting: url, settings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: 2, AVLinearPCMBitDepthKey: 24,
        ], commonFormat: .pcmFormatFloat32, interleaved: false)
        source.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
            try? file.write(from: buffer)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [source] in
            source.removeTap(onBus: 0)
            done()
        }
    }
}
