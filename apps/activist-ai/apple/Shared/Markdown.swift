import SwiftUI

/// Markdown as Ola writes it: paragraphs, headings, lists, quotes, tables and code blocks, set on
/// paper in Literata, with code in IBM Plex Mono. Inline styling is Foundation's Markdown parser;
/// the blocks are parsed here (a small, forgiving subset: half-written text streams in, so nothing
/// here may fail on an unclosed fence or a table missing its last row).
enum MDBlock: Hashable {
  case paragraph(String)
  case heading(Int, String)
  case bullets([String])
  case numbered(Int, [String])
  case quote(String)
  case code(String, String)
  case table([String], [Bool], [[String]])
  case rule
}

enum MarkdownParser {
  static func blocks(_ text: String) -> [MDBlock] {
    let lines = text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
    var out: [MDBlock] = []
    var para: [String] = []
    var i = 0
    func flush() {
      if !para.isEmpty { out.append(.paragraph(para.joined(separator: "\n"))) }
      para = []
    }
    func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespaces) }
    func isBullet(_ s: String) -> Bool { let t = trimmed(s); return t.hasPrefix("- ") || t.hasPrefix("* ") || t.hasPrefix("+ ") }
    func numberedItem(_ s: String) -> (Int, String)? {
      let t = trimmed(s)
      guard let dot = t.firstIndex(where: { $0 == "." || $0 == ")" }), let n = Int(t[..<dot]), t.index(after: dot) < t.endIndex, t[t.index(after: dot)] == " " else { return nil }
      return (n, String(t[t.index(dot, offsetBy: 2)...]))
    }
    func cells(_ s: String) -> [String] {
      var t = trimmed(s)
      if t.hasPrefix("|") { t.removeFirst() }
      if t.hasSuffix("|") { t.removeLast() }
      return t.components(separatedBy: "|").map(trimmed)
    }
    while i < lines.count {
      let line = lines[i]
      let t = trimmed(line)
      if t.hasPrefix("```") || t.hasPrefix("~~~") {
        flush()
        let fence = String(t.prefix(3))
        let lang = String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces)
        var code: [String] = []
        i += 1
        while i < lines.count, !trimmed(lines[i]).hasPrefix(fence) { code.append(lines[i]); i += 1 }
        out.append(.code(lang, code.joined(separator: "\n")))
        i += 1
        continue
      }
      if t.isEmpty { flush(); i += 1; continue }
      if t.hasPrefix("#") {
        let level = t.prefix(while: { $0 == "#" }).count
        if level <= 6, t.dropFirst(level).first == " " {
          flush()
          out.append(.heading(level, String(t.dropFirst(level + 1))))
          i += 1
          continue
        }
      }
      if t == "---" || t == "***" || t == "___" { flush(); out.append(.rule); i += 1; continue }
      if t.hasPrefix("|"), i + 1 < lines.count, trimmed(lines[i + 1]).hasPrefix("|"), trimmed(lines[i + 1]).contains("-") {
        let sep = cells(lines[i + 1])
        if sep.allSatisfy({ $0.allSatisfy { "-:| ".contains($0) } && !$0.isEmpty }) {
          flush()
          let header = cells(line)
          let right = sep.map { $0.hasSuffix(":") && !$0.hasPrefix(":") }
          var rows: [[String]] = []
          i += 2
          while i < lines.count, trimmed(lines[i]).hasPrefix("|") { rows.append(cells(lines[i])); i += 1 }
          out.append(.table(header, right, rows))
          continue
        }
      }
      if t.hasPrefix(">") {
        flush()
        var q: [String] = []
        while i < lines.count, trimmed(lines[i]).hasPrefix(">") { q.append(String(trimmed(lines[i]).dropFirst()).trimmingCharacters(in: .whitespaces)); i += 1 }
        out.append(.quote(q.joined(separator: "\n")))
        continue
      }
      if isBullet(line) {
        flush()
        var items: [String] = []
        while i < lines.count {
          let l = lines[i]
          if isBullet(l) { items.append(String(trimmed(l).dropFirst(2))) }
          else if !trimmed(l).isEmpty, l.hasPrefix("  "), !items.isEmpty { items[items.count - 1] += " " + trimmed(l) }
          else { break }
          i += 1
        }
        out.append(.bullets(items))
        continue
      }
      if let first = numberedItem(line) {
        flush()
        var items: [String] = []
        while i < lines.count {
          if let it = numberedItem(lines[i]) { items.append(it.1) }
          else if !trimmed(lines[i]).isEmpty, lines[i].hasPrefix("  "), !items.isEmpty { items[items.count - 1] += " " + trimmed(lines[i]) }
          else { break }
          i += 1
        }
        out.append(.numbered(first.0, items))
        continue
      }
      para.append(t)
      i += 1
    }
    flush()
    return out
  }

  /// Inline Markdown (bold, italic, code, links) as styled text.
  static func inline(_ s: String, size: CGFloat) -> AttributedString {
    var a = (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
    for run in a.runs {
      guard let intent = run.inlinePresentationIntent else { continue }
      if intent.contains(.code) {
        a[run.range].font = OlaFont.mono(size * 0.84)
        a[run.range].backgroundColor = Ola.details
      } else if intent.contains(.stronglyEmphasized) {
        a[run.range].font = OlaFont.serif(size, .semibold)
      } else if intent.contains(.emphasized) {
        a[run.range].font = OlaFont.serif(size, .italic)
      }
    }
    for run in a.runs where run.link != nil {
      a[run.range].foregroundColor = Ola.blue
      a[run.range].underlineStyle = .single
    }
    return a
  }
}

struct MarkdownView: View {
  var text: String
  var size: CGFloat = Metrics.reading

  var body: some View {
    let blocks = MarkdownParser.blocks(text)
    VStack(alignment: .leading, spacing: size * 0.75) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, b in block(b) }
    }
    .textSelection(.enabled)
  }

  @ViewBuilder func block(_ b: MDBlock) -> some View {
    switch b {
    case .paragraph(let s):
      Text(MarkdownParser.inline(s, size: size)).font(OlaFont.serif(size)).lineSpacing(Metrics.readingLeading).foregroundStyle(Ola.ink)
        .fixedSize(horizontal: false, vertical: true)
    case .heading(let level, let s):
      Text(MarkdownParser.inline(s, size: size)).font(level <= 1 ? OlaFont.sans(Metrics.title, .display) : level == 2 ? OlaFont.sans(Metrics.heading, .semibold) : OlaFont.sans(Metrics.ui, .semibold))
        .foregroundStyle(level <= 2 ? Ola.ink : Ola.ink2).padding(.top, Space.s)
    case .bullets(let items):
      VStack(alignment: .leading, spacing: size * 0.3) {
        ForEach(Array(items.enumerated()), id: \.offset) { _, it in
          HStack(alignment: .firstTextBaseline, spacing: Space.s) {
            Text("\u{2022}").font(OlaFont.serif(size)).foregroundStyle(Ola.ink3)
            Text(MarkdownParser.inline(it, size: size)).font(OlaFont.serif(size)).lineSpacing(Metrics.readingLeading).foregroundStyle(Ola.ink).fixedSize(horizontal: false, vertical: true)
          }
        }
      }
    case .numbered(let start, let items):
      VStack(alignment: .leading, spacing: size * 0.3) {
        ForEach(Array(items.enumerated()), id: \.offset) { n, it in
          HStack(alignment: .firstTextBaseline, spacing: Space.s) {
            Text("\(start + n).").font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink3).monospacedDigit().frame(minWidth: 18, alignment: .trailing)
            Text(MarkdownParser.inline(it, size: size)).font(OlaFont.serif(size)).lineSpacing(Metrics.readingLeading).foregroundStyle(Ola.ink).fixedSize(horizontal: false, vertical: true)
          }
        }
      }
    case .quote(let s):
      Text(MarkdownParser.inline(s, size: size)).font(OlaFont.serif(size, .italic)).lineSpacing(Metrics.readingLeading).foregroundStyle(Ola.ink2)
        .padding(.leading, Space.m).overlay(alignment: .leading) { Rectangle().fill(Ola.vermilion).frame(width: 2) }
    case .code(let lang, let code):
      CodeBlock(lang: lang, code: code)
    case .table(let header, let right, let rows):
      TableBlock(header: header, right: right, rows: rows, size: size)
    case .rule:
      Rectangle().fill(Ola.rule).frame(height: 1)
    }
  }
}

struct CodeBlock: View {
  var lang: String
  var code: String
  @State private var copied = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        Text(lang.isEmpty ? "Code" : lang).font(OlaFont.sans(Metrics.meta, .medium)).foregroundStyle(Ola.ink3)
        Spacer()
        Button { copy() } label: { Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc").labelStyle(.titleAndIcon) }
          .buttonStyle(LinkButton()).help("Copy the code")
      }
      .padding(.horizontal, Space.m).padding(.top, Space.s).padding(.bottom, 6)
      ScrollView(.horizontal, showsIndicators: false) {
        Text(code).font(OlaFont.mono(Metrics.mono)).foregroundStyle(Ola.ink).lineSpacing(3).fixedSize().textSelection(.enabled)
          .padding(.horizontal, Space.m).padding(.bottom, Space.m)
      }
    }
    .background(Ola.details, in: RoundedRectangle(cornerRadius: 5))
    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Ola.rule, lineWidth: 1))
  }

  func copy() {
    #if os(macOS)
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(code, forType: .string)
    #else
    UIPasteboard.general.string = code
    #endif
    copied = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
  }
}

struct TableBlock: View {
  var header: [String]
  var right: [Bool]
  var rows: [[String]]
  var size: CGFloat

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      Grid(alignment: .leading, horizontalSpacing: Space.xl, verticalSpacing: 0) {
        GridRow {
          ForEach(header.indices, id: \.self) { c in
            cell(header[c], c, head: true)
          }
        }
        .padding(.bottom, 6)
        Rectangle().fill(Ola.ink2).frame(height: 1).gridCellUnsizedAxes(.horizontal)
        ForEach(rows.indices, id: \.self) { r in
          GridRow {
            ForEach(header.indices, id: \.self) { c in cell(c < rows[r].count ? rows[r][c] : "", c, head: false) }
          }
          .padding(.vertical, 6)
          Rectangle().fill(Ola.rule).frame(height: 1).gridCellUnsizedAxes(.horizontal)
        }
      }
      .padding(.vertical, 2)
    }
  }

  func cell(_ s: String, _ c: Int, head: Bool) -> some View {
    let r = c < right.count && right[c]
    return Text(MarkdownParser.inline(s, size: Metrics.ui))
      .font(head ? OlaFont.sans(Metrics.meta, .semibold) : OlaFont.sans(Metrics.ui))
      .foregroundStyle(head ? Ola.ink2 : Ola.ink)
      .monospacedDigit()
      .gridColumnAlignment(r ? .trailing : .leading)
  }
}
