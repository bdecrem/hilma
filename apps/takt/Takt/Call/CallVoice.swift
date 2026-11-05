import AVFoundation
import Foundation
import os

/// Call's voice: the words it says (`Call.Word`), one clip each in `Takt/Sounds/call-<clip>.caf`
/// (River on ElevenLabs, rendered once by `scripts/call-voice.py`; `--check` has Whisper read
/// them back), played through the app's own engine on one player (`AudioEngine.makePlayer`), so
/// it shares the output and the `-Silent` volume and needs no network. A phrase is one buffer:
/// the clips copied in with a short gap between words and a longer one before a crossing, so
/// "three, C, tuck" has the rhythm of a call. Main thread only.
final class CallVoice {
    static let gapSeconds = 0.09
    static let crossingGapSeconds = 0.2

    private let audio: AudioEngine
    private let player: AVAudioPlayerNode
    private let format: AVAudioFormat
    private var clips: [String: AVAudioPCMBuffer] = [:]
    /// Bumped by every `say` and `stop`: a finished phrase reports only if it is still the last.
    private var generation = 0
    private static let log = Logger(subsystem: "takt", category: "call")

    /// Every clip from the bundle, or nil (and a log line) when one is missing.
    init?(on audio: AudioEngine) {
        self.audio = audio
        var format: AVAudioFormat?
        for clip in Call.Word.clips {
            guard let url = Bundle.main.url(forResource: "call-\(clip)", withExtension: "caf"),
                  let file = try? AVAudioFile(forReading: url),
                  let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
                  (try? file.read(into: buf)) != nil
            else {
                Self.log.error("call voice: call-\(clip, privacy: .public).caf is not in the bundle")
                return nil
            }
            if format == nil { format = buf.format }
            guard buf.format == format else {
                Self.log.error("call voice: call-\(clip, privacy: .public).caf is not in the voice's format")
                return nil
            }
            clips[clip] = buf
        }
        guard let format else { return nil }
        self.format = format
        player = audio.makePlayer(format: format)
    }

    /// How long a clip lasts.
    func seconds(_ word: Call.Word) -> Double {
        guard let b = clips[word.clip] else { return 0 }
        return Double(b.frameLength) / b.format.sampleRate
    }

    /// How long `words` take to say, gaps included.
    func seconds(_ words: [Call.Word]) -> Double {
        var total = 0.0
        for (i, w) in words.enumerated() {
            if i > 0 { total += Self.gap(before: w) }
            total += seconds(w)
        }
        return total
    }

    private static func gap(before word: Call.Word) -> Double {
        switch word {
        case .tuck, .over: crossingGapSeconds
        default: gapSeconds
        }
    }

    /// Says `words`, cutting off anything still being said; `done` runs on the main thread
    /// once the last word has sounded (not when it was cut off).
    func say(_ words: [Call.Word], done: (() -> Void)? = nil) {
        player.stop()
        generation += 1
        let g = generation
        guard let buf = phrase(words) else {
            done?()
            return
        }
        player.scheduleBuffer(buf, at: nil, options: [], completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, self.generation == g else { return }
                done?()
            }
        }
        player.play()
    }

    func stop() {
        generation += 1
        player.stop()
    }

    /// One buffer for the phrase: the clips end to end with their gaps.
    private func phrase(_ words: [Call.Word]) -> AVAudioPCMBuffer? {
        guard !words.isEmpty, let channels = Int(exactly: format.channelCount) else { return nil }
        let rate = format.sampleRate
        let frames = AVAudioFrameCount((seconds(words) * rate).rounded(.up)) + 1
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames), let dst = out.floatChannelData else { return nil }
        for c in 0..<channels { dst[c].initialize(repeating: 0, count: Int(frames)) }
        var at = 0
        for (i, w) in words.enumerated() {
            if i > 0 { at += Int((Self.gap(before: w) * rate).rounded()) }
            guard let clip = clips[w.clip], let src = clip.floatChannelData else { continue }
            let n = min(Int(clip.frameLength), Int(frames) - at)
            guard n > 0 else { break }
            for c in 0..<channels { (dst[c] + at).update(from: src[c], count: n) }
            at += n
        }
        out.frameLength = AVAudioFrameCount(at)
        return out
    }
}
