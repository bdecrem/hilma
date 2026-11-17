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
  var issued: Set<String> = []
  var revoked: Set<String> = []
  var gatewayAuth: [String] = []
  var gatewayPaths: [String] = []
  /// Every request after sign-in (who-am-I, sign out, the gateway), refused or not.
  var requests = 0
  /// The gateway's own usage reply, as the server passes it on.
  static let usage: JSON = ["object": "usage", "caller": "p-1", "week_start": "2026-11-16T00:00:00Z", "resets_at": "2026-11-23T00:00:00Z",
                            "requests": 12, "tokens_in": 1000, "tokens_out": 500, "tokens_used": 1500, "quota": 3_000_000, "fraction_used": .number(0.42),
                            "by_model": ["general": ["requests": 12, "tokens_in": 1000, "tokens_out": 500]], "claude_month": .null,
                            "web_week": ["used": 3, "limit": 200], "batch_job": .null]
  var slowClosed = false
  var slowOpen = false
  /// What each password sign-in sent: handle, the Mac's name, kind, the known-device header, and any Authorization.
  var logins: [(String, String, String, String?, String?)] = []
  /// What the app sent to the passkey routes.
  var passkeyAnswers: [JSON] = []

  /// A sign-in ceremony, as the server gives it (the challenge is "challenge").
  static func ceremony(_ allow: [String]) -> JSON {
    ["passkey": true, "ceremony": "cer-1", "options": ["challenge": "Y2hhbGxlbmdl", "rpId": "app.ola.cx", "userVerification": "required", "allowCredentials": .array(allow.map { ["id": .string($0), "type": "public-key"] })]]
  }
  var base: URL { URL(string: "http://127.0.0.1:\(port)")! }

  func start() async throws {
    server = try MiniHTTPServer(host: "127.0.0.1", port: 0) { [weak self] req, res in await self?.handle(req, res) }
    port = try await server.start()
  }

  func stop() { server.stop() }

  static func session(_ token: String) -> JSON {
    ["token": .string(token), "expires_at": "2030-01-01T00:00:00Z", "person": ["handle": "bart", "name": "Bart", "admin": true], "device": ["id": 17, "name": "Test Mac", "kind": "mac"]]
  }

  func handle(_ req: HTTPRequest, _ res: HTTPResponder) async {
    let bearer = (req.header("authorization") ?? "").replacingOccurrences(of: "Bearer ", with: "")
    lock.withLock { requests += 1 }
    if req.method == "POST", req.path == "/api/device/login" {
      // The normal sign-in: bart / "right password here"; dana asks for her passkey too; "busy"
      // plays the service being down; "slow" plays too many tries.
      let j = JSON.parse(req.body)
      lock.withLock { logins.append((j?["handle"].str ?? "", j?["name"].str ?? "", j?["kind"].str ?? "", req.header("x-ola-known"), req.header("authorization"))) }
      switch (j?["handle"].str ?? "", j?["password"].str ?? "") {
      case ("bart", "right password here"):
        let token = "olak_\(UUID().uuidString)"
        lock.withLock { _ = issued.insert(token) }
        let s: JSON = ["token": .string(token), "expires_at": "2030-01-01T00:00:00Z", "person": ["handle": "bart", "name": "Bart", "admin": true], "device": ["id": "dev2", "name": "Test Mac", "kind": "mac"], "known": "1.known-token"]
        return await res.send(200, s.data)
      case ("dana", "right password here"): return await res.send(200, StubOla.ceremony(["Y3JlZC1vbmU"]).data)
      case ("", "") where j?["passkey"].bool == true: return await res.send(200, StubOla.ceremony([]).data)
      case ("busy", _): return await res.send(502, Data("<html>bad gateway</html>".utf8))
      case ("slow", _): return await res.send(429, JSON.object(["error": "slow_down", "message": "Too many wrong tries for this name. Wait 4 minutes, or sign in with your passkey."]).data)
      default: return await res.send(401, JSON.object(["error": "sign_in_refused", "message": "That name and password did not match."]).data)
      }
    }
    if req.method == "POST", req.path == "/api/device/login/passkey" {
      // The passkey's answer: kept to look at; the right shape gives a key.
      let j = JSON.parse(req.body)
      lock.withLock { passkeyAnswers.append(j ?? .null) }
      guard j?["ceremony"].str == "cer-1", j?["response"]["id"].str == "Y3JlZC1vbmU" else { return await res.send(401, JSON.object(["error": "sign_in_refused"]).data) }
      let token = "olak_\(UUID().uuidString)"
      lock.withLock { _ = issued.insert(token) }
      var s = Self.session(token).object
      s["has_passkey"] = true
      return await res.send(200, JSON.object(s).data)
    }
    let valid = lock.withLock { issued.contains(bearer) && !revoked.contains(bearer) }
    // A pass the door does not know: its 401 page with a Basic challenge, as app.ola.cx's door does.
    if !bearer.isEmpty, lock.withLock({ !issued.contains(bearer) }) {
      let page = Data("<!doctype html><title>Ola</title><p>Wrong passcode.</p>".utf8)
      _ = await res.head(401, ["Content-Type": "text/html", "WWW-Authenticate": "Basic realm=\"Ola\"", "Content-Length": String(page.count)])
      _ = await res.write(page)
      return res.end()
    }
    if req.path == "/api/device/me" {
      return valid ? await res.send(200, Self.session(bearer).data) : await res.send(401, JSON.object(["error": "signed_out"]).data)
    }
    if req.path == "/api/device/passkey/options" {
      guard valid else { return await res.send(401, JSON.object(["error": "signed_out"]).data) }
      return await res.send(200, (["ceremony": "add-1", "options": ["challenge": "Y2hhbGxlbmdl", "rp": ["name": "Ola", "id": "app.ola.cx"], "user": ["id": "dXNlci1pZA", "name": "bart", "displayName": "Bart"]]] as JSON).data)
    }
    if req.path == "/api/device/passkey/verify" {
      let j = JSON.parse(req.body)
      lock.withLock { passkeyAnswers.append(j ?? .null) }
      return await res.send(200, JSON.object(["ok": true]).data)
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
        return await res.send(200, StubOla.usage.data)
      default:
        return await res.send(403, JSON.object(["error": "forbidden"]).data)
      }
    }
    await res.send(404, Data())
  }
}

/// The normal sign-in (2026-11-17): a name and a password in the app, against the stand-in.
final class PasswordSignInTests: XCTestCase {
  func testRightPasswordGivesAKeyThatWorksTheDoorAndSignOutEndsIt() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let api = AccountAPI(base: stub.base, session: URLSession(configuration: .ephemeral))
    let s = try await api.login(handle: "bart", password: "right password here", deviceName: String(repeating: "Bart’s iMac ", count: 10), kind: "mac", known: "1.earlier")
    XCTAssertTrue(s.token.hasPrefix("olak_"))
    XCTAssertEqual(s.person.handle, "bart")
    XCTAssertEqual(s.known, "1.known-token")
    XCTAssertFalse(s.encoded().contains("known-token"), "the known token is not kept with the key")
    let sent = try XCTUnwrap(stub.lock.withLock { stub.logins.first })
    XCTAssertEqual(sent.0, "bart")
    XCTAssertEqual(sent.1.count, 60, "the Mac's name is cut to 60")
    XCTAssertEqual(sent.2, "mac")
    XCTAssertEqual(sent.3, "1.earlier", "the known-device token goes as its header")
    XCTAssertNil(sent.4, "no Authorization at sign-in")
    // The key works the model door and who-am-I; signing out ends it.
    let me = try await api.me(s)
    XCTAssertEqual(me.person.name, "Bart")
    let door = ModelDoor(api: api) { s.token }
    try await door.start()
    defer { door.stop() }
    var r = URLRequest(url: door.url.appendingPathComponent("v1/usage"))
    r.setValue("Bearer \(door.key)", forHTTPHeaderField: "Authorization")
    let (_, res) = try await URLSession(configuration: .ephemeral).data(for: r)
    XCTAssertEqual((res as? HTTPURLResponse)?.statusCode, 200)
    XCTAssertEqual(stub.lock.withLock { stub.gatewayAuth.last }, s.token, "the server got the account key, never the door's")
    try await api.signOut(s)
    do {
      _ = try await api.me(s)
      XCTFail("still signed in")
    } catch AccountError.signedOut {}
  }

  func testRefusalsInPlainWords() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let api = AccountAPI(base: stub.base, session: URLSession(configuration: .ephemeral))
    func refusal(_ h: String, _ p: String) async -> AccountError? {
      do {
        _ = try await api.login(handle: h, password: p, deviceName: "Mac")
        return nil
      } catch { return error as? AccountError }
    }
    let wrong = await refusal("bart", "not it")
    XCTAssertEqual(wrong, .wrongPassword)
    XCTAssertEqual(wrong?.errorDescription, "That name and password didn\u{2019}t match. Check both and try again.")
    let unknown = await refusal("nobody", "right password here")
    XCTAssertEqual(unknown, .wrongPassword, "an unknown name reads the same")
    let busy = await refusal("busy", "x")
    XCTAssertEqual(busy, .serviceDown)
    let slow = await refusal("slow", "x")
    XCTAssertEqual(slow?.errorDescription, "Too many wrong tries for this name. Wait 4 minutes, or sign in with your passkey.")
    // Nothing there at all: Ola is down, said so.
    let gone = AccountAPI(base: URL(string: "http://127.0.0.1:9")!, session: URLSession(configuration: .ephemeral))
    do {
      _ = try await gone.login(handle: "bart", password: "x", deviceName: "Mac")
      XCTFail("signed in to nothing")
    } catch AccountError.unreachable {}
  }

  /// "Ask for my passkey too": a ceremony for her passkeys, answered in the app; never a browser.
  func testPasskeyStepAfterTheRightPasswordAndThePasskeyAlone() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let api = AccountAPI(base: stub.base, session: URLSession(configuration: .ephemeral))
    var ceremony: PasskeyCeremony?
    do {
      _ = try await api.login(handle: "dana", password: "right password here", deviceName: "Dana’s Mac")
      XCTFail("signed in without the passkey")
    } catch let p as PasskeyNeeded { ceremony = p.ceremony }
    let c = try XCTUnwrap(ceremony)
    XCTAssertEqual(c.id, "cer-1")
    XCTAssertEqual(c.rpID, "app.ola.cx")
    XCTAssertEqual(String(decoding: c.challenge, as: UTF8.self), "challenge")
    XCTAssertEqual(c.allow.map { String(decoding: $0, as: UTF8.self) }, ["cred-one"])
    // The system sheet's answer, sent in WebAuthn's JSON form.
    let a = PasskeyAssertion(credentialID: Data("cred-one".utf8), clientDataJSON: Data(#"{"type":"webauthn.get"}"#.utf8), authenticatorData: Data([1, 2, 3]), signature: Data([4, 5]), userHandle: Data("user-id".utf8))
    let s = try await api.loginPasskey(c, a)
    XCTAssertTrue(s.token.hasPrefix("olak_"))
    XCTAssertEqual(s.hasPasskey, true)
    let sent = try XCTUnwrap(stub.lock.withLock { stub.passkeyAnswers.last })
    XCTAssertEqual(sent["response"]["rawId"].str, "Y3JlZC1vbmU")
    XCTAssertEqual(sent["response"]["type"].str, "public-key")
    XCTAssertEqual(sent["response"]["response"]["authenticatorData"].str, "AQID")
    XCTAssertEqual(sent["response"]["response"]["signature"].str, "BAU")
    XCTAssertEqual(sent["response"]["response"]["userHandle"].str, "dXNlci1pZA")
    XCTAssertEqual(Base64URL.decode(sent["response"]["response"]["clientDataJSON"].str), a.clientDataJSON)
    // Another passkey's answer: refused in plain words.
    var other = a
    other.credentialID = Data("someone else".utf8)
    do { _ = try await api.loginPasskey(c, other); XCTFail("signed in") } catch let e as AccountError { XCTAssertEqual(e, .passkeyRefused) }
    // The passkey alone: a ceremony for any of the person's passkeys.
    let any = try await api.passkeyCeremony(deviceName: "Dana’s Mac")
    XCTAssertEqual(any.allow, [])
    XCTAssertEqual(AccountError.passkeyRequired.errorDescription, "This account asks for a passkey; sign in from the Ola app.")
  }

  /// "Add a passkey?": the options with this Mac's key, the new passkey sent back.
  func testAddAPasskeyWithThisMacsKey() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    let api = AccountAPI(base: stub.base, session: URLSession(configuration: .ephemeral))
    let s = try await api.login(handle: "bart", password: "right password here", deviceName: "Mac")
    let reg = try await api.addPasskeyOptions(s)
    XCTAssertEqual(reg.ceremony, "add-1")
    XCTAssertEqual(reg.rpID, "app.ola.cx")
    XCTAssertEqual(reg.userName, "bart")
    XCTAssertEqual(String(decoding: reg.userID, as: UTF8.self), "user-id")
    let cred = PasskeyCredential(credentialID: Data("new-cred".utf8), clientDataJSON: Data("{}".utf8), attestationObject: Data([0xA3]))
    try await api.addPasskeyVerify(s, reg, cred)
    let sent = try XCTUnwrap(stub.lock.withLock { stub.passkeyAnswers.last })
    XCTAssertEqual(sent["ceremony"].str, "add-1")
    XCTAssertEqual(sent["response"]["id"].str, Base64URL.encode(Data("new-cred".utf8)))
    XCTAssertEqual(sent["response"]["response"]["attestationObject"].str, "ow")
    // Signed out: the options say so.
    try await api.signOut(s)
    do { _ = try await api.addPasskeyOptions(s); XCTFail("options while signed out") } catch let e as AccountError { XCTAssertEqual(e, .signedOut) }
    XCTAssertEqual(Base64URL.decode("not base64!"), nil)
  }
}

final class AccountTests: XCTestCase {
  func testSessionRoundTrip() {
    let j: JSON = ["token": "t", "expires_at": 1_900_000_000, "person": ["handle": "ana", "name": "", "admin": false], "device": ["id": "d", "name": "n", "kind": "cli"]]
    let s = AccountSession.decode(j.data)
    XCTAssertEqual(s?.person.name, "ana", "an empty name falls back to the handle")
    XCTAssertEqual(s?.expiresAt, Date(timeIntervalSince1970: 1_900_000_000))
    XCTAssertEqual(AccountSession.decode(s!.encoded()), s)
    XCTAssertEqual(s?.device.id, "d", "a string id is taken too")
    XCTAssertEqual(AccountSession.decode(StubOla.session("t").data)?.device.id, "17", "the server's numeric device id")
    XCTAssertNil(AccountAPI.usageSentence(["fraction": .number(0.4), "period": "week"]), "only the gateway's fraction_used")
    var utc = Calendar(identifier: .gregorian)
    utc.timeZone = TimeZone(identifier: "UTC")!
    let tue = Date(timeIntervalSince1970: 1_795_000_000)  // 2026-11-18, a Wednesday in UTC
    XCTAssertEqual(AccountAPI.usageSentence(StubOla.usage, now: tue, calendar: utc), "You\u{2019}ve used 42% of this week\u{2019}s share. It starts again Monday.")
    var full = StubOla.usage.object
    full["fraction_used"] = .number(1.0)
    XCTAssertEqual(AccountAPI.usageSentence(.object(full), now: tue, calendar: utc), "You\u{2019}ve used all of this week\u{2019}s share. It starts again Monday.")
  }
}

final class ModelDoorTests: XCTestCase {
  func signedIn(_ stub: StubOla) async throws -> String {
    try await AccountAPI(base: stub.base).login(handle: "bart", password: "right password here", deviceName: "Test Mac").token
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

  /// Ten refused passes in 15 minutes block the person's whole address: a 401 is exactly one
  /// request to the server, however many times opencode, the web commands or the app ask after.
  func testA401IsExactlyOneRequest() async throws {
    let stub = StubOla()
    try await stub.start()
    defer { stub.stop() }
    // A pass the door refuses: its 401 HTML page with WWW-Authenticate: Basic.
    let door = ModelDoor(api: AccountAPI(base: stub.base)) { "olap1.not-a-pass-the-door-knows.x" }
    let told = Counter()
    door.onSignedOut = { told.add() }
    try await door.start()
    defer { door.stop() }
    let before = stub.lock.withLock { stub.requests }
    for path in ["/v1/chat/completions", "/v1/models", "/web/search", "/v1/usage"] {
      var r = URLRequest(url: URL(string: "http://127.0.0.1:\(door.port)\(path)")!)
      r.httpMethod = path == "/v1/models" || path == "/v1/usage" ? "GET" : "POST"
      r.setValue("Bearer \(door.key)", forHTTPHeaderField: "Authorization")
      let (_, res) = try await URLSession(configuration: .ephemeral).data(for: r)
      XCTAssertEqual((res as? HTTPURLResponse)?.statusCode, 401, path)
    }
    XCTAssertEqual(stub.lock.withLock { stub.requests } - before, 1, "one request reached the server; the rest were answered here")
    XCTAssertEqual(told.value, 1, "the app was told once")
    XCTAssertTrue(door.isSignedOut)

    // Who-am-I and usage with that pass: one request each, an error, no retry.
    let api = AccountAPI(base: stub.base)
    let bad = AccountSession(token: "olap1.not-a-pass-the-door-knows.x", expiresAt: nil, person: .init(handle: "bart", name: "Bart", admin: true), device: .init(id: "1", name: "", kind: "mac"))
    var n = stub.lock.withLock { stub.requests }
    do { _ = try await api.me(bad); XCTFail("no error") } catch let e as AccountError { XCTAssertEqual(e, .signedOut) }
    XCTAssertEqual(stub.lock.withLock { stub.requests } - n, 1)
    n = stub.lock.withLock { stub.requests }
    do { _ = try await api.usage(bad); XCTFail("no error") } catch let e as AccountError { XCTAssertEqual(e, .signedOut) }
    XCTAssertEqual(stub.lock.withLock { stub.requests } - n, 1)
  }
}

final class Counter: @unchecked Sendable {
  private let lock = NSLock()
  private var n = 0
  func add() { lock.withLock { n += 1 } }
  var value: Int { lock.withLock { n } }
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
