import OlaKit
import SwiftUI

/// One request and what came of it: Bart's words, the run (steps that fold away), the answer.
struct TurnView: View {
  var turn: Turn
  var isLast: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      RequestView(turn: turn)
      if !turn.steps.isEmpty || !turn.notes.isEmpty || turn.isRunning { RunView(turn: turn, isLast: isLast) }
      if let notice = turn.notice {
        Label(notice, systemImage: "arrow.clockwise").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2)
      }
      if !turn.answer.isEmpty { MarkdownView(text: turn.answer) }
      if let e = turn.error { ProblemView(problem: e) }
      else if turn.status == .stopped { Text("Stopped. What it finished is in the folder.").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3) }
    }
  }
}

struct RequestView: View {
  var turn: Turn
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      Text("You").font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.ink)
      Text(turn.request).font(OlaFont.sans(Metrics.ui + 1)).foregroundStyle(Ola.ink).lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
      Spacer(minLength: 8)
      Text(turn.at.formatted(date: .omitted, time: .shortened)).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3).monospacedDigit()
    }
    .padding(.bottom, 12)
    .overlay(alignment: .bottom) { Rectangle().fill(Ola.rule).frame(height: 1) }
  }
}

/// The run: "Worked for 1 min 48 s · 6 steps · changed 3 files". Open while it works, folded once
/// it is done; a step that failed stays in view either way.
struct RunView: View {
  var turn: Turn
  var isLast: Bool
  @State private var open: Bool?

  var isOpen: Bool { open ?? turn.isRunning }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Button {
        withAnimation(.easeOut(duration: 0.15)) { open = !isOpen }
      } label: {
        HStack(spacing: 8) {
          if turn.isRunning { LampDot() }
          TimelineView(.periodic(from: .now, by: 1)) { ctx in
            Text(turn.summary(now: ctx.date)).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink2).monospacedDigit()
          }
          Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(Ola.ink3).rotationEffect(.degrees(isOpen ? 90 : 0))
          Spacer()
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .padding(.bottom, 4)
      let shown = isOpen ? turn.steps : turn.steps.filter { $0.status == .failed || $0.status == .waiting }
      ForEach(shown) { StepRow(step: $0).transition(.opacity.combined(with: .move(edge: .top))) }
      if isOpen, !turn.notes.isEmpty {
        ForEach(Array(turn.notes.enumerated()), id: \.offset) { _, n in
          Text(n).font(OlaFont.serif(Metrics.reading - 1, .italic)).foregroundStyle(Ola.ink2).padding(.leading, 30).padding(.vertical, 4)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }
}

struct LampDot: View {
  @State private var breathe = false
  @Environment(\.accessibilityReduceMotion) private var reduce
  var body: some View {
    Circle().fill(Ola.lamp).frame(width: 8, height: 8)
      .background(Circle().fill(Ola.lamp.opacity(0.35)).frame(width: 16, height: 16).scaleEffect(breathe ? 1 : 0.6).opacity(breathe ? 0.2 : 0.8))
      .onAppear { if !reduce { withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { breathe = true } } }
  }
}

struct StepRow: View {
  var step: Step
  @State private var details = false

  var tint: Color {
    switch step.status {
    case .failed: Ola.vermilionText
    case .waiting: Ola.vermilionText
    default: Ola.blue
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Image(systemName: step.status == .failed ? "xmark" : StepIconName.symbol(step.icon.rawValue))
          .font(.system(size: 12, weight: .medium)).foregroundStyle(tint).frame(width: 18)
        (Text(step.verb + (step.object.isEmpty ? "" : " ")).font(OlaFont.sans(Metrics.ui + 0.5)) + Text(step.object).font(OlaFont.sans(Metrics.ui + 0.5, .semibold)))
          .foregroundStyle(Ola.ink).lineLimit(2)
        Spacer(minLength: 8)
        Group {
          switch step.status {
          case .running, .preparing: ProgressView().controlSize(.small)
          case .waiting: Text("Needs your yes").foregroundStyle(Ola.vermilionText)
          default: Text(step.result ?? "").foregroundStyle(Ola.ink3)
          }
        }
        .font(OlaFont.sans(Metrics.meta + 0.5)).monospacedDigit().lineLimit(1)
      }
      if let e = step.error {
        Text(e).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText).padding(.leading, 28)
      }
      if !step.input.isEmpty || !step.output.isEmpty {
        Button(details ? "Hide details" : "Show details") { details.toggle() }
          .buttonStyle(.plain).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3).underline(color: Ola.rule).padding(.leading, 28)
        if details {
          ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 6) {
              Text((step.tool == "shell" || step.tool == "bash" ? "$ " : "") + step.input).foregroundStyle(Ola.ink)
              if !step.output.isEmpty { Text(String(step.output.prefix(4000))).foregroundStyle(Ola.ink2) }
            }
            .font(OlaFont.mono(Metrics.mono)).textSelection(.enabled).padding(12)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(Ola.details, in: RoundedRectangle(cornerRadius: 3))
          .padding(.leading, 28)
        }
      }
    }
    .padding(.vertical, 6).padding(.horizontal, 6)
    .background(step.status == .running || step.status == .preparing ? Ola.lampWash : step.status == .waiting ? Ola.vermilionWash : .clear, in: RoundedRectangle(cornerRadius: 3))
    .padding(.horizontal, -6)
  }
}

struct ProblemView: View {
  var problem: Problem
  @State private var details = false
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Label(problem.text, systemImage: "exclamationmark.circle").font(OlaFont.sans(Metrics.ui + 0.5)).foregroundStyle(Ola.vermilionText)
      if let d = problem.detail, !d.isEmpty {
        Button(details ? "Hide details" : "Show details") { details.toggle() }.buttonStyle(.plain).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
        if details { Text(d).font(OlaFont.mono(Metrics.mono)).foregroundStyle(Ola.ink2).textSelection(.enabled) }
      }
    }
  }
}

/// The approval. Vermilion edge, the exact command or change, and three answers. It sits over the
/// bottom of the conversation, above the composer, until Bart answers: it cannot scroll away.
struct ApprovalPanel: View {
  var approval: Approval
  var answer: (OpenCodeClient.Decision) -> Void
  @State private var shown: Set<Int> = [0]
  @State private var busy = false

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 7) {
        Circle().fill(Ola.vermilion).frame(width: 8, height: 8)
        Text("Ola asks").font(OlaFont.sans(Metrics.meta + 0.5, .semibold)).foregroundStyle(Ola.vermilionText)
      }
      Text(approval.title).font(OlaFont.sans(Metrics.ui + 6, .display)).foregroundStyle(Ola.ink)
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(approval.items.enumerated()), id: \.offset) { i, item in
          VStack(alignment: .leading, spacing: 6) {
            HStack {
              Text(item.label).font(OlaFont.sans(Metrics.ui + 0.5, .semibold)).foregroundStyle(Ola.ink)
              Spacer()
              if item.detail != nil, !item.isCommand {
                Button(shown.contains(i) ? "Hide" : "View") { if shown.contains(i) { shown.remove(i) } else { shown.insert(i) } }
                  .buttonStyle(.plain).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.blue)
              }
            }
            if let d = item.detail, item.isCommand || shown.contains(i) {
              ScrollView([.horizontal, .vertical]) {
                Text(d).font(OlaFont.mono(Metrics.mono)).foregroundStyle(Ola.ink).textSelection(.enabled).fixedSize().padding(10)
              }
              .frame(maxWidth: .infinity, maxHeight: item.isCommand ? 90 : 160, alignment: .topLeading)
              .fixedSize(horizontal: false, vertical: true)
              .background(Ola.details, in: RoundedRectangle(cornerRadius: 3))
            }
          }
        }
      }
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 10) { buttons }
        VStack(alignment: .leading, spacing: 8) { buttons }
      }
      .disabled(busy)
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ola.paper)
    .overlay(alignment: .top) { Rectangle().fill(Ola.vermilion).frame(height: 4) }
    .clipShape(RoundedRectangle(cornerRadius: 4))
    .shadow(color: .black.opacity(0.22), radius: 18, y: 6)
    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Ola.rule, lineWidth: 1))
    .onChange(of: approval.id) { _, _ in busy = false; shown = [0] }
  }

  @ViewBuilder var buttons: some View {
    Button { reply(.once) } label: { Text("Yes, this once").padding(.horizontal, 4) }
      .buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
    Button { reply(.always) } label: { Text("Yes, for the rest of this session") }
      .buttonStyle(OlaButton(kind: .ghost))
    Button { reply(.reject) } label: { Text("No, don\u{2019}t") }
      .buttonStyle(OlaButton(kind: .danger)).keyboardShortcut(.cancelAction)
  }

  func reply(_ d: OpenCodeClient.Decision) {
    busy = true
    answer(d)
  }
}

struct OlaButton: ButtonStyle {
  enum Kind { case primary, ghost, danger, onRoom }
  var kind: Kind
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(OlaFont.sans(Metrics.ui + 0.5, .semibold))
      .padding(.horizontal, 14).padding(.vertical, 8)
      .foregroundStyle(kind == .primary ? Ola.onRoom : kind == .danger ? Ola.vermilionText : kind == .onRoom ? Ola.onRoom : Ola.ink)
      .background(RoundedRectangle(cornerRadius: 4).fill(kind == .primary ? Color.ola(0x25407a, 0x3a5aa0) : .clear))
      .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(kind == .primary ? .clear : kind == .onRoom ? Ola.roomRule : Ola.rule, lineWidth: 1.5))
      .brightness(configuration.isPressed ? -0.08 : 0)
      .opacity(enabled ? 1 : 0.5)
      .contentShape(Rectangle())
  }
}

/// Where Bart types. Return sends; the button turns into Stop while a run works.
struct Composer: View {
  @Binding var text: String
  var running: Bool
  var enabled: Bool
  var send: () -> Void
  var stop: () -> Void
  @FocusState private var focused: Bool

  var body: some View {
    HStack(alignment: .bottom, spacing: 10) {
      TextField("Ask, or tell it what to do next", text: $text, axis: .vertical)
        .textFieldStyle(.plain)
        .font(OlaFont.serif(Metrics.reading))
        .foregroundStyle(Ola.ink)
        .lineLimit(1...8)
        .focused($focused)
        .onSubmit { if !running { send() } }
        .padding(.vertical, 4)
      if running {
        Button(action: stop) { Image(systemName: "stop.fill").font(.system(size: 12, weight: .bold)).frame(width: 32, height: 32) }
          .buttonStyle(.plain).foregroundStyle(Ola.onRoom).background(Circle().fill(Ola.vermilion))
          .help("Stop (\u{2318}.)").accessibilityLabel("Stop")
      } else {
        Button(action: send) { Image(systemName: "arrow.up").font(.system(size: 14, weight: .bold)).frame(width: 32, height: 32) }
          .buttonStyle(.plain).foregroundStyle(Ola.onRoom)
          .background(Circle().fill(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Ola.ink3.opacity(0.45) : Color.ola(0x25407a, 0x3a5aa0)))
          .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !enabled)
          .help("Send (Return)").accessibilityLabel("Send")
      }
    }
    .padding(.leading, 16).padding(.trailing, 8).padding(.vertical, 8)
    .background(RoundedRectangle(cornerRadius: 6).fill(Color.ola(0xfbf7ef, 0x252320)))
    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(focused ? Ola.blue.opacity(0.6) : Ola.rule, lineWidth: focused ? 1.5 : 1))
    #if os(macOS)
    .onAppear { focused = true }
    #endif
  }
}

/// The conversation on paper, newest at the bottom, the approval pinned over it.
struct ConversationPane: View {
  @Bindable var store: OlaStore
  @Binding var draft: String
  var columnWidth: CGFloat = 700
  var sidePadding: CGFloat = 40

  var body: some View {
    let convo = store.conversation
    VStack(spacing: 0) {
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 36) {
            if let convo, !convo.turns.isEmpty {
              ForEach(Array(convo.turns.enumerated()), id: \.element.id) { i, t in TurnView(turn: t, isLast: i == convo.turns.count - 1) }
            } else if store.selectedID == nil {
              EmptyConversation(folder: store.projectFolder)
            } else {
              ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
            // Room under the last turn for the approval, so it never hides what it is about.
            Color.clear.frame(height: convo?.approval == nil ? 1 : 320).id("end")
          }
          .frame(maxWidth: columnWidth, alignment: .leading)
          .padding(.horizontal, sidePadding).padding(.top, 28).padding(.bottom, 24)
          .frame(maxWidth: .infinity)
        }
        .modifier(ChatAnchor())
        .onChange(of: convo?.turns.last?.answer.count) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
        .onChange(of: convo?.turns.last?.steps.count) { _, _ in withAnimation(.easeOut(duration: 0.12)) { proxy.scrollTo("end", anchor: .bottom) } }
        .onChange(of: store.selectedID) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
      }
      .overlay(alignment: .bottom) {
        if let a = convo?.approval {
          ZStack(alignment: .bottom) {
            LinearGradient(colors: [Ola.paper.opacity(0), Ola.ink.opacity(0.28)], startPoint: .top, endPoint: .bottom).allowsHitTesting(false)
            ApprovalPanel(approval: a) { d in Task { await store.answer(d) } }
              .frame(maxWidth: columnWidth + 24)
              .padding(.horizontal, sidePadding - 12).padding(.bottom, 14)
              .transition(.move(edge: .bottom).combined(with: .opacity))
          }
        }
      }
      .animation(.easeOut(duration: 0.18), value: convo?.approval?.id)
      if let p = store.problem {
        HStack {
          ProblemView(problem: p)
          Spacer()
          Button("Dismiss") { store.problem = nil }.buttonStyle(.plain).font(OlaFont.sans(Metrics.meta, .medium)).foregroundStyle(Ola.ink3)
        }
        .frame(maxWidth: columnWidth).padding(.horizontal, sidePadding).padding(.top, 8)
      }
      Composer(text: $draft, running: convo?.isRunning ?? false, enabled: store.connection == .open, send: send, stop: { Task { await store.stop() } })
        .frame(maxWidth: columnWidth)
        .padding(.horizontal, sidePadding).padding(.top, 10).padding(.bottom, 16)
    }
    .background(Ola.paper)
  }

  func send() {
    let t = draft
    draft = ""
    Task { await store.send(t) }
  }
}

struct EmptyConversation: View {
  var folder: String
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("What should Ola do?").font(OlaFont.sans(26, .display)).foregroundStyle(Ola.ink)
      Text("It works in \(folder) on the machine, and asks before it runs a command or changes a file. Sessions you start here are on your phone too.")
        .font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink2).lineSpacing(5).fixedSize(horizontal: false, vertical: true)
    }
    .padding(.top, 40)
  }
}

/// The connect sheet: the address and the password, kept in the Keychain.
struct ConnectForm: View {
  var store: OlaStore
  var onDone: () -> Void = {}
  @State private var address = Credentials.savedAddress ?? ServerConfig.defaultAddress
  @State private var password = ""
  @State private var busy = false
  @State private var problem: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Image("Mark").resizable().frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 10))
      Text("Connect to your machine").font(OlaFont.sans(24, .display)).foregroundStyle(Ola.ink)
      Text("Ola runs on your own machine, and this app talks to it over Tailscale. The password is on the machine; it goes into this device\u{2019}s Keychain.")
        .font(OlaFont.serif(Metrics.reading - 0.5)).foregroundStyle(Ola.ink2).lineSpacing(4).fixedSize(horizontal: false, vertical: true)
      VStack(alignment: .leading, spacing: 6) {
        Text("Address").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink2)
        TextField("http://100.95.51.98:4310", text: $address).textFieldStyle(.plain).font(OlaFont.mono(Metrics.ui)).field()
          #if os(iOS)
          .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
          #endif
        Text("Password").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink2).padding(.top, 6)
        SecureField("From ola-bart.sh password", text: $password).textFieldStyle(.plain).font(OlaFont.sans(Metrics.ui)).field().onSubmit(connect)
      }
      if let problem { Text(problem).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText).fixedSize(horizontal: false, vertical: true) }
      HStack {
        if busy { ProgressView().controlSize(.small) }
        Spacer()
        Button("Connect", action: connect).buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
          .disabled(busy || password.isEmpty || URL(string: address)?.host == nil)
      }
    }
    .padding(28)
    .background(Ola.paper)
  }

  func connect() {
    guard let url = URL(string: address.trimmingCharacters(in: .whitespaces)), url.host != nil, !password.isEmpty else { return }
    busy = true
    problem = nil
    Task {
      do {
        try await store.connect(ServerConfig(url: url, password: password))
        onDone()
      } catch let e as OlaError {
        problem = e == .unauthorized ? "The machine refused that password. On the machine: ola-bart.sh password." : "\(e.errorDescription ?? "") (\(e.detail))"
      } catch {
        problem = error.localizedDescription
      }
      busy = false
    }
  }
}

extension View {
  func field() -> some View {
    padding(.horizontal, 12).padding(.vertical, 9)
      .background(RoundedRectangle(cornerRadius: 4).fill(Color.ola(0xfbf7ef, 0x252320)))
      .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Ola.rule, lineWidth: 1))
  }
}

/// A short conversation sits at the top; a long one opens at its newest turn.
struct ChatAnchor: ViewModifier {
  func body(content: Content) -> some View {
    if #available(macOS 15, iOS 18, *) {
      content.defaultScrollAnchor(.top, for: .alignment).defaultScrollAnchor(.bottom, for: .initialOffset)
    } else {
      content.defaultScrollAnchor(.bottom)
    }
  }
}

/// A line under the toolbar when the machine does not answer.
struct ConnectionBar: View {
  var store: OlaStore
  var body: some View {
    switch store.connection {
    case .lost(let since, _):
      HStack(spacing: 10) {
        Image(systemName: "wifi.exclamationmark").foregroundStyle(Ola.vermilion)
        TimelineView(.periodic(from: .now, by: 5)) { ctx in
          Text("The machine is not answering (\(Int(ctx.date.timeIntervalSince(since)))\u{2009}s). Is it on, and is this device on Tailscale? Trying again.")
        }
        Spacer()
        Button("Try now") { store.reconnect() }.buttonStyle(.plain).fontWeight(.semibold)
      }
      .font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.onRoom)
      .padding(.horizontal, 16).padding(.vertical, 9).background(Ola.roomRaised)
    case .refused:
      HStack(spacing: 10) {
        Image(systemName: "lock").foregroundStyle(Ola.vermilion)
        Text("The machine refused the saved password. Connect again with the new one.")
        Spacer()
      }
      .font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.onRoom)
      .padding(.horizontal, 16).padding(.vertical, 9).background(Ola.roomRaised)
    default:
      EmptyView()
    }
  }
}
