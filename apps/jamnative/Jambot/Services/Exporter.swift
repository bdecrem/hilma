import Foundation
import AVFoundation

/// Writes a rendered track (planar Int16 PCM, the same shape `EngineAPI
/// .render` hands back) out to WAV or AAC files — the native equivalent of
/// `src/app/jam/export.ts`. No MP3 here (that's a browser-side lamejs
/// encoder); AAC via the platform encoder is the native swap-in.
enum ExportFormat: String, CaseIterable, Identifiable {
    case wav, aac
    var id: String { rawValue }
    var label: String { self == .wav ? "WAV" : "AAC" }
    var fileExtension: String { self == .wav ? "wav" : "m4a" }
}

enum ExporterError: Error, LocalizedError {
    case emptyBuffer
    case formatUnsupported
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .emptyBuffer: return "Nothing rendered yet."
        case .formatUnsupported: return "This device can't encode AAC at that sample rate/channel count."
        case .writeFailed(let msg): return "Export failed: \(msg)"
        }
    }
}

enum Exporter {
    /// `jambot-<bpm>bpm-<yyyyMMdd-HHmm>.<ext>` — same idea as the web's
    /// `trackFilename`, branded for the native app.
    static func filename(bpm: Int, format: ExportFormat) -> String {
        let df = DateFormatter()
        df.dateFormat = "yyyyMMdd-HHmm"
        return "jambot-\(bpm)bpm-\(df.string(from: Date())).\(format.fileExtension)"
    }

    /// Raw WAV bytes from planar Int16 PCM (channel 0 in full, then channel
    /// 1 in full — the shape `RenderResult.pcm` is already in). Byte layout
    /// matches `../vibeceo/jambot/core/wav.js` `audioBufferToWav` exactly:
    /// 44-byte canonical header, 16-bit PCM, interleaved samples.
    static func wavData(pcm: [Int16], sampleRate: Double, channels: Int) throws -> Data {
        guard channels > 0, !pcm.isEmpty else { throw ExporterError.emptyBuffer }
        let frames = pcm.count / channels
        guard frames > 0 else { throw ExporterError.emptyBuffer }

        let bitDepth = 16
        let bytesPerSample = bitDepth / 8
        let blockAlign = channels * bytesPerSample
        let dataSize = frames * blockAlign
        var data = Data(capacity: 44 + dataSize)

        func ascii(_ s: String) { data.append(contentsOf: Array(s.utf8)) }
        func u32(_ v: UInt32) { var le = v.littleEndian; withUnsafeBytes(of: &le) { data.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { var le = v.littleEndian; withUnsafeBytes(of: &le) { data.append(contentsOf: $0) } }

        ascii("RIFF"); u32(UInt32(36 + dataSize)); ascii("WAVE")
        ascii("fmt "); u32(16); u16(1); u16(UInt16(channels))
        u32(UInt32(sampleRate)); u32(UInt32(sampleRate) * UInt32(blockAlign)); u16(UInt16(blockAlign)); u16(UInt16(bitDepth))
        ascii("data"); u32(UInt32(dataSize))

        // De-interleave planar -> interleaved as we write.
        data.reserveCapacity(44 + dataSize)
        for i in 0..<frames {
            for c in 0..<channels {
                var s = pcm[c * frames + i].littleEndian
                withUnsafeBytes(of: &s) { data.append(contentsOf: $0) }
            }
        }
        return data
    }

    /// Writes a WAV file to `url` (overwriting), returning its byte count.
    @discardableResult
    static func writeWav(pcm: [Int16], sampleRate: Double, channels: Int, to url: URL) throws -> Int {
        let data = try wavData(pcm: pcm, sampleRate: sampleRate, channels: channels)
        try data.write(to: url, options: .atomic)
        return data.count
    }

    /// Writes an AAC .m4a file to `url` (overwriting) at 192 kbps, using
    /// `AVAudioFile`'s compressed-format writer (ExtAudioFile under the
    /// hood) rather than hand-assembling `AVAssetWriter` sample buffers —
    /// same encoder, far less code to get wrong. Returns the file's byte
    /// count once the write completes.
    @discardableResult
    static func writeAac(pcm: [Int16], sampleRate: Double, channels: Int, to url: URL) throws -> Int {
        guard channels > 0, !pcm.isEmpty else { throw ExporterError.emptyBuffer }
        let frames = pcm.count / channels
        guard frames > 0 else { throw ExporterError.emptyBuffer }

        if FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.removeItem(at: url)
        }

        // AVEncoderBitRateStrategyKey matters here: without it, AVAudioFile's
        // encoder silently ignores AVEncoderBitRateKey and falls back to a
        // ~36 kbps default (found via the -exportSmoke check below) — with
        // it, actual output lands within ~0.2% of the requested 192 kbps.
        let outSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: channels,
            AVEncoderBitRateKey: 192_000,
            AVEncoderBitRateStrategyKey: AVAudioBitRateStrategy_Constant,
        ]
        let file: AVAudioFile
        do {
            file = try AVAudioFile(forWriting: url, settings: outSettings, commonFormat: .pcmFormatFloat32, interleaved: false)
        } catch {
            throw ExporterError.writeFailed(error.localizedDescription)
        }

        guard let inFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: AVAudioChannelCount(channels), interleaved: false),
              let buffer = AVAudioPCMBuffer(pcmFormat: inFormat, frameCapacity: AVAudioFrameCount(frames)),
              let channelData = buffer.floatChannelData
        else { throw ExporterError.formatUnsupported }

        buffer.frameLength = AVAudioFrameCount(frames)
        for c in 0..<channels {
            let dst = channelData[c]
            for i in 0..<frames {
                dst[i] = Float(pcm[c * frames + i]) / 32768.0
            }
        }

        do {
            try file.write(from: buffer)
        } catch {
            throw ExporterError.writeFailed(error.localizedDescription)
        }

        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? nil
        return size ?? 0
    }

    /// Writes either format to a fresh temp file named per `filename(bpm:format:)`
    /// and returns its URL — what `BounceSheet` hands to the share sheet.
    static func export(pcm: [Int16], sampleRate: Double, channels: Int, bpm: Int, format: ExportFormat) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename(bpm: bpm, format: format))
        switch format {
        case .wav: try writeWav(pcm: pcm, sampleRate: sampleRate, channels: channels, to: url)
        case .aac: try writeAac(pcm: pcm, sampleRate: sampleRate, channels: channels, to: url)
        }
        return url
    }

    /// A 2-second 440 Hz sine, stereo, planar Int16 — for the `-exportSmoke`
    /// debug check (no engine/render needed).
    static func syntheticSine(seconds: Double = 2, sampleRate: Double = 44100, channels: Int = 2, frequency: Double = 440) -> [Int16] {
        let frames = Int(seconds * sampleRate)
        var pcm = [Int16](repeating: 0, count: frames * channels)
        for i in 0..<frames {
            let t = Double(i) / sampleRate
            let sample = Int16((sin(2 * .pi * frequency * t) * 0.5 * 32767).rounded())
            for c in 0..<channels { pcm[c * frames + i] = sample }
        }
        return pcm
    }
}
