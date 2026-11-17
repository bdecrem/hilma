import CryptoKit
import Foundation

/// Phone notifications: only when a run finished, or when it is waiting for Bart. Never for every
/// message. The Mac app sends them (it is the hub and sees every event).
public struct NotifyEvent: Equatable, Sendable {
  public enum Kind: String, Sendable { case finished, needsYou }
  public var kind: Kind
  public var session: String
  public var title: String
  public var body: String
  /// What makes it the same event twice (a turn's end, an approval's id).
  public var key: String

  public init(kind: Kind, session: String, title: String, body: String, key: String) {
    self.kind = kind
    self.session = session
    self.title = title
    self.body = body
    self.key = key
  }

  /// A run ended. Bart's own Stop is not news; a stop by itself is.
  public static func finished(_ t: Turn, session: SessionInfo) -> NotifyEvent? {
    guard !t.isRunning else { return nil }
    if t.status == .stopped && t.error == nil { return nil }
    if t.reactionOnly { return nil }
    let line: String
    switch t.status {
    case .done:
      let first = t.shownAnswer.split(separator: "\n").first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.map(String.init) ?? "Ola is done."
      line = "Done: " + clip(first.replacingOccurrences(of: "**", with: "").replacingOccurrences(of: "`", with: ""))
    default:
      line = "Didn't finish: " + clip(t.error?.text ?? "It stopped.")
    }
    return NotifyEvent(kind: .finished, session: session.id, title: session.title, body: line, key: "end:\(session.id):\(t.id)")
  }

  public static func needsYou(_ a: Approval, session: SessionInfo) -> NotifyEvent {
    let what = a.title.replacingOccurrences(of: #"^(Ola|Claude) wants to "#, with: "", options: .regularExpression)
    return NotifyEvent(kind: .needsYou, session: session.id, title: session.title, body: "Needs your OK: " + clip(what), key: "ask:\(a.id)")
  }

  static func clip(_ s: String, _ n: Int = 110) -> String { s.count > n ? String(s.prefix(n - 1)) + "\u{2026}" : s }
}

/// Which events reach which phone: its own switches, once per event, and not the session it is
/// looking at right now.
public final class NotifyFilter: @unchecked Sendable {
  private let lock = NSLock()
  private var sent: [String] = []

  public init() {}

  public struct Phone: Sendable {
    public var finished: Bool
    public var needsYou: Bool
    /// The session open on screen, and when the phone last said so (it says so every 30 s).
    public var viewing: String?
    public var viewingAt: Date?
    public init(finished: Bool, needsYou: Bool, viewing: String? = nil, viewingAt: Date? = nil) {
      self.finished = finished
      self.needsYou = needsYou
      self.viewing = viewing
      self.viewingAt = viewingAt
    }
  }

  /// True the first time an event may go to this phone.
  public func shouldSend(_ e: NotifyEvent, to phone: Phone, phoneID: String, now: Date = .now) -> Bool {
    if e.kind == .finished && !phone.finished { return false }
    if e.kind == .needsYou && !phone.needsYou { return false }
    if let v = phone.viewing, v == e.session, let at = phone.viewingAt, now.timeIntervalSince(at) < 75 { return false }
    return lock.withLock {
      let k = "\(phoneID)|\(e.key)"
      if sent.contains(k) { return false }
      sent.append(k)
      if sent.count > 500 { sent.removeFirst(100) }
      return true
    }
  }
}

/// Apple's push service, token-based: an ES256 JWT from the team's .p8 key, HTTP/2 to Apple.
public struct APNs: Sendable {
  public var keyID: String
  public var teamID: String
  public var topic: String
  /// api.sandbox.push.apple.com for development builds, api.push.apple.com for release.
  public var host: URL
  let key: P256.Signing.PrivateKey

  public static let sandbox = URL(string: "https://api.sandbox.push.apple.com")!
  public static let production = URL(string: "https://api.push.apple.com")!

  public init(p8: String, keyID: String, teamID: String, topic: String, host: URL) throws {
    key = try P256.Signing.PrivateKey(pemRepresentation: p8)
    self.keyID = keyID
    self.teamID = teamID
    self.topic = topic
    self.host = host
  }

  static func b64url(_ d: Data) -> String {
    d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }

  /// The provider token: {alg ES256, kid} . {iss team, iat}, signed.
  public func token(at: Date = .now) throws -> String {
    let header = Self.b64url(JSON.object(["alg": "ES256", "kid": .string(keyID)]).data)
    let claims = Self.b64url(JSON.object(["iss": .string(teamID), "iat": .number(Double(Int(at.timeIntervalSince1970)))]).data)
    let input = "\(header).\(claims)"
    let sig = try key.signature(for: Data(input.utf8))
    return "\(input).\(Self.b64url(sig.rawRepresentation))"
  }

  public func request(_ e: NotifyEvent, device: String, at: Date = .now) throws -> URLRequest {
    var r = URLRequest(url: host.appendingPathComponent("3/device/\(device)"))
    r.httpMethod = "POST"
    r.setValue("bearer \(try token(at: at))", forHTTPHeaderField: "authorization")
    r.setValue(topic, forHTTPHeaderField: "apns-topic")
    r.setValue("alert", forHTTPHeaderField: "apns-push-type")
    r.setValue("10", forHTTPHeaderField: "apns-priority")
    r.setValue(String(e.key.prefix(64)), forHTTPHeaderField: "apns-collapse-id")
    r.setValue("application/json", forHTTPHeaderField: "content-type")
    let payload: JSON = [
      "aps": ["alert": ["title": .string(e.title), "body": .string(e.body)], "sound": "default", "thread-id": .string(e.session)],
      "session": .string(e.session),
      "kind": .string(e.kind.rawValue),
    ]
    r.httpBody = payload.data
    return r
  }

  /// Sends one; returns Apple's status and reason (no content is logged anywhere).
  public func send(_ e: NotifyEvent, device: String, session: URLSession = .shared) async -> (Int, String) {
    do {
      let (d, res) = try await session.data(for: try request(e, device: device))
      return ((res as? HTTPURLResponse)?.statusCode ?? 0, JSON.parse(d)?["reason"].string ?? "")
    } catch {
      return (0, error.localizedDescription)
    }
  }
}
