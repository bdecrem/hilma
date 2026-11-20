import Foundation

/// This device's sign-in to an Ola account: the token the server gave it and who it is. Kept as
/// one Keychain item (`SecretKind.account`), this device only; nothing secret anywhere else.
public struct AccountSession: Codable, Equatable, Sendable {
  public struct Person: Codable, Equatable, Sendable {
    public var handle: String
    public var name: String
    public var admin: Bool
    public init(handle: String, name: String, admin: Bool) {
      self.handle = handle
      self.name = name
      self.admin = admin
    }
  }

  public struct Device: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var kind: String
    public init(id: String, name: String, kind: String) {
      self.id = id
      self.name = name
      self.kind = kind
    }
  }

  public var token: String
  public var expiresAt: Date?
  public var person: Person
  public var device: Device
  /// The known-device token the server gave with this sign-in (kept apart, in AccountKeeper.known).
  public var known: String?
  /// Whether the account had a passkey when this sign-in was made (the app offers to add one if not).
  /// Not kept in the Keychain.
  public var hasPasskey: Bool?

  public init(token: String, expiresAt: Date?, person: Person, device: Device) {
    self.token = token
    self.expiresAt = expiresAt
    self.person = person
    self.device = device
  }

  enum CodingKeys: String, CodingKey {
    case token, person, device
    case expiresAt = "expires_at"
  }

  public func expired(at now: Date = .now) -> Bool { expiresAt.map { $0 <= now } ?? false }

  static let encoder: JSONEncoder = {
    let e = JSONEncoder()
    e.dateEncodingStrategy = .iso8601
    e.outputFormatting = [.sortedKeys]
    return e
  }()

  /// The JSON kept in the Keychain (the server's own field names).
  public func encoded() -> String { String(decoding: (try? Self.encoder.encode(self)) ?? Data(), as: UTF8.self) }

  /// From the server's reply or the Keychain; `expires_at` may be ISO 8601 or epoch seconds.
  public static func decode(_ text: String) -> AccountSession? { decode(Data(text.utf8)) }

  public static func decode(_ data: Data) -> AccountSession? {
    guard let j = JSON.parse(data), !j["token"].str.isEmpty, !j["person"]["handle"].str.isEmpty else { return nil }
    var s = AccountSession(token: j["token"].str, expiresAt: date(j["expires_at"]), person: person(j["person"]), device: device(j["device"]))
    s.known = j["known"].string
    s.hasPasskey = j["has_passkey"].bool
    return s
  }

  static func person(_ j: JSON) -> Person { Person(handle: j["handle"].str, name: j["name"].str.isEmpty ? j["handle"].str : j["name"].str, admin: j["admin"].bool ?? false) }
  /// The server's `device.id` is a number; a string is taken too.
  static func device(_ j: JSON) -> Device {
    let id = j["id"].string ?? j["id"].double.map { $0 == $0.rounded() ? String(Int($0)) : String($0) } ?? ""
    return Device(id: id, name: j["name"].str, kind: j["kind"].str)
  }

  static func date(_ j: JSON) -> Date? {
    if let s = j.string {
      let f = ISO8601DateFormatter()
      f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      if let d = f.date(from: s) { return d }
      f.formatOptions = [.withInternetDateTime]
      return f.date(from: s)
    }
    if let n = j.double { return Date(timeIntervalSince1970: n > 1e12 ? n / 1000 : n) }
    return nil
  }
}

/// What can go wrong with the account, in the words a person reads.
public enum AccountError: Error, Hashable, LocalizedError {
  /// The device was signed out (or its sign-in ran out): sign in again.
  case signedOut
  case cancelled
  /// Ola's sign-in does not exist at this address yet (the server is not deployed).
  case notAvailableYet
  case tooManyTries
  /// The server said no, with its one word.
  case refused(String)
  case unreachable
  case badReply
  /// The name and password did not match (the server does not say which).
  case wrongPassword
  /// The account asks for its passkey too, and this place cannot show the passkey sheet (the
  /// command line; an app built without the passkey permission).
  case passkeyRequired
  /// The passkey did not open Ola (the server refused its answer).
  case passkeyRefused
  /// This build of the app cannot use passkeys (Apple's permission for app.ola.cx is not in it yet).
  case passkeysNotInThisVersion
  /// Too long after signing in on this Mac to add a passkey with its key alone.
  case notFresh
  /// Ola answered, but its service is down or overloaded just now.
  case serviceDown
  /// The server's own sentence (a wait after too many tries, say).
  case said(String)

  public var errorDescription: String? {
    switch self {
    case .wrongPassword: return "That name and password didn\u{2019}t match. Check both and try again."
    case .passkeyRequired: return "This account asks for a passkey; sign in from the Ola app."
    case .passkeyRefused: return "That passkey didn\u{2019}t open Ola. Try again, or use another passkey."
    case .passkeysNotInThisVersion: return "Your account asks for your passkey too, and this version of Ola can\u{2019}t use passkeys yet. That arrives with the next update. Until then, turn off \u{201C}Ask for my passkey too\u{201D} in your account on the web."
    case .notFresh: return "A passkey can be added only in the first 15 minutes after signing in. Sign out and in again, then add it."
    case .serviceDown: return "Ola isn\u{2019}t answering just now. Try again in a few minutes."
    case .said(let s): return s
    case .signedOut: return "You\u{2019}ve been signed out on this Mac. Sign in again to keep working."
    case .cancelled: return "Signing in was stopped."
    case .notAvailableYet: return "Signing in with an Ola account isn\u{2019}t open yet. It will be soon."
    case .tooManyTries: return "Too many tries in a short time. Wait a few minutes, then try again."
    case .refused: return "That sign-in didn\u{2019}t go through. Try again."
    case .unreachable: return "Ola didn\u{2019}t answer. Check that this Mac is online, then try again."
    case .badReply: return "Ola sent something this app didn\u{2019}t understand. Try again in a while."
    }
  }
}

/// The account's server: `https://app.ola.cx`, and nothing else in the shipped app. Checks point it
/// at a stand-in (`OLA_ACCOUNT_BASE`, or the `ola.accountBase` default), never shown to anyone.
public struct AccountAPI: Sendable {
  public static let address = URL(string: "https://app.ola.cx")!
  public static var configured: URL {
    if let s = ProcessInfo.processInfo.environment["OLA_ACCOUNT_BASE"], let u = URL(string: s), u.host != nil { return u }
    if let s = UserDefaults.standard.string(forKey: "ola.accountBase"), let u = URL(string: s), u.host != nil { return u }
    return address
  }

  public var base: URL
  public var session: URLSession
  public init(base: URL = AccountAPI.configured, session: URLSession = AccountAPI.session) {
    self.base = base
    self.session = session
  }

  func url(_ path: String) -> URL {
    var s = base.absoluteString
    if s.hasSuffix("/") { s.removeLast() }
    return URL(string: s + path)!
  }

  /// Where the model door forwards `<rest>` to: the model gateway, and for `sites…` (the agent's
  /// `ola-publish`, OLA-223) the front desk's Publish from a Mac, `/api/device/sites…`.
  public func gateway(_ rest: String) -> URL? {
    var s = base.absoluteString
    if s.hasSuffix("/") { s.removeLast() }
    if rest == "sites" || rest.hasPrefix("sites/") { return URL(string: s + "/api/device/" + rest) }
    return URL(string: s + "/api/device/gw/" + rest)
  }

  /// This Mac's name, as the person sees it in their list of computers.
  public static var thisMacName: String {
    #if os(macOS)
    return Host.current().localizedName ?? "Mac"
    #else
    return "iPhone"
    #endif
  }

  /// Signs this Mac (or the `ola` command) in with a name and password: the normal way (2026-11-17),
  /// never a browser. The server gives this device its own key, shown once, kept in the Keychain.
  /// `known` is the token an earlier sign-in from this Mac got back: it lets this Mac sign in even
  /// while a stranger is guessing at the same name (the server holds unknown devices back then),
  /// never without the password. A person who asks for their passkey too gets `PasskeyNeeded` with a
  /// ceremony for their own passkeys, which the app answers with `loginPasskey` (NativePasskey).
  public func login(handle: String, password: String, deviceName: String, kind: String = "mac", known: String? = nil) async throws -> AccountSession {
    var headers: [String: String] = [:]
    if let known, !known.isEmpty { headers["X-Ola-Known"] = known }
    let (d, status, j) = try await post("/api/device/login", ["handle": .string(handle), "password": .string(password), "name": .string(String(deviceName.prefix(60))), "kind": .string(kind)], headers: headers)
    switch status {
    case 200:
      if j?["passkey"].bool == true { throw PasskeyNeeded(ceremony: try PasskeyCeremony(j)) }
      guard let s = AccountSession.decode(d) else { throw AccountError.badReply }
      return s
    case 401: throw AccountError.wrongPassword
    default: throw Self.failure(status, j)
    }
  }

  /// A sign-in with a passkey alone (no name or password): a ceremony for any of the person's passkeys.
  public func passkeyCeremony(deviceName: String, kind: String = "mac") async throws -> PasskeyCeremony {
    let (_, status, j) = try await post("/api/device/login", ["passkey": true, "name": .string(String(deviceName.prefix(60))), "kind": .string(kind)])
    guard status == 200 else { throw Self.failure(status, j) }
    return try PasskeyCeremony(j)
  }

  /// The passkey's answer to a sign-in ceremony: this device's key.
  public func loginPasskey(_ ceremony: PasskeyCeremony, _ assertion: PasskeyAssertion) async throws -> AccountSession {
    let (d, status, j) = try await post("/api/device/login/passkey", ["ceremony": .string(ceremony.id), "response": assertion.json])
    switch status {
    case 200:
      guard let s = AccountSession.decode(d) else { throw AccountError.badReply }
      return s
    case 401: throw AccountError.passkeyRefused
    default: throw Self.failure(status, j)
    }
  }

  /// Adding a passkey with this device's key, soon after it signed in: what the passkey sheet needs.
  public func addPasskeyOptions(_ s: AccountSession) async throws -> PasskeyRegistration {
    let (_, status, j) = try await post("/api/device/passkey/options", [:], bearer: s.token)
    guard status == 200 else { throw Self.failure(status, j, signedIn: true) }
    return try PasskeyRegistration(j)
  }

  /// The new passkey, saved on the account.
  public func addPasskeyVerify(_ s: AccountSession, _ registration: PasskeyRegistration, _ credential: PasskeyCredential) async throws {
    let (_, status, j) = try await post("/api/device/passkey/verify", ["ceremony": .string(registration.ceremony), "response": credential.json], bearer: s.token)
    guard status == 200 else { throw Self.failure(status, j, signedIn: true) }
  }

  /// One JSON POST: the body, the status and the parsed reply. No credential is ever offered for the
  /// door's challenge (NoCredentials), and nothing is retried.
  func post(_ path: String, _ body: [String: JSON], headers: [String: String] = [:], bearer: String? = nil) async throws -> (Data, Int, JSON?) {
    var r = URLRequest(url: url(path))
    r.httpMethod = "POST"
    r.timeoutInterval = 30
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    for (k, v) in headers { r.setValue(v, forHTTPHeaderField: k) }
    if let bearer { r.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
    r.httpBody = JSON.object(body).data
    var d = Data(), res: URLResponse
    let watch = NoCredentials()
    do { (d, res) = try await session.data(for: r, delegate: watch) } catch {
      if let refusal = watch.refusal { res = refusal } else if error is CancellationError { throw AccountError.cancelled } else { throw AccountError.unreachable }
    }
    guard let h = res as? HTTPURLResponse else { throw AccountError.badReply }
    return (d, h.statusCode, JSON.parse(d))
  }

  /// A refusal in plain words.
  static func failure(_ status: Int, _ j: JSON?, signedIn: Bool = false) -> AccountError {
    switch status {
    case 401: return signedIn ? .signedOut : .refused(j?["error"].string ?? "unauthorized")
    case 403 where j?["error"].string == "not_fresh": return .notFresh
    case 404, 405: return .notAvailableYet
    case 409 where j?["message"].string != nil: return .said(j!["message"].str)
    case 429: return j?["message"].string.map { AccountError.said($0) } ?? .tooManyTries
    case 500...599: return .serviceDown
    default: return .refused(j?["error"].string ?? "refused")
    }
  }

  /// Who this device is signed in as (also proves the token still works).
  public func me(_ s: AccountSession) async throws -> AccountSession {
    var r = URLRequest(url: url("/api/device/me"))
    r.setValue("Bearer \(s.token)", forHTTPHeaderField: "Authorization")
    let (d, status) = try await send(r, signedIn: true)
    guard status == 200, let j = JSON.parse(d), !j["person"]["handle"].str.isEmpty else { throw AccountError.badReply }
    var out = s
    out.person = AccountSession.person(j["person"])
    let device = AccountSession.device(j["device"])
    if !device.id.isEmpty { out.device = device }
    if let e = AccountSession.date(j["expires_at"]) { out.expiresAt = e }
    return out
  }

  /// Ends this device's sign-in on the server.
  public func signOut(_ s: AccountSession) async throws {
    var r = URLRequest(url: url("/api/device/signout"))
    r.httpMethod = "POST"
    r.setValue("Bearer \(s.token)", forHTTPHeaderField: "Authorization")
    _ = try await send(r, signedIn: true)
  }

  /// How much of the person's share has been used, as a plain sentence, or nil when the server
  /// does not give a fraction.
  public func usage(_ s: AccountSession) async throws -> String? {
    guard let u = gateway("v1/usage") else { return nil }
    var r = URLRequest(url: u)
    r.setValue("Bearer \(s.token)", forHTTPHeaderField: "Authorization")
    let (d, status) = try await send(r, signedIn: true)
    guard status == 200, let j = JSON.parse(d) else { return nil }
    return Self.usageSentence(j)
  }

  /// The gateway's own usage reply: `fraction_used` (0 to 1) of the week's share, and `resets_at`
  /// → "You've used 42% of this week's share. It starts again Monday."
  public static func usageSentence(_ j: JSON, now: Date = .now, calendar: Calendar = .current) -> String? {
    guard let f = j["fraction_used"].double, f >= 0, f.isFinite else { return nil }
    let pct = Int((min(f, 1) * 100).rounded())
    let used: String
    if f >= 1 { used = "You\u{2019}ve used all of this week\u{2019}s share." }
    else if pct == 0 { used = "You\u{2019}ve hardly used any of this week\u{2019}s share yet." }
    else { used = "You\u{2019}ve used \(pct)% of this week\u{2019}s share." }
    guard let reset = AccountSession.date(j["resets_at"]), reset > now else { return used }
    let f2 = DateFormatter()
    f2.calendar = calendar
    f2.timeZone = calendar.timeZone
    f2.locale = Locale(identifier: "en_US")
    f2.dateFormat = reset.timeIntervalSince(now) < 6 * 86400 ? "EEEE" : "EEEE, MMMM d"
    return used + " It starts again \(calendar.isDateInTomorrow(reset) ? "tomorrow" : f2.string(from: reset))."
  }

  /// No saved credential is ever offered for the door's Basic challenge (a refused pass is a 401
  /// page that asks for one), and nothing is retried: a 401 is one request, then "signed out".
  public static let session: URLSession = {
    let c = URLSessionConfiguration.ephemeral
    c.urlCredentialStorage = nil
    c.httpCookieStorage = nil
    c.urlCache = nil
    return URLSession(configuration: c, delegate: NoCredentials(), delegateQueue: nil)
  }()

  /// Sends and maps the contract's errors: 401 is signed out (or, before sign-in, a refused code),
  /// 404 means the sign-in is not there yet, 429 too many tries.
  func send(_ r: URLRequest, signedIn: Bool) async throws -> (Data, Int) {
    var d = Data(), res: URLResponse
    let watch = NoCredentials()
    do { (d, res) = try await session.data(for: r, delegate: watch) } catch {
      // The door's Basic challenge, cancelled so the request is never sent twice: it was a 401.
      if let refusal = watch.refusal { res = refusal } else if error is CancellationError { throw AccountError.cancelled } else { throw AccountError.unreachable }
    }
    guard let h = res as? HTTPURLResponse else { throw AccountError.badReply }
    let word = JSON.parse(d)?["error"].string ?? ""
    switch h.statusCode {
    case 200..<300: return (d, h.statusCode)
    case 401: throw signedIn ? AccountError.signedOut : AccountError.refused(word.isEmpty ? "unauthorized" : word)
    case 404, 405: throw AccountError.notAvailableYet
    case 429: throw AccountError.tooManyTries
    case 400, 403: throw AccountError.refused(word.isEmpty ? "refused" : word)
    default: throw AccountError.unreachable
    }
  }
}

/// This device's sign-in, kept in the Keychain (one item). Whether someone is signed in, and
/// their name, are also kept in plain settings (not secret), so the app can say who is signed in
/// without reading the Keychain; the token itself is read only when a request needs it.
public enum AccountKeeper {
  public static let nameKey = "ola.account.name"
  public static let handleKey = "ola.account.handle"
  /// This Mac's known-device token (not a secret that signs anyone in: it only spares this Mac the
  /// wait a stranger's wrong guesses put on the name). Kept across sign-outs, in plain settings.
  public static let knownKey = "ola.account.known"
  public static var known: String? {
    get { defaults.string(forKey: knownKey) }
    set { defaults.set(newValue, forKey: knownKey) }
  }
  nonisolated(unsafe) public static var defaults: UserDefaults = .standard

  public static var signedIn: Bool { defaults.string(forKey: handleKey) != nil }
  public static var name: String? { defaults.string(forKey: nameKey) }

  /// The full sign-in, token included: reads the Keychain (once per launch).
  public static var session: AccountSession? {
    guard signedIn, let text = SecretStore.value(.account) else { return nil }
    return AccountSession.decode(text)
  }

  @discardableResult
  public static func keep(_ s: AccountSession) -> Bool {
    guard SecretStore.save(.account, s.encoded()) else { return false }
    if let k = s.known, !k.isEmpty { known = k }
    defaults.set(s.person.handle, forKey: handleKey)
    defaults.set(s.person.name, forKey: nameKey)
    return true
  }

  /// Whether `token` is the sign-in kept now (OLA-252): a 401 for a request sent with an older
  /// sign-in's token says nothing about the current one, and must not end it.
  public static func isCurrent(_ token: String?) -> Bool {
    guard let token, !token.isEmpty, let now = session?.token else { return false }
    return now == token
  }

  public static func forget() {
    SecretStore.remove(.account)
    defaults.removeObject(forKey: handleKey)
    defaults.removeObject(forKey: nameKey)
  }
}

/// The door's refusal is a 401 with `WWW-Authenticate: Basic`. Left to itself, URLSession answers
/// that challenge by sending the request again (measured: two requests per refusal, and ten refused
/// passes in 15 minutes block the person's address). So the challenge is cancelled, the 401 it came
/// with is kept (`refusal`), and the caller treats it as the 401 it is. Nothing is looked up in a
/// credential store or asked of anyone; the server's certificate is still checked the normal way.
final class NoCredentials: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let lock = NSLock()
  private var seen: HTTPURLResponse?
  /// The 401 a cancelled challenge came with.
  var refusal: HTTPURLResponse? { lock.withLock { seen } }

  func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                  completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
      completionHandler(.performDefaultHandling, nil)
      return
    }
    let r = (challenge.failureResponse as? HTTPURLResponse) ?? HTTPURLResponse(url: task.originalRequest?.url ?? URL(string: "about:blank")!, statusCode: 401, httpVersion: nil, headerFields: nil)
    lock.withLock { seen = r }
    completionHandler(.cancelAuthenticationChallenge, nil)
  }
}
