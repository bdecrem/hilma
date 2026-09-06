import Foundation
import AVFoundation
import Accelerate
import os

// Loop player for rendered Jambot buffers — the AVAudioEngine twin of
// src/app/jam/audio.ts (LoopPlayer).
//
// Renders come back with a 2 s release tail; playback loops the exact
// musical length (bars × 4 beats) so the loop is tight, and setBuffer()
// hot-swaps a new render at the same phase so a fader move doesn't restart
// the groove. Audio session: .playback (no mixWithOthers), activated on
// first play, so it keeps going with the screen locked (UIBackgroundModes
// audio in Info.plist).

final class AudioPlayer: ObservableObject {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "audio")

    @Published private(set) var playing = false {
        didSet { if playing != oldValue { onStateChange?(playing) } }
    }

    /// Same state as `playing`, for callers that don't observe the object.
    var isPlaying: Bool { playing }

    /// Fired on the main queue whenever `playing` flips (StudioModel wires
    /// this; SwiftUI views can observe `playing` directly instead).
    var onStateChange: ((Bool) -> Void)?

    private let engine = AVAudioEngine()
    private let node = AVAudioPlayerNode()
    private var buffer: AVAudioPCMBuffer?
    private var connectedFormat: AVAudioFormat?
    private var loopFrames: AVAudioFramePosition = 0
    /// Phase the node's timeline started at (frames into the loop).
    private var startOffset: AVAudioFramePosition = 0
    private var sessionConfigured = false
    private var resumeAfterInterruption = false
    private var interruptedAt: AVAudioFramePosition = 0
    private var observers: [NSObjectProtocol] = []

    init() {
        engine.attach(node)
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            self?.handleInterruption(n)
        })
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            self?.handleConfigurationChange()
        })
    }

    deinit {
        for o in observers { NotificationCenter.default.removeObserver(o) }
        node.stop()
        engine.stop()
    }

    func hasBuffer() -> Bool { buffer != nil }

    /// Seconds per loop (0 until a buffer is set).
    var loopSeconds: Double {
        guard let b = buffer, loopFrames > 0 else { return 0 }
        return Double(loopFrames) / b.format.sampleRate
    }

    // MARK: - Buffer

    /// `setBuffer` with the loop length taken from the render itself
    /// (bars × 4 × 60 / bpm) — what the studio wants in every case but a
    /// section audition, where the caller knows the section's length.
    func load(_ r: RenderResult) {
        setBuffer(r, loopSeconds: loopSecondsFor(bars: r.bars, bpm: r.bpm))
    }

    /// Swap in a new render. Keeps the current phase if playing. `loopSeconds`
    /// is the musical length (bars × 4 × 60 / bpm); the release tail past it
    /// is dropped, exactly like the web player's loopEnd.
    func setBuffer(_ r: RenderResult, loopSeconds: Double) {
        guard r.channels >= 1, r.length > 0, r.pcm.count >= r.length * r.channels else {
            Self.log.error("setBuffer: malformed render (\(r.length) frames × \(r.channels) ch, \(r.pcm.count) samples)")
            return
        }
        let sampleRate = r.sampleRate
        let frames = max(1, min(r.length, Int((loopSeconds * sampleRate).rounded())))
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2),
              let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
              let channelData = pcm.floatChannelData else {
            Self.log.error("setBuffer: could not allocate a \(frames)-frame buffer at \(sampleRate) Hz")
            return
        }
        pcm.frameLength = AVAudioFrameCount(frames)
        var scale: Float = 1.0 / 32768.0
        r.pcm.withUnsafeBufferPointer { src in
            for ch in 0..<2 {
                let source = min(ch, r.channels - 1) // mono renders go to both sides
                let base = src.baseAddress! + source * r.length
                vDSP_vflt16(base, 1, channelData[ch], 1, vDSP_Length(frames))
                vDSP_vsmul(channelData[ch], 1, &scale, channelData[ch], 1, vDSP_Length(frames))
            }
        }

        let phase = position()
        buffer = pcm
        loopFrames = AVAudioFramePosition(frames)
        if playing {
            restart(atFrame: AVAudioFramePosition((phase * Double(frames)).rounded()))
        }
    }

    // MARK: - Transport

    func play() {
        guard buffer != nil else { return }
        activateSession()
        restart(atFrame: 0)
    }

    func toggle() {
        if playing { stop() } else { play() }
    }

    func stop() {
        node.stop()
        engine.stop()
        startOffset = 0
        resumeAfterInterruption = false
        if playing { playing = false }
    }

    /// 0..1 within the loop.
    func position() -> Double {
        guard playing, loopFrames > 0 else { return 0 }
        guard let nodeTime = node.lastRenderTime, nodeTime.isSampleTimeValid,
              let playerTime = node.playerTime(forNodeTime: nodeTime) else {
            return Double(startOffset % loopFrames) / Double(loopFrames)
        }
        var f = (playerTime.sampleTime + startOffset) % loopFrames
        if f < 0 { f += loopFrames }
        return Double(f) / Double(loopFrames)
    }

    // MARK: - Internals

    /// (Re)start the node at `offset` frames into the loop: the rest of the
    /// loop first, then the whole buffer looping forever. Back-to-back
    /// scheduled buffers are sample-accurate, so the seam is silent.
    private func restart(atFrame offset: AVAudioFramePosition) {
        guard let buffer, loopFrames > 0 else { return }
        node.stop()
        do {
            try ensureEngine(for: buffer.format)
        } catch {
            Self.log.error("audio engine failed to start: \(error.localizedDescription, privacy: .public)")
            if playing { playing = false }
            return
        }
        let off = ((offset % loopFrames) + loopFrames) % loopFrames
        if off > 0, let tail = Self.slice(buffer, from: AVAudioFrameCount(off)) {
            node.scheduleBuffer(tail, completionHandler: nil)
        }
        node.scheduleBuffer(buffer, at: nil, options: .loops, completionHandler: nil)
        startOffset = off
        node.play()
        if !playing { playing = true }
    }

    private func ensureEngine(for format: AVAudioFormat) throws {
        let same = connectedFormat.map { $0.sampleRate == format.sampleRate && $0.channelCount == format.channelCount } ?? false
        if !same {
            if engine.isRunning { engine.stop() }
            engine.disconnectNodeOutput(node)
            engine.connect(node, to: engine.mainMixerNode, format: format)
            connectedFormat = format
        }
        if !engine.isRunning {
            engine.prepare()
            try engine.start()
        }
    }

    private static func slice(_ buffer: AVAudioPCMBuffer, from start: AVAudioFrameCount) -> AVAudioPCMBuffer? {
        guard start < buffer.frameLength else { return nil }
        let count = buffer.frameLength - start
        guard let out = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: count),
              let src = buffer.floatChannelData, let dst = out.floatChannelData else { return nil }
        out.frameLength = count
        for ch in 0..<Int(buffer.format.channelCount) {
            dst[ch].update(from: src[ch] + Int(start), count: Int(count))
        }
        return out
    }

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            if !sessionConfigured {
                try session.setCategory(.playback, mode: .default, options: [])
                sessionConfigured = true
            }
            try session.setActive(true)
        } catch {
            Self.log.error("audio session: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func handleInterruption(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            guard playing else { return }
            interruptedAt = AVAudioFramePosition((position() * Double(loopFrames)).rounded())
            resumeAfterInterruption = true
            node.stop()
            engine.stop()
            playing = false
            Self.log.notice("audio interrupted at frame \(self.interruptedAt)")
        case .ended:
            let opts = AVAudioSession.InterruptionOptions(rawValue: n.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            guard resumeAfterInterruption, opts.contains(.shouldResume) else {
                resumeAfterInterruption = false
                return
            }
            resumeAfterInterruption = false
            activateSession()
            restart(atFrame: interruptedAt)
            Self.log.notice("audio resumed after interruption")
        @unknown default:
            break
        }
    }

    /// Output route or sample rate changed under the engine: put it back
    /// together at the same phase.
    private func handleConfigurationChange() {
        guard playing else { return }
        let frame = AVAudioFramePosition((position() * Double(loopFrames)).rounded())
        node.stop()
        engine.stop()
        Self.log.notice("audio configuration changed, restarting at frame \(frame)")
        restart(atFrame: frame)
    }
}

/// Musical length of a loop, in seconds (same as the web's loopSecondsFor).
func loopSecondsFor(bars: Int, bpm: Int) -> Double {
    Double(bars) * 4 * 60 / Double(max(1, bpm))
}
