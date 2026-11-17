import OlaKit
import SwiftUI
import WebKit

/// Pictures a run made, shown right under its reply: fitted to the column, at most 380 points
/// tall; a tap opens it full size. SVG is drawn as an image (an <img> of a data URL, in a web view
/// with JavaScript off and every load blocked), so it cannot run scripts or reach anything.
struct InlinePictures: View {
  var items: [ResultItem]
  var load: (String) async -> Data?
  var open: (ResultItem) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(items) { item in InlinePicture(item: item, load: load).onTapGesture { open(item) } }
    }
  }

  static func isPicture(_ i: ResultItem) -> Bool {
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].contains((i.target as NSString).pathExtension.lowercased())
  }
}

struct InlinePicture: View {
  var item: ResultItem
  var load: (String) async -> Data?
  @State private var data: Data?
  @State private var failed = false
  static let maxHeight: CGFloat = 380

  var isSVG: Bool { (item.target as NSString).pathExtension.lowercased() == "svg" }

  var body: some View {
    Group {
      if let data {
        // On the Mac, Core SVG draws it as a plain image (no scripts, no loads); the phone has no
        // public SVG image API, so it uses the locked-down web view below.
        if isSVG, let img = Self.svgImage(data) {
          img.resizable().scaledToFit().frame(maxHeight: Self.maxHeight, alignment: .leading)
        } else if isSVG {
          let ratio = Self.svgRatio(data)
          SVGView(svg: data)
            .aspectRatio(ratio, contentMode: .fit)
            .frame(maxWidth: .infinity, maxHeight: Self.maxHeight, alignment: .leading)
        } else if let img = Self.image(data) {
          img.resizable().scaledToFit().frame(maxHeight: Self.maxHeight, alignment: .leading)
        } else {
          Text(item.name).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
        }
      } else if failed {
        EmptyView()
      } else {
        RoundedRectangle(cornerRadius: 6).fill(Ola.details).frame(height: 120).overlay(ProgressView())
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 6))
    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Ola.rule, lineWidth: data == nil ? 0 : 1))
    .contentShape(Rectangle())
    .accessibilityLabel("Picture \(item.name)")
    .task {
      if data == nil { data = await load(item.target); failed = data == nil }
    }
  }

  static func svgImage(_ d: Data) -> Image? {
    #if os(macOS)
    guard let img = NSImage(data: d), img.size.width > 0 else { return nil }
    return Image(nsImage: img)
    #else
    return nil
    #endif
  }

  static func image(_ d: Data) -> Image? {
    #if os(macOS)
    NSImage(data: d).map { Image(nsImage: $0) }
    #else
    UIImage(data: d).map { Image(uiImage: $0) }
    #endif
  }

  /// Width over height, from the SVG's viewBox (or width and height), else 4:3.
  static func svgRatio(_ d: Data) -> CGFloat {
    let s = String(decoding: d.prefix(4000), as: UTF8.self)
    func nums(_ pattern: String) -> [Double]? {
      guard let re = try? NSRegularExpression(pattern: pattern), let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
            let r = Range(m.range(at: 1), in: s) else { return nil }
      return s[r].split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) }
    }
    if let v = nums(#"viewBox\s*=\s*"([^"]+)""#), v.count == 4, v[2] > 0, v[3] > 0 { return v[2] / v[3] }
    if let w = nums(#"\swidth\s*=\s*"([\d.]+)"#)?.first, let h = nums(#"\sheight\s*=\s*"([\d.]+)"#)?.first, w > 0, h > 0 { return w / h }
    return 4.0 / 3.0
  }
}

/// An SVG as a picture: no JavaScript, no loads (a content rule blocks everything but the data URL).
struct SVGView {
  var svg: Data

  @MainActor static func make(_ svg: Data) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.defaultWebpagePreferences.allowsContentJavaScript = false
    config.websiteDataStore = .nonPersistent()
    let web = WKWebView(frame: .zero, configuration: config)
    #if os(macOS)
    web.setValue(false, forKey: "drawsBackground")
    #else
    web.isOpaque = false
    web.backgroundColor = .clear
    web.scrollView.isScrollEnabled = false
    #endif
    let html = "<!doctype html><meta name=viewport content='width=device-width'><style>html,body{margin:0;background:transparent}img{display:block;width:100%;height:100vh;object-fit:contain}</style><img src='data:image/svg+xml;base64,\(svg.base64EncodedString())'>"
    let rules = #"[{"trigger":{"url-filter":".*"},"action":{"type":"block"}},{"trigger":{"url-filter":"^data:"},"action":{"type":"ignore-previous-rules"}}]"#
    WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "ola-svg-only", encodedContentRuleList: rules) { list, _ in
      Task { @MainActor in
        if let list { web.configuration.userContentController.add(list) }
        web.loadHTMLString(html, baseURL: nil)
      }
    }
    return web
  }
}

#if os(macOS)
extension SVGView: NSViewRepresentable {
  func makeNSView(context: Context) -> WKWebView { Self.make(svg) }
  func updateNSView(_ v: WKWebView, context: Context) {}
}
#else
extension SVGView: UIViewRepresentable {
  func makeUIView(context: Context) -> WKWebView { Self.make(svg) }
  func updateUIView(_ v: WKWebView, context: Context) {}
}
#endif
