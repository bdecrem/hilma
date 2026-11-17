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

/// Why a request looks like a stretch: during a run (error, budget, tools) or before it (big_files, long_build).
public enum StretchReason: String, Codable, Sendable {
  case error, budget, tools, bigFiles = "big_files", longBuild = "long_build"
  /// The person asked for Claude or Claude Code in plain words ("use claude code for this").
  case asked

  /// The one sentence of why (STRETCH_WHY in steps.ts).
  public var why: String {
    switch self {
    case .error: "Ola\u{2019}s own model ran into an error on this request."
    case .budget: "Ola\u{2019}s own model reached the most it may do for one request."
    case .tools: "Three of Ola\u{2019}s steps in a row did not work."
    case .bigFiles: "The files this request names are much larger than Ola\u{2019}s own model can read at once."
    case .longBuild: "This is a long build in many parts."
    case .asked: "You asked for Claude Code."
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
  /// The line on a reply the hosted open model wrote.
  public static func hostedAnswered(_ provider: String?) -> String { "Answered by the hosted open model\(provider.map { " at \($0)" } ?? ""), outside Ola." }
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
    let parts = request.split(separator: "\n", omittingEmptySubsequences: false).filter { has(listed, String($0)) }.count
    if request.count >= buildMinChars && parts >= buildParts && has(buildVerb, request) { return .longBuild }
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

/// What the hosted open model looks like from here: set up or not, the provider, and this month.
public struct HostedStatus: Equatable, Sendable {
  /// nil when a request can be handed over; else one sentence why not.
  public var unavailable: String?
  public var provider: String?
  public var usedUSD: Double?
  public var capUSD: Double?

  public init(unavailable: String?, provider: String? = nil, usedUSD: Double? = nil, capUSD: Double? = nil) {
    self.unavailable = unavailable
    self.provider = provider
    self.usedUSD = usedUSD
    self.capUSD = capUSD
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
    guard m["granted"].bool == true else { return HostedStatus(unavailable: notForYou, provider: provider) }
    if let used, let cap, used >= cap {
      return HostedStatus(unavailable: "You have used this month\u{2019}s budget for the hosted open model ($\(String(format: "%.2f", cap))). It starts again on the first of next month.", provider: provider, usedUSD: used, capUSD: cap)
    }
    return HostedStatus(unavailable: nil, provider: provider, usedUSD: used, capUSD: cap)
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
