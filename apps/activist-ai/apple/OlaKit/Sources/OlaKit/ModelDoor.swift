#if os(macOS)
import Foundation

/// The model door: the only way the agent on this Mac reaches Ola's model and web commands when
/// the Mac is signed in. It listens on 127.0.0.1, on a free port, accepts only requests that carry
/// the key made for this launch, and forwards `/<rest>` to `<account server>/api/device/gw/<rest>`
/// with the account's token, streaming the answer back as it arrives. The agent (and any command
/// it runs) holds only the launch key, which works nowhere but here and dies with the app; the
/// account token stays in this process.
public final class ModelDoor: @unchecked Sendable {
  public let key: String
  public let api: AccountAPI
  /// The account token, read when the first request needs it (the Keychain, once per launch).
  let token: @Sendable () -> String?
  /// Called once per 401 from the server: the device was signed out or its sign-in ran out.
  public var onSignedOut: (@Sendable () -> Void)?
  private var server: MiniHTTPServer?
  public private(set) var port: UInt16 = 0
  let upstream = Upstream()

  public init(api: AccountAPI = AccountAPI(), token: @escaping @Sendable () -> String?) {
    self.api = api
    self.token = token
    key = "oladoor-" + DeviceSignIn.base64url(DeviceSignIn.random(32))
  }

  /// `http://127.0.0.1:<port>`: what opencode's provider and the web commands are pointed at.
  public var url: URL { URL(string: "http://127.0.0.1:\(port)")! }
  public var hostPort: String { "127.0.0.1:\(port)" }

  @discardableResult
  public func start() async throws -> UInt16 {
    if let server, port != 0 { _ = server; return port }
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { [weak self] req, res in await self?.handle(req, res) }
    server = s
    port = try await s.start()
    return port
  }

  public func stop() {
    server?.stop()
    server = nil
    port = 0
    upstream.cancelAll()
  }

  static func same(_ a: String, _ b: String) -> Bool {
    let x = Array(a.utf8), y = Array(b.utf8)
    var diff: UInt8 = x.count == y.count ? 0 : 1
    for i in 0..<min(x.count, y.count) { diff |= x[i] ^ y[i] }
    return diff == 0
  }

  func handle(_ req: HTTPRequest, _ res: HTTPResponder) async {
    let auth = req.header("authorization") ?? ""
    let presented = auth.hasPrefix("Bearer ") ? String(auth.dropFirst(7)) : (req.header("x-api-key") ?? "")
    guard Self.same(presented, key) else { return await res.send(401, Self.error("This door is only for Ola on this Mac.")) }
    let rest = String(req.path.drop(while: { $0 == "/" }))
    guard !rest.isEmpty, !rest.contains(".."), let base = api.gateway(rest),
          let target = URL(string: base.absoluteString + (req.query.map { "?\($0)" } ?? "")) else {
      return await res.send(404, Self.error("Nothing here."))
    }
    guard let token = token(), !token.isEmpty else {
      onSignedOut?()
      return await res.send(401, Self.error("This Mac is not signed in to Ola. Sign in again in the Ola app."))
    }
    var r = URLRequest(url: target)
    r.httpMethod = req.method
    r.timeoutInterval = 600
    if let ct = req.header("content-type") { r.setValue(ct, forHTTPHeaderField: "Content-Type") }
    r.setValue(req.header("accept") ?? "*/*", forHTTPHeaderField: "Accept")
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if !req.body.isEmpty { r.httpBody = req.body }

    let (id, events) = upstream.start(r)
    // When opencode stops a run it closes the connection: the request to the server ends too.
    res.onClose { [upstream] in upstream.cancel(id) }
    var started = false
    do {
      for try await ev in events {
        switch ev {
        case .response(let h):
          if h.statusCode == 401 {
            upstream.cancel(id)
            onSignedOut?()
            return await res.send(401, Self.error("Signed out of Ola on this Mac. Sign in again in the Ola app."))
          }
          var headers = HTTPResponder.chunkedHeader
          headers["Content-Type"] = h.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream"
          guard await res.head(h.statusCode, headers) else { upstream.cancel(id); return }
          started = true
        case .data(let d):
          guard await res.chunk(d) else { upstream.cancel(id); return }
        }
      }
      if started { await res.finish() } else { await res.send(502, Self.error("Ola sent nothing back.")) }
    } catch {
      if started { res.end() } else { await res.send(502, Self.error("Ola did not answer. Is this Mac online?")) }
    }
  }

  /// The OpenAI-style error body opencode and the web commands both understand.
  static func error(_ message: String) -> Data { JSON.object(["error": .object(["message": .string(message)])]).data }
}

/// Requests whose answer arrives piece by piece, each one cancellable on its own.
final class Upstream: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  enum Event { case response(HTTPURLResponse), data(Data) }
  private let lock = NSLock()
  private var streams: [Int: AsyncThrowingStream<Event, Error>.Continuation] = [:]
  private var tasks: [Int: URLSessionDataTask] = [:]
  private lazy var session: URLSession = {
    let c = URLSessionConfiguration.ephemeral
    c.timeoutIntervalForRequest = 600
    c.timeoutIntervalForResource = 60 * 60 * 6
    c.urlCache = nil
    c.httpCookieStorage = nil
    return URLSession(configuration: c, delegate: self, delegateQueue: nil)
  }()

  func start(_ r: URLRequest) -> (Int, AsyncThrowingStream<Event, Error>) {
    let task = session.dataTask(with: r)
    let id = task.taskIdentifier
    let stream = AsyncThrowingStream<Event, Error> { c in
      lock.withLock { streams[id] = c; tasks[id] = task }
      c.onTermination = { [weak self] reason in if case .cancelled = reason { self?.cancel(id) } }
    }
    task.resume()
    return (id, stream)
  }

  func cancel(_ id: Int) {
    let (t, c) = lock.withLock { (tasks.removeValue(forKey: id), streams.removeValue(forKey: id)) }
    t?.cancel()
    c?.finish(throwing: CancellationError())
  }

  func cancelAll() {
    let ids = lock.withLock { Array(tasks.keys) }
    ids.forEach(cancel)
  }

  /// How many requests to the server are open right now (tests).
  var open: Int { lock.withLock { tasks.count } }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    if let h = response as? HTTPURLResponse { _ = lock.withLock { streams[dataTask.taskIdentifier] }?.yield(.response(h)) }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    _ = lock.withLock { streams[dataTask.taskIdentifier] }?.yield(.data(data))
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let c = lock.withLock { () -> AsyncThrowingStream<Event, Error>.Continuation? in
      tasks[task.taskIdentifier] = nil
      return streams.removeValue(forKey: task.taskIdentifier)
    }
    if let error { c?.finish(throwing: error) } else { c?.finish() }
  }

  /// Never follow a redirect with the account token.
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}
#endif
