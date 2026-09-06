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
// first play and kept active while playing, so it keeps going with the
// screen locked (UIBackgroundModes audio in Info.plist).
//
// Hot swap (stage 8, measured — see AudioSmoke):
//   • Same loop length (the fader / mute / agent-tweak case, i.e. almost
//     always): the new samples are written INTO the buffer the node is
//     already looping (Int16 → Float32 straight into floatChannelData). The
//     node never stops, its timeline never resets, so the phase delta is
//     exactly the wall-clock time the copy took to start — sample-accurate,
//     no gap, no click beyond the one any mid-cycle parameter change makes.
//     The render thread may read a cycle that is half old / half new
//     samples while the copy front passes it; that is audio of the same
//     loop at the same phase, so it is inaudible.
//   • Length changed (bars or tempo): a timed restart. The tail slice is
//     copied while the old loop keeps playing, the phase is carried over as
//     a fraction (like the web's `position() * frames`), then the node is
//     stopped and `play(at:)` pins the new timeline to a host time one I/O
//     buffer ahead. The gap is at most one I/O buffer (≈ 12–23 ms) instead of
//     buffer copy + one I/O buffer as before.
// `position()` extrapolates from the last render time with the host clock,
// so it is continuous between render cycles (sub-millisecond, not the
// 512–1024-frame steps `lastRenderTime` alone would give) and stays
// monotonic across a swap.
//
// Session events: interruption began → pause (phase remembered); ended with
// .shouldResume → resume at that phase. Route change with the old device
// gone (headphones unplugged) → pause. Media services reset → the engine is
// rebuilt and playback resumes at the same phase.

final class AudioPlayer: ObservableObject {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "audio")

    @Published private(set) var playing = false {
        didSet { if playing != oldValue { onStateChange?(playing); onNowPlayingChange?() } }
    }

    /// Same state as `playing`, for callers that don't observe the object.
    /// True from the moment `play()` returns (also across a swap) until
    /// `stop()`, an interruption, or a route loss.
    var isPlaying: Bool { playing }

    /// Fired on the main queue whenever `playing` flips (StudioModel wires
    /// this; SwiftUI views can observe `playing` directly instead).
    var onStateChange: ((Bool) -> Void)?

    /// Fired on the main queue on play, stop, and every buffer swap —
    /// anything that changes what Now Playing should show (`NowPlaying`
    /// sets this; it republishes duration/elapsed/rate).
    var onNowPlayingChange: (() -> Void)?

    /// Phase delta measured by the last hot swap while playing, in
    /// milliseconds (position after − position before, converted to time).
    /// For diagnostics / AudioSmoke; nil until a swap has happened.
    private(set) var lastSwapDeltaMs: Double?
    /// How the last swap was done: "inplace" (same length) or "restart".
    private(set) var lastSwapKind: String?

    private var engine = AVAudioEngine()
    private var node = AVAudioPlayerNode()
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
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main) { [weak self] n in
            guard let self, (n.object as? AVAudioEngine) === self.engine else { return }
            self.handleConfigurationChange()
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] n in
            self?.handleRouteChange(n)
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            self?.handleMediaServicesReset()
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

        // Fast path: playing, same length and format → update the live
        // buffer in place. The node keeps looping; phase is untouched.
        if playing, let live = buffer, Int(live.frameLength) == frames, live.format.sampleRate == sampleRate {
            let before = position()
            Self.fill(live, from: r, frames: frames)
            let after = position()
            lastSwapKind = "inplace"
            lastSwapDeltaMs = (after - before) * loopSeconds * 1000
            Self.log.notice("swap in place: \(frames) frames, phase \(String(format: "%.4f", before), privacy: .public) → \(String(format: "%.4f", after), privacy: .public) (\(String(format: "%.2f", self.lastSwapDeltaMs ?? 0), privacy: .public) ms)")
            onNowPlayingChange?()
            return
        }

        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2),
              let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)) else {
            Self.log.error("setBuffer: could not allocate a \(frames)-frame buffer at \(sampleRate) Hz")
            return
        }
        pcm.frameLength = AVAudioFrameCount(frames)
        Self.fill(pcm, from: r, frames: frames)

        if playing {
            let before = position()
            timedRestart(with: pcm)
            let after = position()
            lastSwapKind = "restart"
            lastSwapDeltaMs = (after - before) * loopSeconds * 1000
            Self.log.notice("swap by restart: \(frames) frames, phase \(String(format: "%.4f", before), privacy: .public) → \(String(format: "%.4f", after), privacy: .public) (\(String(format: "%.2f", self.lastSwapDeltaMs ?? 0), privacy: .public) ms)")
        } else {
            buffer = pcm
            loopFrames = AVAudioFramePosition(frames)
            startOffset = 0
        }
        onNowPlayingChange?()
    }

    /// Int16 planar → Float32 into `pcm` (both channels; mono goes to both).
    private static func fill(_ pcm: AVAudioPCMBuffer, from r: RenderResult, frames: Int) {
        guard let channelData = pcm.floatChannelData else { return }
        var scale: Float = 1.0 / 32768.0
        r.pcm.withUnsafeBufferPointer { src in
            for ch in 0..<2 {
                let source = min(ch, r.channels - 1)
                let base = src.baseAddress! + source * r.length
                vDSP_vflt16(base, 1, channelData[ch], 1, vDSP_Length(frames))
                vDSP_vsmul(channelData[ch], 1, &scale, channelData[ch], 1, vDSP_Length(frames))
            }
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
        // Hand the audio route back (Music etc. resume) — only on an
        // explicit stop, never on the swaps/interruptions above.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// 0..1 within the loop. Continuous between render cycles (host-clock
    /// extrapolated) and monotonic across a hot swap.
    func position() -> Double {
        guard playing, loopFrames > 0 else { return 0 }
        let frame: AVAudioFramePosition
        if let f = playerFrameNow() {
            frame = f + startOffset
        } else {
            frame = startOffset
        }
        var f = frame % loopFrames
        if f < 0 { f += loopFrames }
        return Double(f) / Double(loopFrames)
    }

    /// Frames the node's own timeline has played right now: `lastRenderTime`
    /// pushed forward by the host time since that render. Negative before
    /// a `play(at:)` start time is reached; nil when the node has no time
    /// yet (engine not running).
    private func playerFrameNow() -> AVAudioFramePosition? {
        guard let rt = node.lastRenderTime, rt.isSampleTimeValid, let format = connectedFormat else { return nil }
        let sr = format.sampleRate
        var sample = rt.sampleTime
        if rt.isHostTimeValid {
            let now = mach_absolute_time()
            let delta = now >= rt.hostTime
                ? AVAudioTime.seconds(forHostTime: now - rt.hostTime)
                : -AVAudioTime.seconds(forHostTime: rt.hostTime - now)
            sample += AVAudioFramePosition((delta * sr).rounded())
        }
        let nodeTime = AVAudioTime(sampleTime: sample, atRate: sr)
        guard let pt = node.playerTime(forNodeTime: nodeTime) else { return nil }
        return max(0, pt.sampleTime)
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

    /// Length-changed swap while playing: carry the phase over as a
    /// fraction, prepare the tail while the old loop still plays, then stop
    /// and pin the new timeline to a host time one I/O buffer ahead.
    private func timedRestart(with newBuffer: AVAudioPCMBuffer) {
        let newFrames = AVAudioFramePosition(newBuffer.frameLength)
        let ioBuffer = max(0.005, AVAudioSession.sharedInstance().ioBufferDuration)
        // Lead: one I/O buffer (so the render thread sees the start time
        // before it passes) plus a little slack for the calls below.
        let lead = ioBuffer + 0.004
        let fractionNow = position()
        let hostNow = mach_absolute_time()
        let targetHost = hostNow + AVAudioTime.hostTime(forSeconds: lead)
        // Phase at the target moment, in the new loop's frames.
        let fractionAtTarget = (fractionNow + lead / max(loopSeconds, 0.001)).truncatingRemainder(dividingBy: 1)
        let off = AVAudioFramePosition((fractionAtTarget * Double(newFrames)).rounded()) % newFrames

        // Prepare the tail slice first — the old loop keeps playing meanwhile.
        let tail = off > 0 ? Self.slice(newBuffer, from: AVAudioFrameCount(off)) : nil

        var late = false
        do {
            try ensureEngine(for: newBuffer.format)
        } catch {
            Self.log.error("audio engine failed to start: \(error.localizedDescription, privacy: .public)")
            buffer = newBuffer; loopFrames = newFrames; startOffset = 0
            if playing { playing = false }
            return
        }
        if mach_absolute_time() >= targetHost { late = true }
        node.stop()
        buffer = newBuffer
        loopFrames = newFrames
        if let tail { node.scheduleBuffer(tail, completionHandler: nil) }
        node.scheduleBuffer(newBuffer, at: nil, options: .loops, completionHandler: nil)
        if late {
            // The copy took longer than the lead (huge buffer on a slow
            // device): start now; the phase is off by the overrun only.
            startOffset = off
            node.play()
            Self.log.notice("timed restart ran late; started immediately")
        } else {
            startOffset = off
            node.play(at: AVAudioTime(hostTime: targetHost))
        }
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

    /// Current phase as a frame index into the loop (0 when not playing).
    private var currentFrame: AVAudioFramePosition {
        guard loopFrames > 0 else { return 0 }
        return AVAudioFramePosition((position() * Double(loopFrames)).rounded()) % loopFrames
    }

    // MARK: - Session events

    private func handleInterruption(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            guard playing else { return }
            interruptedAt = currentFrame
            resumeAfterInterruption = true
            node.stop()
            engine.stop()
            playing = false
            Self.log.notice("audio interrupted at frame \(self.interruptedAt)")
        case .ended:
            let opts = AVAudioSession.InterruptionOptions(rawValue: n.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            guard resumeAfterInterruption, opts.contains(.shouldResume) else {
                resumeAfterInterruption = false
                Self.log.notice("audio interruption ended; not resuming (shouldResume=\(opts.contains(.shouldResume)))")
                return
            }
            resumeAfterInterruption = false
            activateSession()
            restart(atFrame: interruptedAt)
            Self.log.notice("audio resumed after interruption at frame \(self.interruptedAt)")
        @unknown default:
            break
        }
    }

    /// Output route or sample rate changed under the engine: put it back
    /// together at the same phase.
    private func handleConfigurationChange() {
        guard playing else { return }
        let frame = currentFrame
        node.stop()
        engine.stop()
        Self.log.notice("audio configuration changed, restarting at frame \(frame)")
        restart(atFrame: frame)
    }

    /// Headphones (or another output) unplugged: pause, like every music
    /// app — the loop would otherwise blast out of the speaker.
    private func handleRouteChange(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
        switch reason {
        case .oldDeviceUnavailable:
            guard playing else { return }
            let previous = n.userInfo?[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription
            let ports = previous?.outputs.map(\.portType.rawValue) ?? []
            Self.log.notice("output route lost (\(ports.joined(separator: ","), privacy: .public)) — pausing")
            stop()
        default:
            break
        }
    }

    /// The media server died (rare, but every AVAudioEngine object is
    /// invalid afterwards): rebuild the engine and node, reconfigure the
    /// session, and resume at the same phase if we were playing.
    private func handleMediaServicesReset() {
        let wasPlaying = playing
        let frame = wasPlaying ? currentFrame : 0
        Self.log.error("media services were reset — rebuilding the audio engine (wasPlaying=\(wasPlaying))")
        node.stop()
        engine.stop()
        engine = AVAudioEngine()
        node = AVAudioPlayerNode()
        engine.attach(node)
        connectedFormat = nil
        sessionConfigured = false
        if wasPlaying {
            activateSession()
            restart(atFrame: frame)
        } else if playing {
            playing = false
        }
    }
}

/// Musical length of a loop, in seconds (same as the web's loopSecondsFor).
func loopSecondsFor(bars: Int, bpm: Int) -> Double {
    Double(bars) * 4 * 60 / Double(max(1, bpm))
}
