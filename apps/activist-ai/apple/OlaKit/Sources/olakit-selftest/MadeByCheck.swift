import Foundation
import OlaKit

/// OLA_MADEBY_CHECK=1: "who made this file?" answered by the real open model from the record (OLA-224).
/// A scratch project where Claude (recorded as Claude, the way the app records a Claude turn) wrote
/// index.html; then the open model, started here as the Mac app starts it, is asked who made it,
/// without the engines note, so it has to look the answer up with `ola-made-by`. It must run it,
/// never be asked about it, name Claude, and never claim the file as its own.
///
///   OLA_MADEBY_CHECK=1 OLA_MODEL_TOKEN_FILE=<bart gateway token> swift run olakit-selftest
enum MadeByCheck {
  static let question = "Who made index.html?"

  static func go(env: [String: String], _ line: (Bool, String, String) -> Void) async {
    let fm = FileManager.default
    guard let tf = env["OLA_MODEL_TOKEN_FILE"], let token = try? String(contentsOfFile: tf, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) else { line(false, "set OLA_MODEL_TOKEN_FILE", ""); return }
    let t = fm.temporaryDirectory.appendingPathComponent("ola-madeby-\(getpid())")
    var server: LocalServer?
    defer { server?.stop(); try? fm.removeItem(at: t) }
    LocalServer.webToolsSource = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../workspace").standardized
    LocalServer.support = t.appendingPathComponent("support")
    let project = t.appendingPathComponent("project")
    try? fm.createDirectory(at: project, withIntermediateDirectories: true)
    let s = LocalServer(folder: project)
    s.stateBase = t.appendingPathComponent("state")
    let config: ServerConfig
    do { config = try await s.start(modelToken: token) } catch { line(false, "the local agent starts", error.localizedDescription); return }
    server = s
    let tools = LocalServer.support.appendingPathComponent("web-tools")
    line(fm.isExecutableFile(atPath: tools.appendingPathComponent("ola-made-by").path), "ola-made-by is next to opencode, on its PATH", tools.path)

    // Claude's turn, recorded as the app records it: begin, the file written, end.
    let record = LocalMadeBy(folder: project, tools: tools)
    await record.begin(turn: "claude-check-1", engine: .claude, model: "claude-opus-5-5", session: "check")
    try? "<p>Claude was here</p>\n".write(to: project.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    let changed = await record.end(turn: "claude-check-1", model: "claude-opus-5-5", interrupted: false)
    let rows = await record.lastChanges()
    line(changed == ["index.html"] && rows.first { $0.path == "index.html" }?.engine == "claude", "the record says Claude wrote index.html",
         rows.map { "\($0.path) \($0.how) by \($0.engine) \($0.model ?? "")" }.joined(separator: "; "))

    // The question, to the real open model, approvals answered No (the lookup must never ask).
    let client = OpenCodeClient(config)
    let asked = WebCheck.Asked()
    guard let turn = await WebCheck.run(client, question, answer: { a in asked.add(a, web: false); return .reject }) else { line(false, "a run", "no turn"); return }
    let steps = turn.steps.map { "\($0.verb) \($0.object) [\($0.status.rawValue)]" }.joined(separator: "; ")
    let lookup = turn.steps.first { $0.tool == "shell" && ($0.object.contains("ola-made-by") || $0.input.contains("ola-made-by")) }
    line(lookup?.status == .done, "the model ran ola-made-by", steps + (lookup.map { " | input: \($0.input) | \($0.error ?? "")" } ?? ""))
    line(asked.refused.isEmpty, "nothing was asked", asked.refused.map { "\($0.title): \($0.action) \($0.items.map { $0.detail ?? $0.label }.joined(separator: "; "))" }.joined(separator: " | "))
    let answer = turn.shownAnswer
    print("      answer: \u{201C}\(answer.replacingOccurrences(of: "\n", with: " "))\u{201D}")
    let lower = answer.lowercased()
    line(lower.contains("claude"), "the answer names Claude", "")
    let claims = ["i made", "i created", "i wrote", "i built"].contains { lower.contains($0) }
    line(!claims, "the open model does not claim the file", "")
  }
}
