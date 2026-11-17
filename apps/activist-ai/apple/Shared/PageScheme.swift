import OlaKit
import SwiftUI
import UniformTypeIdentifiers
import WebKit

// A page the agent built, shown from where it lives. A model wrote the page, so it is untrusted:
// it may run its own JavaScript, and it can load files from the project folder through the
// `ola-page` scheme, and nothing else. No http, https, websockets, file URLs or other schemes:
// a content rule blocks every load that is not ola-page, and navigation away is refused.

enum PageScheme {
  static let scheme = "ola-page"

  static func url(for path: String) -> URL {
    let encoded = path.split(separator: "/").map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }.joined(separator: "/")
    return URL(string: "\(scheme)://project/\(encoded)")!
  }

  /// Everything that is not ola-page is blocked, before WebKit makes the request.
  static let rules = """
  [{"trigger":{"url-filter":".*"},"action":{"type":"block"}},
   {"trigger":{"url-filter":"^ola-page://project/"},"action":{"type":"ignore-previous-rules"}}]
  """

  @MainActor
  static func makeWebView(store: OlaStore, path: String) -> WKWebView {
    let config = WKWebViewConfiguration()
    let handler = Handler(store: store)
    config.setURLSchemeHandler(handler, forURLScheme: scheme)
    config.websiteDataStore = .nonPersistent()
    config.defaultWebpagePreferences.allowsContentJavaScript = true
    let web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = handler
    objc_setAssociatedObject(web, &handlerKey, handler, .OBJC_ASSOCIATION_RETAIN)
    WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "ola-page-only", encodedContentRuleList: rules) { list, _ in
      Task { @MainActor in
        if let list { web.configuration.userContentController.add(list) }
        // Load only once the rules are in force.
        web.load(URLRequest(url: url(for: path)))
      }
    }
    return web
  }

  nonisolated(unsafe) static var handlerKey = 0

  final class Handler: NSObject, WKURLSchemeHandler, WKNavigationDelegate {
    let store: OlaStore
    private var stopped = Set<ObjectIdentifier>()
    init(store: OlaStore) { self.store = store }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
      guard let url = task.request.url, url.host == "project" else {
        task.didFailWithError(URLError(.unsupportedURL))
        return
      }
      let path = (url.path.removingPercentEncoding ?? url.path).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      let id = ObjectIdentifier(task)
      Task { @MainActor in
        let result: Result<Data, Error>
        do { result = .success(try await store.read(path.isEmpty ? "index.html" : path)) } catch { result = .failure(error) }
        guard !stopped.contains(id) else { return }
        switch result {
        case .success(let data):
          let ext = (path as NSString).pathExtension
          let type = UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
          let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-store"]
          task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
          task.didReceive(data)
          task.didFinish()
        case .failure:
          let body = Data("Not found in the project: \(path)".utf8)
          task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!)
          task.didReceive(body)
          task.didFinish()
        }
      }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
      stopped.insert(ObjectIdentifier(task))
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
      action.request.url?.scheme == PageScheme.scheme ? .allow : .cancel
    }
  }
}

#if os(macOS)
struct PageView: NSViewRepresentable {
  var store: OlaStore
  var path: String
  func makeNSView(context: Context) -> WKWebView { PageScheme.makeWebView(store: store, path: path) }
  func updateNSView(_ nsView: WKWebView, context: Context) {}
}

struct PageWindow: View {
  var store: OlaStore
  var path: String
  var body: some View {
    PageView(store: store, path: path)
      .navigationTitle((path as NSString).lastPathComponent)
      .navigationSubtitle("From the project: \(path)")
  }
}
#else
struct PageView: UIViewRepresentable {
  var store: OlaStore
  var path: String
  func makeUIView(context: Context) -> WKWebView { PageScheme.makeWebView(store: store, path: path) }
  func updateUIView(_ uiView: WKWebView, context: Context) {}
}
#endif
