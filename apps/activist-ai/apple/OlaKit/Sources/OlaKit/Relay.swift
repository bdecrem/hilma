#if os(macOS)
import CryptoKit
import Foundation
import Network

// The Mac app is the hub: the phone pairs with it and talks only to it. The relay listens on this
// Mac's Tailscale address and nowhere else, checks the phone's pairing secret, and forwards the
// opencode routes the apps use (an allow-list, not a proxy) to whichever server the Mac app is
// using right now, adding that server's real credentials. The phone never holds them.

// MARK: a small HTTP/1.1 server (one request per connection)

public struct HTTPRequest: Sendable {
  public var method: String
  public var path: String
  public var query: String?
  public var headers: [String: String]
  public var body: Data
  public var remote: String
  public func header(_ name: String) -> String? { headers[name.lowercased()] }
}

public final class HTTPResponder: @unchecked Sendable {
  let connection: NWConnection
  private var started = false
  init(_ c: NWConnection) { connection = c }

  private func raw(_ d: Data) async -> Bool {
    await withCheckedContinuation { cont in
      connection.send(content: d, completion: .contentProcessed { cont.resume(returning: $0 == nil) })
    }
  }

  static func reason(_ s: Int) -> String {
    [200: "OK", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 413: "Too Large", 429: "Too Many Requests", 502: "Bad Gateway", 503: "Service Unavailable"][s] ?? "Status"
  }

  /// Starts a response whose body ends when the connection closes (used for the event stream).
  public func head(_ status: Int, _ headers: [String: String] = [:]) async -> Bool {
    started = true
    var h = "HTTP/1.1 \(status) \(Self.reason(status))\r\nConnection: close\r\nCache-Control: no-store\r\n"
    for (k, v) in headers { h += "\(k): \(v)\r\n" }
    return await raw(Data((h + "\r\n").utf8))
  }

  public func write(_ d: Data) async -> Bool { await raw(d) }

  public func send(_ status: Int, _ body: Data = Data(), type: String = "application/json") async {
    _ = await head(status, ["Content-Type": type, "Content-Length": String(body.count)])
    if !body.isEmpty { _ = await raw(body) }
    end()
  }

  public func json(_ status: Int, _ message: String) async {
    await send(status, JSON.object(["message": .string(message)]).data)
  }

  public func end() { connection.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [connection] _ in connection.cancel() }) }

  /// Calls `f` once when the client closes its side or the connection fails (a request that is
  /// still being answered can then stop its upstream).
  public func onClose(_ f: @escaping @Sendable () -> Void) {
    let once = Once(f)
    func watch() {
      connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [connection] data, _, complete, error in
        if complete || error != nil || data == nil { once.fire(); return }
        _ = connection
        watch()
      }
    }
    watch()
  }

  /// A chunked body: `head` with this, then `chunk` any number of times, then `finish`.
  public static let chunkedHeader = ["Transfer-Encoding": "chunked"]
  public func chunk(_ d: Data) async -> Bool {
    guard !d.isEmpty else { return true }
    var out = Data((String(d.count, radix: 16) + "\r\n").utf8)
    out.append(d)
    out.append(Data("\r\n".utf8))
    return await raw(out)
  }
  public func finish() async {
    _ = await raw(Data("0\r\n\r\n".utf8))
    end()
  }
}

/// Runs a closure once, from any thread.
final class Once: @unchecked Sendable {
  private let lock = NSLock()
  private var f: (@Sendable () -> Void)?
  init(_ f: @escaping @Sendable () -> Void) { self.f = f }
  func fire() {
    let g: (@Sendable () -> Void)? = lock.withLock { defer { f = nil }; return f }
    g?()
  }
}

public final class MiniHTTPServer: @unchecked Sendable {
  let listener: NWListener
  let handler: @Sendable (HTTPRequest, HTTPResponder) async -> Void
  let queue = DispatchQueue(label: "ola.http")
  public private(set) var port: UInt16 = 0

  /// Binds to `host` only (an address, never "any").
  public init(host: String, port: UInt16, handler: @escaping @Sendable (HTTPRequest, HTTPResponder) async -> Void) throws {
    let params = NWParameters.tcp
    params.requiredLocalEndpoint = .hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port) ?? .any)
    params.allowLocalEndpointReuse = true
    listener = try NWListener(using: params)
    self.handler = handler
  }

  /// Starts and waits until listening; returns the port.
  public func start() async throws -> UInt16 {
    listener.newConnectionHandler = { [weak self] c in self?.accept(c) }
    return try await withCheckedThrowingContinuation { cont in
      var done = false
      listener.stateUpdateHandler = { [weak self] st in
        guard !done else { return }
        switch st {
        case .ready:
          done = true
          self?.port = self?.listener.port?.rawValue ?? 0
          cont.resume(returning: self?.port ?? 0)
        case .failed(let e):
          done = true
          cont.resume(throwing: e)
        default: break
        }
      }
      listener.start(queue: queue)
    }
  }

  public func stop() { listener.cancel() }

  private func accept(_ c: NWConnection) {
    c.start(queue: queue)
    var buffer = Data()
    let remote: String = {
      if case .hostPort(let h, _) = c.endpoint { return "\(h)" }
      return "?"
    }()
    func readMore() {
      c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, complete, error in
        guard let self else { return c.cancel() }
        if let data { buffer.append(data) }
        if buffer.count > 2_000_000 || error != nil { return c.cancel() }
        if let req = Self.parse(buffer, remote: remote) {
          let responder = HTTPResponder(c)
          Task { await self.handler(req, responder) }
        } else if complete {
          c.cancel()
        } else {
          readMore()
        }
      }
    }
    readMore()
  }

  /// A whole request, or nil while more is needed.
  static func parse(_ data: Data, remote: String) -> HTTPRequest? {
    guard let end = data.range(of: Data("\r\n\r\n".utf8)) else { return nil }
    let head = String(decoding: data[..<end.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
    let first = head.first?.split(separator: " ") ?? []
    guard first.count >= 2 else { return nil }
    var headers: [String: String] = [:]
    for line in head.dropFirst() {
      guard let colon = line.firstIndex(of: ":") else { continue }
      headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
    }
    let bodyStart = end.upperBound
    let body: Data
    if headers["transfer-encoding"]?.lowercased().contains("chunked") == true {
      guard let b = dechunk(data.subdata(in: bodyStart..<data.count)) else { return nil }
      body = b
    } else {
      let length = Int(headers["content-length"] ?? "0") ?? 0
      guard data.count - bodyStart >= length else { return nil }
      body = data.subdata(in: bodyStart..<bodyStart + length)
    }
    let target = String(first[1])
    let q = target.firstIndex(of: "?")
    return HTTPRequest(method: String(first[0]), path: q.map { String(target[..<$0]) } ?? target, query: q.map { String(target[target.index(after: $0)...]) },
                       headers: headers, body: body, remote: remote)
  }

  /// A chunked body, or nil while its last chunk has not arrived.
  static func dechunk(_ d: Data) -> Data? {
    var out = Data()
    var i = d.startIndex
    let crlf = Data("\r\n".utf8)
    while true {
      guard let lineEnd = d.range(of: crlf, in: i..<d.endIndex) else { return nil }
      let sizeText = String(decoding: d[i..<lineEnd.lowerBound], as: UTF8.self).split(separator: ";").first.map(String.init) ?? ""
      guard let size = Int(sizeText.trimmingCharacters(in: .whitespaces), radix: 16) else { return nil }
      let start = lineEnd.upperBound
      if size == 0 { return out }
      guard d.endIndex - start >= size + 2 else { return nil }
      out.append(d[start..<start + size])
      i = start + size + 2
    }
  }
}

/// When a stream last heard from its upstream.
final class LastSeen: @unchecked Sendable {
  private let lock = NSLock()
  private var at = Date()
  func touch() { lock.withLock { at = Date() } }
  var age: TimeInterval { lock.withLock { Date().timeIntervalSince(at) } }
}

// MARK: the paired phones

/// Paired phones: an id, a label, when paired and last seen, and the SHA-256 of the secret (the
/// secret itself is shown once, in the pairing code, and kept nowhere on the Mac). Thread-safe.
public final class PairingBook: @unchecked Sendable {
  public struct Phone: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var paired: Date
    public var lastSeen: Date?
    var digest: String
    /// Its Apple push token and its two switches (Finished, Needs me), sent by the phone.
    public var pushToken: String?
    public var notifyFinished: Bool?
    public var notifyNeeds: Bool?
    public var pushSandbox: Bool?
    /// The session open on its screen, and when it last said so (not kept on disk).
    public var viewing: String?
    public var viewingAt: Date?

    enum CodingKeys: String, CodingKey { case id, label, paired, lastSeen, digest, pushToken, notifyFinished, notifyNeeds, pushSandbox }
  }

  private let lock = NSLock()
  private var phones: [Phone] = []
  private var failures: [String: [Date]] = [:]
  let file: URL?
  /// Failures from one address within a minute before it is refused for a minute.
  public var maxFailures = 8

  public init(file: URL?) {
    self.file = file
    if let file, let d = try? Data(contentsOf: file), let p = try? JSONDecoder().decode([Phone].self, from: d) { phones = p }
  }

  public var list: [Phone] { lock.withLock { phones } }

  static func digest(_ secret: String) -> String {
    SHA256.hash(data: Data(PairingCode.normalize(secret).utf8)).map { String(format: "%02x", $0) }.joined()
  }

  /// Adds a phone for a new secret (the caller shows the code once).
  @discardableResult
  public func add(secret: String, label: String = "iPhone") -> Phone {
    let p = Phone(id: UUID().uuidString, label: label, paired: .now, lastSeen: nil, digest: Self.digest(secret))
    lock.withLock { phones.append(p) }
    save()
    return p
  }

  /// Removing a phone ends its access at once (its open streams are cut by the relay).
  public func remove(_ id: String) {
    lock.withLock { phones.removeAll { $0.id == id } }
    save()
  }

  public enum Check: Equatable { case phone(String), wrong, tooMany }

  /// Constant-time: the presented secret's digest is compared with every phone's, all the way.
  public func check(_ secret: String?, from remote: String) -> Check {
    lock.withLock {
      let now = Date()
      let recent = (failures[remote] ?? []).filter { now.timeIntervalSince($0) < 60 }
      failures[remote] = recent
      if recent.count >= maxFailures { return .tooMany }
      let given = Array((secret.map { Self.digest($0) } ?? String(repeating: "0", count: 64)).utf8)
      var match: String?
      for p in phones {
        let want = Array(p.digest.utf8)
        var diff: UInt8 = want.count == given.count ? 0 : 1
        for i in 0..<min(want.count, given.count) { diff |= want[i] ^ given[i] }
        if diff == 0 { match = p.id }
      }
      if let match { return .phone(match) }
      failures[remote] = recent + [now]
      return .wrong
    }
  }

  public func setPush(_ id: String, token: String?, finished: Bool, needs: Bool, sandbox: Bool = true) {
    lock.withLock {
      guard let i = phones.firstIndex(where: { $0.id == id }) else { return }
      phones[i].pushToken = token
      phones[i].notifyFinished = finished
      phones[i].notifyNeeds = needs
      phones[i].pushSandbox = sandbox
    }
    save()
  }

  public func setViewing(_ id: String, session: String?) {
    lock.withLock {
      guard let i = phones.firstIndex(where: { $0.id == id }) else { return }
      phones[i].viewing = session
      phones[i].viewingAt = .now
    }
  }

  public func isPaired(_ id: String) -> Bool { lock.withLock { phones.contains { $0.id == id } } }

  public func seen(_ id: String, label: String?) {
    lock.withLock {
      guard let i = phones.firstIndex(where: { $0.id == id }) else { return }
      phones[i].lastSeen = .now
      if let label, !label.isEmpty { phones[i].label = String(label.prefix(60)) }
    }
  }

  func save() {
    guard let file else { return }
    let data = lock.withLock { try? JSONEncoder().encode(phones) }
    try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let data {
      try? data.write(to: file, options: .atomic)
      try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
  }
}

// MARK: the relay

public final class MacRelay: @unchecked Sendable {
  public let book: PairingBook
  public let macName: String
  /// Where the Mac app keeps Claude turns: the phone reads them through `/ola/claude/<session>`.
  public var claudeBase: URL?
  /// "Lots of permissions" for the phone (`GET|PUT /ola/permissions`, OLA-139): the Mac's choice, and
  /// a change made here and on the Ola machine (PermissionSettings.set). Unset: the routes are 404.
  public var permissions: (@Sendable () -> String)?
  public var setPermissions: (@Sendable (String) async -> String)?
  /// "Yes, for the rest of this session" from the phone (OLA-142): an answer `always` on the reply
  /// route goes to the Mac app (OlaStore.answerForSession for the store on the relay's server),
  /// never to opencode as its own lasting "always". Returns an HTTP status. Unset: refused (409).
  public var sessionYes: (@Sendable (_ session: String, _ request: String) async -> Int)?
  private let lock = NSLock()
  private var upstreamConfig: ServerConfig?
  private var mode = "machine"
  private var claudeLine = ""
  private var streams: [UUID: (phone: String, task: Task<Void, Never>)] = [:]
  private var server: MiniHTTPServer?
  private let session: URLSession
  private let streamSession: URLSession

  public init(book: PairingBook, macName: String) {
    self.book = book
    self.macName = macName
    let c = URLSessionConfiguration.ephemeral
    c.timeoutIntervalForRequest = 60
    session = URLSession(configuration: c)
    let s = URLSessionConfiguration.ephemeral
    s.timeoutIntervalForRequest = 75
    s.timeoutIntervalForResource = 60 * 60 * 24 * 7
    streamSession = URLSession(configuration: s)
  }

  /// The routes the apps use, and nothing else.
  static let allowList: [(String, String)] = [
    ("GET", #"^/api/info$"#),
    ("GET", #"^/api/event$"#),
    ("GET", #"^/api/session$"#),
    ("POST", #"^/api/session$"#),
    ("GET", #"^/api/session/active$"#),
    ("GET", #"^/api/session/[A-Za-z0-9_-]{1,80}$"#),
    ("PATCH", #"^/api/session/[A-Za-z0-9_-]{1,80}$"#),
    ("DELETE", #"^/api/session/[A-Za-z0-9_-]{1,80}$"#),
    ("POST", #"^/api/session/[A-Za-z0-9_-]{1,80}/prompt$"#),
    ("POST", #"^/api/session/[A-Za-z0-9_-]{1,80}/interrupt$"#),
    ("POST", #"^/api/session/[A-Za-z0-9_-]{1,80}/model$"#),
    ("GET", #"^/api/session/[A-Za-z0-9_-]{1,80}/message$"#),
    ("GET", #"^/api/session/[A-Za-z0-9_-]{1,80}/permission$"#),
    ("POST", #"^/api/session/[A-Za-z0-9_-]{1,80}/permission/[A-Za-z0-9_-]{1,80}/reply$"#),
    ("GET", #"^/api/model$"#),
    ("GET", #"^/api/model/default$"#),
    ("GET", #"^/api/fs/list$"#),
    ("GET", #"^/api/fs/read/[^?#]+$"#),
  ]

  public static func allowed(_ method: String, _ path: String) -> Bool {
    if path.contains("/../") || path.hasSuffix("/..") || path.contains("%2e%2e") || path.contains("%2E%2E") { return false }
    return allowList.contains { $0.0 == method && path.range(of: $0.1, options: .regularExpression) != nil }
  }

  /// The server the Mac app uses now. A change ends every open event stream, so phones reconnect
  /// to the new one (they follow a switch of "Where Ola works" without pairing again).
  public func setUpstream(_ config: ServerConfig?, mode: String) {
    let cut: [Task<Void, Never>] = lock.withLock {
      let changed = config != upstreamConfig
      upstreamConfig = config
      self.mode = mode
      guard changed else { return [] }
      let t = streams.values.map(\.task)
      streams = [:]
      return t
    }
    cut.forEach { $0.cancel() }
  }

  /// One line for the phone's Settings: how Fallback to Claude stands on the Mac.
  public func setClaudeLine(_ s: String) { lock.withLock { claudeLine = s } }

  /// Ends a removed phone's open streams at once.
  public func cut(phone id: String) {
    let t: [Task<Void, Never>] = lock.withLock {
      let mine = streams.filter { $0.value.phone == id }
      for k in mine.keys { streams[k] = nil }
      return mine.values.map(\.task)
    }
    t.forEach { $0.cancel() }
  }

  public func start(host: String, port: UInt16) async throws -> UInt16 {
    stop()
    let s = try MiniHTTPServer(host: host, port: port) { [weak self] req, res in await self?.handle(req, res) }
    server = s
    return try await s.start()
  }

  public func stop() {
    server?.stop()
    server = nil
  }

  func handle(_ req: HTTPRequest, _ res: HTTPResponder) async {
    let auth = req.header("authorization") ?? ""
    let secret = auth.hasPrefix("Bearer ") ? String(auth.dropFirst(7)) : nil
    let phone: String
    switch book.check(secret, from: req.remote) {
    case .tooMany: return await res.json(429, "Too many wrong tries. Wait a minute.")
    case .wrong: return await res.json(401, "This phone is not paired with this Mac.")
    case .phone(let id): phone = id
    }
    book.seen(phone, label: req.header("x-ola-phone"))
    let (upstream, mode) = lock.withLock { (upstreamConfig, self.mode) }
    if req.method == "GET", req.path == "/ola/hello" {
      let claude = lock.withLock { claudeLine }
      return await res.send(200, JSON.object(["name": .string(macName), "mode": .string(mode), "connected": .bool(upstream != nil), "claude": .string(claude)]).data)
    }
    // The phone's push token and switches, and which session it is looking at.
    if req.method == "POST", req.path == "/ola/push" {
      let j = JSON.parse(req.body) ?? .null
      let token = j["token"].string.flatMap { $0.range(of: #"^[0-9a-f]{32,200}$"#, options: .regularExpression) != nil ? $0 : nil }
      book.setPush(phone, token: token, finished: j["finished"].bool ?? true, needs: j["needs"].bool ?? true, sandbox: j["sandbox"].bool ?? true)
      return await res.send(200, Data("{}".utf8))
    }
    if req.method == "POST", req.path == "/ola/viewing" {
      let s = (JSON.parse(req.body) ?? .null)["session"].string
      book.setViewing(phone, session: s.flatMap { $0.range(of: #"^[A-Za-z0-9_-]{1,80}$"#, options: .regularExpression) != nil ? $0 : nil })
      return await res.send(200, Data("{}".utf8))
    }
    if req.method == "GET", req.path.hasPrefix("/ola/claude/") {
      let id = String(req.path.dropFirst("/ola/claude/".count))
      guard id.range(of: #"^[A-Za-z0-9_-]{1,80}$"#, options: .regularExpression) != nil, let base = claudeBase else { return await res.send(200, Data("[]".utf8)) }
      let data = (try? Data(contentsOf: ClaudeTurns.file(id, base: base))) ?? Data("[]".utf8)
      return await res.send(200, data)
    }
    if req.path == "/ola/permissions" {
      guard let get = permissions else { return await res.json(404, "This Mac keeps no permissions setting.") }
      if req.method == "GET" { return await res.send(200, JSON.object(["mode": .string(get())]).data) }
      guard req.method == "PUT", let set = setPermissions, let m = (JSON.parse(req.body) ?? .null)["mode"].string, m == "lots" || m == "ask" else {
        return await res.json(400, "The mode is lots or ask.")
      }
      return await res.send(200, JSON.object(["mode": .string(await set(m))]).data)
    }
    guard Self.allowed(req.method, req.path) else { return await res.json(403, "That is not something the phone may ask for.") }
    guard let upstream else { return await res.json(503, "The Mac app is not connected to a server right now.") }
    // The allow list already checked the shape: /api/session/<s>/permission/<r>/reply.
    let parts = req.path.split(separator: "/").map(String.init)
    if req.method == "POST", parts.count == 6, parts[3] == "permission", parts[5] == "reply",
       (JSON.parse(req.body) ?? .null)["decision"].string == "always" {
      guard let sessionYes else { return await res.json(409, "This Mac cannot keep a yes for the session.") }
      let status = await sessionYes(parts[2], parts[4])
      return (200..<300).contains(status) ? await res.send(204) : await res.json(status == 404 ? 404 : 502, "Your answer did not reach Ola. Try again.")
    }
    var url = upstream.url.absoluteString
    if url.hasSuffix("/") { url.removeLast() }
    url += req.path + (req.query.map { "?\($0)" } ?? "")
    guard let target = URL(string: url) else { return await res.json(400, "Bad address.") }
    var r = URLRequest(url: target)
    r.httpMethod = req.method
    // Only these pass from the phone; its Authorization is replaced by the server's own.
    if let ct = req.header("content-type") { r.setValue(ct, forHTTPHeaderField: "Content-Type") }
    r.setValue(req.header("accept") ?? "application/json", forHTTPHeaderField: "Accept")
    r.setValue("Basic " + Data("opencode:\(upstream.password)".utf8).base64EncodedString(), forHTTPHeaderField: "Authorization")
    if !req.body.isEmpty { r.httpBody = req.body }

    if req.path == "/api/event" {
      let id = UUID()
      let task = Task { [streamSession] in
        let last = LastSeen()
        let beat = Task {
          // Both ways: our heartbeat to the phone, and a check that the upstream still talks.
          while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 15_000_000_000)
            if Task.isCancelled { break }
            let sent = await withTaskGroup(of: Bool.self) { g -> Bool in
              g.addTask { await res.write(Data(": ola\n\n".utf8)) }
              g.addTask { try? await Task.sleep(nanoseconds: 20_000_000_000); return false }
              let first = await g.next() ?? false
              g.cancelAll()
              return first
            }
            if !sent || last.age > 60 { res.end(); break }
          }
        }
        defer { beat.cancel() }
        do {
          let (bytes, response) = try await streamSession.bytes(for: r)
          let status = (response as? HTTPURLResponse)?.statusCode ?? 502
          guard await res.head(status == 401 ? 502 : status, ["Content-Type": "text/event-stream"]) else { return }
          for try await line in bytes.lines {
            last.touch()
            if Task.isCancelled || !book.isPaired(phone) { break }
            guard await res.write(Data((line + "\n\n").utf8)) else { break }
          }
        } catch {}
        res.end()
      }
      lock.withLock { streams[id] = (phone, task) }
      await task.value
      lock.withLock { streams[id] = nil }
      return
    }
    do {
      let (data, response) = try await session.data(for: r)
      let http = response as? HTTPURLResponse
      // The server refusing the Mac app's own credentials is the Mac's problem, not the phone's.
      let status = http?.statusCode == 401 ? 502 : http?.statusCode ?? 502
      await res.send(status, data, type: http?.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream")
    } catch {
      await res.json(502, "The Mac app could not reach its server.")
    }
  }
}

// MARK: this Mac on the tailnet

public enum Tailnet {
  /// This Mac's Tailscale IPv4 address (100.64.0.0/10), or nil when Tailscale is off.
  public static func address() -> String? {
    var list: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&list) == 0, let first = list else { return nil }
    defer { freeifaddrs(list) }
    var p: UnsafeMutablePointer<ifaddrs>? = first
    while let ifa = p {
      if let sa = ifa.pointee.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET) {
        var addr = sa.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
        let ip = UInt32(bigEndian: addr.s_addr)
        if ip & 0xFFC0_0000 == 0x6440_0000 {
          var buf = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
          inet_ntop(AF_INET, &addr, &buf, socklen_t(INET_ADDRSTRLEN))
          return String(cString: buf)
        }
      }
      p = ifa.pointee.ifa_next
    }
    return nil
  }

  /// This Mac's Tailscale name (`imac-m1.tailde799a.ts.net`), from the Tailscale app's own CLI.
  /// Inside the app, the reverse lookup took 35 s and found nothing, and the Tailscale CLI answered
  /// nothing (2026-11-16, measured by --settings-selftest). So: guess the name from this Mac's names
  /// and the tailnet's suffix (from the Ola machine's address, `*.tailXXXX.ts.net`), and keep a
  /// guess only if it resolves to this Mac's own Tailscale address. The slow ways come last.
  public static func dnsName(suffixHint: String? = nil) -> String? {
    guard let ip = address() else { return nil }
    let suffixes = [suffixHint, UserDefaults.standard.string(forKey: "ola.serverAddress").flatMap { URL(string: $0)?.host() }]
      .compactMap { $0 }
      .compactMap { h -> String? in
        guard h.hasSuffix(".ts.net") else { return nil }
        let parts = h.split(separator: ".")
        return parts.count >= 3 ? parts.suffix(3).joined(separator: ".") : nil
      }
    var labels: [String] = []
    for raw in [Host.current().localizedName, SCDynamicStoreHostName()] {
      guard let raw else { continue }
      let l = raw.lowercased().replacingOccurrences(of: " ", with: "-").replacingOccurrences(of: "'", with: "").replacingOccurrences(of: "\u{2019}", with: "")
      labels.append(l)
      if let r = l.range(of: #"-\d+$"#, options: .regularExpression) { labels.append(String(l[..<r.lowerBound])) }
    }
    for s in Set(suffixes) {
      for l in labels where resolves("\(l).\(s)", to: ip) { return "\(l).\(s)" }
    }
    return reverseName() ?? cliName()
  }

  static func SCDynamicStoreHostName() -> String? {
    var buf = [CChar](repeating: 0, count: 256)
    guard gethostname(&buf, buf.count) == 0 else { return nil }
    return String(cString: buf).replacingOccurrences(of: ".local", with: "")
  }

  /// Does `name` resolve to `ip`? (MagicDNS answers forward lookups quickly.)
  static func resolves(_ name: String, to ip: String) -> Bool {
    var hints = addrinfo()
    hints.ai_family = AF_INET
    var res: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(name, nil, &hints, &res) == 0, let first = res else { return false }
    defer { freeaddrinfo(res) }
    var p: UnsafeMutablePointer<addrinfo>? = first
    while let a = p {
      if let sa = a.pointee.ai_addr {
        var addr = sa.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
        var buf = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        inet_ntop(AF_INET, &addr, &buf, socklen_t(INET_ADDRSTRLEN))
        if String(cString: buf) == ip { return true }
      }
      p = a.pointee.ai_next
    }
    return false
  }

  /// MagicDNS's answer for our own address.
  public static func reverseName() -> String? {
    // MagicDNS answers the reverse lookup of our own address. This works from inside the app; the
    // Tailscale app's CLI, asked from a GUI app, returned nothing (2026-11-16: the code had no name).
    if let ip = address() {
      var sa = sockaddr_in()
      sa.sin_family = sa_family_t(AF_INET)
      sa.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
      inet_pton(AF_INET, ip, &sa.sin_addr)
      var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
      let rc = withUnsafePointer(to: &sa) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getnameinfo($0, socklen_t(MemoryLayout<sockaddr_in>.size), &host, socklen_t(host.count), nil, 0, NI_NAMEREQD) } }
      if rc == 0 {
        var name = String(cString: host)
        if name.hasSuffix(".") { name.removeLast() }
        if name.hasSuffix(".ts.net") { return name }
      }
    }
    return nil
  }

  /// The Tailscale app's CLI (slow, and empty when asked from a GUI app; the fallback).
  public static func cliName() -> String? {
    for path in ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale"] where FileManager.default.isExecutableFile(atPath: path) {
      let p = Process()
      p.executableURL = URL(fileURLWithPath: path)
      p.arguments = ["status", "--json"]
      let out = Pipe()
      p.standardOutput = out
      p.standardError = FileHandle.nullDevice
      guard (try? p.run()) != nil else { continue }
      let data = out.fileHandleForReading.readDataToEndOfFile()
      p.waitUntilExit()
      if let name = JSON.parse(data)?["Self"]["DNSName"].string, !name.isEmpty {
        return name.hasSuffix(".") ? String(name.dropLast()) : name
      }
    }
    return nil
  }
}
#endif
