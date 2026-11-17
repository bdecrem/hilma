import Foundation
import XCTest
@testable import OlaKit

/// ClaudeRunner's process handling, with a stand-in for Claude Code (no request is spent): it asks
/// one question, starts a long command when allowed, and is then stopped. Nothing may be left.
final class ClaudeRunnerTests: XCTestCase {
  func testStopLeavesNothing() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("fake-claude-\(getpid())")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let marker = "ola-fake-sleep-\(getpid())"
    let fake = dir.appendingPathComponent("claude")
    // Asks can_use_tool, waits for the answer, then runs a long command the way Claude Code's
    // shell does (a child that would outlive its parent) and keeps reading its input.
    try """
    #!/bin/bash
    read -r first
    echo '{"type":"system","subtype":"init"}'
    echo '{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"sleep 60"}}}'
    read -r answer
    echo '{"type":"assistant","message":{"id":"m1","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"sleep 60"}}]}}'
    bash -c 'exec -a \(marker) sleep 60' &
    while read -r line; do :; done
    exit 0
    """.write(to: fake, atomically: true, encoding: .utf8)
    chmod(fake.path, 0o755)

    let runner = ClaudeRunner(binary: fake, folder: dir)
    let asked = expectation(description: "asked")
    let ended = expectation(description: "ended")
    runner.onApproval = { rid, tool, input in
      XCTAssertEqual(tool, "Bash")
      runner.answer(rid, allow: true, input: input)
      asked.fulfill()
    }
    runner.onEnd = { _ in ended.fulfill() }
    try runner.start(request: "x", context: "")
    await fulfillment(of: [asked], timeout: 10)
    try await Task.sleep(nanoseconds: 1_500_000_000)
    XCTAssertFalse(pgrep(marker).isEmpty, "the long command runs")
    runner.stop()
    await fulfillment(of: [ended], timeout: 15)
    try await Task.sleep(nanoseconds: 3_500_000_000)
    XCTAssertTrue(pgrep(marker).isEmpty, "nothing is left running after Stop")
  }

  func pgrep(_ pattern: String) -> String {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
    p.arguments = ["-f", pattern]
    let out = Pipe()
    p.standardOutput = out
    try? p.run()
    let s = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    p.waitUntilExit()
    return s.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
