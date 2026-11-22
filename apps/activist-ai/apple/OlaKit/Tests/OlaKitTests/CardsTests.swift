import CryptoKit
import XCTest
@testable import OlaKit

/// Ola's cards, described once (OLA-325): the fixtures the web check renders
/// (web/test/cards.fixtures.json), described here by the very same cards.mjs in JavaScriptCore,
/// and drawn from what the apps' cards hold (the question, the approval and its publish card).
final class CardsTests: XCTestCase {
  static let web = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../web").standardizedFileURL

  struct Fixture {
    var name: String
    var json: JSON
    var lines: [String] { json["lines"].array.map(\.str) }
  }

  static func fixtures() throws -> [Fixture] {
    let data = try Data(contentsOf: web.appendingPathComponent("test/cards.fixtures.json"))
    let j = try XCTUnwrap(JSON.parse(data))
    return j["cards"].array.map { Fixture(name: $0["name"].str, json: $0) }
  }

  /// The apps run what the website runs: CardsJS is made from the repo's cards.mjs as it is now.
  func testTheAppsCopyIsTheWebsitesModule() throws {
    var h = SHA256()
    for m in ["webask", "publishask", "cards"] { h.update(data: try Data(contentsOf: Self.web.appendingPathComponent("server/\(m).mjs"))) }
    let now = h.finalize().map { String(format: "%02x", $0) }.joined()
    XCTAssertEqual(CardsJS.sourceHash, now, "CardsJS.swift is not what web/server/cards.mjs makes: run node apple/tools/cards-js.mjs")
  }

  func testQuestionCards() throws {
    let all = try Self.fixtures().filter { !$0.json["form"].isNull }
    XCTAssertGreaterThanOrEqual(all.count, 5)
    for f in all {
      let q = try XCTUnwrap(Question(form: f.json["form"]), f.name)
      XCTAssertEqual(Cards.lines(q.card), f.lines, f.name)
      // What QuestionPanel draws, in its order, is exactly those lines.
      var drawn = [q.kicker]
      for x in q.fields {
        drawn.append(x.text.isEmpty ? x.title : x.text)
        for o in x.options { drawn.append(o.label); if let d = o.description { drawn.append(d) } }
      }
      drawn.append(q.boxNote)
      if let s = q.sendLabel { drawn.append(s) }
      XCTAssertEqual(drawn, f.lines, f.name)
      XCTAssertEqual(q.single, f.json["tapAnswers"].bool, f.name)
      // Words typed in the box answer the whole card, however many questions (OLA-320).
      XCTAssertEqual(q.answer(words: "  \(f.json["words"].str) ").map(JSON.object), f.json["answer"], f.name)
      XCTAssertNil(q.answer(words: "   "), f.name)
    }
  }

  func testPublishCards() throws {
    let all = try Self.fixtures().filter { !$0.json["permission"].isNull }
    XCTAssertGreaterThanOrEqual(all.count, 6)
    for f in all {
      let p = f.json["permission"]
      let action = p["action"].str, resources = p["resources"].array.map(\.str)
      let files = f.json["ctx"]["files"].isNull ? nil : f.json["ctx"]["files"].array.map(\.str)
      var card = Cards.publish(action: action, resources: resources, address: f.json["ctx"]["address"].string, files: files)
      // After the front desk's look at the files (OLA-325): the same lines as the website's sheet.
      if let c = card, !f.json["plan"].isNull {
        XCTAssertTrue(c.needsPlan, f.name)
        card = Cards.withPlan(c, plan: f.json["plan"])
        XCTAssertEqual(card?.fingerprint, f.json["plan"]["fingerprint"].string, f.name)
        XCTAssertFalse(card?.needsPlan ?? true, f.name)
      }
      XCTAssertEqual(card.map { Cards.lines($0.json) } ?? [], f.lines, f.name)
      guard let card else { continue }
      // What ApprovalPanel draws for it, in its order.
      var drawn = [card.title, card.lede]
      if card.kind == .publish {
        drawn += [card.addressLine, card.heading ?? ""]
        if let notes = card.fileNotes { for (i, f) in card.files.enumerated() { drawn += [f, notes[i]] } } else { drawn += card.files }
        drawn += (card.leftOut.map { [$0] } ?? []) + card.warnings + (card.aup.map { [$0] } ?? [])
      }
      drawn += [card.yes, card.no]
      XCTAssertEqual(drawn, f.lines, f.name)
      if let folder = f.json["folder"].string { XCTAssertEqual(card.folder, folder, f.name) }
    }
  }

  /// The approval the apps show, from opencode's event: its card, the files as the items, never
  /// the command. With Ola working on the Mac the files are read from the folder (OLA-230 check 4).
  func testTheApprovalCarriesTheCard() throws {
    let d = NSTemporaryDirectory() + "olacards-\(UUID().uuidString)"
    try FileManager.default.createDirectory(atPath: d + "/site/img", withIntermediateDirectories: true)
    for f in ["site/index.html", "site/img/a.png", "site/.ola-source.json"] { FileManager.default.createFile(atPath: d + "/" + f, contents: Data("x".utf8)) }
    defer { try? FileManager.default.removeItem(atPath: d) }
    for cmd in ["ola-publish publish site --name oak --fingerprint abc",
                "\"/Users/x/Library/Application Support/Ola/web-tools/ola-publish\" publish site --name oak --fingerprint abc 2>&1",
                "cd \(d) && ola-publish publish site --name oak --fingerprint abc --json"] {
      let a = Approval(.object(["id": "per_1", "sessionID": "ses_1", "action": "shell", "resources": .array([.string(cmd)])]), dir: d)
      let c = try XCTUnwrap(a.card, cmd)
      XCTAssertEqual(a.title, "Ola wants to publish this on the web", cmd)
      XCTAssertEqual(c.files, ["img/a.png", "index.html"], cmd)
      XCTAssertEqual(a.items.map(\.label), ["img/a.png", "index.html"], cmd)
      XCTAssertTrue(a.items.allSatisfy { !$0.isCommand && $0.detail == nil }, cmd)
      XCTAssertEqual(c.addressLine, "The address: sites.ola.cx/oak/")
      XCTAssertEqual(c.yes, "Publish these two files")
    }
    let cloud = Approval(.object(["id": "per_2", "sessionID": "ses_1", "action": "shell", "resources": ["ola-publish site --files index.html,style.css"]]), dir: "/work")
    XCTAssertEqual(cloud.card?.files, ["index.html", "style.css"])
    XCTAssertTrue(cloud.items.allSatisfy { !$0.isCommand && $0.detail == nil })
    let down = Approval(.object(["id": "per_3", "sessionID": "ses_1", "action": "shell", "resources": ["ola-publish unpublish --name oak"]]), dir: d)
    XCTAssertEqual(down.card?.kind, .unpublish)
    XCTAssertEqual(down.title, "Ola wants to take sites.ola.cx/oak/ off the web")
    XCTAssertTrue(down.items.isEmpty)
    // Any other command keeps its own description, and no card.
    let other = Approval(.object(["id": "per_4", "sessionID": "ses_1", "action": "shell", "resources": ["python3 make.py"]]), dir: d)
    XCTAssertNil(other.card)
    XCTAssertEqual(other.title, "Ola wants to run a command")
    XCTAssertNil(Cards.localPublish("ola-publish publish site --name oak --fingerprint abc && rm -rf x"))
    XCTAssertNil(Plain.publishCard(action: "shell", resources: ["ola-publish preview site --name x"], dir: nil))
    XCTAssertNil(Plain.publishCard(action: "shell", resources: ["ola-publish site --files a | cat"], dir: nil))
  }
}
