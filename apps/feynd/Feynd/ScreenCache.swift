import Foundation

/// Stale-while-revalidate cache for screen payloads. Each main screen
/// persists its last-good decoded payload to disk, renders it instantly on
/// next launch, then refreshes from the network and rewrites the file. The
/// whole cache is wiped on sign-out (and on a confirmed 401), so a device
/// only ever holds the signed-in user's data — keys don't need a user id.
enum ScreenCache {
    static let sessionUser = "session-user"
    static let topics = "topics"
    static let chatLatest = "chat-latest"
    static let jumbo = "jumbo"

    private static var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory,
                                            in: .userDomainMask)[0]
        return base.appendingPathComponent("DodoCache", isDirectory: true)
    }

    private static func url(_ key: String) -> URL {
        dir.appendingPathComponent("\(key).json")
    }

    static func save<T: Encodable>(_ value: T, key: String) {
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(value)
            try data.write(to: url(key), options: .atomic)
        } catch {
            // Cache writes are best-effort; the network copy is the truth.
        }
    }

    static func load<T: Decodable>(_ type: T.Type = T.self, key: String) -> T? {
        guard let data = try? Data(contentsOf: url(key)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: dir)
    }
}
