import Foundation
import XCTest
@testable import OlaKit

/// Kit's local voice (OLA-534). The sentence splitter offline; the network half against the live
/// Studio only when KIT_VOICE_URL, KIT_VOICE_TOKEN and KIT_VOICE_PCM are set
/// (scripts/venture/phone-local-voice-check.sh sets them; the PCM is 16 kHz mono int16).
final class KitLocalVoiceTests: XCTestCase {
  func testSentencesAsTheReplyStreams() {
    var s = KitSentences()
    XCTAssertEqual(s.add("Ship it to"), [])
    XCTAssertEqual(s.add("day. Version 3.5 is"), ["Ship it today."])
    XCTAssertEqual(s.add(" fine! Is it \"done?\" Yes"), ["Version 3.5 is fine!", "Is it \"done?\""])
    XCTAssertEqual(s.finish(), "Yes")
    XCTAssertNil(s.finish())
  }

  @MainActor
  func testAGrowingKitLineStaysOneLine() async throws {
    let fake = GrowFake()
    let m = KitMeeting(service: GrowService()) { fake }
    await m.start()
    fake.emit?(.ready)
    fake.emit?(.kitSaid("Hi Bart.", id: 7))
    fake.emit?(.kitSaid("Hi Bart. Kit here.", id: 7))
    XCTAssertEqual(m.lines.map(\.text), ["Hi Bart. Kit here."])
    fake.emit?(.kitCut("Hi Bart.", id: 7))
    XCTAssertEqual(m.lines.map(\.text), ["Hi Bart."])
  }

  /// The network half against the live voice server: the question comes back as text, and one
  /// sentence comes back as audio.
  func testLiveStudio() async throws {
    let env = ProcessInfo.processInfo.environment
    guard let u = env["KIT_VOICE_URL"], let url = URL(string: u), let token = env["KIT_VOICE_TOKEN"], let path = env["KIT_VOICE_PCM"] else {
      throw XCTSkip("KIT_VOICE_URL / KIT_VOICE_TOKEN / KIT_VOICE_PCM not set")
    }
    let v = KitLocalVoice(url: url, token: token)
    let pcm = try Data(contentsOf: URL(fileURLWithPath: path))
    let (call, silence) = try await v.open()
    XCTAssertEqual(silence, 800)
    // The recording, then two seconds of quiet so the server ends the turn, in 256 ms posts.
    let stream = pcm + Data(count: 2 * 16000 * 2 * 2)
    var events: [KitLocalEvent] = []
    var off = 0
    let step = KitLocalVoice.chunk * 2
    let t0 = Date()
    while !events.contains(where: { if case .transcript = $0 { true } else { false } }), Date().timeIntervalSince(t0) < 40 {
      let piece = off < stream.count ? stream.subdata(in: off..<min(off + step, stream.count)) : Data(count: step)
      off += step
      events += try await v.audio(call, piece)
    }
    let heard = events.compactMap { if case .transcript(let t) = $0 { t } else { nil } }.first ?? ""
    print("KIT_LOCAL events:", events.map { "\($0)" }.joined(separator: " "))
    print("KIT_LOCAL heard:", heard)
    XCTAssertTrue(events.contains(.speechStarted))
    XCTAssertTrue(events.contains(.speechStopped))
    XCTAssertFalse(heard.isEmpty, "the question came back as text")
    let audio = try await v.speak(call, "This is the Mac Studio speaking.")
    print("KIT_LOCAL spoke:", audio.count, "bytes =", String(format: "%.2f", Double(audio.count) / 2 / KitLocalVoice.sampleRateOut), "s")
    XCTAssertGreaterThan(audio.count, 24000, "at least half a second of audio")
    await v.end(call)
  }
}

@MainActor
private final class GrowFake: KitVoiceTransport {
  var emit: (@MainActor (KitVoiceEvent) -> Void)?
  func open(token: String, variables: [String: String], onEvent: @escaping @MainActor (KitVoiceEvent) -> Void) async throws { emit = onEvent }
  func send(_ text: String) async throws {}
  func setMuted(_ muted: Bool) async {}
  func setSpeaker(_ on: Bool) async {}
  func close() async {}
}

private struct GrowService: KitService {
  func startMeeting(resume: String?) async throws -> KitMeetingStart {
    KitMeetingStart(session: "s", resumed: false, conversationToken: "t", variables: [:], kickoff: "[begin]")
  }
  func endMeeting(_ id: String, seconds: Int, reason: KitEndReason) async throws {}
}
