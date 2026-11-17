import Foundation
import XCTest
@testable import OlaKit

/// The Kit meeting's states with a fake voice connection and a fake server: connecting, live,
/// interrupted, reconnecting, ended, and that every way out closes the connection (which frees the
/// ElevenLabs slot) and tells the server exactly once.
@MainActor
final class KitMeetingTests: XCTestCase {
  final class FakeTransport: KitVoiceTransport {
    var onEvent: (@MainActor (KitVoiceEvent) -> Void)?
    var opened = 0, closed = 0
    var sent: [String] = []
    var muted: [Bool] = []
    var failOpen = false
    func open(token: String, variables: [String: String], onEvent: @escaping @MainActor (KitVoiceEvent) -> Void) async throws {
      if failOpen { throw KitError.offline }
      opened += 1
      self.onEvent = onEvent
    }
    func send(_ text: String) async throws { sent.append(text) }
    func setMuted(_ m: Bool) async { muted.append(m) }
    func setSpeaker(_ on: Bool) async {}
    func close() async { closed += 1 }
    func emit(_ e: KitVoiceEvent) { onEvent?(e) }
  }

  final class FakeService: KitService, @unchecked Sendable {
    var starts: [String?] = []
    var ends: [(String, KitEndReason)] = []
    var refuse: KitError?
    var refuseResume = false
    func startMeeting(resume: String?) async throws -> KitMeetingStart {
      if let refuse { throw refuse }
      if resume != nil && refuseResume { throw KitError.offline }
      starts.append(resume)
      return KitMeetingStart(session: resume ?? "s-1", resumed: resume != nil, conversationToken: "tok-\(starts.count)", variables: ["dodo_voice_session": "kit-s-1"], kickoff: "[begin]")
    }
    func endMeeting(_ id: String, seconds: Int, reason: KitEndReason) async throws { ends.append((id, reason)) }
  }

  var transports: [FakeTransport] = []
  var service = FakeService()
  var clock = Date(timeIntervalSince1970: 1_800_000_000)

  func meeting() -> KitMeeting {
    transports = []
    let m = KitMeeting(service: service) { [unowned self] in
      let t = FakeTransport()
      self.transports.append(t)
      return t
    }
    m.now = { [unowned self] in self.clock }
    return m
  }

  /// Lets the Tasks the meeting starts run.
  func settle() async {
    for _ in 0..<20 { await Task.yield() }
    try? await Task.sleep(for: .milliseconds(30))
    for _ in 0..<20 { await Task.yield() }
  }

  func live() async -> KitMeeting {
    let m = meeting()
    await m.start()
    XCTAssertEqual(m.phase, .connecting)
    transports[0].emit(.ready)
    await settle()
    return m
  }

  func testConnectingThenLiveThenKitSpeaksFirst() async {
    let m = await live()
    XCTAssertEqual(m.phase, .live)
    XCTAssertEqual(transports[0].sent, ["[begin]"], "the kickoff asks for Kit's greeting")
    transports[0].emit(.kitSaid("Hi Bart, Kit here.", id: 1))
    transports[0].emit(.activity(.speaking))
    XCTAssertEqual(m.caption?.who, .kit)
    XCTAssertEqual(m.activity, .speaking)
    transports[0].emit(.youSaid("[begin]"))
    XCTAssertEqual(m.lines.count, 1, "the kickoff is plumbing, not something he said")
    transports[0].emit(.youSaid("Should we ship it today?"))
    XCTAssertEqual(m.activity, .thinking)
    XCTAssertEqual(m.caption?.text, "Should we ship it today?")
  }

  func testInterruptedKeepsWhatKitActuallySaid() async {
    let m = await live()
    transports[0].emit(.kitSaid("A long answer with three parts. First, the price. Second", id: 7))
    transports[0].emit(.activity(.speaking))
    transports[0].emit(.kitCut("A long answer with three parts.", id: 7))
    XCTAssertEqual(m.activity, .listening)
    XCTAssertEqual(m.lines.last?.text, "A long answer with three parts.")
    XCTAssertEqual(m.phase, .live, "a cut-in does not end anything")
  }

  func testEndByYouClosesOnceAndTellsTheServerOnce() async {
    let m = await live()
    clock += 95
    await m.end()
    await m.end()
    XCTAssertEqual(m.phase, .ended)
    XCTAssertEqual(m.endReason, .you)
    XCTAssertNil(m.endMessage)
    XCTAssertEqual(transports[0].closed, 1)
    XCTAssertEqual(service.ends.count, 1)
    XCTAssertEqual(service.ends.first?.1, .you)
    XCTAssertEqual(m.seconds, 95)
    // a late event from the closed connection changes nothing
    transports[0].emit(.youSaid("hello?"))
    XCTAssertEqual(m.lines.count, 0)
  }

  func testLostConnectionReconnectsOnceIntoTheSameMeeting() async {
    let m = await live()
    transports[0].emit(.closed(error: true))
    await settle()
    XCTAssertEqual(m.phase, .reconnecting)
    XCTAssertEqual(transports[0].closed, 1, "the old connection is closed before the new one opens")
    XCTAssertEqual(service.starts, [nil, "s-1"], "the reconnect resumes the same meeting")
    transports[1].emit(.ready)
    await settle()
    XCTAssertEqual(m.phase, .live)
    XCTAssertEqual(transports[1].sent, ["[begin]"])
    // a second loss ends it, plainly
    transports[1].emit(.closed(error: true))
    await settle()
    XCTAssertEqual(m.phase, .ended)
    XCTAssertEqual(m.endReason, .dropped)
    XCTAssertEqual(m.endMessage, "The connection dropped. What you said is saved.")
    XCTAssertEqual(transports[1].closed, 1)
    XCTAssertEqual(service.ends.map(\.1), [.dropped])
  }

  func testOneLossReportedTwiceReconnectsOnce() async {
    let m = await live()
    transports[0].emit(.closed(error: true))
    transports[0].emit(.closed(error: true))
    await settle()
    XCTAssertEqual(m.phase, .reconnecting)
    XCTAssertEqual(service.starts, [nil, "s-1"])
    XCTAssertEqual(transports.count, 2)
  }

  func testReconnectRefusedEndsTheMeeting() async {
    service.refuseResume = true
    let m = await live()
    transports[0].emit(.closed(error: true))
    await settle()
    XCTAssertEqual(m.phase, .ended)
    XCTAssertEqual(m.endReason, .dropped)
    XCTAssertEqual(transports[0].closed, 1)
    XCTAssertEqual(service.ends.count, 1)
  }

  func testSilenceEndedByTheEngine() async {
    let m = await live()
    transports[0].emit(.youSaid("Let me think."))
    clock += KitMeeting.silenceLimit + 1
    transports[0].emit(.closed(error: false))
    await settle()
    XCTAssertEqual(m.endReason, .silence)
    XCTAssertEqual(m.endMessage, "It went quiet, so the meeting ended.")
    XCTAssertEqual(transports[0].closed, 1)
    XCTAssertEqual(service.ends.map(\.1), [.silence])
  }

  func testTimeLimit() async {
    let m = await live()
    clock += KitMeeting.durationLimit
    transports[0].emit(.youSaid("one more thing"))
    transports[0].emit(.closed(error: false))
    await settle()
    XCTAssertEqual(m.endReason, .timeLimit)
  }

  func testPhoneCallEndsTheMeeting() async {
    let m = await live()
    transports[0].emit(.audioTaken)
    await settle()
    XCTAssertEqual(m.endReason, .phoneCall)
    XCTAssertEqual(m.endMessage, "A phone call ended the meeting.")
    XCTAssertEqual(transports[0].closed, 1)
    XCTAssertEqual(service.ends.map(\.1), [.phoneCall])
  }

  func testBackgroundEndsTheMeetingWhenItCannotKeepTheAudio() async {
    let m = await live()
    await m.backgrounded()
    XCTAssertEqual(m.endReason, .background)
    XCTAssertEqual(transports[0].closed, 1)
    XCTAssertEqual(service.ends.count, 1)
  }

  func testServerRefusesTheStart() async {
    service.refuse = .refused("One moment, then try again.")
    let m = meeting()
    await m.start()
    XCTAssertEqual(m.phase, .ended)
    XCTAssertEqual(m.endReason, .error)
    XCTAssertEqual(m.endMessage, "One moment, then try again.")
    XCTAssertTrue(transports.isEmpty, "nothing was opened")
    XCTAssertTrue(service.ends.isEmpty, "there is no meeting to close")
  }

  func testOpenFailsThenReconnectFailsToo() async {
    let m = meeting()
    m.readyTimeout = .milliseconds(20)
    await m.start()
    // never ready: the timeout counts as a lost connection, then the reconnect never gets ready
    // (polled, not a fixed wait: a busy machine runs the timers late)
    for _ in 0..<200 where m.phase != .ended { try? await Task.sleep(for: .milliseconds(10)) }
    await settle()
    XCTAssertEqual(m.phase, .ended)
    XCTAssertEqual(m.endReason, .dropped)
    XCTAssertEqual(transports.count, 2)
    XCTAssertEqual(transports.map(\.closed), [1, 1], "both connections are closed")
    XCTAssertEqual(service.ends.count, 1)
  }

  func testEndWhileConnectingClosesWhatOpens() async {
    let m = meeting()
    await m.start()
    await m.end()
    XCTAssertEqual(m.phase, .ended)
    XCTAssertEqual(transports[0].closed, 1)
    transports[0].emit(.ready)
    await settle()
    XCTAssertEqual(m.phase, .ended)
    XCTAssertTrue(transports[0].sent.isEmpty, "no kickoff after End")
  }

  func testMuteReachesTheConnectionAndSilencesTheLevel() async {
    let m = await live()
    m.setMuted(true)
    await settle()
    XCTAssertEqual(transports[0].muted.last, true)
    transports[0].emit(.levels(kit: 0, you: 0.8))
    XCTAssertEqual(m.youLevel, 0)
  }

  /// The server's minutes (src/lib/venture/minutes.ts) as the phone reads them, a correction mark included.
  func testMinutesFromTheServer() {
    let j = JSON.parse(#"{"source":"meeting","ref":"s-1","summary":"Two lines.","decided":[{"id":"d1","text":"Ship on Friday","quote":"Yes, decided."},{"id":"t1","text":"Offer the app","by":"bart"}],"to_decide":[{"id":"t2","text":"An outside review"}],"kit_will_do":[{"id":"k1","text":"Send the draft"}],"facts":[]}"#)!
    let m = KitAPI.minutes(j)!
    XCTAssertEqual(m.decided.map(\.text), ["Ship on Friday", "Offer the app"])
    XCTAssertEqual(m.decided[0].quote, "Yes, decided.")
    XCTAssertTrue(m.decided[1].byBart)
    XCTAssertEqual(m.toDecide.map(\.id), ["t2"])
    XCTAssertEqual(m.kitWillDo.map(\.text), ["Send the draft"])
    XCTAssertNil(KitAPI.minutes(.null), "no minutes yet")
  }

  func testPostgresDates() {
    XCTAssertNotNil(kitDate("2026-11-17T10:00:00.123456+00:00"))
    XCTAssertNotNil(kitDate("2026-11-17T10:00:00Z"))
    XCTAssertNil(kitDate("yesterday"))
  }
}
