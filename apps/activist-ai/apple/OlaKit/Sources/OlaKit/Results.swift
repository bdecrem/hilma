import Foundation

/// What a run delivered, shown under its reply with View: the files it wrote or changed (from its
/// own file steps, as the web app's "Open <page>" does: done write/change steps, a relative path)
/// and the web address a deploy command printed. Never from the model's words.
public struct ResultItem: Identifiable, Equatable, Sendable {
  public enum Kind: String, Sendable { case page, image, table, document, text, file, site }
  public var kind: Kind
  /// The file's path in the project, or the web address.
  public var target: String
  public var id: String { target }
  public var name: String {
    kind == .site ? (URL(string: target)?.host() ?? target) : (target.split(separator: "/").last.map(String.init) ?? target)
  }
  public var kindLabel: String {
    switch kind {
    case .page: "Page"
    case .image: "Image"
    case .table: "Table"
    case .document: "Document"
    case .text: "Text"
    case .file: "File"
    case .site: "Website"
    }
  }

  public static func kind(of path: String) -> Kind {
    switch (path as NSString).pathExtension.lowercased() {
    case "html", "htm": .page
    case "png", "jpg", "jpeg", "gif", "webp", "svg", "heic": .image
    case "csv", "tsv", "xlsx", "xls": .table
    case "md", "pdf", "docx", "doc", "rtf", "pages": .document
    case "txt", "log", "json", "py", "js", "mjs", "ts", "sh", "swift", "css", "yml", "yaml", "toml", "r", "sql": .text
    default: .file
    }
  }

  /// The deploy commands whose printed web address is a result.
  static let deploys = #"\b(vercel|netlify|wrangler|surge|firebase\s+deploy|gh-pages|fly\s+deploy|railway\s+up)\b"#
  static let url = try! NSRegularExpression(pattern: #"https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^\s"'<>)\]]*)?"#)

  /// A turn's results, in the order they were made; files first, then sites.
  public static func derive(_ turn: Turn) -> [ResultItem] {
    var files: [ResultItem] = []
    var sites: [ResultItem] = []
    for s in turn.steps where s.status == .done {
      if s.icon == .write || s.icon == .change {
        let path = s.object
        guard !path.isEmpty, !path.hasPrefix("/"), path != "a file", !files.contains(where: { $0.target == path }) else { continue }
        files.append(ResultItem(kind: kind(of: path), target: path))
      }
      if (s.tool == "shell" || s.tool == "bash"), s.input.range(of: deploys, options: .regularExpression) != nil {
        let out = s.output
        let found = url.matches(in: out, range: NSRange(out.startIndex..., in: out)).compactMap { Range($0.range, in: out).map { String(out[$0]) } }
        // The last address a deploy prints is the one it ends on (the live site).
        if let last = found.last(where: { !$0.contains("vercel.com/") && !$0.contains("/inspect") }) ?? found.last,
           !sites.contains(where: { $0.target == last }) {
          sites.append(ResultItem(kind: .site, target: last))
        }
      }
    }
    return files + sites
  }
}
