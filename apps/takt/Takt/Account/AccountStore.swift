import Foundation
import os

/// The account, Dodo's way: on first launch the app makes a guest account on ola.cx (no form,
/// the session cookie is the key); Settings turns it into a real one (sign up: email + password,
/// same account, progress kept) or logs into an existing one. Progress syncs to it: pushed after
/// a change, pulled at log in. Offline is fine: everything works on the device, and a failed
/// call shows its error and changes nothing.
@Observable
final class AccountStore {
    enum State: Equatable {
        /// Not talked to the server yet (or it was unreachable).
        case unknown
        case guest
        case signedIn(email: String)
    }

    struct User: Decodable {
        let id: String
        let email: String?
        let is_guest: Bool
    }

    private(set) var state: State = .unknown
    private(set) var busy = false
    private(set) var error: String?
    private(set) var lastSync: Date?

    @ObservationIgnored private let base: URL
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let progress: ProgressStore
    @ObservationIgnored private let log = Logger(subsystem: "takt", category: "account")
    @ObservationIgnored private var pushTask: Task<Void, Never>?
    @ObservationIgnored private var lastPushed: ProgressStore.Snapshot?

    static let defaultBase: URL = {
        #if DEBUG
        if let s = UserDefaults.standard.string(forKey: "Backend"), let u = URL(string: s) { return u }
        #endif
        return URL(string: "https://ola.cx")!
    }()

    init(progress: ProgressStore, base: URL = AccountStore.defaultBase) {
        self.progress = progress
        self.base = base
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = 15
        session = URLSession(configuration: config)
    }

    /// At launch: who the cookie belongs to, or a fresh guest; then the progress syncs.
    func start() {
        Task { @MainActor in
            if let user = try? await me() {
                applyUser(user)
            } else {
                do { apply(try await call("auth/guest", body: [String: String]())) } catch { note(error) }
            }
            if state != .unknown { await pull() }
        }
    }

    var email: String? { if case .signedIn(let e) = state { return e }; return nil }

    /// Sign up: the guest becomes a real account with this email (same id, progress kept).
    func signUp(email: String, password: String) async {
        await run {
            if self.state == .unknown { self.apply(try await self.call("auth/guest", body: [String: String]())) }
            self.apply(try await self.call("auth/signup", body: ["email": email, "password": password]))
            await self.push()
        }
    }

    /// Log in to an existing account: its progress comes down and merges with this device's.
    func logIn(email: String, password: String) async {
        await run {
            self.apply(try await self.call("auth/login", body: ["email": email, "password": password]))
            await self.pull()
        }
    }

    /// Log out, and start over as a fresh guest (this device keeps its progress).
    func logOut() async {
        await run {
            let _: Empty = try await self.call("auth/logout", body: [String: String]())
            self.state = .unknown
            self.apply(try await self.call("auth/guest", body: [String: String]()))
            await self.push()
        }
    }

    /// After a progress change: push, at most every few seconds.
    func progressChanged() {
        guard state != .unknown, pushTask == nil else { return }
        pushTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            pushTask = nil
            await push()
        }
    }

    // MARK: Daily text

    /// The daily iMessage: a verified phone, on/off, the hour (in this device's time zone).
    struct DailySettings: Codable, Equatable {
        var phone: String?
        var verified: Bool
        var enabled: Bool
        var hour: Int
        var tz: String
    }

    private(set) var daily: DailySettings?
    private(set) var dailyError: String?

    func loadDaily() async {
        await runDaily { self.daily = try await self.call("daily", method: "GET", body: nil as String?) }
    }

    /// On/off and the hour; the time zone always goes with it, so the text follows the device.
    func setDaily(enabled: Bool? = nil, hour: Int? = nil) async {
        struct Body: Encodable { let enabled: Bool?; let hour: Int?; let tz: String }
        await runDaily {
            self.daily = try await self.call("daily", method: "PUT",
                                             body: Body(enabled: enabled, hour: hour, tz: TimeZone.current.identifier))
        }
    }

    func sendCode(phone: String) async {
        await runDaily {
            let _: Empty = try await self.call("daily/phone", body: ["phone": phone])
            await self.loadDaily()
        }
    }

    func verify(code: String) async {
        await runDaily {
            let _: Empty = try await self.call("daily/verify", body: ["code": code])
            await self.setDaily()
        }
    }

    func removePhone() async {
        await runDaily {
            let _: Empty = try await self.call("daily/phone", method: "DELETE", body: nil as String?)
            await self.loadDaily()
        }
    }

    private func runDaily(_ work: @escaping () async throws -> Void) async {
        busy = true
        dailyError = nil
        do { try await work() } catch {
            dailyError = (error as? Failure)?.message ?? "Can't reach ola.cx."
            log.error("daily: \(error.localizedDescription, privacy: .public)")
        }
        busy = false
    }

    // MARK: Sync

    private struct ProgressBody: Codable {
        let progress: ProgressStore.Snapshot
    }

    private func push() async {
        let snap = progress.snapshot
        guard snap != lastPushed else { return }
        do {
            let _: ProgressBody = try await call("progress", method: "PUT", body: ProgressBody(progress: snap))
            lastPushed = snap
            lastSync = Date()
        } catch {
            log.error("push failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The server's copy merged into this device's: lessons keep the furthest step and the best
    /// tempo, skills keep the record with more attempts, the streak keeps every day. Then whatever is newer here goes up.
    private func pull() async {
        do {
            let remote: ProgressBody = try await call("progress", method: "GET", body: nil as String?)
            let merged = Self.merge(progress.snapshot, remote.progress)
            if merged != progress.snapshot { progress.replace(with: merged) }
            lastSync = Date()
            if merged != remote.progress { await push() } else { lastPushed = merged }
        } catch {
            log.error("pull failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    static func merge(_ a: ProgressStore.Snapshot, _ b: ProgressStore.Snapshot) -> ProgressStore.Snapshot {
        var out = a
        for (code, r) in b.lessons {
            var m = out.lessons[code] ?? r
            m.reachedStep = max(m.reachedStep, r.reachedStep)
            m.lessonsDone = max(m.lessonsDone, r.lessonsDone)
            m.bestTempo = max(m.bestTempo, r.bestTempo)
            m.completed = [m.completed, r.completed].compactMap { $0 }.min()
            out.lessons[code] = m
        }
        for (id, s) in b.skills where s.attempts > (out.skills[id]?.attempts ?? -1) {
            out.skills[id] = s
        }
        // Days practiced on either device; the quiz record that has seen more answers.
        out.days = Array(Set(a.days).union(b.days)).sorted()
        if b.quiz.answered > a.quiz.answered || (a.quiz.level == nil && b.quiz.level != nil) { out.quiz = b.quiz }
        func most(_ x: ProgressStore.EarRecord, _ y: ProgressStore.EarRecord) -> ProgressStore.EarRecord {
            .init(level: max(x.level, y.level), best: max(x.best, y.best), answered: max(x.answered, y.answered))
        }
        out.ear = most(a.ear, b.ear)
        out.intervals = most(a.intervals, b.intervals)
        return out
    }

    // MARK: HTTP

    private struct Empty: Decodable {}

    private struct UserBody: Decodable {
        let user: User
    }

    private struct ServerError: Decodable {
        let error: String
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private func me() async throws -> User {
        let body: UserBody = try await call("auth/me", method: "GET", body: nil as String?)
        return body.user
    }

    private func apply(_ body: UserBody) { applyUser(body.user) }

    private func applyUser(_ user: User) {
        state = user.is_guest ? .guest : .signedIn(email: user.email ?? "")
        error = nil
        log.info("account \(user.is_guest ? "guest" : "signed in", privacy: .public)")
    }

    private func run(_ work: @escaping () async throws -> Void) async {
        busy = true
        error = nil
        do { try await work() } catch { note(error) }
        busy = false
    }

    private func note(_ e: Error) {
        error = (e as? Failure)?.message ?? "Can't reach ola.cx. Your progress is safe on this device."
        log.error("account: \(e.localizedDescription, privacy: .public)")
    }

    private func call<B: Encodable, R: Decodable>(_ path: String, method: String = "POST", body: B?) async throws -> R {
        var req = URLRequest(url: base.appendingPathComponent("api/takt/\(path)"))
        req.httpMethod = method
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder.takt.encode(body)
        }
        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "Server error \(status)."
            throw Failure(message: message)
        }
        if R.self == Empty.self { return Empty() as! R }
        return try JSONDecoder.takt.decode(R.self, from: data)
    }
}
