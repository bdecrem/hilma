import XCTest

/// Uses the iPhone app in the simulator the way a person does (OLA-237; tools/drive.sh phone): real
/// taps and the simulator's keyboard through XCUITest, on the app as installed (`cx.ola.mac`). A
/// button that is not on the screen, covered or disabled cannot be tapped, and the run fails there.
///
/// The script comes from the file named by OLA_DRIVE_SCRIPT (tools/drive.sh passes it as
/// TEST_RUNNER_OLA_DRIVE_SCRIPT): {"out", "handle", "passwordFile", "where", "says", "card",
/// "waitSeconds"}. The password is read from its file and typed; it is never written anywhere.
/// Leaves in "out" a PNG per step at the phone's size and transcript.json.
final class PhoneDrive: XCTestCase {
  struct Script: Decodable {
    var out: String
    var handle: String
    var passwordFile: String
    var `where`: String
    var says: [String]
    var card: String?
    var waitSeconds: Double?
  }
  struct Entry: Encodable { var at: Double; var step: String; var shot: String? }
  struct Said: Encodable {
    var sentence: String
    var sentAt: Double?
    var endedAt: Double?
    var status: String
    var cards: [String] = []
    var answered: [String] = []
    var answerOnScreen: String = ""
  }
  struct Record: Encodable {
    var app = "phone"
    var mode = "XCUITest in the simulator: real taps and the simulator's keyboard"
    var bundle = "cx.ola.mac"
    var version = ""
    var build = ""
    var device = ""
    var `where`: String
    var handle: String
    var started: String
    var ok = false
    var verdict = ""
    var steps: [Entry] = []
    var said: [Said] = []
    var screenText: [String] = []
  }
  struct Failed: Error { var why: String }

  var app: XCUIApplication!
  var record: Record!
  var out: URL!
  var shotN = 0
  let t0 = Date()
  var now: Double { (Date().timeIntervalSince(t0) * 10).rounded() / 10 }

  func say(_ s: String) { print(String(format: "DRIVE %6.1f  ", Date().timeIntervalSince(t0)) + s) }

  func testDrive() throws {
    continueAfterFailure = false
    let env = ProcessInfo.processInfo.environment
    guard let path = env["OLA_DRIVE_SCRIPT"], let data = FileManager.default.contents(atPath: path) else {
      XCTFail("DRIVE FAIL  no script (OLA_DRIVE_SCRIPT)"); return
    }
    let s = try JSONDecoder().decode(Script.self, from: data)
    out = URL(fileURLWithPath: s.out)
    try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    record = Record(where: s.where, handle: s.handle, started: ISO8601DateFormatter().string(from: Date()))
    record.device = env["SIMULATOR_DEVICE_NAME"] ?? ""
    record.version = env["OLA_DRIVE_APP_VERSION"] ?? ""
    record.build = env["OLA_DRIVE_APP_BUILD"] ?? ""
    do {
      try run(s)
      record.ok = true
      record.verdict = "every sentence got a finished answer on the screen"
    } catch let e as Failed {
      record.verdict = e.why
      shot("stopped-here")
      try? app.debugDescription.write(to: out.appendingPathComponent("tree.txt"), atomically: true, encoding: .utf8)
    }
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    try enc.encode(record).write(to: out.appendingPathComponent("transcript.json"))
    say((record.ok ? "DRIVE PASS  " : "DRIVE FAIL  ") + record.verdict)
    if !record.ok { XCTFail("DRIVE FAIL  " + record.verdict) }
  }

  // MARK: the run

  func run(_ s: Script) throws {
    let password = try String(contentsOfFile: s.passwordFile, encoding: .utf8).trimmingCharacters(in: .newlines)
    let wait = s.waitSeconds ?? 600
    app = XCUIApplication(bundleIdentifier: "cx.ola.mac")
    app.launch()
    guard app.wait(for: .runningForeground, timeout: 30) else { throw Failed(why: "the app did not open") }
    sleep(2)
    step("the app opened", shot: "open")

    // Signed out: the first screen offers "Sign in to Ola"; then the name, the password, Sign In.
    let newSession = app.buttons["New session"]
    if !newSession.waitForExistence(timeout: 4) {
      let choice = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Sign in to Ola'")).firstMatch
      if choice.waitForExistence(timeout: 10) { try tap(choice, "Sign in to Ola") }
      let name = app.textFields["Name"]
      guard name.waitForExistence(timeout: 15) else { throw Failed(why: "no Name field to sign in with") }
      try tap(name, "the Name field")
      name.typeText(s.handle)
      let pw = app.secureTextFields["Password"]
      try tap(pw, "the Password field")
      pw.typeText(password)
      step("typed the name and the password (not recorded)", shot: "signin")
      try tap(app.buttons["Sign In"], "Sign In")
      let end = Date().addingTimeInterval(60)
      while !newSession.exists {
        if Date() > end { throw Failed(why: "the sign-in did not finish in 60 s (\(visibleProblem() ?? "no message on the screen"))") }
        if let p = visibleProblem() { throw Failed(why: "the sign-in was refused: \(p)") }
        sleep(1)
      }
      sleep(2)
      step("signed in", shot: "signed-in")
    }
    // The sessions list, with the cloud's section.
    let cloudHeader = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Cloud sessions'")).firstMatch
    _ = cloudHeader.waitForExistence(timeout: 20)
    step("the sessions list", shot: "sessions")

    // New session, then the runtime in the sheet.
    try tap(newSession, "New session")
    let place = s.where == "local" ? "Local" : "Cloud"
    let row = app.buttons.containing(NSPredicate(format: "label BEGINSWITH %@", place + ":")).firstMatch
    guard row.waitForExistence(timeout: 10) else { throw Failed(why: "New session showed no \(place) choice") }
    step("New Session", shot: "new-session")
    if (row.label as NSString).contains("Not set up yet") { throw Failed(why: "\(place) is not set up on the phone: \(row.label)") }
    try tap(row, place)

    for (i, sentence) in s.says.enumerated() {
      let n = i + 1
      var said = Said(sentence: sentence, status: "not sent")
      defer { record.said.append(said) }
      let box = composer()
      guard box.waitForExistence(timeout: 20) else { throw Failed(why: "no box to type in") }
      try tap(box, "the box to type in")
      box.typeText(sentence)
      step("typed sentence \(n)", shot: "say\(n)-typed")
      try tap(app.buttons["Send"], "Send")
      said.sentAt = now
      said.status = "sent"
      // The keyboard down, so the conversation shows (as a person would after sending).
      step("sent sentence \(n)", shot: "say\(n)-sent")
      let stop = app.buttons["Stop"]
      _ = stop.waitForExistence(timeout: 30)
      let end = Date().addingTimeInterval(wait)
      var quietSince: Date?
      while true {
        if Date() > end { said.status = "timeout"; throw Failed(why: "no finished answer to sentence \(n) after \(Int(wait)) s") }
        let yes = app.buttons["Yes, this once"]
        if yes.exists {
          let title = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Ola wants'")).firstMatch
          said.cards.append(title.exists ? title.label : "a card")
          step("card: \(said.cards.last!)", shot: "say\(n)-card\(said.cards.count)")
          if s.card == "no" { said.status = "card"; throw Failed(why: "a card came and the script says no card may come") }
          try tap(yes, "Yes, this once")
          said.answered.append("Yes, this once")
          let gone = Date().addingTimeInterval(20)
          while yes.exists, Date() < gone { sleep(1) }
          if yes.exists { throw Failed(why: "the card stayed after Yes, this once") }
          step("answered the card", shot: "say\(n)-card\(said.cards.count)-answered")
          quietSince = nil
          continue
        }
        if let p = visibleProblem() { said.status = "error"; throw Failed(why: "the app shows an error: \(p)") }
        // Done: Stop is gone and Send is back, and it stays so for three seconds.
        if !stop.exists, app.buttons["Send"].exists {
          if let q = quietSince, Date().timeIntervalSince(q) >= 3 { break }
          if quietSince == nil { quietSince = Date() }
        } else { quietSince = nil }
        sleep(1)
      }
      said.endedAt = now
      if s.card == "yes", said.cards.isEmpty { said.status = "no card"; throw Failed(why: "no card came for sentence \(n), and the script says one must") }
      // The answer, read from the screen: the texts after the sentence.
      let texts = app.staticTexts.allElementsBoundByIndex.map(\.label).filter { !$0.isEmpty }
      record.screenText = texts
      let after = texts.lastIndex(where: { $0.contains(sentence.prefix(24)) }).map { Array(texts[($0 + 1)...]) } ?? []
      let answer = after.filter { $0.split(separator: " ").count >= 3 }
      said.answerOnScreen = answer.joined(separator: "\n")
      step("answer \(n) on the screen", shot: "say\(n)-answer")
      if answer.isEmpty { said.status = "no answer"; throw Failed(why: "no answer in words on the screen after sentence \(n)") }
      if let failed = after.first(where: { $0.contains("did not finish") || $0.contains("stopped before it finished") }) { said.status = "failed"; throw Failed(why: "the screen says: \(failed)") }
      said.status = "answered"
    }
  }

  // MARK: helpers

  /// The conversation's box: the field whose placeholder is "Ask, or tell it what to do next".
  func composer() -> XCUIElement {
    let p = NSPredicate(format: "placeholderValue BEGINSWITH 'Ask, or tell it' OR label BEGINSWITH 'Ask, or tell it'")
    let tv = app.textViews.matching(p).firstMatch
    return tv.exists ? tv : app.textFields.matching(p).firstMatch
  }

  /// A real tap, refused when the element is not there, not on the screen or disabled.
  func tap(_ e: XCUIElement, _ what: String) throws {
    guard e.waitForExistence(timeout: 10) else { throw Failed(why: "\(what) is not on the screen") }
    guard e.isEnabled else { throw Failed(why: "\(what) is disabled") }
    guard e.isHittable else { throw Failed(why: "\(what) cannot be tapped (off the screen or covered)") }
    e.tap()
    usleep(400_000)
  }

  /// A refusal or error line the app shows in words, if any.
  func visibleProblem() -> String? {
    let p = NSPredicate(format: "label CONTAINS[c] 'didn’t match' OR label CONTAINS[c] 'isn’t answering' OR label CONTAINS[c] 'not reachable' OR label CONTAINS[c] 'went wrong' OR label CONTAINS[c] 'signed out'")
    let e = app.staticTexts.matching(p).firstMatch
    return e.exists ? e.label : nil
  }

  func step(_ what: String, shot name: String? = nil) {
    let file = name.map { shot($0) }
    record.steps.append(Entry(at: now, step: what, shot: file))
    say(what + (file.map { "  [\($0)]" } ?? ""))
  }

  @discardableResult
  func shot(_ name: String) -> String {
    shotN += 1
    let file = String(format: "%02d-%@.png", shotN, name)
    try? XCUIScreen.main.screenshot().pngRepresentation.write(to: out.appendingPathComponent(file))
    return file
  }
}
