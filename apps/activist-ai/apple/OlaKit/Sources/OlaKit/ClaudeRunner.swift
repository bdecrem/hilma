#if os(macOS)
import Foundation

/// Claude Code, headless, in a folder on this Mac, with Bart's own Claude login (never an API key:
/// one in the environment is removed from the child's). The request goes in, and Claude Code's
/// events come out, as stream-json. Writes and commands ask through Claude Code's own permission
/// prompt (`--permission-mode manual --permission-prompt-tool stdio`): each can_use_tool question
/// waits for Bart's answer, the same as the web app's builder (frontdesk/claude.mjs). Under "Lots of
/// permissions" (PermissionSettings) the runner answers itself what acceptEdits would allow, plus
/// commands that name nothing outside the folder; everything else still asks. Decided at each
/// question, so a change in Settings applies to the next step.
public final class ClaudeRunner: ClaudeRun, @unchecked Sendable {
  /// Where Claude Code is on this Mac. A GUI app's PATH is minimal, so the usual places are looked
  /// at first, then a login shell is asked.
  public static func find() -> URL? {
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    let places = ["\(home)/.local/bin/claude", "\(home)/.claude/local/claude", "/opt/homebrew/bin/claude", "/usr/local/bin/claude", "\(home)/.npm-global/bin/claude"]
    for p in places where FileManager.default.isExecutableFile(atPath: p) { return URL(fileURLWithPath: p) }
    let sh = Process()
    sh.executableURL = URL(fileURLWithPath: "/bin/zsh")
    sh.arguments = ["-lc", "command -v claude"]
    let out = Pipe()
    sh.standardOutput = out
    sh.standardError = FileHandle.nullDevice
    guard (try? sh.run()) != nil else { return nil }
    let path = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    sh.waitUntilExit()
    return path.hasPrefix("/") && FileManager.default.isExecutableFile(atPath: path) ? URL(fileURLWithPath: path) : nil
  }

  /// Signed in, judged without reading any credential: Claude Code records the signed-in account
  /// in ~/.claude.json (`oauthAccount`); only that key's presence is looked at.
  public static func signedIn() -> Bool {
    let f = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".claude.json")
    guard let d = try? Data(contentsOf: f), let j = JSON.parse(d) else { return false }
    return !j["oauthAccount"].isNull
  }

  /// nil when Claude can run here; otherwise one plain sentence saying what is missing.
  public static func unavailable() -> String? {
    if find() == nil { return "Claude Code is not installed on this Mac." }
    if !signedIn() { return "Claude Code on this Mac is not signed in. Open Terminal, run claude, and sign in." }
    return nil
  }

  static let systemNote = """
  You are working for the person using Ola, in their own app, as "Claude", the fallback beside Ola's open-model agent. \
  Work in the current folder. Say plainly what you did and what you found.

  """ + AgentNotes.all

  public let binary: URL
  public let folder: URL
  public var onEvent: @Sendable (JSON) -> Void = { _ in }
  /// A can_use_tool question: request id, Claude Code's tool name, its input.
  public var onApproval: @Sendable (String, String, JSON) -> Void = { _, _, _ in }
  public var onEnd: @Sendable (Int32) -> Void = { _ in }
  /// Whether a question goes ahead without asking (default: Lots of permissions, in this folder).
  public var goesAhead: @Sendable (String, JSON) -> Bool
  private var process: Process?
  private var stdin: FileHandle?
  private let lock = NSLock()
  private var pending: Set<String> = []
  private var ended = false
  /// Every process Claude Code has started during this run, seen once a second. Stop ends the
  /// ones still alive after Claude Code itself has gone (2026-11-16: a `sleep` it ran outlived it).
  private var seen: Set<Int32> = []
  private var stopping = false

  private var queued: (String, String)?

  public init(binary: URL, folder: URL, request: String? = nil, context: String = "") {
    self.binary = binary
    self.folder = folder
    goesAhead = { tool, input in PermissionSettings.lots && PermissionSettings.claudeGoesAhead(tool: tool, input: input, folder: folder) }
    if let request { queued = (request, context) }
  }

  /// Starts the request given at creation (after the callbacks are set).
  public func begin() throws {
    guard let q = queued else { return }
    queued = nil
    try start(request: q.0, context: q.1)
  }

  public var pid: Int32 { process?.processIdentifier ?? 0 }
  public var isRunning: Bool { process?.isRunning ?? false }

  public func start(request: String, context: String) throws {
    let p = Process()
    p.executableURL = binary
    p.currentDirectoryURL = folder
    p.arguments = [
      "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
      "--no-session-persistence", "--permission-mode", "manual", "--permission-prompt-tool", "stdio",
      // Bart's own Claude Code settings, hooks and MCP servers stay out of these runs; his login does not.
      "--setting-sources", "project", "--strict-mcp-config",
      "--append-system-prompt", Self.systemNote,
      "--disallowedTools", "AskUserQuestion", "CronCreate", "CronDelete", "CronList", "ScheduleWakeup", "Monitor", "EnterWorktree", "ExitWorktree", "Workflow", "SendMessage", "ListAgents", "RemoteTrigger",
    ]
    var env = ProcessInfo.processInfo.environment
    for k in ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX"] { env[k] = nil }
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    // Ola's commands first (ola-made-by: who made a file, AgentNotes.madeBy), on the folder.
    let tools = LocalServer.support.appendingPathComponent("web-tools")
    env["PATH"] = "\(tools.path):\(home)/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    env["OLA_WORK"] = folder.path
    env["OLA_LIB"] = tools.path
    p.environment = env
    let inPipe = Pipe(), outPipe = Pipe(), errPipe = Pipe()
    p.standardInput = inPipe
    p.standardOutput = outPipe
    p.standardError = errPipe
    errPipe.fileHandleForReading.readabilityHandler = { h in _ = h.availableData } // never kept: it may quote content
    var buffer = Data()
    outPipe.fileHandleForReading.readabilityHandler = { [weak self] h in
      let d = h.availableData
      guard let self, !d.isEmpty else { return }
      buffer.append(d)
      while let nl = buffer.firstIndex(of: 0x0A) {
        let line = buffer[buffer.startIndex..<nl]
        buffer.removeSubrange(buffer.startIndex...nl)
        guard let e = JSON.parse(Data(line)) else { continue }
        self.handle(e)
      }
    }
    p.terminationHandler = { [weak self] proc in
      guard let self else { return }
      outPipe.fileHandleForReading.readabilityHandler = nil
      errPipe.fileHandleForReading.readabilityHandler = nil
      let (leftovers, stopping) = self.lock.withLock { () -> (Set<Int32>, Bool) in self.ended = true; return (self.seen, self.stopping) }
      if stopping { for c in leftovers where kill(c, 0) == 0 { kill(c, SIGTERM) } }
      self.onEnd(proc.terminationStatus)
    }
    try p.run()
    process = p
    let pid = p.processIdentifier
    DispatchQueue.global().async { [weak self] in
      while let self, !self.lock.withLock({ self.ended }) {
        let now = Self.descendants(of: pid)
        self.lock.withLock { self.seen.formUnion(now) }
        Thread.sleep(forTimeInterval: 0.5)
      }
    }
    stdin = inPipe.fileHandleForWriting
    var content: [JSON] = []
    if !context.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      content.append(["type": "text", "text": .string("The conversation so far, for context (Ola's replies and yours are marked):\n\n\(context)")])
    }
    content.append(["type": "text", "text": .string(request)])
    send(["type": "user", "message": ["role": "user", "content": .array(content)], "parent_tool_use_id": .null, "session_id": ""])
  }

  private func handle(_ e: JSON) {
    if e["type"].str == "control_request" {
      let rid = e["request_id"].str
      let q = e["request"]
      guard !rid.isEmpty else { return }
      if q["subtype"].str != "can_use_tool" {
        send(["type": "control_response", "response": ["subtype": "error", "request_id": .string(rid), "error": "not supported here"]])
        return
      }
      lock.withLock { _ = pending.insert(rid) }
      if goesAhead(q["tool_name"].str, q["input"]) { answer(rid, allow: true, input: q["input"]); return }
      onApproval(rid, q["tool_name"].str, q["input"])
      return
    }
    onEvent(e)
    // One request per run: once Claude Code has answered, its input ends and it exits.
    if e["type"].str == "result" {
      DispatchQueue.global().asyncAfter(deadline: .now() + 0.1) { [weak self] in try? self?.stdin?.close() }
    }
  }

  /// Bart's answer to one question.
  public func answer(_ requestID: String, allow: Bool, input: JSON) {
    guard lock.withLock({ pending.remove(requestID) }) != nil else { return }
    let response: JSON = allow
      ? ["behavior": "allow", "updatedInput": input]
      : ["behavior": "deny", "message": "Bart said no, so do not do this. Say what you would have done, and ask what he would like instead."]
    send(["type": "control_response", "response": ["subtype": "success", "request_id": .string(requestID), "response": response]])
  }

  /// Stop: an interrupt, every open question refused, the input closed, then the process and
  /// everything it started, so nothing is left running.
  public func stop() {
    guard let p = process, p.isRunning else { return }
    // What it has started now (a command it is running): ended too, even if Claude Code exits
    // first and they are left without a parent.
    let started = Self.descendants(of: p.processIdentifier)
    lock.withLock { stopping = true; seen.formUnion(started) }
    DispatchQueue.global().asyncAfter(deadline: .now() + 2.5) { [weak self] in
      guard let self else { return }
      for c in self.lock.withLock({ self.seen }) where kill(c, 0) == 0 { kill(c, SIGTERM) }
    }
    send(["type": "control_request", "request_id": .string("stop-\(p.processIdentifier)"), "request": ["subtype": "interrupt"]])
    for rid in lock.withLock({ Array(pending) }) { answer(rid, allow: false, input: [:]) }
    DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) { [weak self] in try? self?.stdin?.close() }
    DispatchQueue.global().asyncAfter(deadline: .now() + 3) { [weak self] in
      guard let self, let p = self.process, p.isRunning else { return }
      Self.killTree(p.processIdentifier, signal: SIGTERM)
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + 7) { [weak self] in
      guard let self, let p = self.process, p.isRunning else { return }
      Self.killTree(p.processIdentifier, signal: SIGKILL)
    }
  }

  private func send(_ j: JSON) {
    guard let h = stdin, !lock.withLock({ ended }) else { return }
    var d = j.data
    d.append(0x0A)
    try? h.write(contentsOf: d)
  }

  /// A process and all its descendants.
  public static func descendants(of pid: Int32) -> [Int32] {
    let ps = Process()
    ps.executableURL = URL(fileURLWithPath: "/bin/ps")
    ps.arguments = ["-A", "-o", "pid=,ppid="]
    let out = Pipe()
    ps.standardOutput = out
    try? ps.run()
    let text = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    ps.waitUntilExit()
    var children: [Int32: [Int32]] = [:]
    for line in text.split(separator: "\n") {
      let f = line.split(separator: " ").compactMap { Int32($0) }
      if f.count == 2 { children[f[1], default: []].append(f[0]) }
    }
    var all: [Int32] = []
    var queue = [pid]
    while let x = queue.popLast() {
      for c in children[x] ?? [] { all.append(c); queue.append(c) }
    }
    return all
  }

  static func killTree(_ pid: Int32, signal: Int32) {
    for c in descendants(of: pid).reversed() { kill(c, signal) }
    kill(pid, signal)
  }
}
#endif
