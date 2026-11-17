import Foundation
import XCTest
@testable import OlaKit

/// The phone's admin token: read, expiry, and the sign-in and check calls against a fake site.
final class AdminTokenTests: XCTestCase {
  func testParse() {
    let exp = Int(Date().timeIntervalSince1970) + 3600
    let t = AdminToken("olaapp.bart.\(exp).AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    XCTAssertEqual(t?.user, "bart")
    XCTAssertFalse(t!.expired())
    XCTAssertTrue(t!.expired(at: Date().addingTimeInterval(7200)))
    XCTAssertNil(AdminToken("kl_app.bart.\(exp).x"))
    XCTAssertNil(AdminToken("olaapp.bart.soon.AAAAAAAAAAAAAAAAAAAAAAAA"))
    XCTAssertNil(AdminToken(""))
  }

  func testSignInAndCheckAgainstAFakeSite() async throws {
    let exp = Int(Date().timeIntervalSince1970) + 3600
    let good = "olaapp.bart.\(exp).BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
    let site = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let body = JSON.parse(req.body) ?? .null
      let links: JSON = [["name": "Leave a note", "what": "x", "href": "https://ola.cx/venture/memo?k=test"]]
      if req.method == "POST" {
        if body["passcode"].str == "right" {
          await res.send(200, JSON.object(["token": .string(good), "user": "bart", "links": links]).data)
        } else {
          await res.send(401, JSON.object(["error": "That name and passcode do not match."]).data)
        }
      } else {
        let ok = req.header("authorization") == "Bearer \(good)"
        await res.send(ok ? 200 : 401, ok ? JSON.object(["user": "bart", "links": links]).data : JSON.object(["error": "Sign in again."]).data)
      }
    }
    let port = try await site.start()
    defer { site.stop() }
    let url = URL(string: "http://127.0.0.1:\(port)")!
    do {
      _ = try await AdminAuth.signIn(name: "bart", password: "wrong", site: url)
      XCTFail("a wrong password signs in")
    } catch let e as AdminAuth.Failure {
      XCTAssertEqual(e, .refused("That name and passcode do not match."))
    }
    let (t, links) = try await AdminAuth.signIn(name: "bart", password: "right", site: url)
    XCTAssertEqual(t.user, "bart")
    XCTAssertEqual(links.first?.name, "Leave a note")
    let checked = try await AdminAuth.check(t, site: url)
    XCTAssertEqual(checked.count, 1)
    let forged = AdminToken("olaapp.bart.\(exp).CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC")!
    do { _ = try await AdminAuth.check(forged, site: url); XCTFail("a forged token works") } catch {}
    let old = AdminToken("olaapp.bart.1000000000.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")!
    do { _ = try await AdminAuth.check(old, site: url); XCTFail("an expired token works") } catch let e as AdminAuth.Failure { XCTAssertEqual(e, .refused("Sign in again.")) }
  }
}
