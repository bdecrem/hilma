import Foundation
import CryptoKit
import os

// On-device render cache — the native twin of src/app/jam/renderCache.ts.
//
// The last whole-track render of each track is kept under
// Caches/renders/<trackId>.pcm (the planar Int16 samples exactly as the
// engine handed them over: channel 0, then channel 1) with a
// <trackId>.json sidecar (key + the RenderResult metadata). The key is a
// SHA-256 of "<engine stamp>|<serialized session JSON>", so any change to
// the session — or an engine bundle update — misses the cache and a stale
// render can never be played for a different state. Reopening an unchanged
// track plays instantly instead of re-rendering (a long song takes tens of
// seconds on a phone). The 6 most recently saved tracks are kept.
//
// Nothing here throws: a cache problem is logged and treated as a miss.
// The file work runs on a utility queue so a 42 MB write (128 bars, stereo)
// never touches the main thread; reads go straight from Data into the
// [Int16] with one bulk copy.
final class RenderCache {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "cache")
    static let shared = RenderCache()

    /// Tracks kept on disk (most recently saved first).
    static let keep = 6

    /// Where the files live; `nil` when the Caches directory is unavailable.
    let directory: URL?

    private let queue = DispatchQueue(label: "com.bartdecrem.Jambot.renderCache", qos: .utility)

    /// Sidecar metadata — everything in `RenderResult` but the samples,
    /// plus the key it was rendered for.
    struct Sidecar: Codable, Equatable {
        var key: String
        var bpm: Int
        var bars: Int
        var hasArrangement: Bool
        var message: String
        var sampleRate: Double
        var channels: Int
        var length: Int
        var savedAt: Double // seconds since 1970
    }

    init(directory: URL? = nil) {
        if let directory {
            self.directory = directory
        } else if let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            self.directory = caches.appendingPathComponent("renders", isDirectory: true)
        } else {
            self.directory = nil
        }
    }

    // MARK: - Key

    /// Cache key for a session state: SHA-256 hex of
    /// `"<stamp>|<sessionJSON>"` — same text as the web's `renderCacheKey`.
    /// `stamp` is the engine bundle stamp (`EngineHost.engineVersion`), so a
    /// bundle update re-renders even when the session did not change.
    static func key(sessionJSON: Data, stamp: String) -> String {
        var hasher = SHA256()
        hasher.update(data: Data("\(stamp)|".utf8))
        hasher.update(data: sessionJSON)
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// Convenience for callers holding the session as `JSONValue` (what
    /// `EngineAPI.serialize()` returns). Encoded with sorted keys so the
    /// same state always hashes the same.
    static func key(session: JSONValue, stamp: String) -> String? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(session) else { return nil }
        return key(sessionJSON: data, stamp: stamp)
    }

    // MARK: - Read

    /// The cached whole-track render for `trackId` when its key matches,
    /// else `nil`. Never throws.
    func load(trackId: String, key: String) async -> RenderResult? {
        await withCheckedContinuation { cont in
            queue.async { cont.resume(returning: self.loadSync(trackId: trackId, key: key)) }
        }
    }

    private func loadSync(trackId: String, key: String) -> RenderResult? {
        guard let dir = directory else { return nil }
        let sidecarURL = dir.appendingPathComponent("\(Self.safe(trackId)).json")
        let pcmURL = dir.appendingPathComponent("\(Self.safe(trackId)).pcm")
        guard let sidecarData = try? Data(contentsOf: sidecarURL),
              let meta = try? JSONDecoder().decode(Sidecar.self, from: sidecarData) else { return nil }
        guard meta.key == key else {
            Self.log.notice("cache miss \(trackId, privacy: .public): key changed")
            return nil
        }
        let samples = meta.length * meta.channels
        guard samples > 0 else { return nil }
        let started = Date()
        // Map the file rather than read it — the copy below is the only pass.
        guard let data = try? Data(contentsOf: pcmURL, options: .mappedIfSafe),
              data.count == samples * MemoryLayout<Int16>.size else {
            Self.log.error("cache \(trackId, privacy: .public): pcm size mismatch, dropping")
            dropSync(trackId: trackId)
            return nil
        }
        // One bulk copy into the array — no per-sample work.
        let pcm = [Int16](unsafeUninitializedCapacity: samples) { dst, count in
            data.withUnsafeBytes { src in
                let bytes = dst.count * MemoryLayout<Int16>.size
                UnsafeMutableRawBufferPointer(dst).copyMemory(from: UnsafeRawBufferPointer(rebasing: src.prefix(bytes)))
            }
            count = samples
        }
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        Self.log.notice("cache hit \(trackId, privacy: .public): \(meta.bars) bars, \(samples * 2 / 1_048_576) MB in \(ms) ms")
        // Touch the sidecar so pruning keeps what was actually used recently.
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: sidecarURL.path)
        return RenderResult(bars: meta.bars, bpm: meta.bpm, hasArrangement: meta.hasArrangement, message: meta.message,
                            sampleRate: meta.sampleRate, channels: meta.channels, length: meta.length, pcm: pcm)
    }

    // MARK: - Write

    /// Store a whole-track render and prune to the `keep` most recent
    /// tracks. Never throws. Only cache song-scope renders — a section
    /// audition is not "the track".
    func save(trackId: String, key: String, _ result: RenderResult) async {
        await withCheckedContinuation { cont in
            queue.async { self.saveSync(trackId: trackId, key: key, result); cont.resume() }
        }
    }

    private func saveSync(trackId: String, key: String, _ r: RenderResult) {
        guard let dir = directory else { return }
        guard r.length > 0, r.channels >= 1, r.pcm.count >= r.length * r.channels else {
            Self.log.error("cache save \(trackId, privacy: .public): malformed render, skipped")
            return
        }
        let fm = FileManager.default
        do {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            let base = Self.safe(trackId)
            let pcmURL = dir.appendingPathComponent("\(base).pcm")
            let sidecarURL = dir.appendingPathComponent("\(base).json")
            let samples = r.length * r.channels
            let started = Date()
            // Write the planar Int16 as-is — no conversion pass.
            let data = r.pcm.withUnsafeBufferPointer { buf in
                Data(buffer: UnsafeBufferPointer(rebasing: buf.prefix(samples)))
            }
            try data.write(to: pcmURL, options: .atomic)
            let meta = Sidecar(key: key, bpm: r.bpm, bars: r.bars, hasArrangement: r.hasArrangement, message: r.message,
                               sampleRate: r.sampleRate, channels: r.channels, length: r.length,
                               savedAt: Date().timeIntervalSince1970)
            try JSONEncoder().encode(meta).write(to: sidecarURL, options: .atomic)
            let ms = Int(Date().timeIntervalSince(started) * 1000)
            Self.log.notice("cache saved \(trackId, privacy: .public): \(r.bars) bars, \(data.count / 1_048_576) MB in \(ms) ms")
            pruneSync(keeping: base)
        } catch {
            Self.log.error("cache save \(trackId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Keep the `keep` most recently saved tracks (by sidecar `savedAt`);
    /// `current` is never pruned.
    private func pruneSync(keeping current: String) {
        guard let dir = directory else { return }
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return }
        var entries: [(base: String, savedAt: Double)] = []
        for url in files where url.pathExtension == "json" {
            let base = url.deletingPathExtension().lastPathComponent
            guard let data = try? Data(contentsOf: url), let meta = try? JSONDecoder().decode(Sidecar.self, from: data) else {
                // Unreadable sidecar: its pcm is unusable too.
                try? fm.removeItem(at: url)
                try? fm.removeItem(at: dir.appendingPathComponent("\(base).pcm"))
                continue
            }
            entries.append((base, base == current ? .greatestFiniteMagnitude : meta.savedAt))
        }
        // Orphan pcm files (crash between the two writes) go too.
        for url in files where url.pathExtension == "pcm" {
            let base = url.deletingPathExtension().lastPathComponent
            if !entries.contains(where: { $0.base == base }) { try? fm.removeItem(at: url) }
        }
        let stale = entries.sorted { $0.savedAt > $1.savedAt }.dropFirst(Self.keep)
        for e in stale {
            try? fm.removeItem(at: dir.appendingPathComponent("\(e.base).json"))
            try? fm.removeItem(at: dir.appendingPathComponent("\(e.base).pcm"))
            Self.log.notice("cache pruned \(e.base, privacy: .public)")
        }
    }

    // MARK: - Drop

    /// Remove a track's cached render (e.g. when the track is deleted).
    /// Never throws.
    func drop(trackId: String) {
        queue.async { self.dropSync(trackId: trackId) }
    }

    private func dropSync(trackId: String) {
        guard let dir = directory else { return }
        let base = Self.safe(trackId)
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(base).json"))
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(base).pcm"))
    }

    /// Track ids on disk right now (for About/debug and the smoke test).
    func cachedTrackIds() async -> [String] {
        await withCheckedContinuation { cont in
            queue.async {
                guard let dir = self.directory,
                      let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
                    cont.resume(returning: []); return
                }
                cont.resume(returning: files.filter { $0.pathExtension == "json" }.map { $0.deletingPathExtension().lastPathComponent }.sorted())
            }
        }
    }

    /// Track ids are UUIDs today; keep the file name safe if that changes.
    private static func safe(_ id: String) -> String {
        String(id.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" ? Character($0) : "_" })
    }
}
