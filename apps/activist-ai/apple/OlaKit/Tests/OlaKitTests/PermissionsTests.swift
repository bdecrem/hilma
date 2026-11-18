import Foundation
import XCTest
@testable import OlaKit

/// "Lots of permissions" (PermissionSettings): the default, what goes ahead, what still asks, the
/// `ola` command's config and setting, and Claude Code's questions answered by the runner.
final class PermissionsTests: XCTestCase {
  var saved: UserDefaults!
  let suite = "cx.ola.permissions.test.\(getpid())"

  override func setUp() {
    saved = LocalSettings.defaults
    LocalSettings.defaults = UserDefaults(suiteName: suite)!
  }

  override func tearDown() {
    UserDefaults.standard.removePersistentDomain(forName: suite)
    LocalSettings.defaults = saved
  }

  func testLotsIsTheDefaultAndSticks() {
    XCTAssertEqual(PermissionSettings.mode, .lots)
    PermissionSettings.mode = .ask
    XCTAssertFalse(PermissionSettings.lots)
    XCTAssertEqual(LocalSettings.defaults.string(forKey: PermissionSettings.key), "ask")
    PermissionSettings.mode = .lots
    XCTAssertTrue(PermissionSettings.lots)
  }

  func testOnlyTheAskFirstStepsGoAhead() {
    for a in ["shell", "bash", "edit", "write", "apply_patch", "patch"] { XCTAssertTrue(PermissionSettings.goesAhead(action: a, resources: ["mkdir notes"]), a) }
    // Refused today, still refused (they never ask), and anything else that asks still asks.
    for a in ["webfetch", "websearch", "execute", "external_directory", "skill", "question"] { XCTAssertFalse(PermissionSettings.goesAhead(action: a, resources: ["x"]), a) }
    // A web search or download through Ola's own commands goes ahead too under Lots (OLA-139).
    XCTAssertTrue(PermissionSettings.goesAhead(action: "shell", resources: ["ola-search \"rent strike\""]))
    XCTAssertTrue(PermissionSettings.goesAhead(action: "shell", resources: ["cd x && ola-fetch https://example.org"]))
  }

  /// The machine's choice through the Mac's phone door port, and the phone's own configs as they are.
  func testWhereTheMachinesChoiceIsAsked() {
    let mac = ServerConfig(url: URL(string: "http://admins-mac-mini.tailde799a.ts.net:4310")!, password: "pw")
    let door = MachinePermissions.door(for: mac)
    XCTAssertEqual(door.url.absoluteString, "http://admins-mac-mini.tailde799a.ts.net:4312")
    XCTAssertEqual(door.password, "pw")
    XCTAssertFalse(door.account || door.viaMac)
    let phone = ServerConfig(url: URL(string: "http://admins-mac-mini.tailde799a.ts.net:4312")!, password: "key", account: true)
    XCTAssertEqual(MachinePermissions.door(for: phone), phone)
    let relay = ServerConfig(url: URL(string: "http://imac.tailde799a.ts.net:4330")!, password: "s", viaMac: true)
    XCTAssertEqual(MachinePermissions.door(for: relay), relay)
  }

  /// The phone through its Mac: the relay answers with the Mac's choice and takes a change.
  func testThePhoneReadsAndSetsItThroughTheRelay() async throws {
    let book = PairingBook(file: nil)
    let secret = PairingCode.newSecret()
    book.add(secret: secret)
    let relay = MacRelay(book: book, macName: "Test Mac")
    let box = ModeBox()
    relay.permissions = { box.get() }
    relay.setPermissions = { m in box.set(m); return box.get() }
    let port = try await relay.start(host: "127.0.0.1", port: 0)
    defer { relay.stop() }
    let c = ServerConfig(url: URL(string: "http://127.0.0.1:\(port)")!, password: secret, viaMac: true)
    let first = try await MachinePermissions.get(c)
    XCTAssertEqual(first, .lots)
    let changed = try await MachinePermissions.set(.ask, c)
    XCTAssertEqual(changed, .ask)
    XCTAssertEqual(box.get(), "ask")
    let again = try await MachinePermissions.get(c)
    XCTAssertEqual(again, .ask)
    // Without the pairing secret: refused.
    do {
      _ = try await MachinePermissions.get(ServerConfig(url: c.url, password: "WRONG-WRONG-WRONG-WRONG", viaMac: true))
      XCTFail("a wrong secret read the choice")
    } catch OlaError.unauthorized {}
  }

  final class ModeBox: @unchecked Sendable {
    let lock = NSLock()
    var mode = "lots"
    func get() -> String { lock.withLock { mode } }
    func set(_ m: String) { lock.withLock { mode = m } }
  }

  func testTheConfigUnderLotsAndUnderAsk() {
    let ask = LocalServer.config(modelURL: "http://127.0.0.1:1/v1", instructionsPath: "/i.md")
    XCTAssertTrue(ask.contains(#"{ "action": "shell", "resource": "*", "effect": "ask" }"#))
    XCTAssertTrue(ask.contains(#"{ "action": "edit", "resource": "*", "effect": "ask" }"#))
    XCTAssertFalse(ask.contains(#""resource": "*ola-search*""#))
    let lots = LocalServer.config(modelURL: "http://127.0.0.1:1/v1", instructionsPath: "/i.md", askFirst: false)
    for a in ["shell", "bash", "edit", "write", "apply_patch"] {
      XCTAssertTrue(lots.contains(#"{ "action": "\#(a)", "resource": "*", "effect": "allow" }"#), a)
    }
    // Ola's web commands are not asked about under Lots (OLA-139); the refusals stay.
    for w in ["ola-search", "ola-fetch", "ola-lookup"] { XCTAssertFalse(lots.contains(#""resource": "*\#(w)*", "effect": "ask""#), w) }
    for d in ["webfetch", "execute", "websearch", "external_directory"] { XCTAssertTrue(lots.contains(#"{ "action": "\#(d)", "resource": "*", "effect": "deny" }"#), d) }
    XCTAssertTrue(lots.contains(#"{ "action": "provider.use", "resource": "*", "effect": "deny" }"#))
    XCTAssertTrue(lots.contains(#"{ "action": "shell", "resource": "*sudo *", "effect": "deny" }"#))
  }

  func testClaudeUnderLotsKeepsTheFolder() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("ola-perm-\(getpid())")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    func ok(_ tool: String, _ input: JSON) -> Bool { PermissionSettings.claudeGoesAhead(tool: tool, input: input, folder: folder) }
    XCTAssertTrue(ok("Write", ["file_path": .string(folder.appendingPathComponent("notes/a.md").path)]))
    XCTAssertTrue(ok("Edit", ["file_path": "notes/a.md"]))
    XCTAssertTrue(ok("Read", ["file_path": .string(folder.path + "/x.txt")]))
    XCTAssertTrue(ok("Glob", ["pattern": "**/*.md"]))
    XCTAssertFalse(ok("Write", ["file_path": "/etc/hosts"]))
    XCTAssertFalse(ok("Edit", ["file_path": "../outside.txt"]))
    XCTAssertFalse(ok("Read", ["file_path": "~/.ssh/id_ed25519"]))
    XCTAssertFalse(ok("Write", ["file_path": .string(folder.path + "-sibling/x")]))
    XCTAssertTrue(ok("Bash", ["command": "mkdir -p notes && ls notes > /dev/null"]))
    XCTAssertTrue(ok("Bash", ["command": .string("cat \(folder.path)/notes/a.md")]))
    XCTAssertFalse(ok("Bash", ["command": "cat ~/.zshrc"]))
    XCTAssertFalse(ok("Bash", ["command": "ls /Users"]))
    XCTAssertFalse(ok("Bash", ["command": "cd .. && rm -rf x"]))
    XCTAssertFalse(ok("Bash", ["command": "cat $HOME/.netrc"]))
    XCTAssertFalse(ok("Bash", ["command": "sudo ls"]))
    XCTAssertTrue(ok("Bash", ["command": "ola-search \"tenant union\""]))
    XCTAssertFalse(ok("WebFetch", ["url": "https://example.org"]))
    XCTAssertFalse(ok("WebSearch", ["query": "x"]))
  }

  /// The runner answers a question inside the folder itself, asks about one outside it, and asks
  /// about everything under "Ask before each step". A stand-in for Claude Code prints the answers.
  func testTheRunnerAnswersItselfUnderLots() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ola-perm-run-\(getpid())")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let fake = dir.appendingPathComponent("claude")
    try """
    #!/bin/bash
    read -r first
    echo '{"type":"control_request","request_id":"in","request":{"subtype":"can_use_tool","tool_name":"Write","input":{"file_path":"notes/a.md","content":"x"}}}'
    read -r a1
    if [[ "$a1" == *'"allow"'* ]]; then ok=true; else ok=false; fi
    echo "{\\"type\\":\\"answer\\",\\"allowed\\":$ok}"
    echo '{"type":"control_request","request_id":"out","request":{"subtype":"can_use_tool","tool_name":"Write","input":{"file_path":"/etc/x","content":"x"}}}'
    read -r a2
    echo '{"type":"result","subtype":"success"}'
    while read -r line; do :; done
    """.write(to: fake, atomically: true, encoding: .utf8)
    chmod(fake.path, 0o755)

    for mode in [PermissionMode.lots, .ask] {
      PermissionSettings.mode = mode
      let runner = ClaudeRunner(binary: fake, folder: dir)
      let asked = Box()
      let ended = expectation(description: "ended \(mode)")
      runner.onApproval = { rid, _, input in
        asked.add(input["file_path"].str)
        runner.answer(rid, allow: false, input: input)
      }
      runner.onEvent = { e in if e["type"].str == "answer" { asked.answered(e["allowed"].bool ?? false) } }
      runner.onEnd = { _ in ended.fulfill() }
      try runner.start(request: "x", context: "")
      await fulfillment(of: [ended], timeout: 15)
      if mode == .lots {
        XCTAssertEqual(asked.paths, ["/etc/x"], "only the file outside the folder asks")
        XCTAssertEqual(asked.inside, true, "the one inside was allowed without asking")
      } else {
        XCTAssertEqual(asked.paths, ["notes/a.md", "/etc/x"], "everything asks")
        XCTAssertEqual(asked.inside, false)
      }
    }
  }

  final class Box: @unchecked Sendable {
    let lock = NSLock()
    var paths: [String] = []
    var inside: Bool?
    func add(_ p: String) { lock.withLock { paths.append(p) } }
    func answered(_ b: Bool) { lock.withLock { inside = b } }
  }

  func testTheCommandSetsAndShowsIt() {
    XCTAssertEqual(OlaCLI.parse(["settings", "permissions", "ask"]), .settings(["permissions", "ask"]))
    XCTAssertTrue(OlaCLI.help.contains("ola settings permissions lots|ask"))
    XCTAssertEqual(PermissionMode.lots.label, "Lots of permissions: Ola goes ahead without asking")
    XCTAssertEqual(PermissionMode.ask.label, "Ask before each step")
  }
}
