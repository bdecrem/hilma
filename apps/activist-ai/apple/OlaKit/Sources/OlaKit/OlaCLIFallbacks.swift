#if os(macOS)
import Foundation

// The `ola` command's side of the two fallbacks and the stretch card (Fallbacks.swift): the same
// words as the Mac app. `ola /hosted "…"`, `ola /claude "…"`, `ola /ola "…"`, `ola settings`, and
// before a plain request, the before-run check as a one-line question with three choices.
extension OlaCLI.Runner {
  var folderKey: String { folder.standardizedFileURL.path }

  /// A request typed after `ola`: a slash command, or one for Ola (after the before-run check).
  func request(_ text: String) async -> Int32 {
    switch SlashCommand.parse(text) {
    case .unknown(let w):
      OlaCLI.say("ola doesn\u{2019}t know /\(w). The commands: /hosted, /claude, /ola, /help.")
      return 2
    case .command(let c, var rest):
      switch c {
      case .help:
        for k in [SlashCommand.hosted, .claude, .ola] { print("/\(k.rawValue): \(k.summary)") }
        print("/new, /stop, /files: in the Ola app. ola --help lists the rest.")
        return 0
      case .new, .stop, .files, .deepseek:
        OlaCLI.say("/\(c.rawValue) works in the Ola app. Here, start again with ola, or press Ctrl-C to stop.")
        return 2
      case .claude, .hosted, .ola:
        // Alone: the next request goes there (asked for here).
        if rest.isEmpty {
          let who = c == .claude ? "Claude" : c == .hosted ? "the hosted open model" : "Ola"
          rest = OlaCLI.ask("Your request for \(who): ")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
          guard !rest.isEmpty else { OlaCLI.say("No request given, so nothing was done."); return 1 }
        }
        if c == .claude { return await claude(rest) }
        if c == .hosted { return await hosted(rest) }
        return await work(.run(rest))
      }
    case .none:
      return await plain(text)
    }
  }

  /// A plain request: the before-run check first (the web app's precheck), then Ola.
  func plain(_ text: String) async -> Int32 {
    let settings = FallbackSettings.load(folderKey)
    // Asked for Claude in plain words: never to the everyday model (it would say it cannot).
    if let nextOnly = ClaudeAsk.detect(text) {
      if let why = ClaudeRunner.unavailable() { OlaCLI.say(why); return 1 }
      if settings.claude && settings.stretch == .handover && settings.stretchTo == .claude, !nextOnly { return await claude(text) }
      guard isatty(STDIN_FILENO) == 1 else { OlaCLI.say("You asked for Claude Code. Type: ola /claude followed by your request."); return 2 }
      OlaCLI.say("Hand this to Claude Code? " + (nextOnly ? "You asked for Claude Code for your next request." : "You asked for Claude Code.") + " " + FallbackWords.leaves(.claude, provider: nil))
      let a = OlaCLI.ask("  [j] Just this once  [a] Always in this folder  [n] Not now: ")?.trimmingCharacters(in: .whitespaces).lowercased() ?? "n"
      guard a == "j" || a == "a" else { OlaCLI.say("Nothing was sent."); return 0 }
      if a == "a" {
        var s = settings
        if !s.claude {
          OlaCLI.say(FallbackWords.claudeConsent)
          guard OlaCLI.ask("Turn it on for this folder? [y/n]: ")?.lowercased().hasPrefix("y") == true else { OlaCLI.say("Left off. Nothing was sent."); return 0 }
          s.claude = true
        }
        s.stretch = .handover
        s.stretchTo = .claude
        FallbackSettings.save(s, for: folderKey)
      }
      var request = text
      if nextOnly {
        request = OlaCLI.ask("Your request for Claude: ")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !request.isEmpty else { OlaCLI.say("No request given, so nothing was done."); return 1 }
      }
      return await claude(request)
    }
    guard settings.stretch != .never, let reason = Stretch.precheck(text, files: Stretch.localFiles(folder)) else { return await work(.run(text)) }
    var offers: [Fallback] = []
    let status = await hostedStatus()
    if status.unavailable == nil { offers.append(.hosted) }
    if ClaudeRunner.unavailable() == nil { offers.append(.claude) }
    guard !offers.isEmpty else { return await work(.run(text)) }
    if settings.stretch == .handover, let f = offers.contains(settings.stretchTo) && settings.isOn(settings.stretchTo) ? settings.stretchTo : offers.first(where: { settings.isOn($0) }) {
      OlaCLI.say(FallbackWords.handoff(reason, to: f, provider: status.provider))
      return f == .claude ? await claude(text) : await hosted(text, known: status)
    }
    // No terminal to ask in: Ola goes on, as with Not now.
    guard isatty(STDIN_FILENO) == 1 else { return await work(.run(text)) }
    var target = offers[0]
    while true {
      OlaCLI.say(FallbackWords.question(target, provider: status.provider, reason: reason) + " " + reason.why + " " + FallbackWords.leaves(target, provider: status.provider))
      let other = offers.first { $0 != target }
      let a = OlaCLI.ask("  [j] Just this once  [a] Always in this folder  [n] Not now\(other.map { "  [o] or \($0 == .claude ? "Claude" : "the hosted open model")" } ?? ""): ")?.trimmingCharacters(in: .whitespaces).lowercased() ?? "n"
      switch a {
      case "j", "just this once":
        return target == .claude ? await claude(text) : await hosted(text, known: status)
      case "a", "always", "always in this folder":
        var s = settings
        if !s.isOn(target) {
          OlaCLI.say(target == .claude ? FallbackWords.claudeConsent : FallbackWords.hostedConsent(status.provider))
          guard OlaCLI.ask("Turn it on for this folder? [y/n]: ")?.lowercased().hasPrefix("y") == true else { continue }
          if target == .claude { s.claude = true } else { s.hosted = true }
        }
        s.stretch = .handover
        s.stretchTo = target
        FallbackSettings.save(s, for: folderKey)
        OlaCLI.say("From now on, requests like this go to \(target.named(provider: status.provider)) without asking, in this folder. ola settings changes it.")
        return target == .claude ? await claude(text) : await hosted(text, known: status)
      case "o" where other != nil:
        target = other!
      default:
        return await work(.run(text))
      }
    }
  }

  /// Whether the hosted open model is there for this Mac's caller: signed in, through the
  /// account's door; on the owner's own setup, through the machine's forwarder.
  func hostedStatus() async -> HostedStatus {
    if AccountKeeper.session != nil {
      guard let d = try? await openDoor() else { return HostedStatus(unavailable: HostedStatus.unknown) }
      return await HostedStatus.check(baseURL: d.url.absoluteString + "/v1", token: d.key)
    }
    if let t = LocalSettings.token { return await HostedStatus.check(baseURL: LocalServer.defaultModelURL, token: t) }
    return HostedStatus(unavailable: notSignedIn)
  }

  /// `ola /hosted "…"`: the same agent here, with the model `hosted` for this one request.
  func hosted(_ text: String, known: HostedStatus? = nil) async -> Int32 {
    let status: HostedStatus
    if let known { status = known } else { status = await hostedStatus() }
    if let why = status.unavailable { OlaCLI.say(why); return 1 }
    OlaCLI.say("Handing this to the hosted open model at \(status.provider ?? "an outside company"). Your request and the parts of your files it reads leave Ola.")
    let code = await work(.run(text), model: "ola/hosted")
    OlaCLI.say(FallbackWords.hostedAnswered(status.provider))
    return code
  }

  /// `ola /claude "…"`: Claude Code on this Mac, in this folder, with the person's own Claude login.
  /// Its steps are said in Ola's words as they finish; writes and commands ask here first.
  func claude(_ text: String) async -> Int32 {
    guard let bin = ClaudeRunner.find() else {
      OlaCLI.say("Claude Code is not installed on this Mac. Install it (claude.com/claude-code), sign in once with claude, then try again.")
      return 1
    }
    guard ClaudeRunner.signedIn() else {
      OlaCLI.say("Claude Code on this Mac is not signed in. Run claude once and sign in, then try again.")
      return 1
    }
    OlaCLI.say("Handing this to Claude Code on this Mac. What it reads goes to Anthropic.")
    let run = ClaudeRunner(binary: bin, folder: folder, request: text, context: "")
    let box = ClaudeTerminal(directory: folder.path, request: text)
    let tty = isatty(STDIN_FILENO) == 1
    let done = DispatchSemaphore(value: 0)
    run.onEvent = { e in box.apply(e) }
    run.onApproval = { [weak run] rid, tool, input in
      // One question at a time, on its own thread (reading the terminal blocks).
      Thread.detachNewThread {
        let allow = box.ask(rid, tool, input, tty: tty)
        run?.answer(rid, allow: allow, input: input)
      }
    }
    run.onEnd = { code in box.end(code); done.signal() }
    signal(SIGINT, SIG_IGN)
    let stop = DispatchSource.makeSignalSource(signal: SIGINT, queue: .global())
    stop.setEventHandler { [weak run] in OlaCLI.say("\nStopping Claude."); run?.stop() }
    stop.resume()
    defer { stop.cancel(); signal(SIGINT, SIG_DFL) }
    do { try run.begin() } catch {
      OlaCLI.say("Claude Code didn\u{2019}t start here. \(error.localizedDescription)")
      return 1
    }
    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
      DispatchQueue.global().async { done.wait(); c.resume() }
    }
    let t = box.turn
    if !t.shownAnswer.isEmpty { print(t.shownAnswer) }
    if let e = t.error { OlaCLI.say(e.text) }
    OlaCLI.say("Answered by Claude, outside Ola.")
    return t.status == .done ? 0 : 1
  }

  /// `ola settings`: this folder's fallbacks; `ola settings hosted on`, `claude off`,
  /// `stretch suggest|handover|never`, `stretch-to hosted|claude`.
  func settings(_ a: [String]) async -> Int32 {
    var s = FallbackSettings.load(folderKey)
    if !a.isEmpty {
      switch (a.first!, a.count == 2 ? a[1] : "") {
      case ("hosted", "on"), ("claude", "on"):
        let f: Fallback = a[0] == "hosted" ? .hosted : .claude
        if !s.isOn(f) {
          let status = f == .hosted ? await hostedStatus() : HostedStatus(unavailable: ClaudeRunner.unavailable())
          if let why = status.unavailable { OlaCLI.say(why); return 1 }
          OlaCLI.say(f == .claude ? FallbackWords.claudeConsent : FallbackWords.hostedConsent(status.provider))
          guard OlaCLI.ask("Turn it on for this folder? [y/n]: ")?.lowercased().hasPrefix("y") == true else { OlaCLI.say("Left off."); return 1 }
          if f == .claude { s.claude = true } else { s.hosted = true }
        }
      case ("hosted", "off"): s.hosted = false
      case ("claude", "off"): s.claude = false
      case ("stretch", let m) where StretchMode(rawValue: m) != nil: s.stretch = StretchMode(rawValue: m)!
      case ("stretch-to", let f) where Fallback(rawValue: f) != nil: s.stretchTo = Fallback(rawValue: f)!
      case ("permissions", let m) where PermissionMode(rawValue: m) != nil:
        // The local runtime's switch (this Mac, `ola`, the phone through this Mac). The Ola
        // machine keeps its own (OLA-142), changed in the apps when working there.
        if let line = await PermissionSettings.set(PermissionMode(rawValue: m)!) { OlaCLI.say(line) }
      default:
        OlaCLI.say("Say one of: ola settings permissions lots|ask, hosted on|off, claude on|off, stretch suggest|handover|never, stretch-to hosted|claude.")
        return 2
      }
      FallbackSettings.save(s, for: folderKey)
    }
    let status = await hostedStatus()
    print("Permissions on this Mac (the local runtime; the Ola machine keeps its own): \(PermissionSettings.mode.label)")
    print("Folder:   \((folder.path as NSString).abbreviatingWithTildeInPath)")
    print("Fallback to Claude:                    \(s.claude ? "on" : "off") (\(ClaudeRunner.unavailable() ?? "Claude Code on this Mac, with your own Claude login"))")
    print("Fallback to the hosted open model:     \(s.hosted ? "on" : "off") (\(status.unavailable ?? "at \(status.provider ?? "an outside company")\(status.monthLine.map { ", \($0)" } ?? "")"))")
    print("When a request looks like a stretch:   \(s.stretch.label)\(s.stretch == .handover && s.claude && s.hosted ? ", to \(s.stretchTo == .claude ? "Claude" : "the hosted open model")" : "")")
    print("Typing /hosted or /claude before a request hands just that one over, even with these off.")
    return 0
  }
}

/// A Claude Code run said in the terminal: the steps in Ola's words as they finish, the questions
/// asked one at a time, the turn kept for the reply at the end.
final class ClaudeTerminal: @unchecked Sendable {
  private let lock = NSLock()
  private let ask = NSLock()
  private var fold: ClaudeFold
  private(set) var turn: Turn
  private var said: Set<String> = []
  private var always: Set<String> = []

  init(directory: String, request: String) {
    fold = ClaudeFold(directory: directory)
    turn = Turn(id: "claude-cli", request: request, at: .now, status: .working, engine: .claude)
  }

  func apply(_ e: JSON) {
    let lines: [String] = lock.withLock {
      fold.apply(e, to: &turn)
      var out: [String] = []
      for s in turn.steps where (s.status == .done || s.status == .failed) && !said.contains(s.id) {
        said.insert(s.id)
        out.append("  \(s.status == .done ? "\u{2713}" : "\u{2717}") \(s.verb)\(s.object.isEmpty ? "" : " \(s.object)")\(s.status == .failed ? ": \(s.error ?? "did not work")" : "")")
      }
      return out
    }
    for l in lines { OlaCLI.say(l) }
  }

  /// One question: Allow once, Always allow (this kind of step, for this run), Reject.
  func ask(_ id: String, _ tool: String, _ input: JSON, tty: Bool) -> Bool {
    ask.lock()
    defer { ask.unlock() }
    let kind = Plain.claudeTool(tool)
    if lock.withLock({ always.contains(kind) }) { return true }
    let w = Plain.describeClaudeApproval(tool, input: input, dir: lock.withLock { fold.directory })
    OlaCLI.say(w.title)
    for i in w.items {
      OlaCLI.say("  \(i.label)")
      if let d = i.detail, !d.isEmpty { OlaCLI.say(d.split(separator: "\n", omittingEmptySubsequences: false).prefix(12).map { "    \($0)" }.joined(separator: "\n")) }
    }
    guard tty else {
      OlaCLI.say("  Not done: this needs your yes, and there is no terminal to ask in. Run it in a terminal.")
      return false
    }
    let a = OlaCLI.ask("  [o] Allow once  [a] Always allow  [r] Reject: ")?.trimmingCharacters(in: .whitespaces).lowercased() ?? "r"
    if a == "a" { _ = lock.withLock { always.insert(kind) } }
    return a == "o" || a == "a"
  }

  func end(_ code: Int32) {
    lock.withLock {
      if turn.isRunning {
        turn.status = code == 0 ? .done : .failed
        if code != 0 { turn.error = Problem(text: "Claude stopped before it finished.", detail: "exit \(code)") }
      }
    }
  }
}
#endif
