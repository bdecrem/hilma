import AVFoundation
#if canImport(CoreAudio)
import CoreAudio  // UnsafeMutableAudioBufferListPointer on Mac Catalyst
#endif
import os

/// AVAudioEngine with one stereo source node: the BandRenderer, which is the transport,
/// the band and the monitor. Everything audible comes out of that render block, through a
/// small room (the samples are close-miked and dry).
final class AudioEngine {
    let renderer: BandRenderer
    let band: BandData
    private let engine = AVAudioEngine()
    private let source: AVAudioSourceNode
    private let room = AVAudioUnitReverb()
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
        engine.attach(room)
        room.loadFactoryPreset(.mediumRoom)
        room.wetDryMix = 12
        engine.connect(source, to: room, format: format)
        engine.connect(room, to: engine.mainMixerNode, format: format)

        NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine,
                                               queue: .main) { [weak self] _ in self?.restart() }
    }

    func send(_ command: EngineCommand) { renderer.send(command) }

    /// Another band (`Takt/Content/band-*.json`), from the same tick; built once, then reused.
    private var loaded: [String: BandRenderer.Events] = [:]
    @discardableResult
    func load(band name: String) -> BandRenderer.Events {
        let e = loaded[name] ?? renderer.load(.bundled(name))
        loaded[name] = e
        renderer.send(.band(e))
        return e
    }

    /// A song's band with your keys on the part's instrument, at the part's level.
    @discardableResult
    func load(song: Song, part: Song.PartKey) -> BandRenderer.Events {
        let p = song.part(part)
        let key = "\(song.name)|\(part.rawValue)"
        let e = loaded[key] ?? {
            var band = song.band
            band.instruments["monitor"] = p.monitor
            var levels = band.levels ?? [:]
            levels["monitor"] = levels[p.channel] ?? 0
            band.levels = levels
            // Your keys pump with the kick the way the record's part does.
            if var duck = band.duck, duck.channels.contains(p.channel) {
                duck.channels.append("monitor")
                band.duck = duck
            }
            return renderer.load(band)
        }()
        loaded[key] = e
        renderer.send(.band(e))
        return e
    }
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

    /// Records the live render (after the room, before the output volume) to a WAV for `seconds`, then calls `done`.
    func record(seconds: Double, to url: URL, done: @escaping () -> Void) throws {
        let file = try AVAudioFile(forWriting: url, settings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: 2, AVLinearPCMBitDepthKey: 24,
        ], commonFormat: .pcmFormatFloat32, interleaved: false)
        // The file finishes its WAV header (the sizes) when it is released, so it must be gone
        // before `done` (which exits): the tap holds it through a box that lets go first.
        let box = FileBox(file)
        room.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
            box.lock.withLock { try? box.file?.write(from: buffer) }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [room] in
            room.removeTap(onBus: 0)
            box.lock.withLock { box.file = nil }
            done()
        }
    }
}

private final class FileBox {
    let lock = NSLock()
    var file: AVAudioFile?
    init(_ file: AVAudioFile) { self.file = file }
}
