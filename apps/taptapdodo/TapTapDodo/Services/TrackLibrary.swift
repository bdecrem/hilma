import Foundation
import Combine

/// Runtime track registry: the 5 built-ins plus downloaded track packs.
/// Downloaded packs live as JSON files in Application Support/taptapdodo/
/// tracks/ and persist across launches. The online catalog is fetched from
/// the hilma backend; fetch failure is silent by design — the set-select
/// screen must never block on network.
@MainActor
final class TrackLibrary: ObservableObject {

    /// One row of the online catalog (GET /api/ttd/tracks).
    struct OnlineTrack: Codable, Identifiable {
        let id: String
        let name: String
        let genreLine: String
        let bpm: Double
        let bars: Int
        let skinRef: String?
    }

    private struct OnlineList: Codable { let tracks: [OnlineTrack] }

    // Production Next.js backend for the track store (routes: /api/ttd/tracks
    // and /api/ttd/tracks/[id]). Vercel project `hilma`.
    static let baseURL = URL(string: "https://hilma-nine.vercel.app")!

    @Published private(set) var downloaded: [TrackDef] = []
    @Published private(set) var online: [OnlineTrack] = []
    @Published private(set) var downloading: Set<String> = []

    init() {
        loadDownloaded()
    }

    // MARK: - Registry

    /// Everything playable right now: built-ins first, then downloads.
    var allPlayable: [TrackDef] { TrackDef.all + downloaded }

    func byId(_ id: String) -> TrackDef? {
        TrackDef.byId(id) ?? downloaded.first { $0.id == id }
    }

    func isDownloaded(_ id: String) -> Bool {
        byId(id) != nil
    }

    /// Online rows worth showing as store cards (built-ins never appear).
    var storeTracks: [OnlineTrack] {
        online.filter { TrackDef.byId($0.id) == nil }
    }

    // MARK: - Persistence

    private var tracksDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("taptapdodo/tracks", isDirectory: true)
    }

    private func loadDownloaded() {
        let dir = tracksDir
        guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return }
        var defs: [TrackDef] = []
        for file in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) where file.pathExtension == "json" {
            do {
                let data = try Data(contentsOf: file)
                let pack = try JSONDecoder().decode(TrackPack.self, from: data)
                defs.append(try pack.toTrackDef())
            } catch {
                // A corrupt file must not brick the library — skip it, loudly.
                print("TrackLibrary: skipping \(file.lastPathComponent): \(error)")
            }
        }
        downloaded = defs
    }

    // MARK: - Network

    /// Refresh the online catalog. Silent on failure per the store spec.
    func fetchOnline() async {
        var req = URLRequest(url: TrackLibrary.baseURL.appendingPathComponent("api/ttd/tracks"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 10
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return }
            online = try JSONDecoder().decode(OnlineList.self, from: data).tracks
        } catch {
            // No online cards, no error spam.
        }
    }

    /// Download one pack, validate it end to end, persist it, register it.
    func download(_ id: String) async throws {
        guard !downloading.contains(id) else { return }
        downloading.insert(id)
        defer { downloading.remove(id) }

        var req = URLRequest(url: TrackLibrary.baseURL.appendingPathComponent("api/ttd/tracks/\(id)"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 15
        let (data, response) = try await URLSession.shared.data(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let pack = try JSONDecoder().decode(TrackPack.self, from: data)
        let def = try pack.toTrackDef()   // validate BEFORE persisting

        let dir = tracksDir
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try data.write(to: dir.appendingPathComponent("\(pack.id).json"), options: .atomic)

        downloaded.removeAll { $0.id == def.id }
        downloaded.append(def)
    }

    /// Deep-link path: if the track isn't local but the store has it,
    /// download it first. Returns true when the track is playable.
    func ensurePlayable(_ id: String) async -> Bool {
        if byId(id) != nil { return true }
        do {
            try await download(id)
            return true
        } catch {
            return false
        }
    }
}
