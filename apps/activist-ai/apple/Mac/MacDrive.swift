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
///   "waitSeconds": n, "pick": model?, "tryAgain": model?, "small": bool?}
/// "pick" (OLA-339/340): the model picked at the box before the first sentence, by its shortcut
/// (Option-Command-<n>, the Model menu), e.g. "DeepSeek V4 Pro". "tryAgain": after the last answer,
/// that request again with this model, by Control-Option-Command-<n> (Model, Try Again With).
/// "small": the window at 760 by 560. After every answer the run fails unless "Try again with"
/// under the latest request is all in view, above the box (OLA-337).
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
    var pick: String?
    var tryAgain: String?
    var small: Bool?
    /// The window's size, "1400x900" (OLA-344: the crash came at a person's own window size).
    var size: String?
    /// Picks the model this many times more, back and forth with Ola, before the first sentence (OLA-344).
    var pickRounds: Int?
    /// The window stays on the screen, behind the others, at the size it opens with (OLA-344: the crash
    /// came in a window on the screen, macOS 27).
    var visible: Bool?
    /// The pick made with the mouse in the box's own menu, as a person does, not by the shortcut.
    /// Caution: the menu's own loop then runs inside the drive's task; on macOS 27 with build 30 that
    /// ended the app in AppDelegate.keepAppMenuPlain (EXC_BAD_ACCESS in MainActor.assumeIsolated), a
    /// crash of the drive's making, not Bart's (OLA-344).
    var menuPick: Bool?
    /// The phone through this Mac (OLA-237 check 4): the copy lets a phone connect (Settings, Phone,
    /// Let my phone connect, on `port`), pairs one as Pair a Phone does, writes the code a person
    /// would type into `codeFile` (mode 600), and types nothing itself. When `doneFile` appears (the
    /// phone's run ended), it opens the newest session and the run passes only when the phone's
    /// sentences and an answer to each show in this Mac's window.
    var phone: PhoneServe?
    /// When Ola asks a question: New Session, then back to the asking session as a click in the
    /// sidebar does (its selection), and the run fails unless the same question shows again before it
    /// is answered (OLA-301 check 7).
    var away: Bool?
  }
  struct PhoneServe: Decodable {
    var codeFile: String
    var doneFile: String
    var port: Int?
    /// Where the copy listens and what the code names: 127.0.0.1 for a simulator on this Mac
    /// (PhoneLink.driveHost says why); absent, the Tailscale address as for a person.
    var host: String?
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
    // The phone link stays off: this copy never opens a port, unless the run is the phone through
    // this Mac; then on a port of its own (never 4330, an Ola a person runs here may have that one).
    UserDefaults.standard.set(s.phone != nil, forKey: "ola.phone.enabled")
    if let p = s.phone { UserDefaults.standard.set(p.port ?? 4338, forKey: "ola.phone.port"); PhoneLink.driveHost = p.host }
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
    /// Ola's questions (OLA-301), each answered with its first choice (Command-1).
    var questions: [String] = []
    var answered: [String] = []
    var answerOnScreen: String = ""
    var answerInApp: String = ""
    var wordsOnScreen: String = ""
    var steps: [String] = []
    /// Who made the answer, as the app marks it ("Ola", "DeepSeek V4 Pro", ...) (OLA-337).
    var by: String = ""
    /// "Try again with" under it: all in view above the box, or not.
    var tryAgainInView: Bool?
  }
  struct Record: Encodable {
    var app = "mac"
    var mode = "in-app drive (-OlaDrive): the real window, key and mouse events sent to it, buttons by their keyboard shortcuts, the answer read from its picture"
    var bundle: String
    var version: String
    var build: String
    /// Debug or Release, and the commit it was built from (OLA-277: a drivable Debug build carried
    /// the shipped build's number, so a transcript could not say which build it drove).
    var configuration: String
    var commit: String?
    var `where`: String
    var project: String?
    var handle: String
    var started: String
    var ok = false
    var verdict = ""
    var steps: [Entry] = []
    var said: [Said] = []
    var screenText: [String] = []
    var picked: String?
  }

  static var record: Record!
  static var t0 = Date()
  static var shotN = 0
  static var out: URL!

  /// "31" for the shipped build; "31 Debug of 0f297294a1b2" for a drivable one, never the bare number.
  static func buildName(_ number: String, configuration: String, commit: String?) -> String {
    if configuration == "Release" { return number }
    return "\(number) \(configuration)" + (commit.map { " of \($0)" } ?? "")
  }

  static func say(_ s: String) { print(String(format: "%6.1f  ", Date().timeIntervalSince(t0)) + s); fflush(stdout) }
  static var now: Double { (Date().timeIntervalSince(t0) * 10).rounded() / 10 }

  // MARK: run

  static func start(delegate: AppDelegate) {
    guard let s = script else { return }
    out = URL(fileURLWithPath: (s.out as NSString).expandingTildeInPath)
    try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    let info = Bundle.main.infoDictionary ?? [:]
    let config = (info["OlaConfiguration"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "unknown"
    let commit = (info["OlaCommit"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    let number = info["CFBundleVersion"] as? String ?? "?"
    record = Record(bundle: Bundle.main.bundlePath, version: info["CFBundleShortVersionString"] as? String ?? "?", build: Self.buildName(number, configuration: config, commit: commit),
                    configuration: config, commit: commit, where: s.where, project: s.project, handle: s.handle, started: ISO8601DateFormatter().string(from: Date()))
    say("Ola \(record.version) (\(record.build)) at \(record.bundle), \(s.where)")
    AccountController.trace = { line in Task { @MainActor in say("account: " + line) } }
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
    Self.store = store
    let whereOla = try await until(20, "the app opened without its runtimes") { delegate.whereOla }

    // Signed out: the sign-in screen, typed like a person (a click in the name field, the name,
    // Return, the password, Return).
    if whereOla.account?.signedIn != true {
      let fields = try await until(20, "the sign-in screen has no name and password fields") { () -> [NSTextField]? in let f = textFields(in: window); return f.count >= 2 ? f : nil }
      // Typed again when it did not land (OLA-344: on macOS 27 the first keys after the window
      // opens were sometimes lost, and the sign-in went out with no name).
      for attempt in 0..<4 {
        if attempt > 0 { try await settle(window, 1) }
        try click(fields[0], in: window)
        type(s.handle, in: window)
        try await settle(window, 0.5)
        if fields[0].stringValue == s.handle { break }
        say("the name did not land in its field (it says \"\(fields[0].stringValue)\"); again")
        fields[0].stringValue = ""
      }
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
    // Signed in out of sight (typing reaches a window that is not on the screen); from here on, on the
    // screen behind the other windows, as a person's window is (OLA-344).
    if s.visible == true {
      window.ignoresMouseEvents = false
      window.setFrame(NSRect(x: 60, y: 60, width: 1280, height: 820), display: true)
      window.orderBack(nil)
      try await settle(window, 1)
    }

    if let p = s.phone {
      try await servePhone(p, s, delegate: delegate, window: window, wait: wait)
      return
    }

    // A new conversation: New Session (Command-N, the menu's shortcut), then Return for Start in the
    // sheet (the runtime picked is the last one used, the one this run is in).
    shortcut("n", code: 45, in: window)
    let sheet = try await until(10, "Command-N did not open the New Session sheet") { window.attachedSheet }
    try await settle(sheet, 0.8)
    step("New Session", shot: "new-session")
    key(.return, in: sheet)
    _ = try await until(10, "Return did not start the session (Start disabled?); the sheet stayed") { window.attachedSheet == nil ? true : nil }
    if s.small == true { window.setContentSize(NSSize(width: 760, height: 560)) }
    if let z = s.size?.split(separator: "x").compactMap({ Double($0) }), z.count == 2 { window.setContentSize(NSSize(width: z[0], height: z[1])) }
    try await settle(window, 1)
    step("a new session", shot: "new-session-started")

    // The model for this session, picked at the box before the first request (OLA-339).
    if let name = s.pick {
      guard let c = EngineChoice.named(name) else { throw Failed(why: "no model called \(name); the choices are \(EngineChoice.all.map(\.name).joined(separator: ", "))") }
      _ = try await until(60, "\(c.name) is not offered here (the box lists \(store.choices.map(\.name).joined(separator: ", ")))") { store.choices.contains(c) ? true : nil }
      if s.menuPick == true {
        try await pickInTheBox(c, in: window)
        _ = try await until(5, "the box's menu did not pick \(c.name) (the box says \(store.nextChoice.name))") { store.nextChoice == c ? true : nil }
      } else {
        try await viaMenu(["Model", c.name], key: c.digit, modifiers: [.command, .option], in: window) { store.nextChoice == c }
      }
      // Back and forth with Ola, each time by the shortcut, the window settling between (OLA-344:
      // build 30 crashed on Bart's Mac at the pick, every time, with Ola working on the Mac).
      for r in 0..<(s.pickRounds ?? 0) {
        for x in [EngineChoice.ola, c] {
          shortcut("\(x.digit)", code: digitCode(x.digit), in: window, modifiers: [.command, .option])
          _ = try await until(5, "round \(r + 1): Option-Command-\(x.digit) did not pick \(x.name)") { store.nextChoice == x ? true : nil }
          try await settle(window, 0.6)
        }
      }
      if let r = s.pickRounds, r > 0 { say("picked \(c.name) and Ola back and forth \(r) times; the app is still running") }
      record.picked = c.name
      try await settle(window, 0.8)
      step("picked \(c.name) at the box (Option-Command-\(c.digit))", shot: "picked")
    }

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
        // Ola's question (OLA-301): its first choice by its shortcut, Command-1, as a person could
        // press it; one pick-several question its first two boxes and Send my answers; any other card
        // (no choices, two questions) gets "Yes, go ahead."
        // typed in the box and Return, which answers the whole card (OLA-320).
        if store.conversation?.approval == nil, let q = store.conversation?.question, q.id != lastCard {
          lastCard = q.id
          let f = q.fields.first
          said.questions.append(q.fields.map { $0.text + " [" + $0.options.map(\.label).joined(separator: " | ") + "]" }.joined(separator: " / "))
          try await settle(window, 0.8)
          step("question: \(f?.text ?? "")", shot: "say\(n)-question\(said.questions.count)")
          if s.away == true, let here = store.selectedID {
            // Away and back, before answering (OLA-301 check 7): New Session (Command-N, Return), then
            // the asking session chosen again, as the sidebar's click sets the selection.
            shortcut("n", code: 45, in: window)
            let sheet = try await until(10, "Command-N did not open the New Session sheet") { window.attachedSheet }
            try await settle(sheet, 0.8)
            key(.return, in: sheet)
            _ = try await until(10, "Return did not start the other session") { window.attachedSheet == nil ? true : nil }
            _ = try await until(30, "the other session did not open") { store.selectedID != here ? true : nil }   // a new session is a draft, with no id, until its first request
            try await settle(window, 1.5)
            step("away: another session opened, the question not answered", shot: "say\(n)-question\(said.questions.count)-away")
            store.selectedID = here
            _ = try await until(30, "back in the asking session, its question did not show again") { store.selectedID == here && store.conversation?.question?.id == q.id ? true : nil }
            try await settle(window, 1.5)
            step("back in the asking session: the same question waits", shot: "say\(n)-question\(said.questions.count)-back")
            said.answered.append("away and back")
          }
          if let first = f?.options.first, q.single {
            shortcut("1", code: 18, in: window)
            said.answered.append("\(first.label) (Command-1)")
          } else if let f, q.fields.count == 1, f.multiple, f.options.count >= 2 {
            // A pick-several question (OLA-301 check 5): its first two boxes ticked by Command-1 and
            // Command-2, then Return, the card's default button, Send my answers.
            shortcut("1", code: 18, in: window)
            try await settle(window, 0.4)
            shortcut("2", code: 19, in: window)
            try await settle(window, 0.6)
            step("ticked \(f.options[0].label) and \(f.options[1].label)", shot: "say\(n)-question\(said.questions.count)-ticked")
            key(.return, in: window)
            said.answered.append("\(f.options[0].label) + \(f.options[1].label) (Command-1, Command-2, Return = \(q.sendLabel ?? "Send"))")
          } else {
            let box = try await until(15, "no box to type the answer in") { textFields(in: window).last }
            try click(box, in: window)
            type("Yes, go ahead.", in: window)
            key(.return, in: window)
            said.answered.append("Yes, go ahead. (typed, Return)")
          }
          _ = try await until(20, "the question stayed after it was answered") { store.conversation?.question?.id == q.id ? nil : true }
          step("answered the question: \(said.answered.last ?? "")", shot: "say\(n)-question\(said.questions.count)-answered")
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
      // The turn's own error line comes before "no card": on Nov 21 a run with a used-up weekly
      // allowance reported only "no card came", which named the wrong cause.
      if let e = store.conversation?.turns.last?.error { said.status = "error"; throw Failed(why: "the app shows an error under the answer: \(e.text)") }
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
      try await checkTryAgain(&said, n)
    }

    // "Try again with" on the latest answer, by its shortcut (OLA-340).
    if let name = s.tryAgain, let last = s.says.last {
      guard let c = EngineChoice.named(name) else { throw Failed(why: "no model called \(name)") }
      var said = Said(sentence: "Try again with \(c.name): \(last)", status: "not sent")
      defer { record.said.append(said) }
      guard store.choices.contains(c) else { throw Failed(why: "\(c.name) is not offered under Try again with here") }
      let before = store.conversation?.turns.count ?? 0
      try await viaMenu(["Model", "Try Again With", c.name], key: c.digit, modifiers: [.command, .option, .control], in: window) { (store.conversation?.turns.count ?? 0) > before }
      said.sentAt = now
      _ = try await until(30, "Control-Option-Command-\(c.digit) sent nothing") { (store.conversation?.turns.count ?? 0) > before ? true : nil }
      said.status = "sent"
      step("Try again with \(c.name) (Control-Option-Command-\(c.digit))", shot: "try-again-sent")
      let t = try await until(wait, "no finished answer from \(c.name) after \(Int(wait)) s") { () -> Turn? in
        guard let t = store.conversation?.turns.last, !t.isRunning else { return nil }
        return t
      }
      said.endedAt = now
      said.answerInApp = t.answer
      said.by = MadeByWords.name(t.engine, model: t.model)
      guard t.status == .done else { said.status = t.status.rawValue; throw Failed(why: "Try again with \(c.name) ended \(t.status.rawValue)\(t.error.map { ": \($0.text)" } ?? "")") }
      guard EngineChoice.of(t) == c else { said.status = "wrong model"; throw Failed(why: "Try again with \(c.name) was answered by \(said.by)") }
      try await settle(window, 2.5)
      _ = shot("try-again-answer")
      said.status = "answered"
      try await checkTryAgain(&said, s.says.count + 1)
    }
  }

  /// The phone through this Mac: pair, wait for the phone's run, then find its conversation here.
  static func servePhone(_ p: PhoneServe, _ s: Script, delegate: AppDelegate, window: NSWindow, wait: Double) async throws {
    let link = try await until(20, "the app opened without its phone link") { delegate.phoneLink }
    _ = try await until(30, "Let my phone connect did not start: \(link.status)") { link.listening ? true : nil }
    step("Let my phone connect is on: \(link.status)", shot: "phone-on")
    guard let code = link.newPairing() else { throw Failed(why: "Pair a Phone gave no code: \(link.pairProblem ?? "no reason shown")") }
    // The pairing sheet opens in a window of its own: its picture, then out of sight with the rest.
    try await Task.sleep(nanoseconds: 1_000_000_000)
    for w in NSApp.windows where w != window && w.isVisible && w.attachedSheet == nil && w.sheetParent == nil {
      _ = shot("phone-pairing-code", of: w)
      hide(w)
    }
    step("Pair a Phone: the code for \(code.host):\(code.port) (the secret not recorded)")
    let file = URL(fileURLWithPath: (p.codeFile as NSString).expandingTildeInPath)
    FileManager.default.createFile(atPath: file.path, contents: Data("\(code.host):\(code.port) \(code.secret)\n".utf8), attributes: [.posixPermissions: 0o600])
    // The phone's run: its sentences, each up to `wait`, its sign-in and simulator on top.
    let done = (p.doneFile as NSString).expandingTildeInPath
    _ = try await until(Double(s.says.count) * wait + 900, "the phone's run never ended") { FileManager.default.fileExists(atPath: done) ? true : nil }
    step("the phone's run ended; looking for its conversation on this Mac")
    // The newest session that holds the phone's first sentence, opened as a person clicks it.
    let first = s.says[0].trimmingCharacters(in: .whitespacesAndNewlines)
    let mine = { (t: Turn) in t.request.trimmingCharacters(in: .whitespacesAndNewlines) == first }
    guard let store = Self.store else { throw Failed(why: "no store") }
    var found: String?
    let end = Date().addingTimeInterval(60)
    while found == nil, Date() < end {
      await store.refresh()
      for info in store.sessions.prefix(5) {
        store.selectedID = info.id
        if (try? await until(10, "") { store.conversation.map { _ in true } }) != nil, store.conversation?.turns.contains(where: mine) == true { found = info.id; break }
      }
      if found == nil { try await Task.sleep(nanoseconds: 2_000_000_000) }
    }
    guard found != nil else { throw Failed(why: "the phone's conversation is not in this Mac's sessions (the newest \(min(5, store.sessions.count)) opened)") }
    try await settle(window, 2.5)
    for (i, sentence) in s.says.enumerated() {
      var said = Said(sentence: sentence, status: "on the phone")
      defer { record.said.append(said) }
      let n = i + 1
      guard let t = store.conversation?.turns.last(where: { $0.request.trimmingCharacters(in: .whitespacesAndNewlines) == sentence.trimmingCharacters(in: .whitespacesAndNewlines) }) else {
        said.status = "not on the Mac"; throw Failed(why: "sentence \(n) from the phone is not in the conversation on this Mac")
      }
      said.answerInApp = t.answer
      said.steps = t.steps.map { "\($0.verb) \($0.object) [\($0.status.rawValue)]" }
      said.by = MadeByWords.name(t.engine, model: t.model)
      guard t.status == .done, !words(t.answer).isEmpty else { said.status = t.status.rawValue; throw Failed(why: "sentence \(n) from the phone shows on this Mac without a finished answer (\(t.status.rawValue))") }
      said.status = "answered, on the Mac too"
    }
    // The last answer as this Mac's window shows it.
    let shotFile = shot("mac-shows-the-phone-session")
    record.steps.append(Entry(at: now, step: "the phone's conversation on this Mac", shot: shotFile))
    let lines = shotFile.flatMap { readText(out.appendingPathComponent($0)) } ?? []
    record.screenText = lines
    let last = record.said.last?.answerInApp ?? ""
    let (seen, of, shown) = onScreen(last, lines: lines)
    if !record.said.isEmpty { record.said[record.said.count - 1].answerOnScreen = shown; record.said[record.said.count - 1].wordsOnScreen = "\(seen) of the answer's last \(of) words" }
    say("on this Mac: \(seen) of the last \(of) words of the phone's last answer are on the screen")
    guard of > 0, Double(seen) / Double(of) >= 0.6 else { throw Failed(why: "the phone's last answer is not on this Mac's screen (\(seen) of its last \(of) words read there)") }
    if let id = link.phones.first?.id { link.remove(id) }
  }

  /// "Try again with" under the latest request: there, and all of it in view above the box.
  static func checkTryAgain(_ said: inout Said, _ n: Int) async throws {
    let inView = LastTryAgainFrame.allInView
    said.tryAgainInView = inView
    if said.by.isEmpty, let t = store?.conversation?.turns.last { said.by = MadeByWords.name(t.engine, model: t.model) }
    say("answer \(n) by \(said.by); Try again with under it: \(inView.map { $0 ? "in view" : "NOT in view" } ?? "missing")")
    guard inView == true else { said.status = "try again hidden"; throw Failed(why: "Try again with under answer \(n) is \(inView == nil ? "not there" : "not all in view (behind the box)")") }
  }

  static var store: OlaStore?

  /// A menu bar command: its keyboard shortcut first, as a person presses it; if the shortcut does not
  /// reach it, the menu item itself (Model, its name), as a person clicks it. Says which way worked.
  static func viaMenu(_ path: [String], key d: Int, modifiers: NSEvent.ModifierFlags, in w: NSWindow, done: () -> Bool) async throws {
    let keys = (modifiers.contains(.control) ? "Control-" : "") + "Option-Command-\(d)"
    shortcut("\(d)", code: digitCode(d), in: w, modifiers: modifiers)
    if (try? await until(3, "") { done() ? true : nil }) != nil { say("\(path.joined(separator: " > ")): by its shortcut, \(keys)"); return }
    var menu = NSApp.mainMenu
    var item: NSMenuItem?
    for (i, name) in path.enumerated() {
      menu?.update()
      item = menu?.items.first { $0.title == name }
      if i < path.count - 1 { menu = item?.submenu }
    }
    guard let menu, let item, let index = menu.items.firstIndex(of: item) else { throw Failed(why: "no menu item \(path.joined(separator: " > ")) in the menu bar") }
    say("\(keys) did not reach \(path.joined(separator: " > ")) (its shortcut: \(item.keyEquivalentModifierMask.rawValue) \(item.keyEquivalent.debugDescription), enabled \(item.isEnabled)); choosing the menu item")
    menu.performActionForItem(at: index)
    _ = try await until(5, "\(path.joined(separator: " > ")) did nothing") { done() ? true : nil }
  }

  /// The box's own menu, with the mouse: a click on the pick beside the box, then its item chosen by
  /// typing its first letter and Return in the open menu (OLA-344).
  static func pickInTheBox(_ c: EngineChoice, in w: NSWindow) async throws {
    let box = try await until(15, "no box to type in") { textFields(in: w).last }
    guard let frame = w.contentView?.superview ?? w.contentView else { throw Failed(why: "the window has no content") }
    let r = box.convert(box.bounds, to: nil)
    // The pick starts one spacing (8 points) after the field, in the same row, its text at the bottom.
    var point: CGPoint?
    var what = ""
    for dx in stride(from: 12.0, through: 40.0, by: 4.0) {
      let p = CGPoint(x: r.maxX + dx, y: r.minY + 8)
      guard let hit = frame.hitTest(frame.convert(p, from: nil)), hit !== box, !hit.isDescendant(of: box) else { continue }
      point = p
      what = "\(Swift.type(of: hit))"
      break
    }
    guard let p = point else { throw Failed(why: "no menu beside the box (the field reaches \(Int(r.maxX)) of \(Int(frame.bounds.width)))") }
    say("the box's pick is a \(what); clicking it, then \"\(c.name.prefix(1))\" and Return in its menu")
    func key(_ ch: String, _ code: UInt16) -> NSEvent? {
      NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.windowNumber, context: nil, characters: ch, charactersIgnoringModifiers: ch, isARepeat: false, keyCode: code)
    }
    // Queued first: the open menu's own loop takes them (an Escape later closes it if nothing did).
    if let e = key(String(c.name.prefix(1)).lowercased(), 0) { NSApp.postEvent(e, atStart: false) }
    if let e = key("\r", 36) { NSApp.postEvent(e, atStart: false) }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { if let e = key("\u{1b}", 53) { NSApp.postEvent(e, atStart: false) } }
    guard let down = NSEvent.mouseEvent(with: .leftMouseDown, location: p, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1) else { return }
    w.sendEvent(down)
    if let up = NSEvent.mouseEvent(with: .leftMouseUp, location: p, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 0) { w.sendEvent(up) }
    RunLoop.main.run(until: Date().addingTimeInterval(0.3))
  }

  /// The key codes of 1 to 9 on a US keyboard.
  static func digitCode(_ d: Int) -> UInt16 { [18, 19, 20, 21, 23, 22, 26, 28, 25][max(0, min(8, d - 1))] }

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
  static func shot(_ name: String, of window: NSWindow? = nil) -> String? {
    guard let w = window ?? mainWindow(), out != nil else { return nil }
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
  static func shortcut(_ c: String, code: UInt16, in w: NSWindow, modifiers: NSEvent.ModifierFlags = [.command]) {
    guard let ev = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: modifiers, timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: w.windowNumber, context: nil, characters: c, charactersIgnoringModifiers: c, isARepeat: false, keyCode: code) else { return }
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
