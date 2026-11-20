import Foundation
import XCTest
@testable import OlaKit

/// OLA-142: "yes for the rest of this session" covers the session's later web steps (a search, a
/// download, a lookup, however wrapped) and nothing else, is never opencode's own lasting "always",
/// and goes to whoever answers for the runtime; and "Lots of permissions" is one switch per runtime.
/// The machine's side is `bart/permissions-check.mjs` (real opencode).
@MainActor
final class SessionYesTests: XCTestCase {
  var saved: UserDefaults!
  let suite = "cx.ola.sessionyes.test.\(getpid())"

  override func setUp() async throws {
    saved = LocalSettings.defaults
    LocalSettings.defaults = UserDefaults(suiteName: suite)!
  }

  override func tearDown() async throws {
    UserDefaults.standard.removePersistentDomain(forName: suite)
    LocalSettings.defaults = saved
  }

  func testTheKinds() {
    // The open model's wrappings of a web step are all one kind.
    XCTAssertEqual(SessionYes.kind(action: "shell", resources: ["ola-search \"rent strike\" 2>&1", "head -20"]), "web")
    XCTAssertEqual(SessionYes.kind(action: "shell", resources: ["ola-fetch \"https://example.org/a.pdf\" 2>&1", "tail -5"]), "web")
    XCTAssertEqual(SessionYes.kind(action: "bash", resources: ["ola-lookup \"doi:10.1/x\""]), "web")
    // A web command beside a real one is a command, not a web step.
    XCTAssertEqual(SessionYes.kind(action: "shell", resources: ["ola-search x", "rm -rf notes"]), "shell")
    XCTAssertEqual(SessionYes.kind(action: "shell", resources: ["ls"]), "shell")
    XCTAssertEqual(SessionYes.kind(action: "edit", resources: ["a.md"]), "edit")
  }

  /// A stand-in opencode: the waiting requests per session, and every answer it got.
  final class Stub: @unchecked Sendable {
    let lock = NSLock()
    var pending: [JSON] = []
    var replies: [(String, String)] = []
    func reply(_ id: String, _ d: String) { lock.withLock { replies.append((id, d)); pending.removeAll { $0["id"].str == id } } }
    var got: [(String, String)] { lock.withLock { replies } }
    func add(_ id: String, _ session: String, _ action: String, _ resources: [String]) {
      lock.withLock { pending.append(.object(["id": .string(id), "sessionID": .string(session), "action": .string(action), "resources": .array(resources.map(JSON.string))])) }
    }
  }

  func stub() async throws -> (MiniHTTPServer, Stub, UInt16) {
    let st = Stub()
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      let parts = req.path.split(separator: "/").map(String.init)
      if req.method == "GET", parts.count == 4, parts[3] == "permission" {
        let mine = st.lock.withLock { st.pending.filter { $0["sessionID"].str == parts[2] } }
        return await res.send(200, JSON.object(["data": .array(mine)]).data)
      }
      if req.method == "POST", parts.count == 6, parts[5] == "reply" {
        st.reply(parts[4], (JSON.parse(req.body) ?? .null)["decision"].str)
        return await res.send(200, Data("{}".utf8))
      }
      await res.send(200, Data("{}".utf8))
    }
    return (s, st, try await s.start())
  }

  func asked(_ id: String, _ session: String, _ action: String, _ resources: [String]) -> JSON {
    ["type": "permission.asked", "data": .object(["id": .string(id), "sessionID": .string(session), "action": .string(action), "resources": .array(resources.map(JSON.string))])]
  }

  func waitFor(_ ok: @escaping @MainActor () -> Bool) async {
    var n = 0
    while !ok(), n < 50 {
      try? await Task.sleep(nanoseconds: 50_000_000)
      n += 1
    }
  }

  /// "On this Mac": the store keeps the yes and answers "once", never "always".
  func testOnThisMacTheYesCoversTheSessionsWebStepsOnly() async throws {
    let (server, st, port) = try await stub()
    defer { server.stop() }
    PermissionSettings.mode = .ask
    let store = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "pw"))
    PermissionSettings.wire(store)
    XCTAssertEqual(store.runtime, .local)
    st.add("per_1", "ses_a", "shell", ["ola-search \"tenant union\" 2>&1", "head -20"])
    let status = await store.answerForSession(session: "ses_a", request: "per_1")
    XCTAssertEqual(status, 204)
    XCTAssertEqual(st.got.map(\.1), ["once"], "opencode heard once, never always")
    XCTAssertEqual(store.yesKinds("ses_a"), ["web"])

    // A download and a lookup later in the same session: answered here, no card.
    st.add("per_2", "ses_a", "shell", ["ola-fetch \"https://example.org/a.pdf\" 2>&1", "tail -5"])
    store.handle(asked("per_2", "ses_a", "shell", ["ola-fetch \"https://example.org/a.pdf\" 2>&1", "tail -5"]))
    st.add("per_3", "ses_a", "bash", ["ola-lookup \"doi:10.1/x\""])
    store.handle(asked("per_3", "ses_a", "bash", ["ola-lookup \"doi:10.1/x\""]))
    await waitFor { st.got.count >= 3 }
    // per_2 and per_3 are answered at once, so they can reach the server in either order.
    XCTAssertEqual(st.got.map(\.0).sorted(), ["per_1", "per_2", "per_3"])
    XCTAssertEqual(st.got.map(\.1), ["once", "once", "once"])

    // A command in that session, and a web step in another session: not covered.
    store.handle(asked("per_4", "ses_a", "shell", ["rm -rf notes"]))
    store.handle(asked("per_5", "ses_b", "shell", ["ola-search \"x\""]))
    try await Task.sleep(nanoseconds: 400_000_000)
    XCTAssertEqual(st.got.count, 3, "a command or another session's search was answered")
  }

  /// The cloud (OLA-150): the yes goes to the front desk as "always", which keeps it for the
  /// conversation and gives opencode "once" (frontdesk/server.mjs, the permission reply).
  func testTheCloudSendsTheYesToTheFrontDesk() async throws {
    let (fd, fdStub, fdPort) = try await stub()
    defer { fd.stop() }
    let store = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(fdPort)")!, password: "olap1.key", account: true))
    XCTAssertEqual(store.runtime, .cloud)
    fdStub.add("per_1", "ses_a", "shell", ["ola-search \"x\""])
    let status = await store.answerForSession(session: "ses_a", request: "per_1")
    XCTAssertEqual(status, 204)
    XCTAssertEqual(fdStub.got.map(\.1), ["always"])
    XCTAssertEqual(store.yesKinds("ses_a"), ["web"])
  }

  /// A stand-in front desk that records every request: method, path and body.
  final class Recorder: @unchecked Sendable {
    let lock = NSLock()
    var seen: [(String, String, JSON)] = []
    func add(_ m: String, _ p: String, _ b: JSON) { lock.withLock { seen.append((m, p, b)) } }
    var all: [(String, String, JSON)] { lock.withLock { seen } }
  }

  /// The cloud's "Lots of permissions" is the conversation's autonomy, as on the website: a new
  /// conversation carries the switch, and a request after the switch changed carries it again first.
  func testTheCloudSwitchTravelsWithTheConversation() async throws {
    let rec = Recorder()
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      rec.add(req.method, req.path, JSON.parse(req.body) ?? .null)
      if req.method == "POST", req.path == "/api/session" {
        return await res.send(200, JSON.object(["data": ["id": "ses_new", "title": "t", "time": ["created": 1_800_000_000_000, "updated": 1_800_000_000_000]]]).data)
      }
      await res.send(200, Data("{}".utf8))
    }
    let port = try await s.start()
    defer { s.stop() }
    var lots = true
    let store = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "olap1.key", account: true))
    store.cloudLots = { lots }
    await store.sendToOla("Count the rows")
    let create = rec.all.first { $0.0 == "POST" && $0.1 == "/api/session" }
    XCTAssertEqual(create?.2["metadata"]["autonomy"].str, "go")
    XCTAssertFalse(rec.all.contains { $0.0 == "PATCH" }, "the switch had not changed")
    XCTAssertTrue(rec.all.contains { $0.0 == "POST" && $0.1 == "/api/session/ses_new/prompt" })
    lots = false
    await store.sendToOla("And the columns")
    let patches = rec.all.filter { $0.0 == "PATCH" }
    XCTAssertEqual(patches.map(\.1), ["/api/session/ses_new"])
    XCTAssertEqual(patches.first?.2["metadata"]["autonomy"].str, "ask")
    let order = rec.all.map { "\($0.0) \($0.1)" }
    XCTAssertLessThan(order.lastIndex(of: "PATCH /api/session/ses_new")!, order.lastIndex(of: "POST /api/session/ses_new/prompt")!, "the switch went before the request")
    // Anywhere else (this Mac's own agent) no autonomy is sent: the switch is the Mac's.
    let rec2 = Recorder()
    let s2 = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      rec2.add(req.method, req.path, JSON.parse(req.body) ?? .null)
      if req.method == "POST", req.path == "/api/session" {
        return await res.send(200, JSON.object(["data": ["id": "ses_l", "title": "t", "time": ["created": 1_800_000_000_000, "updated": 1_800_000_000_000]]]).data)
      }
      // This Mac's own engine offers Ola's model (the store checks before each request, OLA-249/287).
      let general: JSON = ["providerID": "ola", "id": "general", "name": "General"]
      if req.path == "/api/model" { return await res.send(200, JSON.object(["data": .array([general])]).data) }
      if req.path == "/api/model/default" { return await res.send(200, JSON.object(["data": general]).data) }
      await res.send(200, Data("{}".utf8))
    }
    let port2 = try await s2.start()
    defer { s2.stop() }
    let local = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(port2)")!, password: "pw"))
    await local.sendToOla("Hello")
    XCTAssertTrue(rec2.all.first { $0.1 == "/api/session" }?.2["metadata"].isNull ?? false)
  }

  /// A cloud conversation stays in its project, as on the website: the app does not delete it.
  func testTheCloudKeepsItsConversations() async throws {
    let rec = Recorder()
    let s = try MiniHTTPServer(host: "127.0.0.1", port: 0) { req, res in
      rec.add(req.method, req.path, .null)
      await res.send(200, Data("{}".utf8))
    }
    let port = try await s.start()
    defer { s.stop() }
    let store = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: "olap1.key", account: true))
    await store.delete("ses_a")
    XCTAssertFalse(rec.all.contains { $0.0 == "DELETE" })
    XCTAssertNotNil(store.problem)
  }

  /// The cloud's files are the website's list, one folder at a time.
  func testTheCloudsFilesAreTheWebsitesList() {
    let paths = ["survey.csv", "charts/rent.png", "charts/old/a.png", "sources/law.pdf", "notes.md"]
    XCTAssertEqual(OpenCodeClient.folder(paths, "").map(\.path), ["charts", "sources", "notes.md", "survey.csv"])
    XCTAssertEqual(OpenCodeClient.folder(paths, "").map(\.isDirectory), [true, true, false, false])
    XCTAssertEqual(OpenCodeClient.folder(paths, "charts").map(\.path), ["charts/old", "charts/rent.png"])
    XCTAssertEqual(OpenCodeClient.folder(paths, "charts/old/").map(\.path), ["charts/old/a.png"])
  }

  /// The phone through its Mac: the relay hands the session yes to the Mac app; anything else
  /// goes through to the server as before.
  func testTheRelayKeepsThePhonesYesForTheMac() async throws {
    let (up, upStub, upPort) = try await stub()
    defer { up.stop() }
    let book = PairingBook(file: nil)
    let secret = PairingCode.newSecret()
    book.add(secret: secret)
    let relay = MacRelay(book: book, macName: "Test Mac")
    let got = Calls()
    relay.sessionYes = { s, r in got.add("\(s) \(r)"); return 204 }
    let port = try await relay.start(host: "127.0.0.1", port: 0)
    defer { relay.stop() }
    relay.setUpstream(ServerConfig(url: URL(string: "http://127.0.0.1:\(upPort)")!, password: "pw"), mode: "mac")
    let phone = OpenCodeClient(ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: secret, viaMac: true))
    try await phone.reply(session: "ses_a", request: "per_1", decision: .always)
    XCTAssertEqual(got.all, ["ses_a per_1"])
    XCTAssertTrue(upStub.got.isEmpty, "the always went to opencode")
    try await phone.reply(session: "ses_a", request: "per_2", decision: .once)
    XCTAssertEqual(upStub.got.map(\.1), ["once"])
  }

  final class Calls: @unchecked Sendable {
    let lock = NSLock()
    var list: [String] = []
    func add(_ s: String) { lock.withLock { list.append(s) } }
    var all: [String] { lock.withLock { list } }
  }

  /// One "Lots of permissions" per runtime: a store goes by its own runtime's switch, and changing
  /// the local one leaves the cloud one alone.
  func testOneSwitchPerRuntime() async {
    PermissionSettings.mode = .ask
    PermissionSettings.cloudMode = .lots
    let local = OlaStore(config: ServerConfig(url: URL(string: "http://127.0.0.1:1")!, password: "x"))
    let cloud = OlaStore(config: ServerConfig(url: URL(string: "http://admins-mac-mini.tailde799a.ts.net:4310")!, password: "x"))
    PermissionSettings.wire(local)
    PermissionSettings.wire(cloud)
    XCTAssertEqual(local.goesAhead?("shell", ["ls"]), false)
    XCTAssertEqual(cloud.goesAhead?("shell", ["ls"]), true)
    XCTAssertFalse(local.serverAnswers())
    XCTAssertTrue(cloud.serverAnswers())
    await PermissionSettings.set(.lots)
    XCTAssertEqual(local.goesAhead?("shell", ["ls"]), true)
    PermissionSettings.cloudMode = .ask
    XCTAssertEqual(cloud.goesAhead?("shell", ["ls"]), false)
    XCTAssertEqual(PermissionSettings.mode, .lots, "the cloud switch moved the local one")
    XCTAssertEqual(PermissionSettings.mode(.cloud), .ask)
    // The runtime of each kind of server.
    XCTAssertEqual(Runtime.of(ServerConfig(url: URL(string: "http://x.ts.net:4312")!, password: "k", account: true)), .cloud)
    XCTAssertEqual(Runtime.of(ServerConfig(url: URL(string: "http://imac.ts.net:4330")!, password: "s", viaMac: true)), .local)
  }
}
