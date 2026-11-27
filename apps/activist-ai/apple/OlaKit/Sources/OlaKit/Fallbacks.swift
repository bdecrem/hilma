import Foundation

// The two fallbacks and the stretch card, on the Mac and in the `ola` command: the rules are the web
// app's (apps/activist-ai/README.md, "Fallback to a hosted open model, and the stretch card";
// web/src/lib/steps.ts precheck, stuckReason, STRETCH_WHY; web/src/components/StretchCard.tsx).
// Keep the words and the thresholds in step with those.
//
// What differs on a Mac: the settings are per folder (the web app's are per project), and the
// person is the one who decides, so "Just this once" and "Always in this folder" are always theirs.
// "Fallback to Claude" is Claude Code on this Mac with the person's own Claude login. The hosted open
// model is reached through Ola (the account's door, or the owner's forwarder), only for an account
// the person who runs Ola let use it (admin.mjs app-hosted), on the person's own weekly allowance.

/// Where a request can be handed over to.
public enum Fallback: String, CaseIterable, Codable, Sendable {
  case hosted, claude

  /// As the card names it: "Claude", "the hosted open model at Together AI".
  public func named(provider: String?) -> String {
    switch self {
    case .claude: "Claude"
    case .hosted: "the hosted open model at \(provider ?? "an outside company")"
    }
  }

  /// The engine a turn handed over is marked with.
  public var engine: Turn.Engine { self == .claude ? .claude : .hosted }

  /// Where what is handed over goes.
  public func place(provider: String?) -> String {
    switch self {
    case .claude: "Anthropic"
    case .hosted: provider ?? "an outside company"
    }
  }
}

/// "When a request looks like a stretch": suggest it and let me decide (the default), hand it over
/// without asking, or never suggest.
public enum StretchMode: String, CaseIterable, Codable, Sendable {
  case suggest, handover, never

  public var label: String {
    switch self {
    case .suggest: "Suggest it and let me decide"
    case .handover: "Hand it over without asking"
    case .never: "Never suggest"
    }
  }
}

/// Why a request looks like a stretch: during a run (error, budget, tools) or before it (big_files,
/// long_build, and the simple confidence check of OLA-144: many_files, design).
public enum StretchReason: String, Codable, Sendable {
  case error, budget, tools, bigFiles = "big_files", longBuild = "long_build", manyFiles = "many_files", design
  /// The person asked for Claude or Claude Code in plain words ("use claude code for this").
  case asked
  /// What Ola itself counted during a run (OLA-479, `Escalate`): failed test rounds, the same step
  /// again with nothing changed, replies cut off at the length limit, work that computes handed over untested.
  case tests, loop, length, untested

  /// The one sentence of why (STRETCH_WHY in steps.ts).
  public var why: String {
    switch self {
    case .error: "Ola\u{2019}s own model ran into an error on this request."
    case .budget: "Ola\u{2019}s own model reached the most it may do for one request."
    case .tools: "Three of Ola\u{2019}s steps in a row did not work."
    case .bigFiles: "The files this request names are much larger than Ola\u{2019}s own model can read at once."
    case .longBuild: "This is a long build in many parts."
    case .manyFiles: "This request covers many documents at once."
    case .design: "Design is the kind of work Ola\u{2019}s own model is weakest at today."
    case .asked: "You asked for Claude Code."
    case .tests: "Ola\u{2019}s own model\u{2019}s tests of its work failed \(Escalate.failedTestRounds) times."
    case .loop: "Ola\u{2019}s own model did the same step \(Escalate.sameSteps) times without getting further."
    case .length: "Ola\u{2019}s own model\u{2019}s replies were cut off at its length limit \(Escalate.lengthHits) times."
    case .untested: "Ola\u{2019}s own model handed over work that computes without testing it, even when asked to."
    }
  }
}

/// A folder's fallback settings. Both fallbacks are off until the person turns them on.
public struct FallbackSettings: Codable, Equatable, Sendable {
  public var claude = false
  public var hosted = false
  public var stretch: StretchMode = .suggest
  /// Where a handover goes when both are on (the hosted open model by default).
  public var stretchTo: Fallback = .hosted

  public init(claude: Bool = false, hosted: Bool = false, stretch: StretchMode = .suggest, stretchTo: Fallback = .hosted) {
    self.claude = claude
    self.hosted = hosted
    self.stretch = stretch
    self.stretchTo = stretchTo
  }

  public func isOn(_ f: Fallback) -> Bool { f == .claude ? claude : hosted }

  public static let key = "ola.fallbacks"
  /// The machine's own folder (On the Ola machine), as a key.
  public static let machineFolder = "machine"

  /// The settings for a folder (its path, or `machineFolder`). A folder with none of its own starts
  /// with both off, except that the old app-wide Claude switch, if it was on, carries over.
  static var store: UserDefaults {
    #if os(macOS)
    LocalSettings.defaults
    #else
    UserDefaults.standard
    #endif
  }

  public static func load(_ folder: String, defaults: UserDefaults? = nil) -> FallbackSettings {
    let defaults = defaults ?? store
    let all = defaults.dictionary(forKey: key) as? [String: Data] ?? [:]
    if let d = all[folder], let s = try? JSONDecoder().decode(FallbackSettings.self, from: d) { return s }
    return FallbackSettings(claude: defaults.bool(forKey: "ola.claude.enabled"))
  }

  public static func save(_ s: FallbackSettings, for folder: String, defaults: UserDefaults? = nil) {
    let defaults = defaults ?? store
    var all = defaults.dictionary(forKey: key) as? [String: Data] ?? [:]
    all[folder] = try? JSONEncoder().encode(s)
    defaults.set(all, forKey: key)
  }
}

/// The consent texts, asked when a switch is turned on (the web app's, with "this Mac" and "Ola").
public enum FallbackWords {
  public static let claudeConsent = "When this is on, you can hand a request to Claude Code, run with Anthropic\u{2019}s Claude, using your own Claude login on this Mac. Your request, and the parts of your files Claude reads to answer it, leave this Mac and go to Anthropic. It is off unless you turn it on. Every use is marked, and you can turn it off at any time."
  public static func hostedConsent(_ provider: String?) -> String {
    let p = provider ?? "an outside company"
    return "When this is on, you can hand a request to an open model that runs at \(p), an outside company, instead of on Ola\u{2019}s own machine. Your request, and the parts of your files Ola reads to answer it, leave Ola and go to \(p). It is off unless you turn it on. Every use is marked, and you can turn it off at any time."
  }
  /// The line on a reply the hosted open model wrote (or a picked choice: "Answered by DeepSeek V4
  /// Pro, an outside open model at Together AI, not Ola's own model.").
  public static func hostedAnswered(_ provider: String?, model: String? = nil) -> String {
    if let n = HostedPick.name(model) { return "Answered by \(n), an outside open model\(provider.map { " at \($0)" } ?? ""), not Ola\u{2019}s own model." }
    return "Answered by the hosted open model\(provider.map { " at \($0)" } ?? ""), outside Ola."
  }
  /// The sentence when a request was handed over without asking.
  public static func handoff(_ reason: StretchReason, to f: Fallback, provider: String?) -> String {
    "\(reason.why) This folder hands such requests to \(f.named(provider: provider)), so it is working on it."
  }
  /// What leaves, on the card.
  public static func leaves(_ f: Fallback, provider: String?) -> String {
    "If you hand it over, your request, this conversation so far, and the parts of your files it reads go to \(f.place(provider: provider))."
  }
  /// The card's question.
  public static func question(_ f: Fallback, provider: String?, reason: StretchReason? = nil) -> String {
    if reason == .asked { return "Hand this to Claude Code?" }
    return "This may be a stretch for Ola\u{2019}s own model. Hand it to \(f.named(provider: provider))?"
  }
}

/// When a request looks like a stretch: the web app's checks, with its thresholds.
public enum Stretch {
  /// Ola's own model's context, in tokens; bytes per token; past this many contexts the named files are too big.
  public static let contextTokens = 131_072
  public static let bytesPerToken = 4
  public static let overContext = 3
  static let textLike = try! NSRegularExpression(pattern: #"\.(txt|md|markdown|csv|tsv|json|jsonl|ndjson|html?|xml|ya?ml|log|py|js|ts|sql|tex|rtf)$"#, options: .caseInsensitive)
  /// A long multi-part build: at least 8 listed parts, in a request of at least 800 characters, that asks for something to be made.
  public static let buildParts = 8
  public static let buildMinChars = 800
  static let buildVerb = try! NSRegularExpression(pattern: #"\b(build|make|create|write|set up|develop|implement|design)\b"#, options: .caseInsensitive)
  static let listed = try! NSRegularExpression(pattern: #"^\s*(\d{1,3}[.)]|[-*\u2022])\s+\S"#)
  // The simple confidence check (OLA-144; the web app's STRETCH_CHECKS, the same thresholds): many
  // documents (at least 8 of the folder's files named, or "all / every / each" of them in a folder
  // with at least 20 documents), or a designed thing to be made.
  public static let manyNamed = 8
  public static let manyDocs = 20
  static let allOfThem = try! NSRegularExpression(pattern: #"\b(all|every|each)\b[^.?!\n]{0,40}\b(files?|documents?|docs|pdfs?|papers?|reports?|studies|letters|transcripts|minutes|laws|pages)\b"#, options: .caseInsensitive)
  static let docLike = try! NSRegularExpression(pattern: #"\.(pdf|docx?|txt|md|markdown|rtf|csv|tsv|xlsx?|pptx?|html?|json|epub)$"#, options: .caseInsensitive)
  static let designThing = try! NSRegularExpression(pattern: #"\b(landing page|home ?page|web ?site|poster|flyer|logo|branding|brochure)\b"#, options: .caseInsensitive)
  static let designVerb = try! NSRegularExpression(pattern: #"\b(build|make|create|draw|lay ?out|restyle)\b"#, options: .caseInsensitive)
  /// "Design a…" outright ("the design of this survey" is a question, not a request to make).
  static let designAsk = try! NSRegularExpression(pattern: #"\b(re)?design (a|an|the|me|us|our|my|some|this|that)\b"#, options: .caseInsensitive)

  /// A design request gets no card before a run and goes to Ola, which hands it to the design model
  /// (OLA-168, Bart, Nov 20; the website's STRETCH_CHECKS.designBeforeRun is false too).
  public static let designBeforeRun = false

  static func has(_ r: NSRegularExpression, _ s: String) -> Bool { r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil }

  /// Before a run: does the request alone look like a stretch? `files` are the folder's files with
  /// their sizes in bytes (relative paths); only text files the request names count.
  public static func precheck(_ request: String, files: [(path: String, size: Int)]) -> StretchReason? {
    let text = request.lowercased()
    let named = files.filter { f in
      has(textLike, f.path) && (text.contains(f.path.lowercased()) || text.contains((f.path.split(separator: "/").last.map(String.init) ?? f.path).lowercased()))
    }
    let bytes = named.reduce(0) { $0 + $1.size }
    if bytes / bytesPerToken > overContext * contextTokens { return .bigFiles }
    let namedAny = files.filter { f in
      text.contains(f.path.lowercased()) || text.contains((f.path.split(separator: "/").last.map(String.init) ?? f.path).lowercased())
    }.count
    if namedAny >= manyNamed { return .manyFiles }
    if has(allOfThem, request), files.filter({ has(docLike, $0.path) }).count >= manyDocs { return .manyFiles }
    let parts = request.split(separator: "\n", omittingEmptySubsequences: false).filter { has(listed, String($0)) }.count
    if request.count >= buildMinChars && parts >= buildParts && has(buildVerb, request) { return .longBuild }
    if designBeforeRun, has(designAsk, request) || (has(designThing, request) && has(designVerb, request)) { return .design }
    return nil
  }

  /// During a run, by what can be seen: it ended in an error; it hit its step or token budget;
  /// three tool calls in a row did not work. Never a score.
  public static func stuck(_ t: Turn) -> StretchReason? {
    let detail = "\(t.error?.text ?? "") \(t.error?.detail ?? "")"
    if detail.range(of: #"429|quota|used up|max(imum)? ?steps|step limit|context length|too long|max_tokens"#, options: [.regularExpression, .caseInsensitive]) != nil { return .budget }
    var row = 0
    for s in t.steps { row = s.status == .failed ? row + 1 : 0 }
    if row >= 3 { return .tools }
    if t.status == .failed { return .error }
    return nil
  }

  /// The folder's text files and their sizes, for `precheck` (hidden folders and node_modules
  /// skipped, at most `limit` files): only On this Mac, where the folder is here.
  public static func localFiles(_ folder: URL, limit: Int = 4000) -> [(path: String, size: Int)] {
    guard let e = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey], options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { return [] }
    var out: [(String, Int)] = []
    let base = folder.standardizedFileURL.path
    for case let u as URL in e {
      if u.lastPathComponent == "node_modules" { e.skipDescendants(); continue }
      guard let v = try? u.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]), v.isRegularFile == true else { continue }
      let p = u.standardizedFileURL.path
      out.append((p.hasPrefix(base + "/") ? String(p.dropFirst(base.count + 1)) : u.lastPathComponent, v.fileSize ?? 0))
      if out.count >= limit { break }
    }
    return out
  }
}

/// OLA-479, the web app's `ESCALATE` (web/src/lib/steps.ts), the same settings in one place: for a
/// request that computes a test must run before Ola hands over, and Ola itself (from the steps it
/// sees, never by asking the model) counts failed test rounds, the same step repeated with no change
/// and replies cut off at the length limit, and hands the request to the bigger model at a threshold.
public enum Escalate {
  /// Where a stuck request goes: the hosted model, only while its id is this one (never a Chinese model).
  public static let to = "thinkingmachines/Inkling-2-Small"
  public static let failedTestRounds = 2
  public static let sameSteps = 3
  public static let lengthHits = 2
  /// A request that computes (a test must run): formulas, totals, a calculator, a game's rules, an answer worked out.
  public static let computes = try! NSRegularExpression(pattern: #"\b(spreadsheets?|calculat\w*|formulas?|converter|convert|totals?|sums?|averages?|budget|tax|tips?|interest|loan|mortgage|scores?|scoring|game|quiz|puzzle|sudoku|chess|tic[- ]tac[- ]toe)\b"#, options: .caseInsensitive)
  /// A step that ran a test.
  public static let test = try! NSRegularExpression(pattern: #"\b(ola-test|pytest|unittest)\b|^python3?\s+\S*test\w*\.py\b"#)
  public static let reasons: Set<StretchReason> = [.tests, .loop, .length, .untested]

  /// The one nudge, sent as a request in the model's conversation, marked so the apps show it as Ola's.
  public static let nudgeMark = "<ola-nudge>"
  public static let nudge = "\(nudgeMark)From Ola, not the person: this request computes, and no test of its logic has run. Write 8 to 10 cases with the answers you expect to a test file, run them with ola-test, fix what fails (at most three rounds), then hand it over and say how many cases passed."
  /// A request as the person sees it, and whether it is Ola's nudge.
  public static func nudgeOf(_ text: String) -> (request: String, nudge: Bool) {
    text.hasPrefix(nudgeMark) ? ("Ola asked its model to run a test of the logic before handing it over.", true) : (text, false)
  }

  /// A checker's test switch (the web's `?escalate=`): the launch argument `-OlaEscalate tests|loop|length|untested`
  /// treats every run as if Ola had counted that (untested: as if no test ran, so the nudge comes first).
  public static let forced: StretchReason? = UserDefaults.standard.string(forKey: "OlaEscalate").flatMap(StretchReason.init(rawValue:)).flatMap { reasons.contains($0) ? $0 : nil }

  static func isShell(_ s: Step) -> Bool { s.tool == "shell" || s.tool == "bash" }
  static let changes: Set<String> = ["write", "edit", "patch", "apply_patch", "multiedit"]

  /// Did a step of this turn run a test?
  public static func testRan(_ t: Turn) -> Bool { t.steps.contains { isShell($0) && Stretch.has(test, $0.input) } }

  /// During a run or after it, by what can be seen: failed test rounds, the same step again with
  /// nothing changed in between (a file written again with the same words counts), replies cut off.
  public static func escalation(_ t: Turn) -> StretchReason? {
    if (t.cutOff ?? 0) >= lengthHits { return .length }
    if t.steps.filter({ isShell($0) && Stretch.has(test, $0.input) && $0.status == .failed }).count >= failedTestRounds { return .tests }
    var seen: [String: Int] = [:]
    for s in t.steps where !s.input.isEmpty {
      let key = "\(s.tool)\n\(s.input)"
      let n = (seen[key] ?? 0) + 1
      if n >= sameSteps { return .loop }
      if changes.contains(s.tool) { seen = seen.filter { changes.contains(String($0.key.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)[0])) } }
      seen[key] = n
    }
    return nil
  }
}

/// The card in the conversation: Ola says a request may be a stretch, and the person decides.
public struct StretchSuggestion: Equatable, Sendable, Identifiable {
  public var id: String
  public var sessionID: String?
  public var request: String
  public var reason: StretchReason
  /// What the card offers first; `offers` is everything set up here (the other one is "or …").
  public var target: Fallback
  public var offers: [Fallback]
  /// The Ola turn that got stuck, or nil when the request has not been sent yet (before a run).
  public var turnID: String?
  /// The person asked for Claude for the next thing ("use claude code for this next thing"):
  /// Just this once applies to the next request, and nothing is sent now.
  public var nextOnly = false

  public init(id: String = UUID().uuidString, sessionID: String?, request: String, reason: StretchReason, target: Fallback, offers: [Fallback], turnID: String?) {
    self.id = id
    self.sessionID = sessionID
    self.request = request
    self.reason = reason
    self.target = target
    self.offers = offers
    self.turnID = turnID
  }

  public var other: Fallback? { offers.first { $0 != target } }

  /// Its why line: the reason, then whether Ola started.
  public var whyLine: String {
    if reason == .asked { return nextOnly ? "You asked for Claude Code for your next request. Ola has not started on anything." : "You asked for Claude Code. Ola has not started on it." }
    return "\(reason.why) \(turnID == nil ? "Ola has not started on it." : "What Ola did so far stays as it is.")"
  }
  public var question: String { FallbackWords.question(target, provider: nil, reason: reason) }

  public enum Answer: String, Sendable { case once, always, notNow }
}

/// A picked choice (OLA-337): another outside open model at the hosted provider, under its own
/// name at the gateway (DeepSeek V4 Pro, `deepseek-v4-pro`). Only for a request the person picks it
/// for, in the Mac app: "Try again with" and the choice in the box. Never a default or a backup.
public struct HostedPick: Equatable, Hashable, Sendable, Identifiable {
  /// The gateway's name for it, and opencode's model id.
  public var id: String
  /// As people read it: "DeepSeek V4 Pro".
  public var name: String
  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }

  /// The ones this app knows by name, so a reply is marked truthfully even before the gateway is asked.
  public static let known: [String: String] = ["deepseek-v4-pro": "DeepSeek V4 Pro"]
  /// The model id the plain hosted open model runs under.
  public static let plain = "hosted"
  /// Whether a step's model id is an outside open model at the hosted provider (`hosted` or a pick).
  public static func isHosted(_ model: String?) -> Bool { model == plain || (model.map { known[$0] != nil } ?? false) }
  /// "DeepSeek V4 Pro" for a pick, nil for the plain hosted model or an unknown one.
  public static func name(_ model: String?) -> String? { model.flatMap { known[$0] } }

  /// From the gateway's (or the front desk's) list: `[{id, name}]`, only the ones this app knows.
  public static func list(_ j: JSON) -> [HostedPick] {
    j.array.compactMap { x in
      let id = x["id"].str
      guard let mine = known[id] else { return nil }
      return HostedPick(id: id, name: x["name"].string ?? mine)
    }
  }
}

/// Who does a request, as the box and "Try again with" list them in the Mac app (OLA-337): Ola's own
/// model, the hosted open model or one of its picked choices, or Claude.
public enum EngineChoice: Hashable, Sendable, Identifiable {
  case ola
  /// The hosted provider, with the model: `hosted` or a pick's id (`deepseek-v4-pro`).
  case hosted(String)
  case claude

  public var id: String {
    switch self {
    case .ola: "ola"
    case .hosted(let m): m
    case .claude: "claude"
    }
  }

  /// As the menus say it: "Ola", "Hosted", "DeepSeek V4 Pro", "Claude".
  public var name: String {
    switch self {
    case .ola: "Ola"
    case .hosted(let m): HostedPick.name(m) ?? "Hosted"
    case .claude: "Claude"
    }
  }

  public var engine: Turn.Engine {
    switch self {
    case .ola: .ola
    case .hosted: .hosted
    case .claude: .claude
    }
  }

  /// Every choice the Mac app can offer, in menu order; each has a typed command and a shortcut.
  public static let all: [EngineChoice] = [.ola, .hosted(HostedPick.plain), .hosted("deepseek-v4-pro"), .claude]

  /// The command typed in the box for it: "/ola", "/hosted", "/deepseek", "/claude".
  public var command: String {
    switch self {
    case .ola: "/ola"
    case .hosted(let m): m == HostedPick.plain ? "/hosted" : m == "deepseek-v4-pro" ? "/deepseek" : "/\(m)"
    case .claude: "/claude"
    }
  }

  /// Its number for the shortcuts: Option-Command-<n> picks it for the box, Control-Option-Command-<n>
  /// sends the last request again with it.
  public var digit: Int { (Self.all.firstIndex(of: self) ?? 0) + 1 }

  /// The menu's hint beside the name: "/deepseek  \u{2325}\u{2318}3".
  public var hint: String { "\(command)  \u{2325}\u{2318}\(digit)" }

  /// A name as a checker types it ("DeepSeek V4 Pro", "deepseek", "/deepseek"), or nil.
  public static func named(_ s: String) -> EngineChoice? {
    let t = s.trimmingCharacters(in: .whitespaces).lowercased()
    return all.first { $0.name.lowercased() == t || $0.command == t || $0.command.dropFirst() == t }
  }

  /// The box's words for the pick: "Ola" by default; a pick says that it sticks for this session.
  public func boxLabel(nextOnly: Bool) -> String {
    self == .ola ? "Ola" : nextOnly ? "\(name), next message only" : "\(name), this session"
  }

  /// The choice a finished turn was made by.
  public static func of(_ t: Turn) -> EngineChoice {
    switch t.engine {
    case .ola: .ola
    case .hosted: .hosted(t.model ?? HostedPick.plain)
    case .claude: .claude
    }
  }
}

/// "Try again with" in the Mac app (OLA-337): under every finished request, whatever came of it
/// (an answer, a failure, a stop, a thank-you) and whoever did it, with every model that can do it here.
public enum TryAgain {
  public static func offered(_ t: Turn, choices: [EngineChoice]) -> Bool {
    !t.isRunning && !choices.isEmpty && !t.request.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}

/// What the hosted open model looks like from here: set up or not, the provider, and this month.
public struct HostedStatus: Equatable, Sendable {
  /// nil when a request can be handed over; else one sentence why not.
  public var unavailable: String?
  public var provider: String?
  public var usedUSD: Double?
  public var capUSD: Double?
  /// The picked choices served at the same provider (OLA-337), under the same grant and month.
  public var picks: [HostedPick] = []
  /// In a cloud project whose switch is off: the owner hands each request over just this once.
  public var once = false
  /// The provider's id of the hosted model ("thinkingmachines/Inkling-2-Small"), when told (OLA-479).
  public var model: String?

  public init(unavailable: String?, provider: String? = nil, usedUSD: Double? = nil, capUSD: Double? = nil, picks: [HostedPick] = [], once: Bool = false, model: String? = nil) {
    self.model = model
    self.unavailable = unavailable
    self.provider = provider
    self.usedUSD = usedUSD
    self.capUSD = capUSD
    self.picks = picks
    self.once = once
  }

  public static let notSetUp = "Ola has no hosted open model set up yet."
  public static let notForYou = "Your Ola account can\u{2019}t use the hosted open model yet. The person who runs Ola can turn it on for you."
  public static let unknown = "Ola could not be asked about the hosted open model just now. Try again in a moment."

  /// From the gateway's answer to GET /v1/usage, as the caller (the door or the forwarder).
  public static func from(usage j: JSON?) -> HostedStatus {
    guard let j else { return HostedStatus(unavailable: unknown) }
    guard let provider = j["hosted"]["provider"].string else { return HostedStatus(unavailable: notSetUp) }
    let m = j["hosted_month"]
    let used = m["cost_micro_usd"].double.map { $0 / 1e6 }
    let cap = m["cap_micro_usd"].double.map { $0 / 1e6 }
    let picks = HostedPick.list(j["hosted"]["picks"])
    guard m["granted"].bool == true else { return HostedStatus(unavailable: notForYou, provider: provider, picks: picks) }
    if let used, let cap, used >= cap {
      return HostedStatus(unavailable: "You have used this month\u{2019}s budget for the hosted open model ($\(String(format: "%.2f", cap))). It starts again on the first of next month.", provider: provider, usedUSD: used, capUSD: cap, picks: picks)
    }
    return HostedStatus(unavailable: nil, provider: provider, usedUSD: used, capUSD: cap, picks: picks, model: j["hosted"]["model"].string)
  }

  /// A cloud project's, from the front desk's GET /api/fallback (OLA-337): there when the machine
  /// has the provider and the project's switch is on, or the person is its owner (just this once).
  public static func from(fallback j: JSON?) -> HostedStatus {
    guard let j else { return HostedStatus(unavailable: unknown) }
    let h = j["hosted"]
    let provider = h["provider"].string
    let picks = HostedPick.list(h["picks"])
    guard h["configured"].bool == true else { return HostedStatus(unavailable: h["unavailable"].string ?? notSetUp, provider: provider) }
    let used = h["month"]["used"].double
    let cap = h["month"]["cap"].double
    let on = h["enabled"].bool == true
    guard on || h["canChange"].bool == true else {
      return HostedStatus(unavailable: "The hosted open model is off for this project. Its owner can turn it on in Settings.", provider: provider, picks: picks)
    }
    return HostedStatus(unavailable: nil, provider: provider, usedUSD: used, capUSD: cap, picks: picks, once: !on, model: h["model"].string)
  }

  /// "$0.03 of $20.00 this month"
  public var monthLine: String? {
    guard let usedUSD, let capUSD else { return nil }
    return "$\(String(format: "%.2f", usedUSD)) of $\(String(format: "%.2f", capUSD)) this month"
  }

  /// Asks the gateway as this Mac's caller (`<base>/usage` with the route's token: the account's
  /// door, or the owner's forwarder) whether the hosted open model is there for it.
  public static func check(baseURL: String, token: String) async -> HostedStatus {
    guard let u = URL(string: baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/usage") else { return HostedStatus(unavailable: unknown) }
    var r = URLRequest(url: u)
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    r.timeoutInterval = 15
    guard let (d, res) = try? await URLSession(configuration: .ephemeral).data(for: r), (res as? HTTPURLResponse)?.statusCode == 200 else { return HostedStatus(unavailable: unknown) }
    return from(usage: JSON.parse(d))
  }
}

/// Whether the model door lets a request for the hosted model through now: open while the app hands
/// one over (it may hand over in two sessions at once, so it counts).
public final class HostedGate: @unchecked Sendable {
  private let lock = NSLock()
  private var open = 0
  public init() {}
  public var isOpen: Bool { lock.withLock { open > 0 } }
  public func set(_ on: Bool) { lock.withLock { open = max(0, open + (on ? 1 : -1)) } }
}

/// The person asks for Claude in plain words: "hey can you use claude code for this next thing?",
/// "ask claude", "have Claude do this". Then Ola does not send it to its own model (which would
/// answer that it cannot); it offers the Claude card instead.
public enum ClaudeAsk {
  static let ask = try! NSRegularExpression(pattern: #"\b(use|ask|have|let|get|try|switch to|hand (it|this)( over)? to|give (it|this) to|with|via|through)\s+(the\s+)?claude(\s+code)?\b|\bclaude(\s+code)?\s*(please|,)?\s*(do|take|handle|try)\b"#, options: .caseInsensitive)
  static let next = try! NSRegularExpression(pattern: #"\b(next (thing|one|request|task|message|question)|for the next|from now on|going forward)\b"#, options: .caseInsensitive)

  /// nil when the message is not a request for Claude; else whether it only asks for the next thing.
  public static func detect(_ text: String) -> Bool? {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard Stretch.has(ask, t) else { return nil }
    // "use claude code for this next thing?" asks about what comes next and carries no task of its own.
    let short = t.count <= 140
    return short && Stretch.has(next, t)
  }
}
