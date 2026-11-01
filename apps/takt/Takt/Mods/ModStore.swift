import Foundation
import os

/// The player's mods: their own versions of the Stage songs, made in Agent mode on ola.cx
/// (`/api/takt/mods`, src/lib/takt/mods.ts) and kept here as the bundles the server sends —
/// the song file in the app's own format, the song's charting override, the conversation.
/// A bundle is a file in Application Support/mods; the set list shows every mod whose version
/// is 1 or more (a version-0 bundle is a thread that hasn't changed the song yet). The account
/// is the truth: `refresh` pulls what's new and drops what's gone; offline, the files play.
@Observable
final class ModStore {
    struct Message: Codable, Equatable {
        let role: String
        let text: String
        let at: String
        let steps: [String]?
    }

    /// One mod as the server sends it (and as it sits on disk).
    struct Bundle {
        let id: String
        let name: String
        let base: String
        let baseTitle: String
        let title: String
        let version: Int
        let line: String
        let createdAt: String
        let updatedAt: String
        /// The song file: what `Song(name:data:mod:)` reads, and what a mod of this mod sends up.
        let songData: Data
        let override: [String: Charting.PartOverride]?
        let messages: [Message]
        /// The whole bundle, as received.
        let raw: Data

        init(data: Data) throws {
            guard let top = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw Song.LoadError(message: "a mod bundle that is not an object") }
            func string(_ k: String) throws -> String {
                guard let v = top[k] as? String else { throw Song.LoadError(message: "mod bundle: no \(k)") }
                return v
            }
            id = try string("id")
            name = try string("name")
            base = try string("base")
            baseTitle = try string("base_title")
            title = try string("title")
            version = top["version"] as? Int ?? 0
            createdAt = try string("created_at")
            updatedAt = try string("updated_at")
            guard let song = top["song"] as? [String: Any] else { throw Song.LoadError(message: "mod bundle \(name): no song") }
            songData = try JSONSerialization.data(withJSONObject: song)
            line = (song["song"] as? [String: Any])?["line"] as? String ?? ""
            if let c = top["charting"] as? [String: Any], !c.isEmpty {
                override = try JSONDecoder().decode([String: Charting.PartOverride].self, from: JSONSerialization.data(withJSONObject: c))
            } else {
                override = nil
            }
            if let m = top["messages"] {
                messages = try JSONDecoder().decode([Message].self, from: JSONSerialization.data(withJSONObject: m))
            } else {
                messages = []
            }
            raw = data
        }

        var info: Song.ModInfo { .init(id: id, base: base, baseTitle: baseTitle, version: version, override: override) }

        func song() throws -> Song { try Song(name: name, data: songData, mod: info) }
    }

    /// Where the player is when Agent mode opens from a run.
    struct Position: Encodable {
        let part: String
        let difficulty: String
        let level: Int
        let bar: Int
        let section: String
    }

    /// What a turn streams back.
    enum Event {
        /// The row exists (a first message on a bundled song); its title.
        case created(title: String)
        /// One working step.
        case status(String)
        /// The agent's reply, before the bundle lands.
        case reply(String)
        /// The turn is saved: the bundle as it stands now (version unchanged when nothing moved).
        case done(Bundle)
        case failed(String)
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// Every bundle, oldest first, version 0 included.
    private(set) var bundles: [Bundle] = []
    /// The mods on the set list: every bundle of version 1 or more, loaded.
    private(set) var songs: [Song] = []
    private(set) var error: String?
    private(set) var syncing = false

    @ObservationIgnored private let dir: URL
    @ObservationIgnored private let base: URL
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "mods")

    static var defaultDir: URL {
        #if DEBUG
        if let path = UserDefaults.standard.string(forKey: "ModsDir") { return URL(fileURLWithPath: path, isDirectory: true) }
        #endif
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("mods", isDirectory: true)
    }

    init(dir: URL = ModStore.defaultDir, base: URL = AccountStore.defaultBase) {
        self.dir = dir
        self.base = base
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        // A turn streams for minutes; the server pings every ten seconds.
        config.timeoutIntervalForRequest = 90
        config.timeoutIntervalForResource = 600
        session = URLSession(configuration: config)
        loadFiles()
    }

    // MARK: Files

    private func loadFiles() {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        var loaded: [Bundle] = []
        for url in files where url.pathExtension == "json" {
            do {
                loaded.append(try Bundle(data: Data(contentsOf: url)))
            } catch {
                log.error("mod file \(url.lastPathComponent, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        set(loaded)
    }

    private func set(_ list: [Bundle]) {
        bundles = list.sorted { $0.createdAt < $1.createdAt }
        var out: [Song] = []
        for b in bundles where b.version >= 1 {
            do {
                out.append(try b.song())
            } catch {
                log.error("mod \(b.name, privacy: .public) does not load: \(error.localizedDescription, privacy: .public)")
            }
        }
        songs = out
    }

    private func store(_ b: Bundle) {
        try? b.raw.write(to: dir.appendingPathComponent("\(b.id).json"), options: .atomic)
        set(bundles.filter { $0.id != b.id } + [b])
    }

    private func forget(_ id: String) {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(id).json"))
        set(bundles.filter { $0.id != id })
    }

    func bundle(for song: Song) -> Bundle? {
        guard let id = song.mod?.id else { return nil }
        return bundles.first { $0.id == id }
    }

    /// The mods made from this song (by name), oldest first.
    func mods(of name: String) -> [Song] { songs.filter { $0.mod?.base == name } }

    /// A thread on this bundled song that hasn't changed anything yet: the next message
    /// continues it instead of opening another.
    func pendingThread(for name: String) -> Bundle? {
        bundles.last { $0.base == name && $0.version == 0 }
    }

    // MARK: Account

    private struct Summary: Decodable {
        let id: String
        let version: Int
    }

    private struct ListBody: Decodable { let mods: [Summary] }
    private struct ServerError: Decodable { let error: String }

    /// What the account has: new and newer bundles come down, deleted ones go.
    func refresh() async {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "Offline") { return }
        #endif
        syncing = true
        defer { syncing = false }
        do {
            let list: ListBody = try await get("mods")
            let remote = Dictionary(uniqueKeysWithValues: list.mods.map { ($0.id, $0.version) })
            for b in bundles where remote[b.id] == nil { forget(b.id) }
            for s in list.mods where (bundles.first { $0.id == s.id }?.version ?? -1) < s.version || !bundles.contains { $0.id == s.id } {
                let full: Data = try await getData("mods/\(s.id)")
                guard let top = try JSONSerialization.jsonObject(with: full) as? [String: Any], let mod = top["mod"] else { continue }
                store(try Bundle(data: JSONSerialization.data(withJSONObject: mod)))
            }
            error = nil
        } catch {
            self.error = (error as? Failure)?.message ?? "Can't reach ola.cx."
            log.error("refresh: \(error.localizedDescription, privacy: .public)")
        }
    }

    func delete(_ id: String) async throws {
        var req = URLRequest(url: base.appendingPathComponent("api/takt/mods/\(id)"))
        req.httpMethod = "DELETE"
        let (data, response) = try await session.data(for: req)
        try check(response, data)
        forget(id)
    }

    /// One turn of Agent mode on `song`: a bundled song (or a mod) and a message. A bundled
    /// song's first message makes the mod (or continues a thread that hasn't changed it yet);
    /// a mod's continues its own. Streams the steps, then the saved bundle.
    func send(_ message: String, song: Song, position: Position?) -> AsyncStream<Event> {
        AsyncStream { continuation in
            let task = Task {
                do {
                    try await stream(message, song: song, position: position) { continuation.yield($0) }
                } catch {
                    let text = (error as? Failure)?.message ?? (error as? Song.LoadError)?.message ?? "Can't reach ola.cx."
                    log.error("agent: \(error.localizedDescription, privacy: .public)")
                    continuation.yield(.failed(text))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func stream(_ message: String, song: Song, position: Position?, yield: @escaping (Event) -> Void) async throws {
        guard let charting = Foundation.Bundle.main.url(forResource: "charting", withExtension: "json"),
              let chartingJSON = try? JSONSerialization.jsonObject(with: Data(contentsOf: charting)) else { throw Failure(message: "charting.json is missing") }
        var context: [String: Any] = ["charting": chartingJSON, "device": deviceName]
        var figures: [String: [Double]] = [:]
        for k in song.partKeys { figures[k.rawValue] = song.ladder(k) }
        context["figures"] = figures
        if let position {
            context["position"] = ["part": position.part, "difficulty": position.difficulty, "level": position.level, "bar": position.bar, "section": position.section]
        }
        var body: [String: Any] = ["message": message, "context": context]
        let path: String
        if let mod = song.mod {
            path = "mods/\(mod.id)/agent"
        } else if let pending = pendingThread(for: song.name) {
            path = "mods/\(pending.id)/agent"
        } else {
            path = "mods"
            guard let url = Foundation.Bundle.main.url(forResource: song.name, withExtension: "json"),
                  let file = try? JSONSerialization.jsonObject(with: Data(contentsOf: url)) else { throw Failure(message: "\(song.name).json is not in the bundle") }
            body["song"] = file
            body["base"] = song.name
            body["base_title"] = song.meta.title
            if let own = Charting.bundled.songs[song.name] {
                body["charting"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(own))
            }
        }
        var req = URLRequest(url: base.appendingPathComponent("api/takt/\(path)"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (bytes, response) = try await session.bytes(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            var data = Data()
            for try await b in bytes { data.append(b) }
            throw Failure(message: (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "Server error \(status).")
        }
        var gotDone = false
        for try await line in bytes.lines {
            guard line.hasPrefix("data: "), let data = line.dropFirst(6).data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = event["type"] as? String else { continue }
            switch type {
            case "mod":
                if let m = event["mod"] as? [String: Any], let title = m["title"] as? String { yield(.created(title: title)) }
            case "status":
                if let text = event["text"] as? String { yield(.status(text)) }
            case "reply":
                if let text = event["text"] as? String { yield(.reply(text)) }
            case "done":
                if let m = event["mod"] {
                    let bundle = try Bundle(data: JSONSerialization.data(withJSONObject: m))
                    // A bundle the app can't play never reaches the set list; the server keeps it.
                    if bundle.version >= 1 { _ = try bundle.song() }
                    store(bundle)
                    gotDone = true
                    yield(.done(bundle))
                }
            case "error":
                throw Failure(message: event["text"] as? String ?? "The agent tripped.")
            default:
                break
            }
        }
        if !gotDone { throw Failure(message: "The connection dropped before the agent finished. Reopen Agent mode: the thread is kept.") }
    }

    private var deviceName: String {
        #if targetEnvironment(macCatalyst)
        return "mac"
        #else
        return "iphone"
        #endif
    }

    private func check(_ response: URLResponse, _ data: Data) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw Failure(message: (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "Server error \(status).")
        }
    }

    private func getData(_ path: String) async throws -> Data {
        let req = URLRequest(url: base.appendingPathComponent("api/takt/\(path)"))
        let (data, response) = try await session.data(for: req)
        try check(response, data)
        return data
    }

    private func get<R: Decodable>(_ path: String) async throws -> R {
        try JSONDecoder().decode(R.self, from: try await getData(path))
    }

    #if DEBUG
    /// `-LoadMod <file>`: a bundle from disk (a saved `done` event's mod, or a GET's `mod`)
    /// into the store, for the checks and the screenshots without an account.
    func loadFile(_ path: String) throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        if let top = try JSONSerialization.jsonObject(with: data) as? [String: Any], let mod = top["mod"] {
            store(try Bundle(data: JSONSerialization.data(withJSONObject: mod)))
        } else {
            store(try Bundle(data: data))
        }
    }
    #endif
}
