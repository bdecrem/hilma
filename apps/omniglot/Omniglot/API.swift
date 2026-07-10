import Foundation

enum APIError: Error, LocalizedError {
    case http(Int, String?)
    case decode(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .http(let code, let msg):
            // Surface the server's own error message when it sent one.
            if let msg, let data = msg.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let serverError = obj["error"] as? String {
                return serverError
            }
            return "Server returned \(code)."
        case .decode(let e): return "Couldn't read server response: \(e.localizedDescription)"
        case .transport(let e): return e.localizedDescription
        }
    }
}

/// HTTP client for /api/omni/*. The omni_session cookie persists across
/// launches via shared HTTPCookieStorage.
final class API {
    static let shared = API()

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
        session = URLSession(configuration: config)

        encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
    }

    // MARK: Auth

    func signup(email: String, password: String, language: String, level: Int) async throws -> AuthResponse {
        struct Body: Encodable { let email, password, language: String; let level: Int }
        return try await post("/api/omni/auth/signup", Body(email: email, password: password, language: language, level: level))
    }

    func login(email: String, password: String) async throws -> AuthResponse {
        struct Body: Encodable { let email, password: String }
        return try await post("/api/omni/auth/login", Body(email: email, password: password))
    }

    func me() async throws -> AuthResponse {
        try await get("/api/omni/auth/me")
    }

    func logout() async throws {
        struct Empty: Codable {}
        let _: Empty = try await post("/api/omni/auth/logout", Empty())
        if let cookies = HTTPCookieStorage.shared.cookies {
            for cookie in cookies where cookie.name == "omni_session" {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            }
        }
    }

    /// Switch language (per-language progress is kept server-side).
    func updateLanguage(_ code: String, startLevel: Int? = nil) async throws -> AuthResponse {
        struct Body: Encodable { let language: String; let level: Int? }
        return try await request("/api/omni/me", method: "PATCH", body: Body(language: code, level: startLevel))
    }

    // MARK: Chapters

    func topics() async throws -> TopicsResponse {
        try await get("/api/omni/topics")
    }

    func topicDetail(id: String) async throws -> TopicDetail {
        try await get("/api/omni/topics/\(id)")
    }

    /// Generate a custom chapter. Slow (~15-30s) — the server builds the
    /// whole package in one call.
    func createTopic(title: String, level: Int?) async throws -> TopicDetail {
        struct Body: Encodable { let title: String; let level: Int? }
        return try await post("/api/omni/topics", Body(title: title, level: level))
    }

    func deleteTopic(id: String) async throws {
        struct Empty: Codable { let ok: Bool? }
        let _: Empty = try await request("/api/omni/topics/\(id)", method: "DELETE", body: nil as Nothing?)
    }

    // MARK: Flash cards

    func submitReviews(_ results: [(cardId: String, known: Bool)]) async throws -> XpResult {
        struct Item: Encodable { let cardId: String; let known: Bool }
        struct Body: Encodable { let results: [Item] }
        let res: XpResponse = try await post(
            "/api/omni/review",
            Body(results: results.map { Item(cardId: $0.cardId, known: $0.known) })
        )
        return res.xp
    }

    // MARK: Talk

    func startTalkSession(topicId: String?) async throws -> TalkSessionResponse {
        struct Body: Encodable { let topicId: String? }
        return try await post("/api/omni/talk/session", Body(topicId: topicId))
    }

    func endTalkSession(id: String, transcript: [[String: String]]) async throws -> EndSessionResponse {
        struct Body: Encodable { let transcript: [[String: String]] }
        return try await request("/api/omni/talk/session/\(id)", method: "PATCH", body: Body(transcript: transcript))
    }

    // MARK: Plumbing

    private struct Nothing: Encodable {}

    private func get<R: Decodable>(_ path: String) async throws -> R {
        try await request(path, method: "GET", body: nil as Nothing?)
    }

    private func post<B: Encodable, R: Decodable>(_ path: String, _ body: B) async throws -> R {
        try await request(path, method: "POST", body: body)
    }

    private func request<B: Encodable, R: Decodable>(
        _ path: String,
        method: String,
        body: B?
    ) async throws -> R {
        var encoded: Data? = nil
        if let body { encoded = try encoder.encode(body) }
        let data = try await raw(path, method: method, body: encoded)
        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            throw APIError.decode(error)
        }
    }

    private func raw(_ path: String, method: String, body: Data?) async throws -> Data {
        guard let url = URL(string: path, relativeTo: Secrets.backendBaseURL) else {
            throw APIError.http(0, "bad path \(path)")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 90 // chapter generation is a long call
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError.http(status, String(data: data, encoding: .utf8))
        }
        return data
    }
}
