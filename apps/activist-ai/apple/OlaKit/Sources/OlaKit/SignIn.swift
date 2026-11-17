#if os(macOS)
import CryptoKit
import Foundation
import Security

/// Signing this Mac (or the `ola` command) in to an Ola account, in the browser, with a passkey:
///
/// 1. A random secret S (32 bytes, base64url) is made here and never leaves this Mac until step 3.
/// 2. A listener on 127.0.0.1, on a free port, waits for the browser; the default browser opens
///    `<base>/#/device?challenge=<base64url(sha256(S))>&port=<port>&name=<this Mac>&kind=mac|cli`.
///    The person approves there; the page sends the browser to `http://127.0.0.1:<port>/?code=<code>`.
///    The listener answers with a small page, takes exactly one well-formed code, and closes.
/// 3. `POST /api/device/token` with the code as the bearer and `{"verifier": S}` gives the token.
///
/// A page elsewhere that sends its own code to the listener gains nothing: the server gives a
/// token only for the code made for this challenge, and only S answers it.
public final class DeviceSignIn: @unchecked Sendable {
  public let api: AccountAPI
  public let deviceName: String
  public let kind: String
  public let timeout: TimeInterval
  public let verifier: String
  private var server: MiniHTTPServer?
  private let lock = NSLock()
  private var waiter: CheckedContinuation<String, Error>?
  private var code: String?
  private var finished = false

  public init(api: AccountAPI = AccountAPI(), deviceName: String = DeviceSignIn.thisMacName, kind: String = "mac", timeout: TimeInterval = 300) {
    self.api = api
    self.deviceName = String(deviceName.prefix(60))
    self.kind = kind
    self.timeout = timeout
    verifier = Self.base64url(Self.random(32))
  }

  public static var thisMacName: String { Host.current().localizedName ?? "Mac" }

  static func random(_ n: Int) -> Data {
    var b = [UInt8](repeating: 0, count: n)
    _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
    return Data(b)
  }

  public static func base64url(_ d: Data) -> String {
    d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }

  public static func challenge(for verifier: String) -> String { base64url(Data(SHA256.hash(data: Data(verifier.utf8)))) }

  /// A code as the server makes them: URL-safe characters, a sensible length.
  static func wellFormed(_ code: String) -> Bool { code.range(of: #"^[A-Za-z0-9._~-]{8,512}$"#, options: .regularExpression) != nil }

  /// The page the browser opens.
  public func browserURL(port: UInt16) -> URL {
    var c = URLComponents()
    c.queryItems = [URLQueryItem(name: "challenge", value: Self.challenge(for: verifier)), URLQueryItem(name: "port", value: String(port)),
                    URLQueryItem(name: "name", value: deviceName), URLQueryItem(name: "kind", value: kind)]
    let query = c.percentEncodedQuery ?? ""
    var base = api.base.absoluteString
    if base.hasSuffix("/") { base.removeLast() }
    return URL(string: "\(base)/#/device?\(query)")!
  }

  /// Starts the listener and returns the page to open. First makes sure sign-in exists there, so
  /// a browser never opens on a page that is not there yet.
  public func start() async throws -> URL {
    try await api.checkOpen()
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { [weak self] req, res in await self?.handle(req, res) }
    server = s
    let port = try await s.start()
    return browserURL(port: port)
  }

  /// Waits for the browser (up to `timeout`), then redeems the code. Cancelling the task stops it.
  public func finish() async throws -> AccountSession {
    let code = try await waitForCode()
    return try await api.redeem(code: code, verifier: verifier)
  }

  /// The whole thing: listen, open the browser (`open` is called once with the page), wait, redeem.
  public func run(open: (URL) -> Void) async throws -> AccountSession {
    let url = try await start()
    open(url)
    return try await finish()
  }

  public func waitForCode() async throws -> String {
    let timer = Task { [weak self, timeout] in
      try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
      if !Task.isCancelled { self?.end(.failure(AccountError.timedOut)) }
    }
    defer { timer.cancel() }
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (c: CheckedContinuation<String, Error>) in
        let ready: Result<String, Error>? = lock.withLock {
          if let code { return .success(code) }
          if finished { return .failure(AccountError.cancelled) }
          waiter = c
          return nil
        }
        if let ready { c.resume(with: ready) }
      }
    } onCancel: { [weak self] in
      self?.end(.failure(AccountError.cancelled))
    }
  }

  /// Stops listening (Cancel, a timeout, or done).
  public func cancel() { end(.failure(AccountError.cancelled)) }

  private func end(_ r: Result<String, Error>) {
    let w: CheckedContinuation<String, Error>? = lock.withLock {
      guard !finished else { return nil }
      finished = true
      if case .success(let c) = r { code = c }
      defer { waiter = nil }
      return waiter
    }
    server?.stop()
    w?.resume(with: r)
  }

  func handle(_ req: HTTPRequest, _ res: HTTPResponder) async {
    let items = URLComponents(string: "http://x/?" + (req.query ?? ""))?.queryItems ?? []
    guard req.method == "GET", req.path == "/", let code = items.first(where: { $0.name == "code" })?.value, Self.wellFormed(code) else {
      return await res.send(404, Data(Self.page(title: "Nothing here", body: "This is Ola, waiting for a sign-in.").utf8), type: "text/html; charset=utf-8")
    }
    let first: Bool = lock.withLock { !finished }
    guard first else {
      return await res.send(410, Data(Self.page(title: "Already done", body: "This sign-in has already finished. You can close this window.").utf8), type: "text/html; charset=utf-8")
    }
    await res.send(200, Data(Self.page(title: "You\u{2019}re signed in to Ola", body: "You can close this window.", ok: true).utf8), type: "text/html; charset=utf-8")
    end(.success(code))
  }

  /// The page the browser shows after approving: the app's paper and ink, no outside loads.
  static func page(title: String, body: String, ok: Bool = false) -> String {
    """
    <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>Ola</title><style>
    :root{color-scheme:light dark;--room:#ebe6dd;--paper:#fbf8f2;--ink:#1d1b18;--ink2:#4d4841;--rule:#e6e0d5;--ok:#3f7a3a}
    @media (prefers-color-scheme:dark){:root{--room:#1b1a18;--paper:#252320;--ink:#f2ede4;--ink2:#c6bfb3;--rule:#33302c;--ok:#92c585}}
    html,body{margin:0;height:100%;background:var(--room)}
    body{display:flex;align-items:center;justify-content:center;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:var(--ink)}
    main{background:var(--paper);border:1px solid var(--rule);border-radius:5px;box-shadow:0 1px 2px rgba(0,0,0,.06);padding:32px;max-width:360px;margin:16px}
    svg{display:block;margin-bottom:16px}
    h1{font-size:20px;line-height:1.25;margin:0 0 8px;font-weight:650;letter-spacing:-.01em}
    p{margin:0;color:var(--ink2)}
    </style></head><body><main>\(ok ? #"<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="none" stroke="var(--ok)" stroke-width="1.5"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--ok)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>"# : "")<h1>\(title)</h1><p>\(body)</p></main></body></html>
    """
  }
}
#endif
