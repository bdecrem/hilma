import Foundation

/// Where Bart's opencode is and the password for it (Basic auth, user `opencode`).
public struct ServerConfig: Equatable, Sendable {
  public var url: URL
  public var password: String
  /// The phone, paired with the Mac app: `password` is the pairing secret, sent as a Bearer token
  /// to the Mac app's relay, which adds the real credentials.
  public var viaMac: Bool
  public var macName: String?
  /// The cloud (OLA-150): one of the person's projects through the front desk's device routes
  /// (`OlaCloud`, `<base>/api/device/w/<project>/oc`); `password` is this device's Ola account key,
  /// sent as a Bearer token. The same conversations the website shows.
  public var account: Bool
  public init(url: URL, password: String, viaMac: Bool = false, macName: String? = nil, account: Bool = false) {
    self.url = url
    self.password = password
    self.viaMac = viaMac
    self.macName = macName
    self.account = account
  }
  /// The mini's Tailscale name. Its address, http://100.95.51.98:4310, answers too, but App
  /// Transport Security cannot be told to allow plain HTTP to an IP address: in the simulator the
  /// IP was refused and the name worked. On the Studio, change it in the connect sheet.
  public static let defaultAddress = "http://admins-mac-mini.tailde799a.ts.net:4310"
}

public enum OlaError: Error, Equatable, LocalizedError {
  /// The password was refused.
  case unauthorized
  /// Nothing answered: the machine is off, asleep, or not on Tailscale.
  case unreachable(String)
  /// The server answered with an error.
  case server(Int, String)
  case badReply(String)

  public var errorDescription: String? {
    switch self {
    case .unauthorized: return "The machine refused the password."
    case .unreachable: return "The machine did not answer. Is it on, and is this device on Tailscale?"
    case .server(let code, let message): return message.isEmpty ? "The machine answered with an error (\(code))." : message
    case .badReply: return "The machine sent something this app did not understand."
    }
  }

  /// The raw detail behind "Show details".
  public var detail: String {
    switch self {
    case .unauthorized: return "401"
    case .unreachable(let s): return s
    case .server(let code, let m): return "\(code) \(m)"
    case .badReply(let s): return s
    }
  }
}

public struct SessionInfo: Identifiable, Equatable, Sendable, Hashable {
  public var id: String
  public var title: String
  public var created: Date
  public var updated: Date
  public var directory: String?

  public init(id: String, title: String, created: Date, updated: Date, directory: String? = nil) {
    self.id = id
    self.title = title
    self.created = created
    self.updated = updated
    self.directory = directory
  }

  init(_ j: JSON) {
    id = j["id"].str
    let t = j["title"].str
    title = t.isEmpty ? "New session" : t
    created = j["time"]["created"].date ?? .now
    updated = j["time"]["updated"].date ?? created
    directory = j["location"]["directory"].string
  }
}

public struct FileEntry: Identifiable, Equatable, Sendable, Hashable {
  public var path: String
  public var isDirectory: Bool
  public var id: String { path }
  public var name: String {
    let trimmed = path.hasSuffix("/") ? String(path.dropLast()) : path
    return trimmed.split(separator: "/").last.map(String.init) ?? trimmed
  }
  public init(path: String, isDirectory: Bool) {
    self.path = path
    self.isDirectory = isDirectory
  }
}

public struct ModelInfo: Identifiable, Equatable, Sendable, Hashable {
  public var providerID: String
  public var modelID: String
  public var name: String
  public var id: String { "\(providerID)/\(modelID)" }
  public init(providerID: String, modelID: String, name: String) {
    self.providerID = providerID
    self.modelID = modelID
    self.name = name
  }
}

/// opencode 2.3.0's V2 HTTP API, the routes the apps use. Every call is async and throws OlaError.
public final class OpenCodeClient: @unchecked Sendable {
  public let config: ServerConfig
  private let http: URLSession
  private let streamSession: URLSession

  public init(_ config: ServerConfig) {
    self.config = config
    let c = URLSessionConfiguration.ephemeral
    c.timeoutIntervalForRequest = 20
    c.waitsForConnectivity = false
    c.httpCookieStorage = nil
    http = URLSession(configuration: c)
    let s = URLSessionConfiguration.ephemeral
    // opencode sends a heartbeat on the event stream; this much silence means the line is gone.
    s.timeoutIntervalForRequest = 75
    s.timeoutIntervalForResource = 60 * 60 * 24 * 7
    streamSession = URLSession(configuration: s)
  }

  private var authorization: String {
    config.viaMac || config.account ? "Bearer \(config.password)" : "Basic " + Data("opencode:\(config.password)".utf8).base64EncodedString()
  }

  /// The bytes of a GET (the Mac relay's own routes).
  public func raw(_ path: String) async throws -> Data { try await send("GET", path).0 }

  /// A POST to the Mac app's own routes (push token, what the phone is looking at).
  public func post(_ path: String, _ body: JSON) async throws { try await send("POST", path, body: body) }

  /// Any GET, for checks.
  public func get(_ path: String) async throws -> JSON { try await json("GET", path) }

  /// What the Mac app says about itself (only through its relay).
  public func hello() async throws -> JSON { try await json("GET", "/ola/hello") }

  /// A path starting `/project/` is the cloud project's own (beside its `/oc`: its files).
  func url(_ path: String, _ query: [URLQueryItem] = []) -> URL {
    var c = URLComponents(url: config.url, resolvingAgainstBaseURL: false)!
    var base = c.percentEncodedPath.hasSuffix("/") ? String(c.percentEncodedPath.dropLast()) : c.percentEncodedPath
    var path = path
    if config.account, path.hasPrefix("/project/"), base.hasSuffix("/oc") {
      base.removeLast(3)
      path.removeFirst("/project".count)
    }
    c.percentEncodedPath = base + path
    if !query.isEmpty { c.queryItems = query }
    return c.url!
  }

  func request(_ method: String, _ path: String, query: [URLQueryItem] = [], body: JSON? = nil, timeout: TimeInterval? = nil) -> URLRequest {
    var r = URLRequest(url: url(path, query))
    r.httpMethod = method
    r.setValue(authorization, forHTTPHeaderField: "Authorization")
    r.setValue("application/json", forHTTPHeaderField: "Accept")
    if let timeout { r.timeoutInterval = timeout }
    if let body {
      r.httpBody = body.data
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    return r
  }

  @discardableResult
  func send(_ method: String, _ path: String, query: [URLQueryItem] = [], body: JSON? = nil) async throws -> (Data, HTTPURLResponse) {
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await http.data(for: request(method, path, query: query, body: body))
    } catch {
      throw OlaError.unreachable(error.localizedDescription)
    }
    guard let res = response as? HTTPURLResponse else { throw OlaError.badReply("no HTTP response") }
    if res.statusCode == 401 { throw OlaError.unauthorized }
    if !(200..<300).contains(res.statusCode) {
      let j = JSON.parse(data)
      let message = j?["message"].string ?? j?["error"]["message"].string ?? j?["data"]["message"].string ?? ""
      throw OlaError.server(res.statusCode, message)
    }
    return (data, res)
  }

  func json(_ method: String, _ path: String, query: [URLQueryItem] = [], body: JSON? = nil) async throws -> JSON {
    let (data, _) = try await send(method, path, query: query, body: body)
    if data.isEmpty { return .null }
    guard let j = JSON.parse(data) else { throw OlaError.badReply(String(decoding: data.prefix(200), as: UTF8.self)) }
    return j
  }

  // MARK: server

  /// `GET /api/info`: the version, and proof the password works.
  public func info() async throws -> JSON { try await json("GET", "/api/info") }

  // MARK: sessions

  public func sessions(limit: Int = 100) async throws -> [SessionInfo] {
    let j = try await json("GET", "/api/session", query: [URLQueryItem(name: "limit", value: String(limit))])
    return j["data"].array.map(SessionInfo.init).sorted { $0.updated > $1.updated }
  }

  public func session(_ id: String) async throws -> SessionInfo {
    SessionInfo(try await json("GET", "/api/session/\(id)")["data"])
  }

  /// `autonomy` is the cloud's "Lots of permissions" for the new conversation (CloudAutonomy), as
  /// the website sends it; the front desk turns it into the rules. Sent only to the cloud.
  public func createSession(title: String? = nil, autonomy: String? = nil) async throws -> SessionInfo {
    var body: [String: JSON] = [:]
    if let title { body["title"] = .string(title) }
    if let autonomy, config.account { body["metadata"] = ["autonomy": .string(autonomy)] }
    return SessionInfo(try await json("POST", "/api/session", body: .object(body))["data"])
  }

  /// The cloud: a conversation's "Lots of permissions" changed (`go` or `ask`), as the website does.
  public func setAutonomy(_ id: String, _ autonomy: String) async throws {
    try await send("PATCH", "/api/session/\(id)", body: ["metadata": ["autonomy": .string(autonomy)]])
  }

  public func rename(_ id: String, to title: String) async throws {
    try await send("PATCH", "/api/session/\(id)", body: ["title": .string(title)])
  }

  public func deleteSession(_ id: String) async throws {
    try await send("DELETE", "/api/session/\(id)")
  }

  /// The ids of sessions running right now.
  public func active() async throws -> Set<String> {
    Set(try await json("GET", "/api/session/active")["data"].object.keys)
  }

  public func prompt(_ id: String, text: String) async throws {
    try await send("POST", "/api/session/\(id)/prompt", body: ["text": .string(text)])
  }

  public func interrupt(_ id: String) async throws {
    try await send("POST", "/api/session/\(id)/interrupt", body: [:])
  }

  /// The stored history, newest first (opencode's order).
  public func messages(_ id: String, pages: Int = 5) async throws -> [JSON] {
    // opencode serves at most 200 a page; older pages follow cursor.next.
    var out: [JSON] = []
    var cursor: String?
    for _ in 0..<pages {
      var q = [URLQueryItem(name: "limit", value: "200")]
      if let cursor { q.append(URLQueryItem(name: "cursor", value: cursor)) }
      let j = try await json("GET", "/api/session/\(id)/message", query: q)
      out += j["data"].array
      guard j["data"].array.count == 200, let next = j["cursor"]["next"].string else { break }
      cursor = next
    }
    return out
  }

  public func pendingPermissions(_ id: String) async throws -> [JSON] {
    let j = try await json("GET", "/api/session/\(id)/permission")
    return j["data"].isNull ? j.array : j["data"].array
  }

  public enum Decision: String, Sendable { case once, always, reject }

  public func reply(session: String, request: String, decision: Decision) async throws {
    try await send("POST", "/api/session/\(session)/permission/\(request)/reply", body: ["decision": .string(decision.rawValue)])
  }

  // MARK: models

  /// Models the server offers through Ola's gateway (the config allows no other provider).
  public func models() async throws -> [ModelInfo] {
    // The cloud's model is the project's (the website offers no choice either).
    if config.account { return [] }
    return try await json("GET", "/api/model")["data"].array.map {
      ModelInfo(providerID: $0["providerID"].str, modelID: $0["id"].str, name: $0["name"].string ?? $0["id"].str)
    }
  }

  public func defaultModel() async throws -> ModelInfo? {
    if config.account { return nil }
    let d = try await json("GET", "/api/model/default")["data"]
    return d.isNull ? nil : ModelInfo(providerID: d["providerID"].str, modelID: d["id"].str, name: d["name"].string ?? d["id"].str)
  }

  public func switchModel(_ id: String, to model: ModelInfo) async throws {
    try await send("POST", "/api/session/\(id)/model", body: ["model": ["providerID": .string(model.providerID), "id": .string(model.modelID)]])
  }

  // MARK: files of the project

  public func files(in path: String? = nil) async throws -> [FileEntry] {
    // The cloud: the website's list of the project's files, one folder of it.
    if config.account { return Self.folder(try await json("GET", "/project/api/files")["files"].array.map { $0["path"].str }, path ?? "") }
    let q = path.map { [URLQueryItem(name: "path", value: $0)] } ?? []
    return try await json("GET", "/api/fs/list", query: q)["data"].array.map {
      FileEntry(path: $0["path"].str, isDirectory: $0["type"].str == "directory")
    }
    .sorted { ($0.isDirectory ? 0 : 1, $0.name.lowercased()) < ($1.isDirectory ? 0 : 1, $1.name.lowercased()) }
  }

  /// A file's bytes, relative to the project folder.
  public func read(_ path: String) async throws -> Data {
    let encoded = path.split(separator: "/").map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }.joined(separator: "/")
    // The cloud: the website's own download of one of the project's files.
    if config.account { return try await send("GET", "/project/api/files/\(encoded)").0 }
    return try await send("GET", "/api/fs/read/\(encoded)").0
  }

  /// One folder's entries from the website's flat list of the project's files: the files in it and
  /// the folders under it, as opencode's own list gives them.
  static func folder(_ paths: [String], _ dir: String) -> [FileEntry] {
    let prefix = dir.isEmpty ? "" : (dir.hasSuffix("/") ? dir : dir + "/")
    var out: [String: FileEntry] = [:]
    for p in paths where p.hasPrefix(prefix) && p.count > prefix.count {
      let rest = p.dropFirst(prefix.count)
      if let slash = rest.firstIndex(of: "/") {
        let d = prefix + rest[..<slash]
        out[d] = FileEntry(path: d, isDirectory: true)
      } else {
        out[p] = FileEntry(path: p, isDirectory: false)
      }
    }
    return out.values.sorted { ($0.isDirectory ? 0 : 1, $0.name.lowercased()) < ($1.isDirectory ? 0 : 1, $1.name.lowercased()) }
  }

  // MARK: the event stream

  /// opencode's events as they happen (`GET /api/event`, server-sent events). Ends or throws when
  /// the connection goes; the caller reconnects. `onHeartbeat` sees every line, events or not.
  public func events(onHeartbeat: @escaping @Sendable () -> Void = {}) -> AsyncThrowingStream<JSON, Error> {
    let req = request("GET", "/api/event", timeout: config.viaMac || config.account ? 45 : 75)
    let session = streamSession
    return AsyncThrowingStream { continuation in
      let task = Task {
        do {
          let (bytes, response) = try await session.bytes(for: req)
          if let res = response as? HTTPURLResponse {
            if res.statusCode == 401 { throw OlaError.unauthorized }
            if res.statusCode != 200 { throw OlaError.server(res.statusCode, "event stream") }
          }
          for try await line in bytes.lines {
            onHeartbeat()
            guard line.hasPrefix("data:") else { continue }
            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            if let ev = JSON.parse(payload) { continuation.yield(ev) }
          }
          continuation.finish()
        } catch let e as OlaError {
          continuation.finish(throwing: e)
        } catch {
          continuation.finish(throwing: OlaError.unreachable(error.localizedDescription))
        }
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
}
