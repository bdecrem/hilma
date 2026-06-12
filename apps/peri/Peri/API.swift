import Foundation

enum APIError: Error, LocalizedError {
    case http(Int, String?)
    case decode(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .http(let code, let msg): return "Server returned \(code): \(msg ?? "no message")."
        case .decode(let e): return "Couldn't read server response: \(e.localizedDescription)."
        case .transport(let e): return e.localizedDescription
        }
    }
}

struct User: Codable, Equatable {
    let id: String
    let username: String
}

/// Slim client for Peri: F2 auth (same accounts as Loci/Feynd) + the walk
/// session/tool endpoints. Session cookie lives in shared HTTPCookieStorage.
final class API {
    static let shared = API()

    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        session = URLSession(configuration: config)
    }

    // MARK: Auth

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
    }

    // MARK: Walk session

    struct WalkSessionResponse: Codable {
        let clientSecret: ClientSecret
        let voiceSession: VoiceSession
        let realtime: Realtime
        let agenda: Agenda

        struct ClientSecret: Codable {
            let value: String
            let expiresAt: Double?
            enum CodingKeys: String, CodingKey {
                case value
                case expiresAt = "expires_at"
            }
        }
        struct VoiceSession: Codable {
            let id: String
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
            let cardCount: Int
            let streakDays: Int
            enum CodingKeys: String, CodingKey {
                case dueCount = "due_count"
                case cardCount = "card_count"
                case streakDays = "streak_days"
            }
        }

        enum CodingKeys: String, CodingKey {
            case realtime, agenda
            case clientSecret = "client_secret"
            case voiceSession = "voice_session"
        }
    }

    func startWalkSession() async throws -> WalkSessionResponse {
        struct Empty: Encodable {}
        return try await post("/api/f4/walk/session", Empty())
    }

    /// Raw passthrough for Realtime tool calls — the data-channel handler
    /// serializes whatever JSON comes back into the function_call_output.
    func callWalkTool(name: String, argumentsJSON: String) async throws -> Data {
        let argsObject = (try? JSONSerialization.jsonObject(with: Data(argumentsJSON.utf8))) ?? [:]
        let payload: [String: Any] = ["name": name, "arguments": argsObject]
        let body = try JSONSerialization.data(withJSONObject: payload)
        return try await raw("/api/f4/walk/tool", method: "POST", body: body)
    }

    func finishWalkSession(id: String, transcript: [[String: String]], summary: String?) async throws {
        struct Body: Encodable {
            let transcript: [[String: String]]
            let summary: String?
        }
        struct Empty: Codable {}
        let _: Empty = try await request(
            "/api/f2/realtime/session/\(id)",
            method: "PATCH",
            body: Body(transcript: transcript, summary: summary)
        )
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
            throw APIError.http(status, String(data: data, encoding: .utf8)?.prefix(300).description)
        }
        return data
    }
}
