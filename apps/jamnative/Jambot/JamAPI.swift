import Foundation

enum JamAPIError: Error, LocalizedError {
    case unauthenticated
    case http(Int, String?)
    case decode(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .unauthenticated: return "Not signed in."
        case .http(let code, let msg): return "Server returned \(code): \(msg ?? "no message")."
        case .decode(let e): return "Couldn't read server response: \(e.localizedDescription)."
        case .transport(let e): return e.localizedDescription
        }
    }
}

/// Thin HTTP client for the /api/jam/* backend (same routes the web app uses).
/// Session is held in the shared HTTPCookieStorage — the server sets a
/// cookie named `jam_session`; URLSession replays it automatically.
final class JamAPI {
    static let shared = JamAPI()

    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        // Agent turns can run long server-side (a full track render + LLM
        // round trip) — match the server's own generous timeout.
        config.timeoutIntervalForRequest = 300
        self.session = URLSession(configuration: config)
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
    }

    private struct EmptyBody: Encodable {}
    private struct EmptyResponse: Decodable {}

    private func url(_ path: String) -> URL {
        Secrets.backendBaseURL.appendingPathComponent(path)
    }

    private func request<T: Decodable>(_ path: String, method: String, body: Encodable?) async throws -> T {
        var req = URLRequest(url: url(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        if let body {
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw JamAPIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw JamAPIError.transport(URLError(.badServerResponse))
        }
        if http.statusCode == 401 { throw JamAPIError.unauthenticated }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw JamAPIError.http(http.statusCode, msg)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw JamAPIError.decode(error)
        }
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        try await request(path, method: "GET", body: nil)
    }
    private func post<T: Decodable>(_ path: String, body: Encodable = EmptyBody()) async throws -> T {
        try await request(path, method: "POST", body: body)
    }
    private func put<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        try await request(path, method: "PUT", body: body)
    }
    private func delete<T: Decodable>(_ path: String) async throws -> T {
        try await request(path, method: "DELETE", body: nil)
    }

    func clearCookies() {
        guard let cookies = HTTPCookieStorage.shared.cookies else { return }
        for cookie in cookies where cookie.name == "jam_session" {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    // MARK: Auth

    private struct UserResponse: Decodable { let user: JamUser }
    private struct LoginBody: Encodable { let username: String; let password: String }
    private struct OkResponse: Decodable { let ok: Bool }

    func me() async throws -> JamUser {
        let res: UserResponse = try await get("/api/jam/auth/me")
        return res.user
    }

    func login(username: String, password: String) async throws -> JamUser {
        let res: UserResponse = try await post("/api/jam/auth/login", body: LoginBody(username: username, password: password))
        return res.user
    }

    func signup(username: String, password: String) async throws -> JamUser {
        let res: UserResponse = try await post("/api/jam/auth/signup", body: LoginBody(username: username, password: password))
        return res.user
    }

    func logout() async throws {
        let _: OkResponse = try await post("/api/jam/auth/logout")
        clearCookies()
    }

    // MARK: Tracks

    private struct TracksResponse: Decodable { let tracks: [TrackMeta] }
    private struct TrackResponse: Decodable { let track: Track }
    private struct TrackMetaResponse: Decodable { let track: TrackMeta }
    private struct CreateTrackBody: Encodable { let title: String? }

    func tracks() async throws -> [TrackMeta] {
        let res: TracksResponse = try await get("/api/jam/tracks")
        return res.tracks
    }

    func createTrack(title: String? = nil) async throws -> Track {
        let res: TrackResponse = try await post("/api/jam/tracks", body: CreateTrackBody(title: title))
        return res.track
    }

    func track(_ id: String) async throws -> Track {
        let res: TrackResponse = try await get("/api/jam/tracks/\(id)")
        return res.track
    }

    func saveTrack(_ id: String, patch: TrackPatch) async throws -> TrackMeta {
        let res: TrackMetaResponse = try await put("/api/jam/tracks/\(id)", body: patch)
        return res.track
    }

    func deleteTrack(_ id: String) async throws {
        let _: OkResponse = try await delete("/api/jam/tracks/\(id)")
    }

    // MARK: LLM proxy (engine host)

    /// POST /api/jam/llm with the exact body the engine's agent loop built
    /// ({ system, messages, tools, max_tokens }); returns the raw Messages
    /// API response JSON for the engine to consume. 401 → `.unauthenticated`,
    /// any other non-2xx → `.http` with the server's `error` message.
    func llm(body: Data) async throws -> Data {
        var req = URLRequest(url: url("/api/jam/llm"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = body
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw JamAPIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw JamAPIError.transport(URLError(.badServerResponse))
        }
        if http.statusCode == 401 { throw JamAPIError.unauthenticated }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw JamAPIError.http(http.statusCode, msg)
        }
        return data
    }
}

/// Type-erasing box so `request(_:method:body:)` can accept any Encodable
/// without making the whole client generic over the body type.
private struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { self.encodeFn = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}
