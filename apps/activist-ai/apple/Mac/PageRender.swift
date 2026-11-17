import AppKit
import OlaKit
import WebKit

/// `ola-page` on this Mac (bart/ola-page-mac, installed with the web commands for "On this Mac"):
/// the agent asks, this app renders. A request file lands in Application Support/Ola/render/in; the
/// page is loaded from its own folder in a web view in a window ordered in far off every display
/// (never shown, never key), through a scheme that serves only that folder, with every other load
/// blocked by a content rule (no http, https, file URLs or websockets: a model wrote the page). The
/// image's measurements (olapage.py's MEASURE) run in the page; the picture and the report go to
/// render/out, and the command moves the picture where it was asked to go. Only pages inside the
/// folder "On this Mac" works in (or a check's own folder) are rendered.
@MainActor
final class PageRender: NSObject {
  static let shared = PageRender()
  var dir = LocalServer.support.appendingPathComponent("render")
  /// Folders whose pages may be rendered, besides the project folder of "On this Mac".
  var extraRoots: [URL] = []
  private var source: DispatchSourceFileSystemObject?
  private var busy = false
  private static var rules: WKContentRuleList?
  static let scheme = "ola-render"

  func start() {
    guard source == nil else { return }
    let fm = FileManager.default
    for d in ["in", "out"] { try? fm.createDirectory(at: dir.appendingPathComponent(d), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700]) }
    // Answers nobody collected (a command that gave up) are cleared at start.
    for f in (try? fm.contentsOfDirectory(atPath: dir.appendingPathComponent("out").path)) ?? [] { try? fm.removeItem(at: dir.appendingPathComponent("out/\(f)")) }
    let fd = open(dir.appendingPathComponent("in").path, O_EVTONLY)
    guard fd >= 0 else { return }
    let s = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: .write, queue: .main)
    s.setEventHandler { [weak self] in MainActor.assumeIsolated { self?.drain() } }
    s.setCancelHandler { close(fd) }
    s.resume()
    source = s
    drain()
  }

  func stop() { source?.cancel(); source = nil }

  private func drain() {
    guard !busy else { return }
    let inbox = dir.appendingPathComponent("in")
    let files = ((try? FileManager.default.contentsOfDirectory(atPath: inbox.path)) ?? []).filter { $0.hasSuffix(".json") && !$0.hasPrefix(".") }.sorted()
    guard let f = files.first else { return }
    busy = true
    let url = inbox.appendingPathComponent(f)
    let data = try? Data(contentsOf: url)
    try? FileManager.default.removeItem(at: url)
    Task { @MainActor in
      let id = String(f.dropLast(5))
      var answer = await self.render(data, id: id)
      answer["id"] = id
      let out = self.dir.appendingPathComponent("out")
      if let body = try? JSONSerialization.data(withJSONObject: answer) {
        let tmp = out.appendingPathComponent(".\(id).tmp")
        try? body.write(to: tmp)
        try? FileManager.default.moveItem(at: tmp, to: out.appendingPathComponent("\(id).json"))
      }
      self.busy = false
      self.drain()
    }
  }

  private func allowed(_ root: URL) -> Bool {
    let roots = ([LocalSettings.folder].compactMap { $0 } + extraRoots).map { $0.resolvingSymlinksInPath().standardizedFileURL.path }
    let r = root.resolvingSymlinksInPath().standardizedFileURL.path
    return roots.contains { r == $0 || r.hasPrefix($0 + "/") }
  }

  private static func ruleList() async -> WKContentRuleList? {
    if let rules { return rules }
    let json = """
    [{"trigger":{"url-filter":".*"},"action":{"type":"block"}},
     {"trigger":{"url-filter":"^ola-render://page/"},"action":{"type":"ignore-previous-rules"}},
     {"trigger":{"url-filter":"^data:"},"action":{"type":"ignore-previous-rules"}},
     {"trigger":{"url-filter":"^blob:"},"action":{"type":"ignore-previous-rules"}},
     {"trigger":{"url-filter":"^about:"},"action":{"type":"ignore-previous-rules"}}]
    """
    rules = await withCheckedContinuation { c in
      WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "ola-render-only", encodedContentRuleList: json) { list, _ in c.resume(returning: list) }
    }
    return rules
  }

  func render(_ data: Data?, id: String) async -> [String: Any] {
    guard let data, let req = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let pagePath = req["page"] as? String, let measure = req["measure"] as? String else { return ["ok": false, "error": "the request could not be read"] }
    let page = URL(fileURLWithPath: pagePath).standardizedFileURL
    let root = page.deletingLastPathComponent()
    guard FileManager.default.fileExists(atPath: page.path) else { return ["ok": false, "error": "no such page"] }
    guard allowed(root) else { return ["ok": false, "error": "the page is outside the project folder"] }
    let w = min(max(req["width"] as? Int ?? 1280, 200), 3000), h = min(max(req["height"] as? Int ?? 900, 200), 4000)
    let viewport = req["viewport"] as? Bool ?? false, dark = req["dark"] as? Bool ?? false
    let scale = min(max(req["scale"] as? Double ?? 1, 0.5), 3), wait = min(max(req["wait"] as? Int ?? 600, 0), 10000)
    let maxH = req["max_height"] as? Int ?? 12000
    guard let rules = await Self.ruleList() else { return ["ok": false, "error": "the content rules could not be compiled"] }

    let serve = Serve(root: root)
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(serve, forURLScheme: Self.scheme)
    config.websiteDataStore = .nonPersistent()
    config.userContentController.add(rules)
    config.userContentController.addUserScript(WKUserScript(source: """
      window.__olaErrors = []; addEventListener('error', function (e) { try { if (e.message) __olaErrors.push(String(e.message).slice(0, 200)) } catch (_) {} });
      """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: config)
    web.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
    let nav = NavWait()
    web.navigationDelegate = nav
    let window = NSWindow(contentRect: NSRect(x: -40000, y: -40000, width: w, height: h), styleMask: [.borderless], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    window.contentView = web
    window.orderBack(nil)
    defer { window.orderOut(nil); window.contentView = nil; window.close() }

    let rel = page.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? page.lastPathComponent
    web.load(URLRequest(url: URL(string: "\(Self.scheme)://page/\(rel)")!))
    let loaded = await nav.wait(seconds: 20)
    try? await Task.sleep(nanoseconds: UInt64(wait) * 1_000_000)
    guard let raw = try? await web.evaluateJavaScript(measure) as? String,
          var report = (try? JSONSerialization.jsonObject(with: Data(raw.utf8))) as? [String: Any] else {
      return ["ok": false, "error": "the page could not be measured"]
    }
    // What a browser would have fetched from elsewhere (the content rule blocked it), and errors.
    let extra = """
      (() => { const out = new Set(); const bad = (u) => /^(https?:)?\\/\\//i.test(u || '');
        for (const e of document.querySelectorAll('[src],[href],[srcset],[poster],[data]')) for (const a of ['src', 'href', 'poster', 'data']) {
          const v = e.getAttribute(a); if (bad(v) && !(e.tagName === 'A' && a === 'href')) out.add(v.slice(0, 200)) }
        for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { const m = (r.cssText || '').match(/url\\(["']?((https?:)?\\/\\/[^"')]+)/g); if (m) m.forEach((x) => out.add(x.slice(4, 204))) } } catch (_) {} }
        return JSON.stringify({ outside: [...out].slice(0, 20), errors: (window.__olaErrors || []).slice(0, 20) }) })()
      """
    if let s = try? await web.evaluateJavaScript(extra) as? String, let j = (try? JSONSerialization.jsonObject(with: Data(s.utf8))) as? [String: Any] {
      report["outside_requests"] = j["outside"] ?? []
      report["script_errors"] = j["errors"] ?? []
    }
    report["missing_files"] = Array(serve.missing.prefix(20))
    report["loaded"] = loaded

    let fullH = viewport ? h : min(max(report["page_height"] as? Int ?? h, h), maxH)
    if fullH != h {
      window.setContentSize(NSSize(width: w, height: fullH))
      web.frame = NSRect(x: 0, y: 0, width: w, height: fullH)
      try? await Task.sleep(nanoseconds: 300_000_000)
    }
    let snap = WKSnapshotConfiguration()
    snap.rect = CGRect(x: 0, y: 0, width: w, height: fullH)
    snap.afterScreenUpdates = true
    let image: NSImage? = await withCheckedContinuation { c in web.takeSnapshot(with: snap) { img, _ in c.resume(returning: img) } }
    guard let image else { return ["ok": false, "error": "the page could not be pictured"] }
    // Exactly width x height x scale pixels, whatever the screen's own scale.
    let pw = Int((Double(w) * scale).rounded()), ph = Int((Double(fullH) * scale).rounded())
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pw, pixelsHigh: ph, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                     colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return ["ok": false, "error": "no picture buffer"] }
    rep.size = NSSize(width: pw, height: ph)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    image.draw(in: NSRect(x: 0, y: 0, width: pw, height: ph))
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else { return ["ok": false, "error": "the picture could not be saved"] }
    let file = dir.appendingPathComponent("out/\(id).png")
    do { try png.write(to: file) } catch { return ["ok": false, "error": "the picture could not be written"] }
    return ["ok": true, "png": file.path, "report": report]
  }

  /// Serves files from the page's own folder only.
  final class Serve: NSObject, WKURLSchemeHandler {
    let root: URL
    var missing: [String] = []
    init(root: URL) { self.root = root.resolvingSymlinksInPath().standardizedFileURL }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
      guard let url = task.request.url, url.host == "page" else { task.didFailWithError(URLError(.unsupportedURL)); return }
      let rel = (url.path.removingPercentEncoding ?? url.path).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      let file = root.appendingPathComponent(rel.isEmpty ? "index.html" : rel).resolvingSymlinksInPath().standardizedFileURL
      let inside = file.path.hasPrefix(root.path + "/")
      var isDir: ObjCBool = false
      guard inside, FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), !isDir.boolValue, let data = try? Data(contentsOf: file) else {
        missing.append("/" + rel)
        task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!)
        task.didReceive(Data("not found".utf8))
        task.didFinish()
        return
      }
      let types = ["html": "text/html; charset=utf-8", "htm": "text/html; charset=utf-8", "css": "text/css", "js": "text/javascript", "mjs": "text/javascript",
                   "json": "application/json", "csv": "text/csv", "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                   "gif": "image/gif", "webp": "image/webp", "woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf", "otf": "font/otf", "txt": "text/plain"]
      let type = types[file.pathExtension.lowercased()] ?? "application/octet-stream"
      task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-store"])!)
      task.didReceive(data)
      task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
  }

  /// Waits for the page to finish loading (or fail), at most a number of seconds.
  final class NavWait: NSObject, WKNavigationDelegate {
    private var done: Bool?
    private var waiter: CheckedContinuation<Bool, Never>?
    func wait(seconds: Double) async -> Bool {
      if let done { return done }
      return await withCheckedContinuation { c in
        waiter = c
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in self?.finish(false) }
      }
    }
    private func finish(_ ok: Bool) {
      guard done == nil else { return }
      done = ok
      waiter?.resume(returning: ok)
      waiter = nil
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finish(true) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(false) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(false) }
    // Navigation away from the page is refused (a link the page clicks itself, a redirect).
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
      decisionHandler(action.request.url?.scheme == PageRender.scheme || action.request.url?.scheme == "about" ? .allow : .cancel)
    }
  }
}

/// `Ola --render-selftest <folder>`: the Mac's ola-page end to end, as the agent would run it: the
/// web commands and Ola's skills installed into the folder, a page with a request to another address,
/// rendered at 390 and 1280 px and in dark mode by this app through the command, and the designer
/// skill's look.py run on it. Prints PASS or FAIL per step and exits. No window is shown.
enum RenderSelfTest {
  static var requested: Bool { CommandLine.arguments.contains("--render-selftest") }

  @MainActor
  static func run() -> Never {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: "--render-selftest"), i + 1 < args.count else { print("usage: --render-selftest <folder>"); exit(2) }
    let base = URL(fileURLWithPath: (args[i + 1] as NSString).expandingTildeInPath)
    NSApplication.shared.setActivationPolicy(.prohibited)
    Task { @MainActor in
      let ok = await go(base)
      exit(ok ? 0 : 1)
    }
    NSApplication.shared.run()
    exit(1)
  }

  @MainActor
  static func go(_ base: URL) async -> Bool {
    var bad = 0
    func line(_ ok: Bool, _ what: String, _ note: String = "") { if !ok { bad += 1 }; print("\(ok ? "PASS" : "FAIL")  \(what)\(note.isEmpty || ok ? "" : "  (\(note))")"); fflush(stdout) }
    let fm = FileManager.default
    try? fm.removeItem(at: base)
    let project = base.appendingPathComponent("project"), tools = base.appendingPathComponent("tools"), skills = base.appendingPathComponent("skills")
    try? fm.createDirectory(at: project, withIntermediateDirectories: true)
    let svc = PageRender.shared
    svc.dir = base.appendingPathComponent("render")
    svc.extraRoots = [project]
    svc.start()
    line(LocalServer.installWebTools(into: tools), "the web commands (ola-page, ola-see and the rest) install from the app's Resources", "missing some")
    let names = LocalServer.installSkills(into: skills)
    line(names.contains("designer") && names.contains("app-designer"), "Ola's skills install from the app's Resources", names.joined(separator: ","))
    let look = (try? String(contentsOf: skills.appendingPathComponent("designer/SKILL.md"), encoding: .utf8)) ?? ""
    line(look.contains("\(skills.path)/designer/scripts/look.py") && !look.contains("/opt/ola/skills"), "the skills' commands point at this Mac's copy")
    let page = """
      <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rents</title>
      <style>body{margin:0;font:17px/1.6 -apple-system,sans-serif;background:#fbf9f6;color:#211b14} main{max-width:720px;margin:0 auto;padding:32px 16px}
      h1{font-size:40px;margin:0 0 12px} .wide{width:900px;background:#eee} @media (prefers-color-scheme: dark){body{background:#17130e;color:#f2eee9}}</style></head>
      <body><main><h1>Rents rose 12% in Old Town</h1><p>From the 2025 survey of 1,204 households.</p><div class="wide">A box wider than a phone.</div>
      <img src="https://example.test/logo.png" alt="Logo"></main></body></html>
      """
    try? page.write(to: project.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    func olaPage(_ extra: [String]) async -> (Int32, String) {
      await withCheckedContinuation { c in
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        p.arguments = ["python3", tools.appendingPathComponent("ola-page").path, project.appendingPathComponent("index.html").path] + extra
        p.currentDirectoryURL = project
        var env = ProcessInfo.processInfo.environment
        env["OLA_RENDER_DIR"] = svc.dir.path
        env["PATH"] = tools.path + ":/usr/bin:/bin:/opt/homebrew/bin"
        p.environment = env
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        p.terminationHandler = { pr in c.resume(returning: (pr.terminationStatus, String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self))) }
        try? p.run()
      }
    }
    func json(_ name: String) -> [String: Any] { (try? JSONSerialization.jsonObject(with: Data(contentsOf: project.appendingPathComponent(name)))) as? [String: Any] ?? [:] }
    func size(_ name: String) -> (Int, Int) {
      guard let d = try? Data(contentsOf: project.appendingPathComponent(name)), d.count > 24 else { return (0, 0) }
      let b = [UInt8](d.prefix(24))
      return (Int(b[16]) << 24 | Int(b[17]) << 16 | Int(b[18]) << 8 | Int(b[19]), Int(b[20]) << 24 | Int(b[21]) << 16 | Int(b[22]) << 8 | Int(b[23]))
    }
    var (code, out) = await olaPage(["--width", "390", "--out", "p390.png", "--json", "p390.json"])
    var j = json("p390.json")
    line(code == 0 && size("p390.png").0 == 390, "a page renders at 390 px through the app's web view", "\(code) \(out.suffix(300))")
    line((j["horizontal_scroll"] as? Int ?? 0) > 0, "the measurements run in the page: the wide box scrolls sideways at 390 px", "\(j["horizontal_scroll"] ?? "none")")
    line((j["outside_requests"] as? [String] ?? []).contains { $0.contains("example.test") }, "a request to another address is reported (and was blocked)", "\(j["outside_requests"] ?? "none")")
    line(out.contains("sideways scroll:"), "it prints the same plain lines as the image's ola-page", String(out.prefix(200)))
    (code, out) = await olaPage(["--width", "1280", "--viewport", "--scale", "2", "--out", "p1280.png", "--json", "p1280.json"])
    line(code == 0 && size("p1280.png") == (2560, 1800), "at 1280 px, the first screen only, at 2x", "\(size("p1280.png")) \(out.suffix(200))")
    (code, out) = await olaPage(["--width", "390", "--dark", "--viewport", "--out", "dark.png", "--json", "dark.json"])
    j = json("dark.json")
    line(code == 0 && (j["taste"] as? [String: Any])?["background"] as? String == "#17130e", "dark mode reaches the page (prefers-color-scheme)", "\((j["taste"] as? [String: Any])?["background"] ?? "none")")
    let outside = project.deletingLastPathComponent().appendingPathComponent("elsewhere.html")
    try? page.write(to: outside, atomically: true, encoding: .utf8)
    let p2 = Process()
    p2.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    p2.arguments = ["python3", tools.appendingPathComponent("ola-page").path, outside.path, "--out", project.appendingPathComponent("x.png").path]
    p2.environment = ["OLA_RENDER_DIR": svc.dir.path, "PATH": "/usr/bin:/bin"]
    let refused: Int32 = await withCheckedContinuation { c in p2.terminationHandler = { c.resume(returning: $0.terminationStatus) }; try? p2.run() }
    line(refused != 0, "a page outside the project folder is refused")
    // The designer skill's own look.py, through this Mac's ola-page.
    let lp = Process()
    lp.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    lp.arguments = ["python3", skills.appendingPathComponent("designer/scripts/look.py").path, project.appendingPathComponent("index.html").path, "--name", "mac", "--no-see"]
    lp.environment = ["OLA_RENDER_DIR": svc.dir.path, "PATH": tools.path + ":/usr/bin:/bin"]
    let lpipe = Pipe()
    lp.standardOutput = lpipe
    lp.standardError = lpipe
    let lout: String = await withCheckedContinuation { c in lp.terminationHandler = { _ in c.resume(returning: String(decoding: lpipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)) }; try? lp.run() }
    line(lout.contains("At 390 px") && lout.contains("At 1280 px") && fm.fileExists(atPath: project.appendingPathComponent("shots/index-mac-390.png").path),
         "the designer skill's look.py runs on this Mac and saves its shots", String(lout.suffix(400)))
    line(lout.contains("scrolls sideways"), "look.py finds the sideways scroll through the Mac's renderer")
    svc.stop()
    print(bad == 0 ? "ALL PASSED" : "\(bad) FAILED")
    return bad == 0
  }
}
