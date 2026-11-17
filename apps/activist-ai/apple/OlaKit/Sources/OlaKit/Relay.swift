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
    let length = Int(headers["content-length"] ?? "0") ?? 0
    let bodyStart = end.upperBound
    guard data.count - bodyStart >= length else { return nil }
    let target = String(first[1])
    let q = target.firstIndex(of: "?")
    return HTTPRequest(method: String(first[0]), path: q.map { String(target[..<$0]) } ?? target, query: q.map { String(target[target.index(after: $0)...]) },
                       headers: headers, body: data.subdata(in: bodyStart..<bodyStart + length), remote: remote)
  }
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
  private let lock = NSLock()
  private var upstreamConfig: ServerConfig?
  private var mode = "machine"
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
      return await res.send(200, JSON.object(["name": .string(macName), "mode": .string(mode), "connected": .bool(upstream != nil)]).data)
    }
    guard Self.allowed(req.method, req.path) else { return await res.json(403, "That is not something the phone may ask for.") }
    guard let upstream else { return await res.json(503, "The Mac app is not connected to a server right now.") }
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
        do {
          let (bytes, response) = try await streamSession.bytes(for: r)
          let status = (response as? HTTPURLResponse)?.statusCode ?? 502
          guard await res.head(status == 401 ? 502 : status, ["Content-Type": "text/event-stream"]) else { return }
          for try await line in bytes.lines {
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
  public static func dnsName() -> String? {
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
