import Foundation
import OlaKit

/// OLA_CLAUDE=1 OLA_CLAUDE_FOLDER=<scratch> swift run olakit-selftest
/// Fallback to Claude against this Mac's real Claude Code and Bart's own login: four tiny requests
/// (his weekly allowance): a streamed reply; a file write approved; a file write refused; a long
/// command stopped mid-way, with nothing left running.
enum ClaudeCheck {
  final class Run: @unchecked Sendable {
    let lock = NSLock()
    var turn = Turn(id: "c", request: "", at: .now, status: .sending, engine: .claude)
    var fold = ClaudeFold(directory: nil)
    var asks: [(String, String, JSON)] = []
    var ended: Int32?
    var deltas = 0
    func snapshot() -> (Turn, [(String, String, JSON)], Int32?, Int) { lock.withLock { (turn, asks, ended, deltas) } }
  }

  static func go(_ line: (Bool, String, String) -> Void) async -> Bool {
    guard let bin = ClaudeRunner.find() else { line(false, "Claude Code is found", "not installed"); return false }
    line(ClaudeRunner.unavailable() == nil, "Claude Code is found and signed in", bin.path)
    let folder = URL(fileURLWithPath: ProcessInfo.processInfo.environment["OLA_CLAUDE_FOLDER"] ?? NSTemporaryDirectory() + "ola-claude-check")
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

    func run(_ request: String, onAsk: @escaping (ClaudeRunner, Run, String, JSON) -> Void, stopAfter: TimeInterval? = nil) async -> (Turn, [(String, String, JSON)], Int32?, Int, Int32) {
      let r = Run()
      let runner = ClaudeRunner(binary: bin, folder: folder)
      runner.onEvent = { e in r.lock.withLock {
        if e["type"].str == "stream_event", e["event"]["delta"]["type"].str == "text_delta" { r.deltas += 1 }
        r.fold.apply(e, to: &r.turn)
      } }
      runner.onApproval = { rid, tool, input in
        r.lock.withLock { r.asks.append((rid, tool, input)) }
        onAsk(runner, r, rid, input)
      }
      runner.onEnd = { code in r.lock.withLock { r.ended = code } }
      do { try runner.start(request: request, context: "") } catch { return (r.turn, [], -1, 0, 0) }
      let pid = runner.pid
      let t0 = Date()
      var stopped = false
      while Date().timeIntervalSince(t0) < 180 {
        if r.snapshot().2 != nil { break }
        if let s = stopAfter, !stopped, Date().timeIntervalSince(t0) > s, !r.snapshot().1.isEmpty {
          stopped = true
          runner.stop()
        }
        try? await Task.sleep(nanoseconds: 200_000_000)
      }
      let s = r.snapshot()
      return (s.0, s.1, s.2, s.3, pid)
    }

    // 1. A streamed reply.
    let a = await run("Say hello in five words.", onAsk: { runner, _, rid, input in runner.answer(rid, allow: false, input: input) })
    line(a.0.status == .done && !a.0.answer.isEmpty && a.3 > 0, "a streamed reply from Claude", "\(a.3) pieces: \(a.0.answer.replacingOccurrences(of: "\n", with: " "))")

    // 2. A write, asked, approved.
    let yes = folder.appendingPathComponent("claude-yes.txt")
    try? FileManager.default.removeItem(at: yes)
    let b = await run("Use the Write tool to create the file claude-yes.txt containing exactly the word ok. Do nothing else.", onAsk: { runner, _, rid, input in runner.answer(rid, allow: true, input: input) })
    let words = b.1.first.map { Plain.describeClaudeApproval($0.1, input: $0.2, dir: folder.path) }
    line(b.1.contains { $0.1 == "Write" }, "the write asks first", words.map { "\($0.title): \($0.items.first?.label ?? "")" } ?? "no question")
    let written = (try? String(contentsOf: yes, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
    line(written == "ok" && b.0.status == .done, "allowed, the file is there", "claude-yes.txt: \(written ?? "missing"); \(b.0.summary())")

    // 3. A write, asked, refused.
    let no = folder.appendingPathComponent("claude-no.txt")
    try? FileManager.default.removeItem(at: no)
    let c = await run("Use the Write tool to create the file claude-no.txt containing exactly the word no. If you are not allowed, just say so in one sentence.", onAsk: { runner, _, rid, input in runner.answer(rid, allow: false, input: input) })
    line(!c.1.isEmpty && !FileManager.default.fileExists(atPath: no.path), "refused, no file is written", "\(c.1.count) question(s); \(c.0.answer.prefix(80))")

    // 4. A long command, approved, then Stop: nothing is left running.
    let d = await run("Run exactly this command with the Bash tool and wait for it: sleep 45 && echo done-sleeping", onAsk: { runner, _, rid, input in runner.answer(rid, allow: true, input: input) }, stopAfter: 6)
    try? await Task.sleep(nanoseconds: 9_000_000_000)
    let left = ClaudeRunner.descendants(of: d.4)
    let sleeping = Process()
    sleeping.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
    sleeping.arguments = ["-f", "sleep 45"]
    let out = Pipe()
    sleeping.standardOutput = out
    try? sleeping.run()
    let sl = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    sleeping.waitUntilExit()
    line(d.2 != nil && kill(d.4, 0) != 0 && left.isEmpty && sl.isEmpty, "Stop ends the run and leaves nothing running", "claude exited \(d.2.map(String.init) ?? "no"), children left \(left.count), sleep left \(sl.isEmpty ? "none" : sl)")
    return true
  }
}
