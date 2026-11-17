import Foundation

/// What a web approval is about: the words, the address or the reference in an `ola-search` /
/// `ola-fetch` / `ola-lookup` command. A port of `web/server/webask.mjs`, so the apps ask the same
/// question as the web app ("Ola wants to search the web for: …"), not "run a command".
public enum WebAsk {
  public enum Kind: String, Sendable { case search, fetch, lookup }
  public struct Request: Equatable, Sendable {
    public var kind: Kind
    /// nil when the command is not in the simple form (it is then shown as written).
    public var item: String?
  }

  static let tools: [String: Kind] = ["ola-search": .search, "/opt/ola/bin/ola-search": .search, "ola-fetch": .fetch, "/opt/ola/bin/ola-fetch": .fetch,
                                      "ola-lookup": .lookup, "/opt/ola/bin/ola-lookup": .lookup]

  /// The shell words of a simple command (words, quotes, backslash escapes), or nil.
  public static func shellWords(_ cmd: String) -> [String]? {
    guard cmd.count <= 8192 else { return nil }
    let c = Array(cmd)
    var words: [String] = []
    var cur = ""
    var has = false
    var i = 0
    while i < c.count {
      let ch = c[i]
      if ch == "'" {
        guard let end = c[(i + 1)...].firstIndex(of: "'") else { return nil }
        cur += String(c[(i + 1)..<end])
        has = true
        i = end
      } else if ch == "\"" {
        i += 1
        while i < c.count, c[i] != "\"" {
          if c[i] == "$" || c[i] == "`" { return nil }
          if c[i] == "\\", i + 1 < c.count, "\"\\$`\n".contains(c[i + 1]) { i += 1 }
          cur.append(c[i])
          i += 1
        }
        if i >= c.count { return nil }
        has = true
      } else if ch == "\\" {
        if i + 1 >= c.count { return nil }
        i += 1
        cur.append(c[i])
        has = true
      } else if ch == " " || ch == "\t" {
        if has { words.append(cur); cur = ""; has = false }
      } else if "$`;&|<>()\n\r{}".contains(ch) {
        return nil
      } else {
        cur.append(ch)
        has = true
      }
      i += 1
    }
    if has { words.append(cur) }
    return words
  }

  /// The web request in one command, or nil for anything else.
  public static func request(_ cmd: String) -> Request? {
    let t = cmd.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let first = t.split(whereSeparator: \.isWhitespace).first.map(String.init), let kind = tools[first] else { return nil }
    guard let w = shellWords(t), tools[w[0]] == kind else { return Request(kind: kind, item: nil) }
    var rest: [String] = []
    var i = 1
    while i < w.count {
      if kind == .search && w[i] == "--count" { i += 1 }
      else if kind == .fetch && ["--as", "--expect-title", "--expect-doi", "--expect-authors", "--expect-cite"].contains(w[i]) { i += 1 }
      else if kind == .lookup && w[i] == "--json" {}
      else { rest.append(w[i]) }
      i += 1
    }
    if kind == .search || kind == .lookup {
      let q = rest.joined(separator: " ").split(whereSeparator: \.isWhitespace).joined(separator: " ")
      return Request(kind: kind, item: q.isEmpty ? nil : q)
    }
    guard rest.count == 1, let u = URL(string: rest[0].trimmingCharacters(in: .whitespaces)), u.scheme == "https" else { return Request(kind: kind, item: nil) }
    return Request(kind: kind, item: u.absoluteString)
  }

  /// What a shell permission asks, when it is a web request: the web commands in it, and whether
  /// it holds anything more. The open model often adds `2>&1` or a `head` to ola-search however it
  /// is told; output plumbing (a redirection of the command's own output, or head, tail, cat, wc,
  /// grep, sort, echo, which as further commands) does not change what leaves the machine, so it is still
  /// asked as a web question, the exact command under View. Anything else is a command.
  public static func question(_ resources: [String]) -> (webs: [Request], first: Request, extra: Bool)? {
    var webs: [Request] = []
    var extra = false
    for r in resources {
      let bare = stripRedirects(r)
      if let w = request(bare) {
        webs.append(w)
        if bare != r.trimmingCharacters(in: .whitespacesAndNewlines) { extra = true }
      } else if isPlumbing(r) {
        extra = true
      } else {
        return nil
      }
    }
    guard let first = webs.first else { return nil }
    return (webs, first, extra)
  }

  /// `2>&1`, `2>/dev/null`, `>/dev/null 2>&1` at the end of a command, removed.
  static func stripRedirects(_ cmd: String) -> String {
    var c = cmd.trimmingCharacters(in: .whitespacesAndNewlines)
    while let r = c.range(of: #"\s+(?:[12]?>&[12]|[12]?>\s*/dev/null)$"#, options: .regularExpression) { c.removeSubrange(r) }
    return c
  }

  /// A command that only shows or trims output, with no file or program of its own.
  static func isPlumbing(_ cmd: String) -> Bool {
    let c = stripRedirects(cmd)
    guard let w = shellWords(c), let first = w.first else { return false }
    switch first {
    case "head", "tail", "wc", "sort", "uniq": return w.dropFirst().allSatisfy { $0.hasPrefix("-") || Int($0) != nil }
    case "cat": return w.count == 1
    case "echo", "true", "which", "type": return true
    case "grep": return w.dropFirst().filter { !$0.hasPrefix("-") }.count <= 1
    default: return false
    }
  }

  /// The question on the card, word for word the web app's (web/src/lib/steps.ts).
  public static func title(_ r: Request) -> String {
    let what = r.item ?? "something"
    switch r.kind {
    case .search: return "Ola wants to search the web for: \(what)"
    case .lookup: return "Ola wants to look up this paper: \(what)"
    case .fetch: return "Ola wants to download: \(what)"
    }
  }

  public static func label(_ r: Request) -> String {
    switch r.kind {
    case .search: return r.item.map { "Search for \u{201C}\($0)\u{201D}" } ?? "Search for this"
    case .lookup: return r.item.map { "Look up \u{201C}\($0)\u{201D}" } ?? "Look up this"
    case .fetch: return "Download \(r.item ?? "this")"
    }
  }

  /// What leaves the machine, in one line (the web app's sentence).
  public static func leaves(_ r: Request) -> String {
    switch r.kind {
    case .search: return "The words of the search go to Brave Search. Nothing from your files is sent."
    case .lookup: return "This reference goes to Crossref and Unpaywall, public catalogs of research papers. Nothing from your files is sent."
    case .fetch:
      let host = r.item.flatMap { URL(string: $0)?.host() }.map { $0.hasPrefix("www.") ? String($0.dropFirst(4)) : $0 } ?? "a document"
      return "Ola asks \(host) for this one address. Nothing from your files is sent."
    }
  }
}
