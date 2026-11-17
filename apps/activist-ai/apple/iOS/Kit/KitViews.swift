import AVFoundation
import OlaKit
import SwiftUI
import UIKit

// Kit's screens in the phone app (admins only): talk to Kit in a voice meeting, or leave it a
// voice note, and read back the last few of each. The server is hilma's /api/venture/phone.

// MARK: Kit's screen

struct KitScreen: View {
  var api: KitAPI
  /// Screenshots: a fixed list, no network.
  var fixture: KitOverview? = nil
  @State private var overview: KitOverview?
  @State private var error: String?
  @State private var meeting: KitOpenMeeting?
  @State private var noting = false
  @State private var reading: KitRecent?

  var body: some View {
    KitScroll {
      VStack(alignment: .leading, spacing: Space.xl) {
        VStack(spacing: Space.m) {
          KitAction(title: "Talk to Kit", detail: "A meeting, out loud. Cut in any time.", symbol: "waveform", primary: true) {
            meeting = KitOpenMeeting(meeting: KitMeeting(service: api) { ElevenKitTransport() })
          }
          KitAction(title: "Leave a note", detail: "Up to five minutes. Kit reads it soon.", symbol: "mic", primary: false) {
            noting = true
          }
        }
        if let latest = recent.first, latest.minutes != nil || isWriting(latest) {
          KitRecap(title: latest.isMeeting ? "From this call" : "From this note", when: kitWhen(latest.at), minutes: latest.minutes, writing: isWriting(latest)) { m, line, to in
            await correct(m, line, to)
          }
        }
        KitRecentList(items: recent, loaded: (fixture ?? overview) != nil, error: error, open: { reading = $0 }, retry: { Task { await load() } })
      }
      .padding(.horizontal, Space.l)
      .padding(.vertical, Space.xl)
    }
    .background(Ola.paper.ignoresSafeArea())
    .task { if fixture == nil { await load() } }
    .task(id: waitingFor) {
      // Kit writes up a call or a note a few seconds after it ends: look again until it is there.
      guard fixture == nil, waitingFor != nil else { return }
      for _ in 0..<30 {
        try? await Task.sleep(for: .seconds(4))
        if Task.isCancelled { return }
        await load()
        if waitingFor == nil { return }
      }
    }
    .refreshable { await load() }
    .fullScreenCover(item: $meeting, onDismiss: { Task { await load() } }) { open in
      KitMeetingScreen(meeting: open.meeting, close: { meeting = nil })
    }
    .sheet(isPresented: $noting, onDismiss: { Task { await load() } }) {
      KitNoteScreen(api: api, close: { noting = false })
    }
    .sheet(item: $reading, onDismiss: { Task { await load() } }) { item in
      KitReadScreen(item: item, api: api)
    }
  }

  var recent: [KitRecent] {
    guard let o = fixture ?? overview else { return [] }
    let m = o.meetings.map(KitRecent.meeting)
    let n = o.notes.map(KitRecent.note)
    return (m + n).sorted { $0.at > $1.at }.prefix(8).map { $0 }
  }

  /// The newest call or note ended in the last few minutes and its notes are not written yet.
  func isWriting(_ r: KitRecent) -> Bool { r.minutes == nil && Date.now.timeIntervalSince(r.end) < 180 }
  var waitingFor: String? { recent.first.flatMap { isWriting($0) ? $0.id : nil } }

  func load() async {
    do {
      overview = try await api.overview()
      error = nil
    } catch {
      self.error = (error as? KitError)?.errorDescription ?? "Kit's list did not load."
    }
  }

  func correct(_ m: KitMinutes, _ line: String, _ to: KitMinutes.Move) async {
    guard fixture == nil else { return }
    do {
      let fixed = try await api.correct(m, line: line, to: to)
      overview = overview.map { o in
        var o = o
        o.meetings = o.meetings.map { var x = $0; if x.minutes?.ref == fixed.ref && fixed.source == "meeting" { x.minutes = fixed }; return x }
        o.notes = o.notes.map { var x = $0; if x.minutes?.ref == fixed.ref && fixed.source == "note" { x.minutes = fixed }; return x }
        return o
      }
    } catch {
      self.error = (error as? KitError)?.errorDescription ?? "That did not save."
    }
  }
}

/// The meeting on screen (a full-screen cover needs an identity).
struct KitOpenMeeting: Identifiable {
  let id = UUID()
  let meeting: KitMeeting
}

/// A meeting or a note, for the list.
enum KitRecent: Identifiable, Equatable {
  case meeting(KitMeetingSummary), note(KitNote)
  var id: String {
    switch self {
    case .meeting(let m): "m-\(m.id)"
    case .note(let n): "n-\(n.id)"
    }
  }
  var at: Date {
    switch self {
    case .meeting(let m): m.at
    case .note(let n): n.at
    }
  }
  var end: Date {
    switch self {
    case .meeting(let m): m.at.addingTimeInterval(TimeInterval(m.seconds))
    case .note(let n): n.at
    }
  }
  var minutes: KitMinutes? {
    switch self {
    case .meeting(let m): m.minutes
    case .note(let n): n.minutes
    }
  }
  var isMeeting: Bool { if case .meeting = self { return true }; return false }
}

// MARK: what Kit took from a call

/// "From this call": Decided, To be decided, Kit will do. A tap on a line moves it between Decided
/// and To be decided, or removes it; the server keeps the change, marked as his.
struct KitRecap: View {
  var title: String
  var when: String? = nil
  var minutes: KitMinutes?
  var writing = false
  var correct: (KitMinutes, String, KitMinutes.Move) async -> Void
  @Environment(\.kitStill) private var still

  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      HStack(alignment: .firstTextBaseline) {
        Text(title).font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.ink)
        Spacer()
        if let when { Text(when).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3) }
      }
      if let m = minutes {
        if m.isEmpty {
          Text("Nothing decided, open or to do.").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
        } else {
          group("Decided", m.decided, m, move: .toDecide, moveLabel: "Not decided yet", mark: "checkmark.circle.fill", markColor: Ola.leaf)
          group("To be decided", m.toDecide, m, move: .decided, moveLabel: "It's decided", mark: "circle.dashed", markColor: Ola.ink3)
          group("Kit will do", m.kitWillDo, m, move: nil, moveLabel: "", mark: "arrow.right.circle", markColor: Ola.blue)
        }
      } else if writing {
        Text("Kit is writing it up.").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
      }
    }
    .padding(Space.l)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 14).fill(Ola.field))
    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Ola.ruleStrong, lineWidth: 1))
  }

  @ViewBuilder
  func group(_ name: String, _ lines: [KitMinutes.Line], _ m: KitMinutes, move: KitMinutes.Move?, moveLabel: String, mark: String, markColor: Color) -> some View {
    if !lines.isEmpty {
      VStack(alignment: .leading, spacing: Space.s) {
        Text(name).font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink3)
        ForEach(lines) { line in
          if still {
            label(line, mark: mark, markColor: markColor)
          } else {
            Menu {
              if let move { Button(moveLabel) { Task { await correct(m, line.id, move) } } }
              Button("Remove", role: .destructive) { Task { await correct(m, line.id, .delete) } }
            } label: {
              label(line, mark: mark, markColor: markColor)
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
  }

  func label(_ line: KitMinutes.Line, mark: String, markColor: Color) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: Space.s) {
      Image(systemName: mark).font(.system(size: 12, weight: .semibold)).foregroundStyle(markColor)
      VStack(alignment: .leading, spacing: 2) {
        Text(line.text).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
        if line.byBart {
          Text("Set by you").font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
        } else if let q = line.quote, !q.isEmpty {
          Text("You said \u{201C}\(q)\u{201D}").font(OlaFont.serif(Metrics.meta, .italic)).foregroundStyle(Ola.ink3).lineLimit(2)
        }
      }
      Spacer(minLength: 0)
    }
    .contentShape(Rectangle())
  }
}

/// One of the two large actions.
struct KitAction: View {
  var title: String
  var detail: String
  var symbol: String
  var primary: Bool
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Space.m) {
        Image(systemName: symbol)
          .font(.system(size: 20, weight: .medium))
          .frame(width: 44, height: 44)
          .background(Circle().fill(primary ? Ola.onAction.opacity(0.16) : Ola.details))
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(OlaFont.sans(Metrics.heading, .semibold))
          Text(detail).font(OlaFont.sans(Metrics.meta)).opacity(primary ? 0.85 : 1)
            .foregroundStyle(primary ? Ola.onAction : Ola.ink3)
        }
        Spacer(minLength: 0)
      }
      .foregroundStyle(primary ? Ola.onAction : Ola.ink)
      .padding(.horizontal, Space.l)
      .frame(maxWidth: .infinity, minHeight: 84)
      .background(RoundedRectangle(cornerRadius: 14).fill(primary ? Ola.action : Ola.field))
      .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(primary ? Color.clear : Ola.ruleStrong, lineWidth: 1))
      .contentShape(RoundedRectangle(cornerRadius: 14))
    }
    .buttonStyle(KitPress())
  }
}

struct KitPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.75 : 1).scaleEffect(configuration.isPressed ? 0.985 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

struct KitRecentList: View {
  var items: [KitRecent]
  var loaded: Bool
  var error: String?
  var open: (KitRecent) -> Void
  var retry: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("Recent").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink3)
        .padding(.bottom, Space.s)
      if let error, items.isEmpty {
        Text(error).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2)
        Button("Try again", action: retry).buttonStyle(LinkButton(size: Metrics.ui)).padding(.top, Space.s)
      } else if !loaded {
        ProgressView().padding(.vertical, Space.l)
      } else if items.isEmpty {
        Text("Nothing yet.").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3)
      } else {
        ForEach(items) { item in
          Button { open(item) } label: { KitRecentRow(item: item) }.buttonStyle(KitPress())
          if item != items.last { Rectangle().fill(Ola.rule).frame(height: 1).padding(.leading, 34) }
        }
      }
    }
  }
}

struct KitRecentRow: View {
  var item: KitRecent
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Space.m) {
      Image(systemName: isMeeting ? "waveform" : "mic")
        .font(.system(size: 14, weight: .medium)).foregroundStyle(Ola.ink3).frame(width: 22)
      VStack(alignment: .leading, spacing: 3) {
        Text(line).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink).lineLimit(2).multilineTextAlignment(.leading)
        Text(meta).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ola.ink3)
    }
    .padding(.vertical, Space.m)
    .contentShape(Rectangle())
  }

  var isMeeting: Bool { item.isMeeting }
  var line: String {
    switch item {
    case .meeting(let m): m.firstLine.isEmpty ? "A meeting" : m.firstLine
    case .note(let n): n.text
    }
  }
  var meta: String {
    switch item {
    case .meeting(let m): "Meeting · \(kitLength(m.seconds)) · \(kitWhen(m.at))"
    case .note(let n): "Note · \(kitWhen(n.at))\(n.read ? " · Kit read it" : "")"
    }
  }
}

func kitLength(_ seconds: Int) -> String {
  seconds < 60 ? "under a minute" : "\(Int((Double(seconds) / 60).rounded())) min"
}

func kitWhen(_ d: Date, now: Date = .now) -> String {
  let cal = Calendar.current
  let time = d.formatted(date: .omitted, time: .shortened)
  if cal.isDate(d, inSameDayAs: now) { return "Today \(time)" }
  if let y = cal.date(byAdding: .day, value: -1, to: now), cal.isDate(d, inSameDayAs: y) { return "Yesterday \(time)" }
  return d.formatted(.dateTime.month(.abbreviated).day()) + " " + time
}

func kitClock(_ seconds: Int) -> String { String(format: "%d:%02d", seconds / 60, seconds % 60) }

// MARK: a meeting

struct KitMeetingScreen: View {
  @Bindable var meeting: KitMeeting
  var close: () -> Void
  /// Screenshots: a fixed time, no permission prompt, no connection.
  var frozen: Double? = nil
  @State private var micDenied = false
  @Environment(\.scenePhase) private var phase

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Kit").font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.ink)
        Spacer()
        if meeting.phase != .connecting && !micDenied && meeting.seconds > 0 {
          TimelineView(.periodic(from: .now, by: 1)) { _ in
            Text(kitClock(meeting.seconds)).font(OlaFont.mono(Metrics.mono)).foregroundStyle(Ola.ink3).monospacedDigit()
          }
        }
      }
      .padding(.horizontal, Space.xl).padding(.top, Space.l)

      Spacer(minLength: Space.l)
      KitVoiceFigure(mode: mode, kitLevel: meeting.kitLevel, youLevel: meeting.youLevel, size: 232, frozen: frozen)
      Text(status).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(statusColor)
        .padding(.top, Space.s)
        .contentTransition(.opacity)
        .animation(.easeOut(duration: 0.2), value: status)

      ZStack(alignment: .top) {
        Color.clear
        words
      }
        .frame(maxWidth: .infinity)
        .frame(height: 200)
        .padding(.horizontal, Space.xl).padding(.top, Space.xl)
      Spacer(minLength: Space.l)

      Group {
      if meeting.phase == .ended || micDenied {
        Button(action: close) {
          Text("Done").font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.onAction)
            .frame(maxWidth: .infinity, minHeight: 50).background(RoundedRectangle(cornerRadius: 12).fill(Ola.action))
        }
        .buttonStyle(KitPress())
        .padding(.horizontal, Space.xl)
      } else {
        HStack(spacing: Space.xxl) {
          KitRound(symbol: meeting.muted ? "mic.slash.fill" : "mic.fill", label: meeting.muted ? "Muted" : "Mute", on: meeting.muted) {
            meeting.setMuted(!meeting.muted)
          }
          KitRound(symbol: meeting.speaker ? "speaker.wave.2.fill" : "iphone", label: meeting.speaker ? "Speaker" : "Phone", on: false) {
            meeting.setSpeaker(!meeting.speaker)
          }
          KitRound(symbol: "phone.down.fill", label: "End", on: false, danger: true) {
            Task { await meeting.end() }
          }
        }
      }
      }
      // The same height in every state, so the eyes never move when the meeting ends.
      .frame(height: 104, alignment: .bottom)
      .padding(.bottom, Space.xl)
    }
    .background(Ola.paper.ignoresSafeArea())
    .task {
      guard frozen == nil, meeting.phase == .idle else { return }
      let granted = await withCheckedContinuation { c in AVAudioApplication.requestRecordPermission { c.resume(returning: $0) } }
      if !granted { micDenied = true; return }
      UIApplication.shared.isIdleTimerDisabled = true
      await meeting.start()
    }
    .onDisappear {
      UIApplication.shared.isIdleTimerDisabled = false
      if meeting.phase != .ended { Task { await meeting.end() } }
    }
    .onChange(of: meeting.phase) { _, p in
      if p == .ended { UIApplication.shared.isIdleTimerDisabled = false }
    }
  }

  @ViewBuilder var words: some View {
    if micDenied {
      VStack(spacing: Space.m) {
        Text("Ola needs the microphone to talk with Kit.").font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink).multilineTextAlignment(.center)
        Button("Open Settings") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
          .buttonStyle(LinkButton(size: Metrics.ui))
      }
    } else if meeting.phase == .ended {
      VStack(spacing: Space.s) {
        if !endLine.isEmpty { Text(endLine).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3) }
        if let m = meeting.endMessage {
          Text(m).font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink).multilineTextAlignment(.center)
        }
      }
    } else if let line = meeting.caption {
      VStack(alignment: .leading, spacing: Space.xs) {
        Text(line.who == .kit ? "Kit" : "You").font(OlaFont.sans(Metrics.meta, .medium)).foregroundStyle(Ola.ink3)
        Text(line.text).font(OlaFont.serif(Metrics.reading)).foregroundStyle(line.who == .kit ? Ola.ink : Ola.ink2)
          .lineSpacing(Metrics.readingLeading).lineLimit(6).truncationMode(.head)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .id(line.id)
      .transition(.opacity)
      .animation(.easeOut(duration: 0.2), value: line.id)
    }
  }

  var mode: KitVoiceFigure.Mode {
    if micDenied { return .unavailable }
    switch meeting.phase {
    case .idle, .connecting, .reconnecting: return .connecting
    case .ended:
      switch meeting.endReason {
      case .error: return .unavailable
      case .dropped, .phoneCall, .background: return .rest
      default: return .over
      }
    case .live:
      if meeting.activity == .speaking { return .speaking }
      if meeting.muted { return .muted }
      return meeting.activity == .thinking ? .thinking : .listening
    }
  }

  var status: String {
    if micDenied { return "No microphone" }
    switch meeting.phase {
    case .idle, .connecting: return "Connecting"
    case .reconnecting: return "Reconnecting"
    case .ended: return meeting.endReason == .error ? "Kit can't talk right now" : "Meeting over"
    case .live:
      if meeting.activity == .speaking { return "Speaking" }
      if meeting.muted { return "Muted" }
      return meeting.activity == .thinking ? "Thinking" : "Listening"
    }
  }

  var statusColor: Color { meeting.phase == .reconnecting || meeting.muted && meeting.phase == .live ? Ola.vermilionText : Ola.ink2 }

  var endLine: String {
    meeting.endReason == .error ? "" : "\(kitLength(meeting.seconds)) · saved for Kit"
  }
}

/// A round control under the meeting: Mute, Speaker, End.
struct KitRound: View {
  var symbol: String
  var label: String
  var on: Bool
  var danger = false
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(spacing: Space.s) {
        Image(systemName: symbol).font(.system(size: 22, weight: .medium))
          .foregroundStyle(danger ? Color.white : on ? Ola.onAction : Ola.ink)
          .frame(width: 66, height: 66)
          .background(Circle().fill(danger ? Ola.vermilion : on ? Ola.action : Ola.details))
          .overlay(Circle().strokeBorder(danger || on ? Color.clear : Ola.rule, lineWidth: 1))
        Text(label).font(OlaFont.sans(Metrics.meta, .medium)).foregroundStyle(Ola.ink2)
      }
    }
    .buttonStyle(KitPress())
    .accessibilityLabel(label)
  }
}

// MARK: a note

struct KitNoteScreen: View {
  var api: KitAPI
  var close: () -> Void
  @State var recorder = KitNoteRecorder()
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Leave a note").font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.ink)
        Spacer()
        if recorder.state != .recording && recorder.state != .sending {
          Button(closeLabel) {
            if case .sent = recorder.state {} else { recorder.discard() }
            close()
          }
          .buttonStyle(LinkButton(size: Metrics.ui))
        }
      }
      .padding(.horizontal, Space.xl).padding(.top, Space.xl)
      Spacer()
      content.padding(.horizontal, Space.xl)
      Spacer()
    }
    .background(Ola.paper.ignoresSafeArea())
    .interactiveDismissDisabled(recorder.state == .recording || recorder.state == .recorded || recorder.state == .sending)
    .onDisappear { if recorder.state == .recording { recorder.discard() } }
  }

  var closeLabel: String { if case .sent = recorder.state { return "Done" }; return "Cancel" }

  @ViewBuilder var content: some View {
    switch recorder.state {
    case .ready, .recording:
      // One layout for both, so the button stays under the thumb.
      let on = recorder.state == .recording
      VStack(spacing: Space.l) {
        Text(kitClock(Int(recorder.elapsed))).font(OlaFont.mono(34)).foregroundStyle(on ? Ola.ink : Ola.ink3).monospacedDigit()
        KitLevelBars(levels: on ? recorder.levels : Array(repeating: 0, count: recorder.levels.count))
        KitRecordButton(recording: on) {
          if on { recorder.stop() } else { Task { await recorder.start() } }
        }
        Group {
          if !on {
            Text("Tap to record. Up to five minutes.").foregroundStyle(Ola.ink2)
          } else if recorder.remaining <= KitNoteRecorder.countdown {
            Text("\(Int(recorder.remaining.rounded(.up))) seconds left").font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.vermilionText)
          } else {
            Text("Tap to stop").foregroundStyle(Ola.ink2)
          }
        }
        .font(OlaFont.sans(Metrics.ui))
        .frame(height: 24)
      }
    case .recorded, .failed:
      VStack(spacing: Space.l) {
        Text(kitClock(Int(recorder.elapsed))).font(OlaFont.mono(34)).foregroundStyle(Ola.ink).monospacedDigit()
        KitLevelBars(levels: Array(repeating: 0, count: recorder.levels.count))
        VStack(spacing: Space.m) {
          Button { Task { await recorder.send(with: api) } } label: {
            Text(recorder.isFailed ? "Try again" : "Send").font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.onAction)
              .frame(maxWidth: .infinity, minHeight: 50).background(RoundedRectangle(cornerRadius: 12).fill(Ola.action))
          }
          Button { recorder.discard() } label: {
            Text("Discard").font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink)
              .frame(maxWidth: .infinity, minHeight: 50)
              .background(RoundedRectangle(cornerRadius: 12).fill(Ola.field))
              .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Ola.ruleStrong, lineWidth: 1))
          }
        }
        .buttonStyle(KitPress())
        Group {
          if case .failed(let why) = recorder.state {
            Text(why).foregroundStyle(Ola.vermilionText)
          } else {
            Text("Kit gets the words, not the recording.").foregroundStyle(Ola.ink3)
          }
        }
        .font(OlaFont.sans(Metrics.meta)).multilineTextAlignment(.center)
      }
    case .sending:
      VStack(spacing: Space.m) {
        KitVoiceFigure(mode: .connecting, size: 96)
        Text("Sending").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2)
      }
    case .sent(let note):
      VStack(spacing: Space.l) {
        KitVoiceFigure(mode: .over, size: 96, frozen: 0)
        Text("Kit has your note").font(OlaFont.sans(Metrics.title, .display)).foregroundStyle(Ola.ink)
        KitScroll {
          Text(note.text).font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink).lineSpacing(Metrics.readingLeading)
            .frame(maxWidth: .infinity, alignment: .leading).padding(Space.l)
        }
        .frame(maxHeight: 280)
        .fixedSize(horizontal: false, vertical: true)
        .background(RoundedRectangle(cornerRadius: 12).fill(Ola.field))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Ola.rule, lineWidth: 1))
      }
    case .denied:
      VStack(spacing: Space.m) {
        Text("Ola needs the microphone to record a note.").font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink).multilineTextAlignment(.center)
        Button("Open Settings") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
          .buttonStyle(LinkButton(size: Metrics.ui))
      }
    }
  }
}

struct KitRecordButton: View {
  var recording: Bool
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      ZStack {
        Circle().fill(recording ? Ola.vermilion : Ola.action).frame(width: 96, height: 96)
        if recording {
          RoundedRectangle(cornerRadius: 6).fill(Color.white).frame(width: 30, height: 30)
        } else {
          Image(systemName: "mic.fill").font(.system(size: 34, weight: .medium)).foregroundStyle(Ola.onAction)
        }
      }
    }
    .buttonStyle(KitPress())
    .accessibilityLabel(recording ? "Stop" : "Record")
  }
}

/// The note's level meter: the last few seconds of loudness as bars.
struct KitLevelBars: View {
  var levels: [Float]
  var body: some View {
    HStack(alignment: .center, spacing: 4) {
      ForEach(Array(levels.enumerated()), id: \.offset) { _, l in
        Capsule().fill(Ola.ink2).frame(width: 4, height: 4 + 44 * CGFloat(l))
      }
    }
    .frame(height: 52)
    .animation(.linear(duration: 0.08), value: levels)
  }
}

// MARK: reading one back

struct KitReadScreen: View {
  var item: KitRecent
  var api: KitAPI
  var fixtureLines: [KitLine]? = nil
  @State private var lines: [KitLine]?
  @State private var minutes: KitMinutes?
  @State private var error: String?
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.ink)
          Text(kitWhen(item.at)).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
        }
        Spacer()
        Button("Done") { dismiss() }.buttonStyle(LinkButton(size: Metrics.ui))
      }
      .padding(.horizontal, Space.xl).padding(.vertical, Space.l)
      Rectangle().fill(Ola.rule).frame(height: 1)
      KitScroll {
        VStack(alignment: .leading, spacing: Space.l) {
          if let m = minutes ?? item.minutes {
            KitRecap(title: item.isMeeting ? "From this call" : "From this note", minutes: m) { m, line, to in
              guard fixtureLines == nil else { return }
              do { minutes = try await api.correct(m, line: line, to: to) } catch { self.error = (error as? KitError)?.errorDescription }
            }
            .padding(.bottom, Space.s)
          }
          switch item {
          case .note(let n):
            Text(n.text).font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink).lineSpacing(Metrics.readingLeading)
          case .meeting:
            if let shown = fixtureLines ?? lines {
              ForEach(shown) { l in
                VStack(alignment: .leading, spacing: Space.xs) {
                  Text(l.who == .kit ? "Kit" : "You").font(OlaFont.sans(Metrics.meta, .medium)).foregroundStyle(Ola.ink3)
                  Text(l.text).font(OlaFont.serif(Metrics.reading)).foregroundStyle(l.who == .kit ? Ola.ink : Ola.ink2).lineSpacing(Metrics.readingLeading)
                }
              }
            } else if let error {
              Text(error).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2)
            } else {
              ProgressView().frame(maxWidth: .infinity)
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.xl)
      }
    }
    .background(Ola.paper.ignoresSafeArea())
    .task {
      guard fixtureLines == nil, case .meeting(let m) = item else { return }
      do {
        let got = try await api.meeting(m.id)
        lines = got.2
        if let fresh = got.1 { minutes = fresh }
      } catch { self.error = (error as? KitError)?.errorDescription ?? "It did not load." }
    }
  }

  var title: String {
    switch item {
    case .meeting(let m): "Meeting · \(kitLength(m.seconds))"
    case .note: "Note"
    }
  }
}

/// A scroll view, except in still renders (ImageRenderer draws a ScrollView blank).
struct KitScroll<Content: View>: View {
  @ViewBuilder var content: Content
  @Environment(\.kitStill) private var still
  var body: some View {
    if still { content.frame(maxHeight: .infinity, alignment: .top) } else { ScrollView { content } }
  }
}

private struct KitStillKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
  var kitStill: Bool { get { self[KitStillKey.self] } set { self[KitStillKey.self] = newValue } }
}
