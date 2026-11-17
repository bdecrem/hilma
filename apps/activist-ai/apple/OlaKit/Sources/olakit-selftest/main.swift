// OlaKit against the real server: one pass/fail line per step.
//
//   OLA_SERVER=http://100.95.51.98:4310 OLA_PASSWORD_FILE=<file holding the password> swift run olakit-selftest
//
// Makes a session, asks for five words, has the agent write olakit-check.txt (approving the write
// once), asks for a shell command naming a protected path (it must be refused, never asked),
// renames and deletes the session. The password is read from the file and never printed.
import Foundation
import OlaKit

let env = ProcessInfo.processInfo.environment
let address = env["OLA_SERVER"] ?? ServerConfig.defaultAddress
guard let pwFile = env["OLA_PASSWORD_FILE"], let pw = try? String(contentsOfFile: pwFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else {
  print("set OLA_PASSWORD_FILE to a file holding the password")
  exit(2)
}
let client = OpenCodeClient(ServerConfig(url: URL(string: address)!, password: pw))
var failures = 0
func line(_ ok: Bool, _ what: String, _ note: String = "") {
  if !ok { failures += 1 }
  print("\(ok ? "PASS" : "FAIL")  \(what)\(note.isEmpty ? "" : "  (\(note))")")
}

/// Every event of one session, folded into a Conversation as the apps do.
actor Watch {
  var conversation: Conversation
  var events: [JSON] = []
  init(_ id: String) { conversation = Conversation(sessionID: id, directory: nil) }
  func add(_ ev: JSON) {
    events.append(ev)
    conversation.apply(ev)
  }
  func start(_ text: String) { conversation.startTurn(text) }
  func snapshot() -> (Conversation, [JSON]) { (conversation, events) }
}

func wait(_ watch: Watch, seconds: Double, until: (Conversation, [JSON]) -> Bool) async -> Bool {
  let end = Date().addingTimeInterval(seconds)
  while Date() < end {
    let (c, e) = await watch.snapshot()
    if until(c, e) { return true }
    try? await Task.sleep(nanoseconds: 200_000_000)
  }
  return false
}

let t0 = Date()
do {
  let info = try await client.info()
  line(info["version"].str == "2.3.0", "connect with the password", "opencode \(info["version"].str)")
} catch {
  line(false, "connect with the password", "\(error)")
  exit(1)
}
do {
  _ = try await OpenCodeClient(ServerConfig(url: URL(string: address)!, password: "wrong-password")).info()
  line(false, "a wrong password is refused")
} catch OlaError.unauthorized {
  line(true, "a wrong password is refused", "401")
} catch {
  line(false, "a wrong password is refused", "\(error)")
}

let models = (try? await client.models()) ?? []
line(!models.isEmpty && models.allSatisfy { $0.providerID == "ola" }, "models come only from Ola's gateway", models.map(\.id).joined(separator: ", "))

let session: SessionInfo
do {
  session = try await client.createSession(title: "OlaKit self-test")
  line(session.id.hasPrefix("ses_"), "create a session", session.directory ?? "")
} catch {
  line(false, "create a session", "\(error)")
  exit(1)
}

let watch = Watch(session.id)
let listener = Task {
  for try await ev in client.events() {
    if ev["data"]["sessionID"].str == session.id || ev["type"].str == "server.connected" { await watch.add(ev) }
  }
}
_ = await wait(watch, seconds: 10) { _, e in e.contains { $0["type"].str == "server.connected" } }

let listed = (try? await client.sessions()) ?? []
line(listed.first?.id == session.id, "the session is listed, newest first", "\(listed.count) sessions")

// 1. A streamed reply.
await watch.start("Say hello in five words")
try await client.prompt(session.id, text: "Say hello in five words")
let replied = await wait(watch, seconds: 120) { c, _ in c.turns.last?.status == .done }
let (c1, e1) = await watch.snapshot()
let deltas = e1.filter { $0["type"].str == "session.text.delta" }.count
line(replied && !(c1.turns.last?.answer ?? "").isEmpty, "a streamed reply", "\(deltas) pieces: \(c1.turns.last?.answer.replacingOccurrences(of: "\n", with: " ") ?? "")")

// 2. An approval: the agent writes a file, the write asks, we allow it once.
let ask = "Use your file writing tool (not the shell) to create a file named olakit-check.txt that contains exactly the word ok and nothing else. Do nothing else."
await watch.start(ask)
try await client.prompt(session.id, text: ask)
let asked = await wait(watch, seconds: 120) { c, _ in c.approval != nil || c.turns.last?.status != .working && c.turns.last?.status != .sending }
let (c2, _) = await watch.snapshot()
if let a = c2.approval {
  line(asked && a.action == "edit", "the write asks first", "\(a.title): \(a.items.map(\.label).joined(separator: "; "))")
  try await client.reply(session: session.id, request: a.id, decision: .once)
  let done = await wait(watch, seconds: 120) { c, _ in c.turns.last?.status == .done || c.turns.last?.status == .failed }
  let (c3, _) = await watch.snapshot()
  line(done && c3.approval == nil, "allowed once, the run finished", c3.turns.last.map { $0.summary() } ?? "")
  let body = (try? await client.read("olakit-check.txt")).map { String(decoding: $0, as: UTF8.self) } ?? "(missing)"
  line(body.trimmingCharacters(in: .whitespacesAndNewlines) == "ok", "the file is there", "olakit-check.txt: \(body.trimmingCharacters(in: .whitespacesAndNewlines))")
} else {
  line(false, "the write asks first", "no approval came; turn \(c2.turns.last?.status.rawValue ?? "-")")
}

// 3. A protected path is refused without asking.
let risky = "Run exactly this shell command with your shell tool and report its output: ls ~/GAMI"
await watch.start(risky)
try await client.prompt(session.id, text: risky)
var askedAboutGAMI = false
let ended = await wait(watch, seconds: 120) { c, _ in
  if let a = c.approval, a.items.contains(where: { ($0.detail ?? $0.label).contains("GAMI") }) { askedAboutGAMI = true; return true }
  return c.turns.last?.status == .done || c.turns.last?.status == .failed
}
let (c4, _) = await watch.snapshot()
if askedAboutGAMI, let a = c4.approval {
  try? await client.reply(session: session.id, request: a.id, decision: .reject)
  line(false, "a command naming ~/GAMI is refused, not asked about", "it asked")
} else {
  let shellSteps = c4.turns.last?.steps.filter { $0.tool == "shell" } ?? []
  let refused = shellSteps.contains { $0.status == .failed }
  line(ended && (refused || shellSteps.isEmpty), "a command naming ~/GAMI is refused, not asked about", refused ? "refused: \(shellSteps.first?.error ?? "")" : "the model did not try; no shell step")
}
if let a = (await watch.snapshot()).0.approval { try? await client.reply(session: session.id, request: a.id, decision: .reject) }

// 4. History rebuilt from the server matches what the stream showed.
let history = Conversation.turns(fromMessages: (try? await client.messages(session.id)) ?? [], directory: session.directory)
line(history.count == 3 && history.first?.answer.isEmpty == false, "history from the server", "\(history.count) turns, \(history.flatMap(\.steps).count) steps")

// 5. Rename and delete.
try await client.rename(session.id, to: "OlaKit self-test, renamed")
let renamed = await wait(watch, seconds: 10) { _, e in e.contains { $0["type"].str == "session.renamed" } }
line(renamed, "rename arrives on the stream")
try await client.deleteSession(session.id)
let gone = await wait(watch, seconds: 10) { _, e in e.contains { $0["type"].str == "session.deleted" } }
let still = ((try? await client.sessions()) ?? []).contains { $0.id == session.id }
line(gone && !still, "delete arrives on the stream, and the session is gone")
listener.cancel()

print(failures == 0 ? "ALL PASSED in \(Int(Date().timeIntervalSince(t0))) s" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
