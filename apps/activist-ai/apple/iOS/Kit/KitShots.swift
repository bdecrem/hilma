#if DEBUG
import OlaKit
import SwiftUI
import UIKit

/// `-KitShots <dir>` (simulator, debug builds): draws every Kit screen and state, light and dark,
/// into PNGs with made-up words, then exits. No network, no microphone, no ElevenLabs.
@MainActor
enum KitShots {
  static func runIfAsked() {
    let args = ProcessInfo.processInfo.arguments
    guard let i = args.firstIndex(of: "-KitShots"), i + 1 < args.count else { return }
    let dir = URL(fileURLWithPath: args[i + 1])
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for (name, view) in screens() {
      for dark in [false, true] {
        let content = view
          .environment(\.colorScheme, dark ? .dark : .light)
          .environment(\.kitStill, true)
          .frame(width: 393, height: 852)
          .padding(.top, 0)
        let r = ImageRenderer(content: content)
        r.scale = 3
        r.proposedSize = ProposedViewSize(width: 393, height: 852)
        guard let image = r.uiImage, let png = image.pngData() else { continue }
        try? png.write(to: dir.appendingPathComponent("kit-\(name)-\(dark ? "dark" : "light").png"))
      }
    }
    exit(0)
  }

  static let api = KitAPI(token: { nil })
  static let t0 = Date(timeIntervalSince1970: 1_800_000_000)

  static func screens() -> [(String, AnyView)] {
    let now = Date.now
    let recap = KitMinutes(
      source: "meeting", ref: "a", summary: "Where the PDF offer stands, and the Mac app for others.",
      decided: [KitMinutes.Line(id: "d1", text: "Quote a price on the next call", quote: "Yes, decided. Quote it.")],
      toDecide: [KitMinutes.Line(id: "t1", text: "Offer the Mac app to others, as a choice"), KitMinutes.Line(id: "t2", text: "Whether an outside review comes first")],
      kitWillDo: [KitMinutes.Line(id: "k1", text: "Send both drafts tonight")])
    let overview = KitOverview(
      meetings: [
        KitMeetingSummary(id: "a", at: now.addingTimeInterval(-50 * 60), seconds: 742, firstLine: "Where are we on the PDF offer, and what do you need from me this week?", turns: 18, minutes: recap),
        KitMeetingSummary(id: "b", at: now.addingTimeInterval(-26 * 3600), seconds: 305, firstLine: "Quick one about the pricing page.", turns: 8),
      ],
      notes: [
        KitNote(id: 1, text: "Move the call with the clerk's office to Thursday, and send me the draft first.", at: now.addingTimeInterval(-3 * 3600), read: true,
                minutes: KitMinutes(source: "note", ref: "1", summary: "Move the clerk call.", decided: [], toDecide: [], kitWillDo: [KitMinutes.Line(id: "k1", text: "Move the clerk's call to Thursday"), KitMinutes.Line(id: "k2", text: "Send Bart the draft first")])),
        KitNote(id: 2, text: "Idea for the landing page: lead with the before and after.", at: now.addingTimeInterval(-3 * 86400), read: true),
      ])
    let lines = [
      KitLine(id: 0, who: .kit, text: "Hi Bart, Kit here."),
      KitLine(id: 1, who: .bart, text: "Where are we on the PDF offer?"),
      KitLine(id: 2, who: .kit, text: "Two offices said yes to a free first file. I'll send both drafts tonight and need one answer from you: can I quote a price on the call?"),
    ]
    func meeting(_ m: KitMeeting, t: Double = 1.3) -> AnyView { AnyView(KitMeetingScreen(meeting: m, close: {}, frozen: t).padding(.top, 47).background(Ola.paper)) }
    func note(_ r: KitNoteRecorder) -> AnyView { AnyView(KitNoteScreen(api: api, close: {}, recorder: r).padding(.top, 10).background(Ola.paper)) }
    var levels: [Float] = (0..<32).map { i in Float(0.15 + 0.7 * abs(sin(Double(i) * 0.7)) * (0.5 + 0.5 * cos(Double(i) * 0.23))) }
    levels[31] = 0.4
    return [
      ("home", AnyView(KitScreen(api: api, fixture: overview).padding(.top, 47).background(Ola.paper))),
      ("home-writing", AnyView(KitScreen(api: api, fixture: KitOverview(meetings: [KitMeetingSummary(id: "c", at: now.addingTimeInterval(-70), seconds: 60, firstLine: "One more thing about the Mac app.", turns: 4)] + overview.meetings, notes: overview.notes)).padding(.top, 47).background(Ola.paper))),
      ("home-corrected", AnyView(KitScreen(api: api, fixture: KitOverview(meetings: [{ var m = overview.meetings[0]; m.minutes = KitMinutes(source: "meeting", ref: "a", summary: "", decided: recap.decided + [KitMinutes.Line(id: "t1", text: "Offer the Mac app to others, as a choice", byBart: true)], toDecide: [recap.toDecide[1]], kitWillDo: recap.kitWillDo); return m }()], notes: [])).padding(.top, 47).background(Ola.paper))),
      ("home-empty", AnyView(KitScreen(api: api, fixture: KitOverview(meetings: [], notes: [])).padding(.top, 47).background(Ola.paper))),
      ("meeting-connecting", meeting(.fixture(phase: .connecting))),
      ("meeting-speaking", meeting(.fixture(phase: .live, activity: .speaking, lines: lines, seconds: 74, kitLevel: 0.8))),
      ("meeting-listening", meeting(.fixture(phase: .live, activity: .listening, lines: Array(lines.prefix(2)), seconds: 31, youLevel: 0.6))),
      ("meeting-thinking", meeting(.fixture(phase: .live, activity: .thinking, lines: Array(lines.prefix(2)), seconds: 33))),
      ("meeting-muted", meeting(.fixture(phase: .live, activity: .listening, lines: lines, muted: true, seconds: 80))),
      ("meeting-reconnecting", meeting(.fixture(phase: .reconnecting, lines: lines, seconds: 95))),
      ("meeting-over", meeting(.fixture(phase: .ended, lines: lines, seconds: 742, endReason: .you))),
      ("meeting-dropped", meeting(.fixture(phase: .ended, lines: lines, seconds: 402, endReason: .dropped, endMessage: "The connection dropped. What you said is saved."))),
      ("meeting-phone-call", meeting(.fixture(phase: .ended, lines: lines, seconds: 130, endReason: .phoneCall, endMessage: "A phone call ended the meeting."))),
      ("meeting-unavailable", meeting(.fixture(phase: .ended, endReason: .error, endMessage: "That is a lot of meetings this hour. Try again later, or leave a note."))),
      ("note-ready", note(KitNoteRecorder())),
      ("note-recording", note(KitNoteRecorder(state: .recording, elapsed: 83, levels: levels))),
      ("note-countdown", note(KitNoteRecorder(state: .recording, elapsed: 276, levels: levels))),
      ("note-recorded", note(KitNoteRecorder(state: .recorded, elapsed: 96))),
      ("note-sending", note(KitNoteRecorder(state: .sending, elapsed: 96))),
      ("note-sent", note(KitNoteRecorder(state: .sent(KitNote(id: 3, text: "Move the call with the clerk's office to Thursday, and send me the draft first. Also, keep the price out of the first email.", at: t0, read: false))))),
      ("note-failed", note(KitNoteRecorder(state: .failed("No connection. Try again when you have signal."), elapsed: 96))),
      ("note-denied", note(KitNoteRecorder(state: .denied))),
      ("read-meeting", AnyView(KitReadScreen(item: .meeting(overview.meetings[0]), api: api, fixtureLines: lines).padding(.top, 10).background(Ola.paper))),
      ("read-meeting-plain", AnyView(KitReadScreen(item: .meeting(overview.meetings[1]), api: api, fixtureLines: lines).padding(.top, 10).background(Ola.paper))),
      ("read-note", AnyView(KitReadScreen(item: .note(overview.notes[0]), api: api).padding(.top, 10).background(Ola.paper))),
    ]
  }
}
#endif
