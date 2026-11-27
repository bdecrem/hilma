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
    /// The phone through the Mac (check 4): the file the Mac copy writes the pairing code into, typed
    /// on the phone's Pair with your Mac screen as a person types it from the Mac's Pair a Phone sheet.
    var pairCodeFile: String?
    /// Ola's question answered by typing these words in the box and Send, not by a tap on a choice
    /// (OLA-301 check 8: a person's own words instead of the choices).
    var answerWords: String?
    /// Each sentence typed, read back from the box and wiped, never sent (OLA-402: the box test,
    /// tools/drive-box-test.sh; no model, no card).
    var typeOnly: Bool?
    /// The app starts with -OlaEscalate <why> (tests|loop|length|untested), as the Mac drive's (OLA-491).
    var escalate: String?
    /// The stretch card's answer to tap when one comes: "Just this once", "Always in this project",
    /// "Not now" (OLA-491). Without it the card is only pictured.
    var answer: String?
  }
  struct Entry: Encodable { var at: Double; var step: String; var shot: String? }
  struct Said: Encodable {
    var sentence: String
    var sentAt: Double?
    var endedAt: Double?
    var status: String
    var cards: [String] = []
    /// Ola's questions (OLA-301), each answered by tapping its choices.
    var questions: [String] = []
    var answered: [String] = []
    var answerOnScreen: String = ""
    /// What the box held before Send, as what element XCUITest calls it, and its height in points
    /// (one line 21, two lines 41 on the drive's phone) (OLA-402).
    var inBox: String?
    var boxKind: String?
    var boxHeight: Double?
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
      record.verdict = s.typeOnly == true ? "every sentence was whole in the box, then wiped (nothing sent)" : "every sentence got a finished answer on the screen"
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
    if let e = s.escalate { app.launchArguments = ["-OlaEscalate", e] }
    app.launch()
    guard app.wait(for: .runningForeground, timeout: 30) else { throw Failed(why: "the app did not open") }
    sleep(2)
    step("the app opened", shot: "open")

    let newSession = app.buttons["New session"]
    // Through the Mac: the first screen's Pair with your Mac, the code typed, Pair.
    if let f = s.pairCodeFile {
      let end = Date().addingTimeInterval(300)
      var code = ""
      while code.isEmpty {
        if Date() > end { throw Failed(why: "the Mac gave no pairing code in 300 s") }
        code = (try? String(contentsOfFile: f, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if code.isEmpty { sleep(1) }
      }
      if !newSession.waitForExistence(timeout: 4) {
        let choice = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Pair with your Mac'")).firstMatch
        if choice.waitForExistence(timeout: 10) { try tap(choice, "Pair with your Mac") }
        let p = NSPredicate(format: "placeholderValue BEGINSWITH 'imac-m1' OR label BEGINSWITH 'imac-m1'")
        let tv = app.textViews.matching(p).firstMatch
        let field = tv.waitForExistence(timeout: 10) ? tv : app.textFields.matching(p).firstMatch
        try tap(field, "the field for the pairing code")
        field.typeText(code)
        step("typed the Mac's pairing code (the secret not recorded)", shot: "pair-typed")
        try tap(app.buttons["Pair"], "Pair")
        let done = Date().addingTimeInterval(60)
        while !newSession.exists {
          if Date() > done { throw Failed(why: "the pairing did not finish in 60 s (\(visibleProblem() ?? "no message on the screen"))") }
          if let p = visibleProblem() { throw Failed(why: "the pairing was refused: \(p)") }
          sleep(1)
        }
        sleep(2)
        step("paired with the Mac", shot: "paired")
      }
    }
    // Signed out: the first screen offers "Sign in to Ola"; then the name, the password, Sign In.
    if s.pairCodeFile == nil, !newSession.waitForExistence(timeout: 4) {
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
    // The sessions list, with the section of the place this run works in.
    // The app's labels (Runtime.label): "Cloud (ola.cx)", "Local (your Mac)"; "Cloud", "Local" before Nov 26.
    let (name, label) = s.where == "local" ? ("Local", "Local (your Mac)") : ("Cloud", "Cloud (ola.cx)")
    let cloudHeader = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", "\(label) sessions", "\(name) sessions")).firstMatch
    _ = cloudHeader.waitForExistence(timeout: 20)
    step("the sessions list", shot: "sessions")
    // The app's own "Get a notification when Ola is done…?" card (after pairing): Not now, as a person
    // who wants nothing on the lock screen taps it.
    let notNow = app.buttons["Not now"]
    if notNow.waitForExistence(timeout: 3) {
      try tap(notNow, "Not now (the notification question)")
      step("answered the notification question: Not now", shot: "notifications-not-now")
    }

    // New session, then the runtime in the sheet.
    try tap(newSession, "New session")
    let place = name
    // The sheet's row: "Cloud (ola.cx), Works with your Mac off. …" ("Cloud: …" before); not the list's header behind it.
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", place + ":", label + ",")).firstMatch
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
      // The box must hold the whole sentence, line breaks included, before Send (OLA-275): the
      // keyboard's return key could send the first line alone.
      let held = boxText(sentence)
      said.inBox = held.text
      said.boxKind = held.kind
      said.boxHeight = held.height
      if norm(held.text) != norm(sentence) {
        throw Failed(why: "the box holds \(one(held.text)), not sentence \(n) \(one(sentence)) (a line break may have sent the first line)")
      }
      step("sentence \(n) is whole in the box (\(held.kind), \(Int(held.height)) pt tall)")
      if s.typeOnly == true {
        // The box test: wiped as a person deletes it, and empty again (Send off), nothing sent.
        let b = composer()
        try tap(b, "the box, to wipe it")
        b.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: sentence.count + 4))
        let left = boxText(sentence).text
        if !(norm(left).isEmpty || left.hasPrefix("Ask, or tell it")) || app.buttons["Send"].isEnabled {
          throw Failed(why: "the box still holds \(one(left)) after deleting sentence \(n)")
        }
        said.status = "in the box"
        step("wiped sentence \(n) from the box (not sent)", shot: "say\(n)-wiped")
        continue
      }
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
        let yes = yesButton()
        if yes.exists {
          let title = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Ola wants'")).firstMatch
          said.cards.append(title.exists ? title.label : "a card")
          step("card: \(said.cards.last!)", shot: "say\(n)-card\(said.cards.count)")
          if s.card == "no" { said.status = "card"; throw Failed(why: "a card came and the script says no card may come") }
          let word = yes.label
          try tap(yes, word)
          said.answered.append(word)
          let gone = Date().addingTimeInterval(20)
          while yes.exists, Date() < gone { sleep(1) }
          if yes.exists { throw Failed(why: "the card stayed after \(word)") }
          step("answered the card", shot: "say\(n)-card\(said.cards.count)-answered")
          quietSince = nil
          continue
        }
        // Ola's question (OLA-301, OLA-360): its choices tapped as a person taps them. One question,
        // one choice: a tap on the first choice is the answer. A card with Send my answers (two
        // questions, or pick several): each question answered on its own, its first choice for a
        // pick-one question, its first two for a pick-several one, then Send my answers. Until Nov 21
        // the drive tapped a pick-one question's choices one after another, each replacing the last,
        // so the checker saw the fourth font picked and the second question never reached.
        if questionKicker() != nil {
          let groups = questionChoiceGroups()
          let choiceWords = groups.flatMap(\.choices)
          let ask = choiceWords.isEmpty ? "a question" : (app.staticTexts.allElementsBoundByIndex.map(\.label).drop { !$0.hasPrefix("Ola is asking you") }.dropFirst().first ?? "a question")
          said.questions.append("\(ask) [\(groups.map { $0.choices.joined(separator: " | ") }.joined(separator: " || "))]")
          step("question: \(ask) (\(groups.count) question\(groups.count == 1 ? "" : "s"))", shot: "say\(n)-question\(said.questions.count)")
          guard !choiceWords.isEmpty, groups.allSatisfy({ !$0.choices.isEmpty }) else { said.status = "question"; throw Failed(why: "Ola's question shows no choice to tap") }
          let sendMine = app.buttons["Send my answers"]
          func button(_ w: String) -> XCUIElement { app.buttons.matching(NSPredicate(format: "label == %@", w)).firstMatch }
          var tapped: [String] = []
          if let words = s.answerWords, !words.isEmpty {
            let box = composer()
            guard box.waitForExistence(timeout: 10) else { throw Failed(why: "no box to type the answer in") }
            try tap(box, "the box to type in")
            box.typeText(words)
            step("typed the answer \"\(words)\" in the box", shot: "say\(n)-question\(said.questions.count)-typed")
            try tap(app.buttons["Send"], "Send (the typed answer)")
            tapped.append("typed \"\(words)\", Send")
          } else if !sendMine.exists {
            let w = choiceWords[0]
            try reveal(button(w), w)
            try tap(button(w), "the choice \(w)")
            tapped.append(w)
          } else {
            for g in groups {
              for w in g.choices.prefix(g.multiple ? 2 : 1) {
                try reveal(button(w), w)
                try tap(button(w), "the choice \(w)")
                tapped.append(w)
              }
            }
            step("ticked \(tapped.joined(separator: ", "))", shot: "say\(n)-question\(said.questions.count)-ticked")
            try reveal(sendMine, "Send my answers")
            try tap(sendMine, "Send my answers")
            tapped.append("Send my answers")
          }
          said.answered.append(tapped.joined(separator: " + "))
          // The same card (its choices' words) still there after 20 s means the answer was not taken;
          // XCUIElements re-resolve, so what the card was is kept as words.
          let was = choiceWords
          let gone = Date().addingTimeInterval(20)
          func same() -> Bool { questionKicker() != nil && questionChoiceGroups().flatMap(\.choices) == was }
          while same(), Date() < gone { sleep(1) }
          if same() {
            said.status = "question"; throw Failed(why: "Ola's question stayed after \(tapped.joined(separator: " + "))")
          }
          step("answered the question: \(tapped.joined(separator: " + "))", shot: "say\(n)-question\(said.questions.count)-answered")
          quietSince = nil
          continue
        }
        // The stretch card (OLA-491): pictured once; with "answer" that answer tapped ("Always" with the
        // switch off asks first: Turn On).
        let stretch = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'This may be a stretch' OR label BEGINSWITH 'Hand this to Claude'")).firstMatch
        if stretch.exists, !said.cards.contains(where: { $0.hasPrefix("stretch card") }) || (s.answer != nil && said.answered.count < said.cards.count) {
          if !said.cards.contains(where: { $0.hasPrefix("stretch card") }) {
            said.cards.append("stretch card: \(stretch.label)")
            step("stretch card", shot: "say\(n)-stretch-card")
          }
          if let a = s.answer {
            let b = app.buttons.matching(NSPredicate(format: "label ==[c] %@", a)).firstMatch
            guard b.exists else { said.status = "card"; throw Failed(why: "the stretch card has no answer '\(a)'") }
            try tap(b, a)
            let on = app.buttons["Turn On"]
            if on.waitForExistence(timeout: 3) { step("the consent question", shot: "say\(n)-stretch-consent"); try tap(on, "Turn On") }
            let gone = Date().addingTimeInterval(20)
            while stretch.exists, Date() < gone { sleep(1) }
            if stretch.exists { throw Failed(why: "the stretch card stayed after \(a)") }
            said.answered.append(a)
            step("answered the stretch card: \(a)", shot: "say\(n)-stretch-answered")
          }
          quietSince = nil
          continue
        }
        if let p = visibleProblem() { said.status = "error"; throw Failed(why: "the app shows an error: \(p)") }
        // Done: Stop is gone and Send is back, and it stays so for six seconds, with no question
        // waiting (a waiting question also shows Send and no Stop: OLA-360). Six, not three (OLA-491):
        // Ola's own next turn (the nudge, the hand-off, the finish after Not now) starts within them.
        if !stop.exists, app.buttons["Send"].exists, questionKicker() == nil {
          if let q = quietSince, Date().timeIntervalSince(q) >= 6 { break }
          if quietSince == nil { quietSince = Date() }
        } else { quietSince = nil }
        sleep(1)
      }
      said.endedAt = now
      // The turn's error line comes before "no card" (Nov 21: a used-up weekly allowance was
      // reported only as "no card came", the wrong cause).
      if app.descendants(matching: .any)["ola-problem"].exists { said.status = "error"; throw Failed(why: "the app shows an error under the answer: \(app.descendants(matching: .any)["ola-problem"].label)") }
      let problemStarts = ["The model could not take this request", "Ola's model did not accept", "Ola\u{2019}s model did not accept", "The model is busy or did not answer", "The model server had a problem", "It stopped:", "It stopped before it finished", "This project's", "Your weekly allowance"]
      if let p = app.staticTexts.allElementsBoundByIndex.map(\.label).first(where: { t in problemStarts.contains { t.hasPrefix($0) } }) { said.status = "error"; throw Failed(why: "the app shows an error, not an answer: \(p)") }
      if s.card == "yes", said.cards.isEmpty { said.status = "no card"; throw Failed(why: "no card came for sentence \(n), and the script says one must") }
      // The answer, read from the screen: the texts after the sentence.
      let texts = app.staticTexts.allElementsBoundByIndex.map(\.label).filter { !$0.isEmpty }
      record.screenText = texts
      let after = texts.lastIndex(where: { $0.contains(sentence.prefix(24)) }).map { Array(texts[($0 + 1)...]) } ?? []
      let answer = after.filter { $0.split(separator: " ").count >= 3 }
      said.answerOnScreen = answer.joined(separator: "\n")
      step("answer \(n) on the screen", shot: "say\(n)-answer")
      try? app.debugDescription.write(to: out.appendingPathComponent("tree-say\(n).txt"), atomically: true, encoding: .utf8)
      // Ola's own markers ([[ola:done]], [[ola:react thanks]]) never show (OLA-322).
      if let m = after.first(where: { $0.lowercased().contains("[[ola") }) { said.status = "marker on screen"; throw Failed(why: "the screen shows Ola's marker as text: \(one(m))") }
      // A thank-you is answered by a reaction alone (README, "Slash commands and reactions"): the
      // chip on the person's message ("Reaction thanks") is the whole answer, and passes.
      if answer.isEmpty, let r = after.first(where: { $0.hasPrefix("Reaction ") }) {
        said.answerOnScreen = "(\(r), no text)"
        said.status = "answered with a reaction"
        continue
      }
      if answer.isEmpty { said.status = "no answer"; throw Failed(why: "no answer in words on the screen after sentence \(n)") }
      if let failed = after.first(where: { $0.contains("did not finish") || $0.contains("stopped before it finished") }) { said.status = "failed"; throw Failed(why: "the screen says: \(failed)") }
      // The turn's error line (ProblemView): marked "ola-problem" in builds after Nov 21, and known by
      // its words in the ones before (OlaKit Steps.runProblem). On Nov 21 a run passed on "The model
      // could not take this request." while the model's account had no credit.
      if let p = after.first(where: { t in problemStarts.contains { t.hasPrefix($0) } }) { said.status = "error"; throw Failed(why: "the app shows an error, not an answer: \(p)") }
      said.status = "answered"
    }
  }

  // MARK: helpers

  /// What the conversation's box holds, and as what element, looked up afresh. The box is SwiftUI's
  /// TextField(axis: .vertical): XCUITest sees a text field while it holds one line and a text view
  /// once the words wrap to two (its log: "Automation type mismatch: computed TextField from legacy
  /// attributes vs TextView from modern attribute") that shows no placeholder, so the box found by its
  /// placeholder before typing no longer resolves after. OLA-402: the driver of release e22f2b7a read that element's value after typing
  /// a sentence that wraps ('make a page that says Bart and publish it on ola') and stopped with
  /// "No matches found ... Descendants matching type TextField" (PhoneDrive.swift:191), 3 of 3 runs.
  /// Every box on the screen is read (the question card has its own fields), the one holding the
  /// sentence first; else the conversation's box.
  func boxText(_ sentence: String) -> (text: String, kind: String, height: Double) {
    var seen: [(text: String, kind: String, height: Double)] = []
    for (q, kind) in [(app.textViews, "text view"), (app.textFields, "text field")] {
      for e in q.allElementsBoundByIndex where e.exists {
        if let v = e.value as? String { seen.append((v, kind, Double(e.frame.height))) }
      }
    }
    if let hit = seen.first(where: { norm($0.text) == norm(sentence) }) { return hit }
    let c = composer()
    if c.exists { return ((c.value as? String) ?? "", c.elementType == .textView ? "text view" : "text field", Double(c.frame.height)) }
    return (seen.map(\.text).joined(separator: " | "), "no box", 0)
  }

  func norm(_ x: String) -> String {
    x.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  func one(_ x: String) -> String { "'" + String(x.replacingOccurrences(of: "\n", with: "⏎").prefix(120)) + "'" }

  /// A yes card's yes button: "Yes, this once", or a publish card's own yes ("Publish this file",
  /// "Publish these three files", "... again", "Publish the folder", "Yes, take it down"; CardsJS
  /// publishYes, ConversationViews yesButtons). Until Nov 22 only "Yes, this once" was known, so a
  /// phone run that came to a publish card (builds 33 and on) waited the whole --wait for an answer
  /// (run-9583: "Publish this file" on the screen, 600 s, no finished answer).
  func yesButton() -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label == 'Yes, this once' OR label == 'Publish this file' OR label BEGINSWITH 'Publish these ' OR label BEGINSWITH 'Publish this file ' OR label == 'Publish the folder' OR label == 'Yes, take it down'")).firstMatch
  }

  /// The conversation's box: the field whose placeholder is "Ask, or tell it what to do next".
  /// Found by its placeholder while it holds one line. Holding two or more it is a text view that
  /// shows no placeholder (the tree: `TextField ... {308.0, 41.0}, value: make a page that s...,
  /// Keyboard Focused`, no placeholderValue), so it is then the text box with the keyboard, or the
  /// text box on the row of Send / Stop (OLA-402).
  func composer() -> XCUIElement {
    let p = NSPredicate(format: "placeholderValue BEGINSWITH 'Ask, or tell it' OR label BEGINSWITH 'Ask, or tell it'")
    let tv = app.textViews.matching(p).firstMatch
    if tv.exists { return tv }
    let tf = app.textFields.matching(p).firstMatch
    if tf.exists { return tf }
    let typed = NSPredicate(format: "elementType == %d OR elementType == %d", XCUIElement.ElementType.textView.rawValue, XCUIElement.ElementType.textField.rawValue)
    let all = app.descendants(matching: .any).matching(typed)
    let focused = all.matching(NSPredicate(format: "hasKeyboardFocus == true")).firstMatch
    if focused.exists { return focused }
    let send = app.buttons["Send"].exists ? app.buttons["Send"] : app.buttons["Stop"]
    if send.exists {
      let s = send.frame
      let row = all.allElementsBoundByIndex.filter { e in
        guard e.exists else { return false }
        let f = e.frame
        return f.maxY >= s.minY && f.minY <= s.maxY && f.maxX <= s.minX + 1
      }
      if let e = row.last { return e }
    }
    return tf
  }

  /// The question card's first line (cards.mjs questionCard kicker), when a question waits.
  func questionKicker() -> XCUIElement? {
    let k = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Ola is asking you'")).firstMatch
    return k.exists ? k : nil
  }

  /// The card's questions, each its choices by their words and whether it takes several: the
  /// buttons after the card's first line and before its note about the box ("Or write…", "Write
  /// your answer…"), in the order the screen lists them; a question ends at its own "Or say it in
  /// your own words" field; Send my answers is not a choice. A choice whose mark is a square takes
  /// several. By the tree's order, not by position: a tall card's top can be above the screen,
  /// where the conversation's own buttons are.
  func questionChoiceGroups() -> [(choices: [String], multiple: Bool)] {
    guard let root = try? app.snapshot() else { return [] }
    var flat: [XCUIElementSnapshot] = []
    func walk(_ e: XCUIElementSnapshot) { flat.append(e); e.children.forEach(walk) }
    walk(root)
    guard let k = flat.firstIndex(where: { $0.elementType == .staticText && $0.label.hasPrefix("Ola is asking you") }) else { return [] }
    var out: [(choices: [String], multiple: Bool)] = []
    var cur: (choices: [String], multiple: Bool) = ([], false)
    for e in flat[(k + 1)...] {
      if e.elementType == .staticText, e.label.hasPrefix("Or write") || e.label.hasPrefix("Write your answer") { break }
      if e.elementType == .textField || e.elementType == .textView {
        if !cur.choices.isEmpty { out.append(cur) }
        cur = ([], false)
        continue
      }
      if e.elementType == .button, !e.label.isEmpty, e.label != "Send my answers" {
        cur.choices.append(e.label)
        if e.children.contains(where: { $0.elementType == .image && $0.identifier.contains("square") }) { cur.multiple = true }
      }
    }
    if !cur.choices.isEmpty { out.append(cur) }
    return out
  }

  /// The part of the screen where the card can be seen: under the navigation bar, inside the card's
  /// own scroll view (which ends above the box and the keyboard).
  func cardRoom() -> CGRect? {
    let scrolls = app.scrollViews.containing(NSPredicate(format: "label BEGINSWITH 'Ola is asking you'")).allElementsBoundByIndex
    guard let card = scrolls.filter({ $0.exists }).min(by: { $0.frame.height < $1.frame.height }) else { return nil }
    let top = app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : card.frame.minY
    return CGRect(x: card.frame.minX, y: max(top, card.frame.minY), width: card.frame.width, height: card.frame.maxY - max(top, card.frame.minY))
  }

  /// A choice scrolled into view as a person scrolls the card: a swipe on the card itself, up when
  /// the choice is below the room, down when above. In view = wholly inside the card's room; XCUITest
  /// calls an element clipped by a scroll view "hittable", so that alone is not trusted (Nov 21).
  func reveal(_ e: XCUIElement, _ word: String) throws {
    guard e.waitForExistence(timeout: 5) else { throw Failed(why: "\(word) is not on the screen") }
    for _ in 0..<10 {
      guard let room = cardRoom() else { throw Failed(why: "the question card is not on the screen") }
      let f = e.frame
      if f.minY >= room.minY - 1, f.maxY <= room.maxY + 1, e.isHittable { return }
      let from = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: room.midX, dy: room.midY))
      let dy = min(room.height * 0.4, max(60, abs(f.midY - room.midY)))
      let to = from.withOffset(CGVector(dx: 0, dy: f.midY > room.midY ? -dy : dy))
      from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.3)
      usleep(500_000)
    }
    throw Failed(why: "\(word) could not be scrolled into view in the question card")
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
    let p = NSPredicate(format: "label CONTAINS[c] 'didn’t match' OR label CONTAINS[c] 'isn’t answering' OR label CONTAINS[c] 'not reachable' OR label CONTAINS[c] 'went wrong' OR label CONTAINS[c] 'signed out' OR label CONTAINS[c] 'couldn’t' OR label CONTAINS[c] 'Try again.' OR label CONTAINS[c] 'did not accept this code' OR label BEGINSWITH 'That is not a pairing code'")
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
