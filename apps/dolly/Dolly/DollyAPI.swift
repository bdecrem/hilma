import Foundation

enum DollyAPIError: LocalizedError {
    case unauthenticated
    case http(Int, String)
    case transport(Error)
    case decode(Error)

    var errorDescription: String? {
        switch self {
        case .unauthenticated: return "Signed out."
        case .http(_, let message): return message
        case .transport(let e): return e.localizedDescription
        case .decode: return "Unexpected reply."
        }
    }
}

/// Thin client for /api/dolly/*. The session is the httpOnly `dolly_session`
/// cookie the server sets at sign-in; URLSession keeps it in the shared
/// cookie store across launches.
final class DollyAPI {
    static let shared = DollyAPI()

    /// `-BackendURL http://localhost:3260` points a simulator run at a dev server.
    static var baseURL: URL {
        if let s = UserDefaults.standard.string(forKey: "BackendURL"), let u = URL(string: s) { return u }
        return Secrets.backendBaseURL
    }

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
        config.timeoutIntervalForRequest = 90
        session = URLSession(configuration: config)
    }

    /// `-TestSessionToken <value>`: a session minted by scripts/dolly/e2e.ts,
    /// set as the cookie the server would have set.
    static func installTestSession(_ token: String) {
        guard let host = baseURL.host else { return }
        let cookie = HTTPCookie(properties: [
            .name: "dolly_session", .value: token, .domain: host, .path: "/",
            .expires: Date().addingTimeInterval(60 * 60 * 24 * 30),
        ])
        if let cookie { HTTPCookieStorage.shared.setCookie(cookie) }
    }

    func clearSession() {
        for cookie in HTTPCookieStorage.shared.cookies ?? [] where cookie.name == "dolly_session" {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    // MARK: Sign-in

    func startCode(phone: String) async throws -> String {
        struct Body: Encodable { let phone: String; let tz: String; let locale: String }
        struct Res: Decodable { let phone: String }
        let res: Res = try await request("/api/dolly/auth/start", method: "POST",
                                         body: Body(phone: phone, tz: TimeZone.current.identifier, locale: Locale.current.identifier))
        return res.phone
    }

    func verify(phone: String, code: String, language: String, level: String, dailyHour: Int) async throws -> VerifyResponse {
        struct Body: Encodable {
            let phone: String; let code: String; let tz: String; let locale: String
            let language: String; let level: String; let daily_hour: Int
        }
        return try await request("/api/dolly/auth/verify", method: "POST",
                                 body: Body(phone: phone, code: code, tz: TimeZone.current.identifier, locale: Locale.current.identifier,
                                            language: language, level: level, daily_hour: dailyHour))
    }

    func logout() async {
        struct Empty: Encodable {}
        let _: EmptyResponse? = try? await request("/api/dolly/auth/logout", method: "POST", body: Empty())
        clearSession()
    }

    // MARK: Me, today

    func me() async throws -> UserView {
        let res: UserResponse = try await request("/api/dolly/me", method: "GET", body: Optional<String>.none)
        return res.user
    }

    func updateMe(name: String?? = nil, language: String? = nil, level: String? = nil, dailyHour: Int? = nil) async throws -> UserView {
        var body: [String: AnyCodable] = [:]
        if let name { body["name"] = AnyCodable(name) }
        if let language { body["language"] = AnyCodable(language) }
        if let level { body["level"] = AnyCodable(level) }
        if let dailyHour { body["daily_hour"] = AnyCodable(dailyHour) }
        body["tz"] = AnyCodable(TimeZone.current.identifier)
        let res: UserResponse = try await request("/api/dolly/me", method: "PUT", body: body)
        return res.user
    }

    func today() async throws -> TodayResponse {
        try await request("/api/dolly/today", method: "GET", body: Optional<String>.none)
    }

    // MARK: Voice

    func startElevenSession(mode: String, holdToTalk: Bool) async throws -> ElevenSessionResponse {
        struct Body: Encodable { let mode: String; let hold_to_talk: Bool }
        return try await request("/api/dolly/eleven/session", method: "POST", body: Body(mode: mode, hold_to_talk: holdToTalk))
    }

    func finishVoice(id: String, transcript: [[String: String]], seconds: Int?) async throws -> DayView {
        struct Body: Encodable { let transcript: [[String: String]]; let seconds: Int? }
        let res: DayResponse = try await request("/api/dolly/voice/\(id)", method: "PATCH", body: Body(transcript: transcript, seconds: seconds))
        return res.day
    }

    // MARK: Cards

    func answer(q: Int, answer: String) async throws -> AnswerResponse {
        struct Body: Encodable { let q: Int; let answer: String }
        return try await request("/api/dolly/cards/answer", method: "POST", body: Body(q: q, answer: answer))
    }

    // MARK: Plumbing

    private func request<B: Encodable, R: Decodable>(_ path: String, method: String, body: B?) async throws -> R {
        let url = Self.baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { req.httpBody = try encoder.encode(body) }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw DollyAPIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else { throw DollyAPIError.http(0, "non-HTTP response") }
        if http.statusCode == 401 { throw DollyAPIError.unauthenticated }
        if http.statusCode >= 400 {
            let message = (try? decoder.decode(ErrorBody.self, from: data))?.error ?? "Request failed (\(http.statusCode))."
            throw DollyAPIError.http(http.statusCode, message)
        }
        if R.self == EmptyResponse.self { return EmptyResponse() as! R }
        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            NSLog("DOLLY_API decode failed %@: %@", path, String(data: data, encoding: .utf8) ?? "")
            throw DollyAPIError.decode(error)
        }
    }
}

struct EmptyResponse: Codable {}

/// A JSON value for the settings PUT (strings, ints, null).
struct AnyCodable: Encodable {
    let value: Any?
    init(_ value: Any?) { self.value = value }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case nil: try c.encodeNil()
        case let s as String: try c.encode(s)
        case let i as Int: try c.encode(i)
        case let b as Bool: try c.encode(b)
        default: try c.encodeNil()
        }
    }
}
