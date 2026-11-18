import Foundation

/// "Store your conversations on ola.cx to help us improve our systems" (2026-11-18, OLA-159; Bart's
/// words for the setting). Off by default. While it is on, each finished turn (the request, the
/// answer, the steps in plain words; never a file's contents or a command's output) is sent to the
/// Ola machine with this device's own sign-in (`/api/device/kept`, frontdesk/devices.mjs). The
/// person sees how many turns are kept and can delete them all.
///
/// A turn another engine was asked to redo carries `switched_from` (OLA-157): asking Claude after
/// Ola's own model means the first result was not good enough, which is what we learn from.
public enum KeptConversations {
  public static let key = "ola.keepConversations"
  nonisolated(unsafe) public static var defaults: UserDefaults = .standard

  public static var on: Bool {
    get { defaults.bool(forKey: key) }
    set { defaults.set(newValue, forKey: key) }
  }

  /// Why it cannot be turned on here, or nil: it needs the Ola sign-in.
  public static var unavailable: String? { AccountKeeper.signedIn ? nil : "Sign in to Ola first." }

  /// The app's version and build, as people read it.
  public static var app: String {
    let i = Bundle.main.infoDictionary
    let v = i?["CFBundleShortVersionString"] as? String ?? "?"
    return (i?["CFBundleVersion"] as? String).map { "\(v) (\($0))" } ?? v
  }

  /// One finished turn as the server takes it. `previous` is the turn before it in the conversation.
  public static func body(_ t: Turn, previous: Turn?, session: SessionInfo, runtime: Runtime, product: String, model: String?) -> JSON {
    var o: [String: JSON] = [
      "product": .string(product), "runtime": .string(runtime.rawValue), "app": .string(app),
      "session": .string(session.id), "session_title": .string(session.title), "turn": .string(t.id),
      "engine": .string(t.engine.rawValue), "status": .string(t.status.rawValue),
      "at": .string(ISO8601DateFormatter().string(from: t.at)),
      "request": .string(t.request), "answer": .string(t.answer),
      "steps": .array(t.steps.map { s in
        var e: [String: JSON] = ["tool": .string(s.tool), "words": .string("\(s.verb) \(s.object)".trimmingCharacters(in: .whitespaces)), "status": .string(s.status.rawValue)]
        if let err = s.error, !err.isEmpty { e["error"] = .string(err) }
        return .object(e)
      }),
    ]
    if let m = model, t.engine == .ola { o["model"] = .string(m) }
    if let end = t.ended { o["seconds"] = .number(max(0, end.timeIntervalSince(t.at)).rounded()) }
    // Another engine tried just before, and this one is a fallback: a switch.
    if let p = previous, p.engine != t.engine, t.engine != .ola { o["switched_from"] = .string(p.engine.rawValue) }
    return .object(o)
  }

  /// Sends a finished turn, when the setting is on and this device is signed in. Quiet on failure:
  /// keeping a turn must never get in the way of the work.
  public static func turnEnded(_ t: Turn, previous: Turn?, session: SessionInfo, runtime: Runtime?, product: String, model: String?, api: AccountAPI = AccountAPI()) {
    guard on, [.done, .failed, .stopped].contains(t.status), !t.request.isEmpty, let s = AccountKeeper.session else { return }
    let payload = body(t, previous: previous, session: session, runtime: runtime ?? .local, product: product, model: model)
    Task.detached(priority: .utility) { _ = try? await call("POST", payload, s, api) }
  }

  /// How many turns are kept, and since when; nil when the server did not answer.
  public static func status(api: AccountAPI = AccountAPI()) async -> (count: Int, since: Date?)? {
    guard let s = AccountKeeper.session, let j = try? await call("GET", nil, s, api) else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return (Int(j["count"].double ?? 0), j["since"].string.flatMap { f.date(from: $0) })
  }

  /// Deletes every kept turn of this person. Returns how many, or nil when it did not work.
  public static func deleteAll(api: AccountAPI = AccountAPI()) async -> Int? {
    guard let s = AccountKeeper.session, let j = try? await call("DELETE", nil, s, api) else { return nil }
    return Int(j["deleted"].double ?? 0)
  }

  @discardableResult
  static func call(_ method: String, _ body: JSON?, _ s: AccountSession, _ api: AccountAPI) async throws -> JSON {
    var r = URLRequest(url: api.url("/api/device/kept"))
    r.httpMethod = method
    r.timeoutInterval = 20
    r.setValue("Bearer \(s.token)", forHTTPHeaderField: "Authorization")
    if let body {
      r.setValue("application/json", forHTTPHeaderField: "content-type")
      r.httpBody = body.data
    }
    let (d, res) = try await api.session.data(for: r)
    guard let h = res as? HTTPURLResponse, h.statusCode == 200 else { throw OlaError.badReply("kept: \((res as? HTTPURLResponse)?.statusCode ?? 0)") }
    return JSON.parse(d) ?? .null
  }
}
