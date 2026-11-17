import Foundation
import XCTest
@testable import OlaKit

/// The Mac app's relay, against two fake opencode servers on loopback: the allow-list, a wrong
/// secret, a removed phone, too many tries, and a switch of "Where Ola works" (the phone follows).
final class RelayTests: XCTestCase {
  func testAllowList() {
    XCTAssertTrue(MacRelay.allowed("GET", "/api/session"))
    XCTAssertTrue(MacRelay.allowed("POST", "/api/session/ses_abc/permission/per_1/reply"))
    XCTAssertTrue(MacRelay.allowed("GET", "/api/fs/read/court-watch/index.html"))
    XCTAssertFalse(MacRelay.allowed("POST", "/api/session/ses_abc/shell"))
    XCTAssertFalse(MacRelay.allowed("GET", "/api/config"))
    XCTAssertFalse(MacRelay.allowed("POST", "/api/experimental/fs/write"))
    XCTAssertFalse(MacRelay.allowed("GET", "/api/fs/read/../../etc/passwd"))
    XCTAssertFalse(MacRelay.allowed("DELETE", "/api/permission/saved/x"))
  }

  func testPairingCodeRoundTrip() {
    let c = PairingCode(host: "imac-m1.tailde799a.ts.net", port: 4330, secret: PairingCode.newSecret(), name: "Bart\u{2019}s iMac")
    XCTAssertEqual(PairingCode.parse(c.text), c)
    let typed = PairingCode.parse("imac-m1.tailde799a.ts.net:4330 \(c.secret.lowercased())")
    XCTAssertEqual(typed?.config.password, PairingCode.normalize(c.secret))
    XCTAssertNil(PairingCode.parse("hello"))
  }

  /// A fake opencode: answers every request with its name and the Authorization it got.
  func fake(_ name: String) async throws -> (MiniHTTPServer, ServerConfig) {
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      await res.send(200, JSON.object(["server": .string(name), "auth": .string(req.header("authorization") ?? ""), "path": .string(req.path)]).data)
    }
    let port = try await s.start()
    return (s, ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "pw-\(name)"))
  }

  func call(_ port: UInt16, _ path: String, secret: String?) async throws -> (Int, JSON) {
    var r = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
    if let secret { r.setValue("Bearer \(secret)", forHTTPHeaderField: "Authorization") }
    let (d, res) = try await URLSession.shared.data(for: r)
    return ((res as! HTTPURLResponse).statusCode, JSON.parse(d) ?? .null)
  }

  func testRelay() async throws {
    let (a, ca) = try await fake("A")
    let (b, cb) = try await fake("B")
    defer { a.stop(); b.stop() }
    let book = PairingBook(file: nil)
    let secret = PairingCode.newSecret()
    let phone = book.add(secret: secret)
    let relay = MacRelay(book: book, macName: "Test Mac")
    let port = try await relay.start(host: "127.0.0.1", port: 0)
    defer { relay.stop() }
    relay.setUpstream(ca, mode: "machine")

    // Through, to A, with A's own credentials in place of the phone's.
    var (code, body) = try await call(port, "/api/session", secret: secret)
    XCTAssertEqual(code, 200)
    XCTAssertEqual(body["server"].str, "A")
    XCTAssertEqual(body["auth"].str, "Basic " + Data("opencode:pw-A".utf8).base64EncodedString())
    // The typed form of the secret (lower case, dashes) is the same secret.
    (code, _) = try await call(port, "/api/session", secret: secret.lowercased())
    XCTAssertEqual(code, 200)

    // Not on the list.
    (code, _) = try await call(port, "/api/config", secret: secret)
    XCTAssertEqual(code, 403)

    // Wrong or missing secret.
    (code, _) = try await call(port, "/api/session", secret: "WRONG-SECRET-WRONG-SECRET")
    XCTAssertEqual(code, 401)
    (code, _) = try await call(port, "/api/session", secret: nil)
    XCTAssertEqual(code, 401)

    // The mode switches on the Mac: the phone, same secret, now reaches B.
    relay.setUpstream(cb, mode: "mac")
    (code, body) = try await call(port, "/api/session", secret: secret)
    XCTAssertEqual(body["server"].str, "B")
    (code, body) = try await call(port, "/ola/hello", secret: secret)
    XCTAssertEqual(body["mode"].str, "mac")

    // Removed: refused at once.
    book.remove(phone.id)
    relay.cut(phone: phone.id)
    (code, _) = try await call(port, "/api/session", secret: secret)
    XCTAssertEqual(code, 401)

    // Too many wrong tries from one address: refused for a minute, even with a right secret.
    let other = PairingCode.newSecret()
    book.add(secret: other)
    for _ in 0..<8 { _ = try await call(port, "/api/session", secret: "NOPE-NOPE-NOPE-NOPE-NOPE") }
    (code, _) = try await call(port, "/api/session", secret: other)
    XCTAssertEqual(code, 429)
  }
}
