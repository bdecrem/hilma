import Foundation

enum APIError: Error, LocalizedError {
    case http(Int, String?)
    case decode(Error)
    case transport(Error)
    case graderUnavailable(answer: String)

    var errorDescription: String? {
        switch self {
        case .http(let code, let msg): return "Server returned \(code): \(msg ?? "no message")."
        case .decode(let e): return "Couldn't read server response: \(e.localizedDescription)."
        case .transport(let e): return e.localizedDescription
        case .graderUnavailable: return "Grader unavailable."
        }
    }
}

/// Thin HTTP client for the F2/F3 backend. The `f2_session` httpOnly cookie
/// lives in the shared HTTPCookieStorage and survives app launches.
final class API {
    static let shared = API()

    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder: JSONDecoder

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        session = URLSession(configuration: config)

        decoder = JSONDecoder()
        let isoFractional = ISO8601DateFormatter()
        isoFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoBasic = ISO8601DateFormatter()
        isoBasic.formatOptions = [.withInternetDateTime]
        decoder.dateDecodingStrategy = .custom { d in
            let c = try d.singleValueContainer()
            let s = try c.decode(String.self)
            // Postgres timestamptz comes back as "2026-06-12 16:58:40.352179+00"
            // via some paths and ISO8601 via others — normalize the space form.
            let normalized = s.contains(" ") ? s.replacingOccurrences(of: " ", with: "T") : s
            if let date = isoFractional.date(from: normalized) { return date }
            if let date = isoBasic.date(from: normalized) { return date }
            // Last resort: trim sub-second precision Postgres sometimes emits
            // with a bare "+00" offset.
            if let date = isoFractional.date(from: normalized + ":00") { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unparseable date: \(s)")
        }
    }

    // MARK: Auth (shared with F2 — same accounts)

    struct UserResponse: Codable { let user: User }

    func login(username: String, password: String) async throws -> User {
        struct Body: Encodable { let username, password: String }
        let res: UserResponse = try await post("/api/f2/auth/login", Body(username: username, password: password))
        return res.user
    }

    func me() async throws -> User {
        let res: UserResponse = try await get("/api/f2/auth/me")
        return res.user
    }

    func logout() async throws {
        struct Empty: Codable {}
        let _: Empty = try await post("/api/f2/auth/logout", Empty())
        if let cookies = HTTPCookieStorage.shared.cookies {
            for c in cookies where c.name == "f2_session" {
                HTTPCookieStorage.shared.deleteCookie(c)
            }
        }
    }

    // MARK: Home / topics

    func home() async throws -> Home {
        let tz = TimeZone.current.identifier.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "UTC"
        return try await get("/api/f3/home?tz=\(tz)")
    }

    struct CardsResponse: Codable {
        let cards: [Card]
        let primer: [String]?
    }

    func topicCards(threadId: String) async throws -> CardsResponse {
        try await get("/api/f3/topics/\(threadId)/cards")
    }

    struct DistillResponse: Codable {
        let added: Int
        let cards: [Card]
    }

    func distill(threadId: String) async throws -> DistillResponse {
        struct Empty: Encodable {}
        return try await post("/api/f3/topics/\(threadId)/distill", Empty())
    }

    struct PrimerResponse: Codable { let primer: [String] }

    func primer(threadId: String) async throws -> [String] {
        struct Empty: Encodable {}
        let res: PrimerResponse = try await post("/api/f3/topics/\(threadId)/primer", Empty())
        return res.primer
    }

    func deleteCard(id: String) async throws {
        struct OK: Codable { let ok: Bool }
        let _: OK = try await request("/api/f3/cards/\(id)", method: "DELETE")
    }

    func deleteTopic(id: String) async throws {
        struct Empty: Codable {}
        let _: Empty = try await request("/api/f2/topics/\(id)", method: "DELETE")
    }

    // MARK: Review

    struct QueueResponse: Codable { let cards: [Card] }

    func reviewQueue(limit: Int = 12) async throws -> [Card] {
        let res: QueueResponse = try await get("/api/f3/review/queue?limit=\(limit)")
        return res.cards
    }

    /// Typed-recall path. A 503 from the grader is surfaced as
    /// `.graderUnavailable(answer:)` so the UI can fall back to self-grading.
    func submitAnswer(cardId: String, answer: String) async throws -> ReviewResult {
        struct Body: Encodable { let answer: String }
        do {
            return try await post("/api/f3/review/\(cardId)/answer", Body(answer: answer))
        } catch APIError.http(503, let msg) {
            struct Fallback: Codable { let answer: String }
            if let data = msg?.data(using: .utf8),
               let f = try? decoder.decode(Fallback.self, from: data) {
                throw APIError.graderUnavailable(answer: f.answer)
            }
            throw APIError.http(503, msg)
        }
    }

    func submitSelfGrade(cardId: String, grade: Int) async throws -> ReviewResult {
        struct Body: Encodable { let self_grade: Int }
        return try await post("/api/f3/review/\(cardId)/answer", Body(self_grade: grade))
    }

    // MARK: Conversation + ingest (f2 endpoints, same backend)

    struct MessageResponse: Codable {
        let reply: String
        let threadId: String?
        enum CodingKeys: String, CodingKey {
            case reply
            case threadId = "thread_id"
        }
    }

    func sendMessage(text: String, threadId: String? = nil) async throws -> MessageResponse {
        struct Body: Encodable {
            let text: String
            let thread_id: String?
        }
        return try await post("/api/f2/messages", Body(text: text, thread_id: threadId))
    }

    struct ThreadDetail: Codable {
        let id: String
        let topic: String?
        let url: String?
        let messages: [Message]
    }

    func thread(id: String) async throws -> ThreadDetail {
        struct Res: Codable { let thread: ThreadDetail }
        let res: Res = try await get("/api/f2/topics/\(id)")
        return res.thread
    }

    func ingestPaste(title: String?, text: String) async throws -> String {
        struct Body: Encodable { let title: String?; let text: String }
        struct Res: Codable {
            let thread: Inner
            struct Inner: Codable { let id: String }
        }
        let res: Res = try await post("/api/f2/topics/ingest", Body(title: title, text: text))
        return res.thread.id
    }

    // MARK: Voice (f4 walk backend — global walk or topic-scoped)

    struct VoiceSessionResponse: Codable {
        let clientSecret: ClientSecret
        let voiceSession: VoiceSession
        let realtime: Realtime
        let agenda: Agenda

        struct ClientSecret: Codable {
            let value: String
            enum CodingKeys: String, CodingKey { case value }
        }
        struct VoiceSession: Codable {
            let id: String
            let mode: String
        }
        struct Realtime: Codable {
            let model: String
            let voice: String
            let callsUrl: URL
            let dataChannel: String
            enum CodingKeys: String, CodingKey {
                case model, voice
                case callsUrl = "calls_url"
                case dataChannel = "data_channel"
            }
        }
        struct Agenda: Codable {
            let dueCount: Int
            enum CodingKeys: String, CodingKey {
                case dueCount = "due_count"
            }
        }

        enum CodingKeys: String, CodingKey {
            case realtime, agenda
            case clientSecret = "client_secret"
            case voiceSession = "voice_session"
        }
    }

    /// threadId nil = global walk; non-nil = voice session scoped to a topic.
    func startVoiceSession(threadId: String?) async throws -> VoiceSessionResponse {
        struct Body: Encodable { let thread_id: String? }
        return try await post("/api/f4/walk/session", Body(thread_id: threadId))
    }

    func callVoiceTool(name: String, argumentsJSON: String) async throws -> Data {
        let argsObject = (try? JSONSerialization.jsonObject(with: Data(argumentsJSON.utf8))) ?? [:]
        let payload: [String: Any] = ["name": name, "arguments": argsObject]
        let body = try JSONSerialization.data(withJSONObject: payload)
        guard let url = URL(string: "/api/f4/walk/tool", relativeTo: Secrets.backendBaseURL) else {
            throw APIError.http(0, "bad tool path")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.httpBody = body
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError.http(status, String(data: data, encoding: .utf8))
        }
        return data
    }

    func finishVoiceSession(id: String, transcript: [[String: String]], summary: String?) async throws {
        struct Body: Encodable {
            let transcript: [[String: String]]
            let summary: String?
        }
        struct OK: Codable { let ok: Bool }
        let _: OK = try await request(
            "/api/f4/walk/session/\(id)",
            method: "PATCH",
            body: Body(transcript: transcript, summary: summary)
        )
    }

    // MARK: Plumbing

    private func get<R: Decodable>(_ path: String) async throws -> R {
        try await request(path, method: "GET")
    }

    private func post<B: Encodable, R: Decodable>(_ path: String, _ body: B) async throws -> R {
        try await request(path, method: "POST", body: body)
    }

    private struct Nothing: Encodable {}

    private func request<R: Decodable>(_ path: String, method: String) async throws -> R {
        try await request(path, method: method, body: nil as Nothing?)
    }

    private func request<B: Encodable, R: Decodable>(
        _ path: String,
        method: String,
        body: B?
    ) async throws -> R {
        guard let url = URL(string: path, relativeTo: Secrets.backendBaseURL) else {
            throw APIError.http(0, "bad path \(path)")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let body {
            req.httpBody = try encoder.encode(body)
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
        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            throw APIError.decode(error)
        }
    }
}
