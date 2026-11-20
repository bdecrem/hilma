import AppKit
import OlaKit
import SwiftUI
import Vision

/// `Ola -OlaDrive <script.json>` (OLA-237): the whole app, as it starts for a person, used the way a
/// person uses it, so a checker can type a sentence in the Mac app without anyone's screen.
///
/// Why inside the app: macOS lets a program click and type in another app only with "Automation
/// Mode" (XCUITest) or the Accessibility permission, and on the test Mac both need an administrator's
/// password at the screen (measured 2026-11-20 on the mini: XCUITest stops with `Timed out while
/// enabling automation mode`). So the app drives itself, through its own real window:
///   - typing is key events sent to the window, one per character, into whatever has the focus; a
///     text field gets the focus by a mouse click at its center, which the window's hit-testing
///     delivers (a covered field fails the run);
///   - buttons are pressed by their keyboard shortcuts, as the application hands a key on (the
///     window's shortcuts first, then the menu bar): Return for Sign In, for Start in New Session and
///     for the card's "Yes, this once"; Command-N for New Session. A disabled button takes nothing,
///     and the run stops when nothing happens;
///   - the answer is read from the window's picture with text recognition (Vision), not from the app.
/// What this does not exercise (README, "Using the apps as a checker"): the window server's own
/// input path (real hardware, focus between apps, another app's window on top), and mouse clicks on
/// buttons (SwiftUI does not give a program in the same process where a button is; its accessibility
/// tree is empty until an assistive app asks, and that needs the permission above).
///
/// It runs as a separate copy with its own home (`CFFIXED_USER_HOME`, set by tools/drive.sh), so its
/// settings, Application Support and opencode state are its own; secrets live in memory only, never
/// the Keychain. The password comes from a file named in the script and is never written anywhere.
///
/// Script (JSON): {"out": dir, "handle": name, "passwordFile": file, "where": "cloud"|"local",
///   "project": slug?, "folder": dir? (local), "says": [sentence, ...], "card": "yes"|"any"|"no",
///   "waitSeconds": n}
/// Result: <out>/transcript.json and one PNG per step; exit 0 only when every sentence got a finished
/// answer on the screen (and a card came when "card" is "yes"). The last line printed is the verdict.
@MainActor
enum MacDrive {
  nonisolated static var requested: Bool { CommandLine.arguments.contains("-OlaDrive") }

  struct Script: Decodable {
    var out: String
    var handle: String
    var passwordFile: String
    var `where`: String
    var project: String?
    var folder: String?
    var says: [String]
    var card: String?
    var waitSeconds: Double?
  }

  static var script: Script?

  /// The settings domain of a driven copy (DriveDefaults, at the end of this file): emptied at each start, never the app's own `cx.ola.mac`.
  nonisolated static let defaultsDomain = "cx.ola.mac.drive"

  /// Every `UserDefaults.standard` in the app (its own code, SwiftUI's @AppStorage, AppKit's window
  /// frames) becomes the drive's own domain, so a driven copy never reads or changes the settings
  /// of an Ola someone uses on this Mac. First thing in main(), before anything reads a setting.
  nonisolated static func isolateDefaults() {
    UserDefaults.standard.removePersistentDomain(forName: defaultsDomain)
    DriveDefaults.suite = UserDefaults(suiteName: defaultsDomain)
    guard let original = class_getClassMethod(UserDefaults.self, #selector(getter: UserDefaults.standard)),
          let ours = class_getClassMethod(DriveDefaults.self, #selector(DriveDefaults.driveStandard)) else {
      print("DRIVE FAIL  the settings could not be kept apart"); exit(2)
    }
    method_setImplementation(original, method_getImplementation(ours))
  }

  /// Before the app's stores are made: secrets in memory, the runtime and project chosen.
  nonisolated static func prepare() {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: "-OlaDrive") else { return }
    guard i + 1 < args.count, let data = FileManager.default.contents(atPath: args[i + 1]), let s = try? JSONDecoder().decode(Script.self, from: data) else {
      print("DRIVE FAIL  the script could not be read"); exit(2)
    }
    // In memory, for this copy only (not `disabled`: that would refuse the sign-in itself).
    SecretStore.backend = MemorySecrets()
    LocalSettings.shown = s.where == "local" ? .local : .cloud
    if let f = s.folder { LocalSettings.defaults.set(f, forKey: LocalSettings.folderKey) }
    if let pr = s.project { OlaCloud.defaults.set(pr, forKey: OlaCloud.projectKey) }
    // The phone link stays off: this copy never opens a port.
    UserDefaults.standard.set(false, forKey: "ola.phone.enabled")
    MainActor.assumeIsolated { script = s }
  }

  // MARK: the record

  struct Entry: Encodable {
    var at: Double
    var step: String
    var shot: String?
  }
  struct Said: Encodable {
    var sentence: String
    var sentAt: Double?
    var endedAt: Double?
    var status: String
    var cards: [String] = []
    var answered: [String] = []
    var answerOnScreen: String = ""
    var answerInApp: String = ""
    var wordsOnScreen: String = ""
    var steps: [String] = []
  }
  struct Record: Encodable {
    var app = "mac"
    var mode = "in-app drive (-OlaDrive): the real window, key and mouse events sent to it, buttons by their keyboard shortcuts, the answer read from its picture"
    var bundle: String
    var version: String
    var build: String
    var `where`: String
    var project: String?
    var handle: String
    var started: String
    var ok = false
    var verdict = ""
    var steps: [Entry] = []
    var said: [Said] = []
    var screenText: [String] = []
  }

  static var record: Record!
  static var t0 = Date()
  static var shotN = 0
  static var out: URL!

  static func say(_ s: String) { print(String(format: "%6.1f  ", Date().timeIntervalSince(t0)) + s); fflush(stdout) }
  static var now: Double { (Date().timeIntervalSince(t0) * 10).rounded() / 10 }

  // MARK: run

  static func start(delegate: AppDelegate) {
    guard let s = script else { return }
    out = URL(fileURLWithPath: (s.out as NSString).expandingTildeInPath)
    try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    let info = Bundle.main.infoDictionary ?? [:]
    record = Record(bundle: Bundle.main.bundlePath, version: info["CFBundleShortVersionString"] as? String ?? "?", build: info["CFBundleVersion"] as? String ?? "?",
                    where: s.where, project: s.project, handle: s.handle, started: ISO8601DateFormatter().string(from: Date()))
    say("Ola \(record.version) (\(record.build)) at \(record.bundle), \(s.where)")
    Task { @MainActor in
      do {
        try await run(s, delegate: delegate)
        record.ok = true
        record.verdict = "every sentence got a finished answer on the screen"
        finish(0)
      } catch let e as Failed {
        record.verdict = e.why
      } catch {
        record.verdict = "\(error)"
      }
      shot("stopped-here")
      dumpViews()
      finish(1)
    }
  }

  struct Failed: Error { var why: String }

  static func finish(_ code: Int32) -> Never {
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    if let d = try? enc.encode(record) { try? d.write(to: out.appendingPathComponent("transcript.json")) }
    say((code == 0 ? "DRIVE PASS  " : "DRIVE FAIL  ") + record.verdict)
    exit(code)
  }

  static func run(_ s: Script, delegate: AppDelegate) async throws {
    let wait = s.waitSeconds ?? 600
    let password = try String(contentsOfFile: (s.passwordFile as NSString).expandingTildeInPath, encoding: .utf8).trimmingCharacters(in: .newlines)
    // The app's window, kept out of sight.
    let window = try await until(30, "the app's window never opened") { mainWindow() }
    hide(window)
    try await settle(window, 2)
    step("the app opened", shot: "open")
    let store = try await until(20, "the app opened without its stores") { delegate.store }
    let whereOla = try await until(20, "the app opened without its runtimes") { delegate.whereOla }

    // Signed out: the sign-in screen, typed like a person (a click in the name field, the name,
    // Return, the password, Return).
    if whereOla.account?.signedIn != true {
      let fields = try await until(20, "the sign-in screen has no name and password fields") { () -> [NSTextField]? in let f = textFields(in: window); return f.count >= 2 ? f : nil }
      try click(fields[0], in: window)
      type(s.handle, in: window)
      try await settle(window, 0.5)
      step("typed the name", shot: "signin-name")
      key(.return, in: window)
      try await settle(window, 0.5)
      type(password, in: window)
      try await settle(window, 0.3)
      step("typed the password (not recorded)", shot: "signin-password")
      key(.return, in: window)
      _ = try await until(60, "the sign-in did not finish") { () -> Bool? in
        if case .problem(let p) = whereOla.account?.phase ?? .idle { failNow = "the sign-in was refused: \(p)" }
        if whereOla.account?.phase == .expired { failNow = "the app says “You’ve been signed out on this Mac” right after signing in" }
        return whereOla.account?.signedIn == true ? true : nil
      }
      step("signed in", shot: "signed-in")
    }
    _ = try await until(120, "the app never connected to the \(s.where) runtime (\(store.connection))") { () -> Bool? in
      if let p = whereOla.problem, !p.isEmpty, store.connection != .open { failNow = "the app says: \(p)" }
      if whereOla.account?.phase == .expired { failNow = "the app says “You’ve been signed out on this Mac” right after signing in" }
      return store.connection == .open && store.runtime == (s.where == "local" ? .local : .cloud) ? true : nil
    }
    record.project = s.where == "cloud" ? (OlaCloud.project(of: store.config) ?? s.project) : nil
    try await settle(window, 1.5)
    step("connected: \(MacRoot.subtitle(store))\(record.project.map { ", project \($0)" } ?? "")", shot: "project-open")

    // A new conversation: New Session (Command-N, the menu's shortcut), then Return for Start in the
    // sheet (the runtime picked is the last one used, the one this run is in).
    shortcut("n", code: 45, in: window)
    let sheet = try await until(10, "Command-N did not open the New Session sheet") { window.attachedSheet }
    try await settle(sheet, 0.8)
    step("New Session", shot: "new-session")
    key(.return, in: sheet)
    _ = try await until(10, "Return did not start the session (Start disabled?); the sheet stayed") { window.attachedSheet == nil ? true : nil }
    try await settle(window, 1)
    step("a new session", shot: "new-session-started")

    for (i, sentence) in s.says.enumerated() {
      var said = Said(sentence: sentence, status: "not sent")
      defer { record.said.append(said) }
      let n = i + 1
      // The box to type in: the conversation's text field, the lowest one in the window.
      let box = try await until(15, "no box to type in") { textFields(in: window).last }
      try click(box, in: window)
      type(sentence, in: window)
      try await settle(window, 0.8)
      step("typed sentence \(n)", shot: "say\(n)-typed")
      let mine = { (t: Turn) in t.request.trimmingCharacters(in: .whitespacesAndNewlines) == sentence.trimmingCharacters(in: .whitespacesAndNewlines) }
      let before = store.conversation?.turns.filter(mine).count ?? 0
      key(.return, in: window)
      said.sentAt = now
      said.status = "sent"
      _ = try await until(30, "the sentence was not taken (no new turn after Return)") { () -> Bool? in
        (store.conversation?.turns.filter(mine).count ?? 0) > before ? true : nil
      }
      step("sent sentence \(n)", shot: "say\(n)-sent")
      // Until the turn ends; a card is answered the way the script says.
      let end = Date().addingTimeInterval(wait)
      var lastCard: String?
      while true {
        let turn = store.conversation?.turns.last(where: mine)
        if Date() > end {
          said.status = "timeout"
          said.answerInApp = turn?.answer ?? ""
          throw Failed(why: "no finished answer to sentence \(n) after \(Int(wait)) s")
        }
        if let a = store.conversation?.approval, a.id != lastCard {
          lastCard = a.id
          said.cards.append(a.title + (a.items.first.map { ": \($0.label)" } ?? ""))
          try await settle(window, 0.8)
          step("card: \(a.title)", shot: "say\(n)-card\(said.cards.count)")
          if s.card == "no" { said.status = "card"; throw Failed(why: "a card came (\(a.title)) and the script says no card may come") }
          // Return is the card's default button, "Yes, this once" (a disabled one takes nothing).
          key(.return, in: window)
          said.answered.append("Yes, this once (Return)")
          _ = try await until(20, "the card stayed after Return (its Yes, this once)") { store.conversation?.approval?.id == a.id ? nil : true }
          step("answered the card: Yes, this once", shot: "say\(n)-card\(said.cards.count)-answered")
        }
        if whereOla.account?.phase == .expired { said.status = "signed out"; throw Failed(why: "the app signed out while answering (“You’ve been signed out on this Mac”)") }
        if let p = store.problem {
          said.status = "error"
          throw Failed(why: "the app shows an error: \(p.text)")
        }
        if let t = turn, !t.isRunning {
          said.endedAt = now
          said.answerInApp = t.answer
          said.steps = t.steps.map { "\($0.verb) \($0.object) [\($0.status.rawValue)]" }
          if t.status != .done {
            said.status = t.status.rawValue
            try await settle(window, 1)
            throw Failed(why: "the turn for sentence \(n) ended \(t.status.rawValue)\(t.error.map { ": \($0.text)" } ?? "")")
          }
          break
        }
        try await Task.sleep(nanoseconds: 300_000_000)
      }
      if s.card == "yes", said.cards.isEmpty { said.status = "no card"; throw Failed(why: "no card came for sentence \(n), and the script says one must") }
      try await settle(window, 2.5)
      // The answer as the screen shows it: the window's picture, read back with text recognition.
      let file = shot("say\(n)-answer")
      record.steps.append(Entry(at: now, step: "answer \(n) on the screen", shot: file))
      let lines = file.flatMap { readText(out.appendingPathComponent($0)) } ?? []
      record.screenText = lines
      guard !words(said.answerInApp).isEmpty else { said.status = "no answer"; throw Failed(why: "sentence \(n) finished with no answer in words") }
      let (seen, of, shown) = onScreen(said.answerInApp, lines: lines)
      said.answerOnScreen = shown
      said.wordsOnScreen = "\(seen) of the answer's last \(of) words"
      say("answer \(n): \(seen) of the last \(of) words of the answer are on the screen")
      guard of > 0, Double(seen) / Double(of) >= 0.6 else { said.status = "answer not on screen"; throw Failed(why: "the answer to sentence \(n) is not on the screen (\(seen) of its last \(of) words read there)") }
      said.status = "answered"
    }
  }

  /// Fails a wait at once with this reason (set inside a wait's check).
  static var failNow: String?

  static func until<T>(_ seconds: Double, _ why: String, _ check: () -> T?) async throws -> T {
    let end = Date().addingTimeInterval(seconds)
    while Date() < end {
      if let w = failNow { failNow = nil; throw Failed(why: w) }
      if let v = check() { return v }
      try await Task.sleep(nanoseconds: 200_000_000)
    }
    throw Failed(why: why)
  }

  static func settle(_ w: NSWindow, _ seconds: Double) async throws {
    hide(w)
    try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    w.contentView?.layoutSubtreeIfNeeded()
  }

  static func step(_ what: String, shot name: String? = nil) {
    let file = name.flatMap { shot($0) }
    record.steps.append(Entry(at: now, step: what, shot: file))
    say(what + (file.map { "  [\($0)]" } ?? ""))
  }

  // MARK: the window

  static func mainWindow() -> NSWindow? {
    NSApp.windows.first { $0.identifier?.rawValue.hasPrefix("main") == true } ?? NSApp.windows.first { $0.contentView != nil && $0.styleMask.contains(.titled) && $0.sheetParent == nil }
  }

  /// Out of sight: far off every display (as Snapshot.writeLive puts its windows), never under the
  /// real mouse. Not transparent: a window at alpha 0 counts as hidden, and SwiftUI then stops
  /// drawing the conversation's scrolled content and the card.
  static func hide(_ w: NSWindow) {
    keepWhereItIs(Swift.type(of: w))
    w.ignoresMouseEvents = true
    if w.frame.origin.x > -10_000 { w.setFrame(NSRect(origin: CGPoint(x: -30_000, y: -30_000), size: CGSize(width: 1280, height: 820)), display: true) }
  }

  /// macOS pulls a titled window back onto a display; for this window's class, a frame stays where
  /// it is put (what SnapshotWindow does for the snapshot's own windows).
  static var kept = Set<ObjectIdentifier>()
  static func keepWhereItIs(_ cls: NSWindow.Type) {
    guard kept.insert(ObjectIdentifier(cls)).inserted else { return }
    let sel = #selector(NSWindow.constrainFrameRect(_:to:))
    let block: @convention(block) (NSWindow, NSRect, NSScreen?) -> NSRect = { _, r, _ in r }
    guard let m = class_getInstanceMethod(cls, sel) else { return }
    class_replaceMethod(cls, sel, imp_implementationWithBlock(block), method_getTypeEncoding(m))
  }

  /// The window (and a sheet on it, beside it) as it draws itself, into the run's folder.
  @discardableResult
  static func shot(_ name: String) -> String? {
    guard let w = mainWindow(), out != nil else { return nil }
    shotN += 1
    let file = String(format: "%02d-%@.png", shotN, name)
    // The window as the window server composited it (an app may read its own windows with no
    // permission). SwiftUI draws text on the GPU, which a drawing of the view tree in this process
    // leaves blank, so that is only the fallback.
    func write(_ win: NSWindow, _ f: String) {
      if let image = windowImage(win) {
        try? NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent(f))
        return
      }
      guard let view = win.contentView?.superview ?? win.contentView else { return }
      view.layoutSubtreeIfNeeded()
      view.displayIfNeeded()
      CATransaction.flush()
      let scale: CGFloat = 1
      let w = Int(view.bounds.width * scale), h = Int(view.bounds.height * scale)
      if let layer = view.layer, let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
        ctx.scaleBy(x: scale, y: scale)
        if view.isFlipped { ctx.translateBy(x: 0, y: view.bounds.height); ctx.scaleBy(x: 1, y: -1) }
        layer.render(in: ctx)
        if let image = ctx.makeImage() {
          try? NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent(f))
          return
        }
      }
      guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
      view.cacheDisplay(in: view.bounds, to: rep)
      try? rep.representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent(f))
    }
    write(w, file)
    if let sheet = w.attachedSheet { write(sheet, file.replacingOccurrences(of: ".png", with: "-sheet.png")) }
    return file
  }

  /// CGWindowListCreateImage for one of this app's own windows. The SDK marks it unavailable since
  /// macOS 15 (ScreenCaptureKit replaces it, and that asks for the Screen Recording permission even
  /// for an app's own windows); the function is still in CoreGraphics, so it is looked up by name.
  static func windowImage(_ w: NSWindow) -> CGImage? {
    typealias Fn = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
    guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreateImage") else { return nil }
    let fn = unsafeBitCast(sym, to: Fn.self)
    // kCGWindowListOptionIncludingWindow = 1 << 3; kCGWindowImageBoundsIgnoreFraming = 1 << 0.
    return fn(.null, 1 << 3, UInt32(w.windowNumber), 1 << 0)?.takeRetainedValue()
  }

  /// The view tree, for a run that stopped.
  static func dumpViews() {
    guard let w = mainWindow(), out != nil else { return }
    var lines: [String] = []
    func views(_ v: NSView, _ d: Int) {
      lines.append(String(repeating: " ", count: d) + "\(Swift.type(of: v)) \(Int(v.frame.minX)),\(Int(v.frame.minY)) \(Int(v.frame.width))x\(Int(v.frame.height))")
      for c in v.subviews { views(c, d + 1) }
    }
    if let c = w.contentView { views(c, 0) }
    try? lines.joined(separator: "\n").write(to: out.appendingPathComponent("views.txt"), atomically: true, encoding: .utf8)
  }

  /// The window's editable text fields (SwiftUI's TextField and SecureField are AppKit text fields
  /// on the Mac), top to bottom.
  static func textFields(in w: NSWindow) -> [NSTextField] {
    var found: [NSTextField] = []
    func walk(_ v: NSView) {
      if let f = v as? NSTextField, f.isEditable, !f.isHiddenOrHasHiddenAncestor { found.append(f) }
      v.subviews.forEach(walk)
    }
    if let c = w.contentView { walk(c) }
    return found.sorted { $0.convert($0.bounds, to: nil).maxY > $1.convert($1.bounds, to: nil).maxY }
  }

  // MARK: input, sent to the window as events

  /// A mouse-down and mouse-up at the view's center. The window's hit-testing decides what gets it:
  /// a field covered by another view, or outside the window, fails the run.
  static func click(_ v: NSView, in w: NSWindow) throws {
    let r = v.convert(v.bounds, to: nil)
    let p = CGPoint(x: r.midX, y: r.midY)
    guard let frame = w.contentView?.superview ?? w.contentView else { throw Failed(why: "the window has no content") }
    guard frame.bounds.contains(frame.convert(p, from: nil)) else { throw Failed(why: "the field is outside the window") }
    let hit = frame.hitTest(frame.convert(p, from: nil))
    guard let hit, hit === v || hit.isDescendant(of: v) else {
      throw Failed(why: "the field is covered: a click on it lands on \(hit.map { "\(Swift.type(of: $0))" } ?? "nothing")")
    }
    func mouse(_ type: NSEvent.EventType) -> NSEvent? {
      NSEvent.mouseEvent(with: type, location: p, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0)
    }
    guard let down = mouse(.leftMouseDown), let up = mouse(.leftMouseUp) else { throw Failed(why: "no mouse event could be made") }
    // A text field tracks the mouse after the down until an up comes from the event queue: the up
    // is queued first, then the down is handed to the window.
    NSApp.postEvent(up, atStart: false)
    w.sendEvent(down)
    RunLoop.main.run(until: Date().addingTimeInterval(0.15))
  }

  enum Key { case `return` }

  static func key(_ k: Key, in w: NSWindow) {
    switch k {
    case .return: press("\r", code: 36, in: w, shortcuts: true)
    }
  }

  /// A Command shortcut, as the application takes it: the window's own, then the menu bar's.
  static func shortcut(_ c: String, code: UInt16, in w: NSWindow) {
    guard let ev = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [.command], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.windowNumber, context: nil, characters: c, charactersIgnoringModifiers: c, isARepeat: false, keyCode: code) else { return }
    if !w.performKeyEquivalent(with: ev) { _ = NSApp.mainMenu?.performKeyEquivalent(with: ev) }
    RunLoop.main.run(until: Date().addingTimeInterval(0.1))
  }

  /// One key event per character, into what has the focus.
  static func type(_ text: String, in w: NSWindow) {
    for ch in text { press(String(ch), code: 0, in: w, shortcuts: false) }
  }

  /// A key down and up, the way the application hands a key on: first to the window's keyboard
  /// shortcuts (a default button takes Return), then to what has the focus.
  static func press(_ chars: String, code: UInt16, in w: NSWindow, shortcuts: Bool) {
    for type in [NSEvent.EventType.keyDown, .keyUp] {
      guard let ev = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.windowNumber, context: nil, characters: chars, charactersIgnoringModifiers: chars, isARepeat: false, keyCode: code) else { continue }
      if type == .keyDown, shortcuts, w.performKeyEquivalent(with: ev) { continue }
      w.sendEvent(ev)
    }
    RunLoop.main.run(until: Date().addingTimeInterval(0.02))
  }

  // MARK: reading the answer

  /// The words in a picture, line by line (Vision's text recognition, on this Mac).
  static func readText(_ url: URL) -> [String]? {
    guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    try? VNImageRequestHandler(cgImage: cg).perform([req])
    return (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  }

  static func words(_ s: String) -> [String] {
    s.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter { $0.count >= 3 }
  }

  /// How many of the answer's last words (up to 30) the screen shows, and the lines that hold them.
  static func onScreen(_ answer: String, lines: [String]) -> (Int, Int, String) {
    let screen = Set(lines.flatMap(words))
    let last = Array(words(answer).suffix(30))
    let seen = last.filter { screen.contains($0) }.count
    let aw = Set(words(answer))
    let shown = lines.filter { l in let w = words(l); return !w.isEmpty && Double(w.filter { aw.contains($0) }.count) / Double(w.count) >= 0.6 }
    return (seen, last.count, shown.joined(separator: "\n"))
  }
}

/// Hands out the drive's settings domain in place of the standard one (MacDrive.isolateDefaults).
final class DriveDefaults: NSObject {
  nonisolated(unsafe) static var suite: UserDefaults?
  @objc class func driveStandard() -> UserDefaults { DriveDefaults.suite! }
}
