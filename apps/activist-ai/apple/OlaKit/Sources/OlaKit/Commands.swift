import Foundation

// Slash commands and reactions: the rules are in apps/activist-ai/README.md, "Slash commands and
// reactions (all surfaces)". The web app follows the same text; keep the two in step.

public enum SlashCommand: String, CaseIterable, Sendable {
  case claude, ola, hosted, new, stop, files, help

  public var summary: String {
    switch self {
    case .claude: "Hand this request to Claude Code"
    case .ola: "Use Ola's own model for this request"
    case .hosted: "Use the hosted open model (not set up yet)"
    case .new: "Start a new session"
    case .stop: "Stop the run"
    case .files: "Show the project's files"
    case .help: "List the commands"
    }
  }

  /// What was typed: a command and the request after it, nothing, or an unknown command.
  public enum Parsed: Equatable, Sendable {
    case none
    case command(SlashCommand, String)
    case unknown(String)
  }

  /// A command only at the very start: "/" and a word, then a space, a line break or the end.
  public static func parse(_ text: String) -> Parsed {
    guard text.hasPrefix("/") else { return .none }
    let body = text.dropFirst()
    let word = body.prefix { !$0.isWhitespace }
    guard !word.isEmpty else { return .unknown("") }
    let rest = body.dropFirst(word.count).trimmingCharacters(in: .whitespacesAndNewlines)
    guard let c = SlashCommand(rawValue: word.lowercased()) else { return .unknown(String(word)) }
    return .command(c, rest)
  }

  /// The commands the menu shows for what is typed so far ("/" alone shows them all).
  public static func matches(_ text: String) -> [SlashCommand] {
    guard text.hasPrefix("/"), !text.contains(" "), !text.contains("\n") else { return [] }
    let typed = text.dropFirst().lowercased()
    return allCases.filter { $0.rawValue.hasPrefix(typed) }
  }
}

public enum Reaction: String, CaseIterable, Codable, Sendable {
  case eyes, thanks, ok, done, party, think, oops

  public var emoji: String {
    switch self {
    case .eyes: "\u{1F440}"
    case .thanks: "\u{1F64F}"
    case .ok: "\u{1F44D}"
    case .done: "\u{2705}"
    case .party: "\u{1F389}"
    case .think: "\u{1F914}"
    case .oops: "\u{1F605}"
    }
  }

  /// The standing instruction, word for word (README).
  public static let instruction = """
  Reactions. You may react to the person's message with one emoji, like a reaction in a chat app.
  To react, make the very first line of your reply exactly [[ola:react NAME]], with NAME one of:
  eyes (you are on it), thanks (they thanked or complimented you), ok (noted: an instruction or
  preference that needs no work), done (you finished what they asked), party (they share a win),
  think (you need something from them first), oops (they caught your mistake).
  Use at most one reaction, only on that first line, and never explain it or mention it.
  If the message is only thanks or a compliment, reply with the marker line alone and nothing else.
  """

  static let marker = try! NSRegularExpression(pattern: #"\[\[ola:react\s+([A-Za-z]+)\s*\]\]"#)

  /// A reply's reaction and the text to show: the marker counts only as the whole first line;
  /// every marker anywhere is removed from what is shown.
  public static func split(_ reply: String) -> (reaction: Reaction?, text: String) {
    var lines = reply.components(separatedBy: "\n")
    var reaction: Reaction?
    // Leading blank lines before the marker do not count as a first line.
    while let f = lines.first, f.trimmingCharacters(in: .whitespaces).isEmpty, lines.count > 1 { lines.removeFirst() }
    if let first = lines.first?.trimmingCharacters(in: .whitespaces),
       let m = marker.firstMatch(in: first, range: NSRange(first.startIndex..., in: first)), m.range.length == (first as NSString).length,
       let r = Range(m.range(at: 1), in: first) {
      reaction = Reaction(rawValue: first[r].lowercased())
      lines.removeFirst()
    }
    // A marker still streaming in ("[[ola:rea") is not shown as text.
    if reaction == nil, lines.count == 1, let f = lines.first?.trimmingCharacters(in: .whitespaces), f.hasPrefix("[["), "[[ola:react ".hasPrefix(f) || f.hasPrefix("[[ola:react") {
      return (nil, "")
    }
    var text = lines.joined(separator: "\n")
    text = marker.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: "")
    return (reaction, text.trimmingCharacters(in: .whitespacesAndNewlines))
  }
}

extension Turn {
  /// The reply as shown, without the reaction marker.
  public var shownAnswer: String { Reaction.split(answer).text }

  /// The reaction on Bart's message: the reply's own; else 👀 while it runs, ✅ when it ended
  /// well, none when it failed or was stopped.
  public var reaction: Reaction? {
    if let r = Reaction.split(answer).reaction { return r }
    switch status {
    case .sending: return nil
    case .working: return .eyes
    case .done: return .done
    case .failed, .stopped: return nil
    }
  }

  /// Only a reaction, no reply to show (a thank-you): no answer, no run line.
  public var reactionOnly: Bool {
    status == .done && shownAnswer.isEmpty && Reaction.split(answer).reaction != nil && steps.isEmpty
  }
}
