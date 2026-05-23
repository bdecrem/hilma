import Foundation

enum F2APIError: Error, LocalizedError {
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

/// Thin HTTP client for the F2 backend.
///
/// Session is held in the shared HTTPCookieStorage. The web app sets an
/// httpOnly persistent cookie named `f2_session` with Max-Age 30 days; iOS
/// URLSession picks it up automatically and replays it on subsequent calls,
/// surviving app launches via the system cookie store.
final class F2API {
    static let shared = F2API()

    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601

        self.decoder = JSONDecoder()
        // Server returns timestamps in two flavors:
        // - ISO8601 with fractional seconds + timezone (Postgres timestamptz)
        // - Plain ISO8601 (set on client side via new Date().toISOString())
        // Try both before giving up.
        let isoFractional = ISO8601DateFormatter()
        isoFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoBasic = ISO8601DateFormatter()
        isoBasic.formatOptions = [.withInternetDateTime]
        self.decoder.dateDecodingStrategy = .custom { d in
            let container = try d.singleValueContainer()
            let str = try container.decode(String.self)
            if let date = isoFractional.date(from: str) { return date }
            if let date = isoBasic.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unparseable date: \(str)")
        }
    }

    // MARK: Auth

    struct LoginResponse: Codable { let user: F2User }

    func login(username: String, password: String) async throws -> F2User {
        struct Body: Encodable { let username: String; let password: String }
        let res: LoginResponse = try await post("/api/f2/auth/login", body: Body(username: username, password: password))
        return res.user
    }

    func me() async throws -> F2User {
        let res: LoginResponse = try await get("/api/f2/auth/me")
        return res.user
    }

    func logout() async throws {
        let _: EmptyResponse = try await post("/api/f2/auth/logout", body: EmptyBody())
        clearCookies()
    }

    // MARK: Messages

    struct MessageResponse: Codable { let reply: String }

    func sendMessage(text: String, threadId: String? = nil) async throws -> String {
        struct Body: Encodable {
            let text: String
            let thread_id: String?
        }
        let res: MessageResponse = try await post("/api/f2/messages", body: Body(text: text, thread_id: threadId))
        return res.reply
    }

    // MARK: Topics

    struct TopicsResponse: Codable { let topics: [F2Topic] }
    struct ThreadResponse: Codable { let thread: F2Thread }
    struct IngestResponse: Codable {
        let thread: ThreadStub
        struct ThreadStub: Codable { let id: String; let topic: String? }
    }

    func listTopics() async throws -> [F2Topic] {
        let res: TopicsResponse = try await get("/api/f2/topics")
        return res.topics
    }

    struct LatestResponse: Codable { let thread: F2Thread? }

    func latestThread() async throws -> F2Thread? {
        let res: LatestResponse = try await get("/api/f2/latest")
        return res.thread
    }

    func getThread(id: String) async throws -> F2Thread {
        let res: ThreadResponse = try await get("/api/f2/topics/\(id)")
        return res.thread
    }

    func renameTopic(id: String, to newTopic: String) async throws {
        struct Body: Encodable { let topic: String }
        let _: EmptyResponse = try await request("/api/f2/topics/\(id)", method: "PATCH", body: Body(topic: newTopic))
    }

    func deleteTopic(id: String) async throws {
        let _: EmptyResponse = try await request("/api/f2/topics/\(id)", method: "DELETE", body: nil as EmptyBody?)
    }

    func quizMe(id: String) async throws -> String {
        let res: MessageResponse = try await request("/api/f2/topics/\(id)/quiz", method: "POST", body: nil as EmptyBody?)
        return res.reply
    }

    func ingestPaste(title: String?, text: String) async throws -> String {
        struct Body: Encodable { let title: String?; let text: String }
        let res: IngestResponse = try await post("/api/f2/topics/ingest", body: Body(title: title?.isEmpty == true ? nil : title, text: text))
        return res.thread.id
    }

    // MARK: HTTP plumbing

    private struct EmptyBody: Codable {}
    private struct EmptyResponse: Codable {}

    private func get<R: Decodable>(_ path: String) async throws -> R {
        try await request(path, method: "GET", body: nil as EmptyBody?)
    }

    private func post<B: Encodable, R: Decodable>(_ path: String, body: B) async throws -> R {
        try await request(path, method: "POST", body: body)
    }

    private func request<B: Encodable, R: Decodable>(_ path: String, method: String, body: B?) async throws -> R {
        let url = Secrets.backendBaseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = try encoder.encode(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw F2APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw F2APIError.http(0, "non-HTTP response")
        }

        if http.statusCode == 401 {
            throw F2APIError.unauthenticated
        }
        if http.statusCode >= 400 {
            let msg = String(data: data, encoding: .utf8)
            throw F2APIError.http(http.statusCode, msg)
        }

        if R.self == EmptyResponse.self {
            // Caller doesn't care about body; succeed regardless of shape.
            return EmptyResponse() as! R
        }

        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            throw F2APIError.decode(error)
        }
    }

    func clearCookies() {
        let host = Secrets.backendBaseURL.host ?? ""
        for cookie in HTTPCookieStorage.shared.cookies ?? [] where cookie.domain.contains(host) || cookie.name == "f2_session" {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }
}
