import CryptoKit
import Foundation
import XCTest
@testable import OlaKit

/// A stand-in for app.ola.cx's device routes, on loopback: the sign-in exchange, who-am-I, sign
/// out, and the model door's far side (`/api/device/gw/<rest>`), with a streamed reply and a reply
/// that never ends (to see that stopping closes it).
final class StubOla: @unchecked Sendable {
  let lock = NSLock()
  var server: MiniHTTPServer!
  var port: UInt16 = 0
  var challenges: Set<String> = []
  let goodCode = "code-OK-12345678"
  var issued: Set<String> = []
  var revoked: Set<String> = []
  var gatewayAuth: [String] = []
  var gatewayPaths: [String] = []
  var slowClosed = false
  var slowOpen = false
  var base: URL { URL(string: "http://127.0.0.1:\(port)")! }

  func start() async throws {
    server = try MiniHTTPServer(host: "127.0.0.1", port: 0) { [weak self] req, res in await self?.handle(req, res) }
    port = try await server.start()
  }

  func stop() { server.stop() }

  /// What the browser page does: remembers the challenge it was opened with.
  func approve(_ browserURL: URL) -> UInt16? {
    let s = browserURL.absoluteString
    guard let q = s.range(of: "#/device?").map({ String(s[$0.upperBound...]) }) else { return nil }
    let items = URLComponents(string: "http://x/?" + q)?.queryItems ?? []
    guard let ch = items.first(where: { $0.name == "challenge" })?.value, let p = items.first(where: { $0.name == "port" })?.value else { return nil }
    lock.withLock { _ = challenges.insert(ch) }
    return UInt16(p)
  }

  static func session(_ token: String) -> JSON {
    ["token": .string(token), "expires_at": "2030-01-01T00:00:00Z", "person": ["handle": "bart", "name": "Bart", "admin": true], "device": ["id": "dev1", "name": "Test Mac", "kind": "mac"]]
  }

  func handle(_ req: HTTPRequest, _ res: HTTPResponder) async {
    let bearer = (req.header("authorization") ?? "").replacingOccurrences(of: "Bearer ", with: "")
    if req.method == "POST", req.path == "/api/device/token" {
      let verifier = JSON.parse(req.body)?["verifier"].str ?? ""
      let ch = DeviceSignIn.challenge(for: verifier)
      let ok = lock.withLock { bearer == goodCode && challenges.contains(ch) }
      guard ok else { return await res.send(401, JSON.object(["error": "invalid_code"]).data) }
      let token = "tok-\(UUID().uuidString)"
      lock.withLock { _ = issued.insert(token) }
      return await res.send(200, Self.session(token).data)
    }
    let valid = lock.withLock { issued.contains(bearer) && !revoked.contains(bearer) }
    if req.path == "/api/device/me" {
      return valid ? await res.send(200, Self.session(bearer).data) : await res.send(401, JSON.object(["error": "signed_out"]).data)
    }
    if req.path == "/api/device/signout" {
      lock.withLock { _ = revoked.insert(bearer) }
      return await res.send(200, Data("{}".utf8))
    }
    if req.path.hasPrefix("/api/device/gw/") {
      let rest = String(req.path.dropFirst("/api/device/gw/".count))
      lock.withLock { gatewayAuth.append(bearer); gatewayPaths.append(rest) }
      guard valid else { return await res.send(401, JSON.object(["error": "signed_out"]).data) }
      switch rest {
      case "v1/chat/completions":
        _ = await res.head(200, ["Content-Type": "text/event-stream"])
        for i in 0..<3 {
          _ = await res.write(Data("data: {\"choices\":[{\"delta\":{\"content\":\"part\(i) \"}}]}\n\n".utf8))
          try? await Task.sleep(nanoseconds: 400_000_000)
        }
        _ = await res.write(Data("data: [DONE]\n\n".utf8))
        return res.end()
      case "v1/slow":
        lock.withLock { slowOpen = true }
        res.onClose { [weak self] in self?.lock.withLock { self?.slowClosed = true } }
        _ = await res.head(200, ["Content-Type": "text/event-stream"])
        for _ in 0..<200 {
          try? await Task.sleep(nanoseconds: 100_000_000)
          if lock.withLock({ slowClosed }) { return }
        }
        return res.end()
      case "v1/usage":
        return await res.send(200, JSON.object(["fraction": .number(0.42), "period": "week"]).data)
      default:
        return await res.send(403, JSON.object(["error": "forbidden"]).data)
      }
    }
    await res.send(404, Data())
  }
}

final class AccountTests: XCTestCase {
  func browserGet(_ port: UInt16, _ query: String) async throws -> (Int, String) {
    var r = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/?\(query)")!)
    r.timeoutInterval = 5
    let (d, res) = try await URLSession(configuration: .ephemeral).data(for: r)
    return ((res as? HTTPURLResponse)?.statusCode ?? 0, String(decoding: d, as: UTF8.self))
  }

  func testSignInSucceedsAndTheListenerTakesOneCode() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let api = AccountAPI(base: stub.base, session: URLSession(configuration: .ephemeral))
    let s = DeviceSignIn(api: api, deviceName: String(repeating: "Bart’s iMac ", count: 10), kind: "mac", timeout: 20)
    let url = try await s.start()
    XCTAssertTrue(url.absoluteString.hasPrefix(stub.base.absoluteString + "/#/device?challenge="), url.absoluteString)
    XCTAssertTrue(url.absoluteString.contains("kind=mac"))
    XCTAssertEqual(DeviceSignIn.challenge(for: s.verifier).count, 43, "base64url of 32 bytes")
    XCTAssertEqual(s.deviceName.count, 60, "the name is cut to 60 characters")
    let port = try XCTUnwrap(stub.approve(url))
    XCTAssertGreaterThanOrEqual(port, 1024)
    async let session = s.finish()
    // Something that is not the code (a browser's icon request) is refused; the listener waits on.
    let (st0, _) = try await browserGet(port, "nothing=1")
    XCTAssertEqual(st0, 404)
    let (st, page) = try await browserGet(port, "code=\(stub.goodCode)")
    XCTAssertEqual(st, 200)
    XCTAssertTrue(page.contains("signed in to Ola") && page.contains("close this window"))
    XCTAssertFalse(page.contains("http://") || page.contains("https://") || page.contains("src="), "no outside loads")
    let got = try await session
    XCTAssertEqual(got.person.handle, "bart")
    XCTAssertTrue(got.token.hasPrefix("tok-"))
    // The listener is closed: a second request finds no one.
    do {
      _ = try await browserGet(port, "code=\(stub.goodCode)")
      XCTFail("a second request was answered")
    } catch {}
    // me, usage and sign out with the token.
    let me = try await api.me(got)
    XCTAssertEqual(me.person.name, "Bart")
    let usage = try await api.usage(got)
    XCTAssertEqual(usage, "You\u{2019}ve used 42% of this week\u{2019}s share.")
    try await api.signOut(got)
    do { _ = try await api.me(got); XCTFail("signed out token still worked") } catch let e as AccountError { XCTAssertEqual(e, .signedOut) }
  }

  func testWrongCodeIsRefused() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let s = DeviceSignIn(api: AccountAPI(base: stub.base, session: URLSession(configuration: .ephemeral)), kind: "cli", timeout: 20)
    let url = try await s.start()
    XCTAssertTrue(url.absoluteString.contains("kind=cli"))
    let port = try XCTUnwrap(stub.approve(url))
    async let session = s.finish()
    _ = try await browserGet(port, "code=code-WRONG-0000")
    do {
      _ = try await session
      XCTFail("a wrong code signed in")
    } catch let e as AccountError {
      XCTAssertEqual(e, .refused("invalid_code"))
      XCTAssertEqual(e.errorDescription, "That sign-in didn\u{2019}t go through. Try again.")
    }
  }

  func testTimeoutAndNotYetAvailable() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let s = DeviceSignIn(api: AccountAPI(base: stub.base), timeout: 0.5)
    _ = try await s.start()
    let t0 = Date()
    do { _ = try await s.finish(); XCTFail("did not time out") } catch let e as AccountError { XCTAssertEqual(e, .timedOut) }
    XCTAssertLessThan(Date().timeIntervalSince(t0), 3)
    // A server without the device routes (app.ola.cx before it is deployed) reads plainly.
    let bare = try MiniHTTPServer(host: "127.0.0.1", port: 0) { _, res in await res.send(404, Data("Not Found".utf8), type: "text/plain") }
    let p = try await bare.start()
    defer { bare.stop() }
    do {
      _ = try await AccountAPI(base: URL(string: "http://127.0.0.1:\(p)")!).redeem(code: "code-OK-12345678", verifier: "v")
      XCTFail("no error")
    } catch let e as AccountError {
      XCTAssertEqual(e, .notAvailableYet)
    }
    // And the browser is never opened on a page that is not there: start() stops first.
    do {
      _ = try await DeviceSignIn(api: AccountAPI(base: URL(string: "http://127.0.0.1:\(p)")!)).start()
      XCTFail("started against a server without sign-in")
    } catch let e as AccountError {
      XCTAssertEqual(e, .notAvailableYet)
      XCTAssertEqual(e.errorDescription, "Signing in with an Ola account isn\u{2019}t open yet. It will be soon.")
    }
  }

  func testSessionRoundTrip() {
    let j: JSON = ["token": "t", "expires_at": 1_900_000_000, "person": ["handle": "ana", "name": "", "admin": false], "device": ["id": "d", "name": "n", "kind": "cli"]]
    let s = AccountSession.decode(j.data)
    XCTAssertEqual(s?.person.name, "ana", "an empty name falls back to the handle")
    XCTAssertEqual(s?.expiresAt, Date(timeIntervalSince1970: 1_900_000_000))
    XCTAssertEqual(AccountSession.decode(s!.encoded()), s)
    XCTAssertNil(AccountAPI.usageSentence(["remaining": 3]))
    XCTAssertEqual(AccountAPI.usageSentence(["fraction": .number(1.0)]), "You\u{2019}ve used all of your share.")
  }
}

final class ModelDoorTests: XCTestCase {
  func signedIn(_ stub: StubOla) async throws -> String {
    let s = DeviceSignIn(api: AccountAPI(base: stub.base), timeout: 20)
    let url = try await s.start()
    let port = try XCTUnwrap(stub.approve(url))
    async let session = s.finish()
    _ = try await URLSession(configuration: .ephemeral).data(from: URL(string: "http://127.0.0.1:\(port)/?code=\(stub.goodCode)")!)
    return try await session.token
  }

  func testDoorNeedsTheKeyForwardsWithTheAccountTokenAndStreams() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let token = try await signedIn(stub)
    let door = ModelDoor(api: AccountAPI(base: stub.base)) { token }
    try await door.start()
    defer { door.stop() }
    let client = URLSession(configuration: .ephemeral)
    func req(_ path: String, key: String?) -> URLRequest {
      var r = URLRequest(url: URL(string: "http://127.0.0.1:\(door.port)\(path)")!)
      r.httpMethod = "POST"
      r.httpBody = Data(#"{"model":"general","stream":true}"#.utf8)
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      if let key { r.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization") }
      return r
    }
    // No key, or a wrong one (the account token itself included): refused, nothing forwarded.
    for key in [nil, "wrong", token] {
      let (_, res) = try await client.data(for: req("/v1/chat/completions", key: key))
      XCTAssertEqual((res as? HTTPURLResponse)?.statusCode, 401)
    }
    XCTAssertTrue(stub.lock.withLock { stub.gatewayAuth.isEmpty }, "nothing reached the server without the key")
    // With the key: forwarded with the account token, and the reply arrives piece by piece.
    let (bytes, res) = try await client.bytes(for: req("/v1/chat/completions", key: door.key))
    XCTAssertEqual((res as? HTTPURLResponse)?.statusCode, 200)
    var times: [Date] = []
    var text = ""
    for try await line in bytes.lines where line.hasPrefix("data:") { times.append(Date()); text += line }
    XCTAssertEqual(times.count, 4)
    XCTAssertGreaterThan(times[2].timeIntervalSince(times[0]), 0.6, "chunks came as they were sent, not all at the end")
    XCTAssertTrue(text.contains("part0") && text.contains("part2") && text.contains("[DONE]"))
    XCTAssertEqual(stub.lock.withLock { stub.gatewayAuth }, [token], "the server saw the account token, not the door key")
    XCTAssertEqual(stub.lock.withLock { stub.gatewayPaths }, ["v1/chat/completions"])
  }

  func testStoppingARunClosesTheUpstreamRequest() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let token = try await signedIn(stub)
    let door = ModelDoor(api: AccountAPI(base: stub.base)) { token }
    try await door.start()
    defer { door.stop() }
    var r = URLRequest(url: URL(string: "http://127.0.0.1:\(door.port)/v1/slow")!)
    r.setValue("Bearer \(door.key)", forHTTPHeaderField: "Authorization")
    let task = Task { () -> Void in
      let (bytes, _) = try await URLSession(configuration: .ephemeral).bytes(for: r)
      for try await _ in bytes {}
    }
    for _ in 0..<50 where !stub.lock.withLock({ stub.slowOpen }) { try await Task.sleep(nanoseconds: 50_000_000) }
    XCTAssertTrue(stub.lock.withLock { stub.slowOpen })
    XCTAssertEqual(door.upstream.open, 1)
    task.cancel()   // what opencode does when Stop is pressed: it drops the connection
    for _ in 0..<60 where !stub.lock.withLock({ stub.slowClosed }) { try await Task.sleep(nanoseconds: 50_000_000) }
    XCTAssertTrue(stub.lock.withLock { stub.slowClosed }, "the request to the server was closed")
    XCTAssertEqual(door.upstream.open, 0)
  }

  func testA401FromTheServerMeansSignedOut() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let token = try await signedIn(stub)
    let door = ModelDoor(api: AccountAPI(base: stub.base)) { token }
    let flag = Flag()
    door.onSignedOut = { flag.set() }
    try await door.start()
    defer { door.stop() }
    try await AccountAPI(base: stub.base).signOut(AccountSession(token: token, expiresAt: nil, person: .init(handle: "bart", name: "Bart", admin: true), device: .init(id: "", name: "", kind: "")))
    var r = URLRequest(url: URL(string: "http://127.0.0.1:\(door.port)/v1/models")!)
    r.setValue("Bearer \(door.key)", forHTTPHeaderField: "Authorization")
    let (d, res) = try await URLSession(configuration: .ephemeral).data(for: r)
    XCTAssertEqual((res as? HTTPURLResponse)?.statusCode, 401)
    XCTAssertTrue(String(decoding: d, as: UTF8.self).contains("Signed out of Ola"))
    XCTAssertTrue(flag.value)
  }
}

final class Flag: @unchecked Sendable {
  private let lock = NSLock()
  private var v = false
  func set() { lock.withLock { v = true } }
  var value: Bool { lock.withLock { v } }
}

final class OpencodeInstallTests: XCTestCase {
  /// The pinned checksums are the ones package-lock.json pins.
  func testPinsMatchThePackageLock() throws {
    let lock = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../package-lock.json").standardized
    let j = try XCTUnwrap(JSON.parse(try Data(contentsOf: lock)))
    for (arch, name) in [("arm64", "cli-darwin-arm64"), ("x86_64", "cli-darwin-x64")] {
      let entry = j["packages"]["node_modules/@opencode/\(name)"]
      XCTAssertEqual(entry["version"].str, OpencodeInstall.version)
      XCTAssertEqual(entry["integrity"].str, OpencodeInstall.packages[arch]?.integrity)
      XCTAssertEqual(entry["resolved"].str, OpencodeInstall.packages[arch]?.url)
    }
    XCTAssertEqual(OpencodeInstall.integrity(of: Data("abc".utf8)), "sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==")
  }

  /// The real download, into a scratch folder (OLA_NETWORK_TESTS=1 only: about 70 MB).
  func testRealInstall() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["OLA_NETWORK_TESTS"] == "1", "set OLA_NETWORK_TESTS=1 to download")
    let dest = FileManager.default.temporaryDirectory.appendingPathComponent("ola-install-test-\(getpid())/opencode")
    defer { try? FileManager.default.removeItem(at: dest.deletingLastPathComponent()) }
    let seen = Flag()
    let bin = try await OpencodeInstall.install(to: dest) { f in if f > 0, f < 1 { seen.set() } }
    XCTAssertEqual(try OpencodeInstall.runVersion(bin), "2.3.0")
    XCTAssertTrue(seen.value, "progress was reported while downloading")
  }
}
