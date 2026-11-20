import OlaKit
import SwiftUI

/// One request and what came of it: Bart's words, the run (steps that fold away), the answer.
struct TurnView: View {
  var turn: Turn
  var isLast: Bool
  /// "Ask Claude instead", under a finished Ola reply (only when Fallback to Claude is on).
  var askClaude: (() -> Void)?
  /// "Ask the hosted model instead" (only when Fallback to the hosted open model is on).
  var askHosted: (() -> Void)? = nil
  /// The hosted model's provider, for the line under its replies.
  var hostedProvider: String? = nil
  /// View on what the run made.
  var view: ((ResultItem) -> Void)?
  /// A file's bytes, for the pictures shown inline.
  var load: ((String) async -> Data?)?

  var body: some View {
    VStack(alignment: .leading, spacing: Space.l) {
      RequestView(turn: turn)
      // A thank-you gets only its reaction: no run line, no reply.
      if !turn.reactionOnly {
        if !turn.steps.isEmpty || !turn.notes.isEmpty || turn.isRunning { RunView(turn: turn, isLast: isLast) }
        if let notice = turn.notice {
          Label(notice, systemImage: "arrow.clockwise").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2)
        }
        if !turn.shownAnswer.isEmpty { MarkdownView(text: turn.shownAnswer) }
        if turn.engine == .hosted, !turn.isRunning, !turn.shownAnswer.isEmpty {
          Text(FallbackWords.hostedAnswered(hostedProvider)).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
        }
        if !turn.isRunning, let view {
          let items = ResultItem.derive(turn)
          let pictures = load == nil ? [] : Array(items.filter(InlinePictures.isPicture).prefix(3))
          if let load, !pictures.isEmpty { InlinePictures(items: pictures, load: load, open: view) }
          let rest = items.filter { i in !pictures.contains(where: { $0.id == i.id }) }
          if !rest.isEmpty { ResultList(items: rest, view: view) }
        }
        if let e = turn.error { ProblemView(problem: e) }
        else if turn.status == .stopped { Text("Stopped. What it finished is in the folder.").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3) }
        if turn.engine == .ola, !turn.isRunning, askClaude != nil || askHosted != nil {
          // One small, quiet pull-down (OLA-156), in the style of the one in the box.
          // On the right, under the answer's last line (Bart, 2026-11-18: "move it to the RIGHT side").
          HStack {
            Spacer(minLength: 0)
            QuietMenu(label: "Try again with", help: "Send this request again to another model") {
              if let askHosted { Button("Hosted", action: askHosted) }
              if let askClaude { Button("Claude", action: askClaude) }
            }
          }
        }
      }
    }
  }
}

/// The agent's reaction on Bart's message: a small chip at its leading edge.
struct ReactionChip: View {
  var reaction: Reaction
  @Environment(\.accessibilityReduceMotion) private var reduce
  @State private var shown = false
  var body: some View {
    Text(reaction.emoji)
      .font(.system(size: Metrics.ui + 1))
      .padding(.horizontal, 7).padding(.vertical, 2)
      .background(Capsule().fill(Ola.details))
      .overlay(Capsule().strokeBorder(Ola.rule, lineWidth: 1))
      .scaleEffect(shown || reduce ? 1 : 0.4)
      .opacity(shown || reduce ? 1 : 0)
      .onAppear { withAnimation(reduce ? nil : .spring(response: 0.32, dampingFraction: 0.55)) { shown = true } }
      .id(reaction)
      .accessibilityLabel("Reaction \(reaction.rawValue)")
  }
}

/// Every Claude turn says so, and every turn of the hosted open model: quiet, but there at a glance.
struct ClaudeMark: View {
  var text = "Claude"
  var body: some View {
    Text(text)
      .font(OlaFont.sans(Metrics.meta - 0.5, .semibold))
      .foregroundStyle(Ola.blue)
      .padding(.horizontal, 6).padding(.vertical, 1)
      .overlay(Capsule().strokeBorder(Ola.blue.opacity(0.45), lineWidth: 1))
      .accessibilityLabel(text == "Claude" ? "Answered by Claude" : "Answered by the hosted open model")
  }
}

/// Your words: set in the interface face at reading size, so they read as yours and Ola's answer
/// (in Literata) as its. "You" and the time are small and out of the way.
struct RequestView: View {
  var turn: Turn
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Space.m) {
      Text("You").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.ink3)
        .frame(width: Metrics.youColumn, alignment: .leading)
      Text(turn.request).font(OlaFont.sans(Metrics.reading)).foregroundStyle(Ola.ink).lineSpacing(2)
        .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
      Spacer(minLength: Space.s)
      if turn.engine == .claude { ClaudeMark() }
      if turn.engine == .hosted { ClaudeMark(text: "Hosted open model") }
      Text(turn.at.formatted(date: .omitted, time: .shortened)).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3).monospacedDigit()
    }
    .padding(.bottom, turn.reaction == nil ? Space.m : Space.m + 8)
    .overlay(alignment: .bottom) { Rectangle().fill(Ola.rule).frame(height: 1) }
    // On the left, under "You" (Bart, 2026-11-18: "put reactions on the left").
    .overlay(alignment: .bottomLeading) {
      if let r = turn.reaction { ReactionChip(reaction: r).offset(y: 11) }
    }
  }
}

extension Metrics {
  /// The step icons and "You" share one left column, so the words after them line up.
  static let youColumn: CGFloat = 24
}

/// The run: "Worked for 1 min 48 s · 6 steps · changed 3 files". Open while it works, folded once
/// it is done; a step that failed stays in view either way.
struct RunView: View {
  var turn: Turn
  var isLast: Bool
  @State private var open: Bool?
  @State private var over = false

  var isOpen: Bool { open ?? turn.isRunning }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Button {
        withAnimation(.easeOut(duration: 0.15)) { open = !isOpen }
      } label: {
        HStack(spacing: Space.s) {
          RunMark(turn: turn, isOpen: isOpen)
            .frame(width: Metrics.youColumn - Space.s, alignment: .leading)
          TimelineView(.periodic(from: .now, by: 1)) { ctx in
            Text(turn.summary(now: ctx.date)).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(over ? Ola.ink : Ola.ink2).monospacedDigit()
          }
          Spacer()
        }
        .padding(.vertical, Space.xs)
        .contentShape(Rectangle())
        .onHover { over = $0 }
      }
      .buttonStyle(.plain)
      .help(isOpen ? "Hide the steps" : "Show every step")
      let shown = isOpen ? turn.steps : turn.steps.filter { $0.status == .failed || $0.status == .waiting }
      ForEach(shown) { StepRow(step: $0).transition(.opacity.combined(with: .move(edge: .top))) }
      if isOpen, !turn.notes.isEmpty {
        ForEach(Array(turn.notes.enumerated()), id: \.offset) { _, n in
          Text(n).font(OlaFont.serif(Metrics.ui, .italic)).foregroundStyle(Ola.ink2).lineSpacing(2)
            .padding(.leading, Metrics.youColumn + Space.s).padding(.vertical, Space.xs)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }
}

/// The lamp beside a working session in the session list.
struct LampDot: View {
  @State private var breathe = false
  @Environment(\.accessibilityReduceMotion) private var reduce
  var body: some View {
    Circle().fill(Ola.lamp).frame(width: 7, height: 7)
      .background(Circle().fill(Ola.lamp.opacity(0.35)).frame(width: 14, height: 14).scaleEffect(breathe ? 1 : 0.6).opacity(breathe ? 0.2 : 0.8))
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
    default: Ola.ink3
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(alignment: .firstTextBaseline, spacing: Space.s) {
        Image(systemName: step.status == .failed ? "xmark" : StepIconName.symbol(step.icon.rawValue))
          .font(.system(size: Metrics.ui - 2, weight: .medium)).foregroundStyle(tint).frame(width: Metrics.youColumn - Space.s, alignment: .leading)
        (Text(step.verb + (step.object.isEmpty ? "" : " ")).font(OlaFont.sans(Metrics.ui)) + Text(step.object).font(OlaFont.sans(Metrics.ui, .semibold)))
          .foregroundStyle(Ola.ink).lineLimit(2)
        Spacer(minLength: Space.s)
        Group {
          switch step.status {
          case .running, .preparing: ProgressView().controlSize(.mini)
          case .waiting: Text("Needs your yes").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.vermilionText)
          default: Text(step.result ?? "").foregroundStyle(Ola.ink3)
          }
        }
        .font(OlaFont.sans(Metrics.meta)).monospacedDigit().lineLimit(1)
      }
      Group {
        if let e = step.error {
          Text(e).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText).fixedSize(horizontal: false, vertical: true)
        }
        if !step.input.isEmpty || !step.output.isEmpty {
          Button(details ? "Hide details" : "Show details") { details.toggle() }
            .buttonStyle(LinkButton(color: Ola.ink3, weight: .regular))
          if details {
            ScrollView(.horizontal, showsIndicators: false) {
              VStack(alignment: .leading, spacing: Space.xs) {
                Text((step.tool == "shell" || step.tool == "bash" ? "$ " : "") + step.input).foregroundStyle(Ola.ink)
                if !step.output.isEmpty { Text(String(step.output.prefix(4000))).foregroundStyle(Ola.ink2) }
              }
              .font(OlaFont.mono(Metrics.mono)).lineSpacing(2).textSelection(.enabled).padding(Space.m)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Ola.details, in: RoundedRectangle(cornerRadius: 4))
            .padding(.top, Space.xs)
          }
        }
      }
      .padding(.leading, Metrics.youColumn)
    }
    .padding(.vertical, Space.xs).padding(.horizontal, Space.s)
    .background(step.status == .running || step.status == .preparing ? Ola.lampWash : step.status == .waiting ? Ola.vermilionWash : .clear, in: RoundedRectangle(cornerRadius: 4))
    .padding(.horizontal, -Space.s)
  }
}

struct ProblemView: View {
  var problem: Problem
  @State private var details = false
  var body: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      Label(problem.text, systemImage: "exclamationmark.circle").font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.vermilionText)
      if let d = problem.detail, !d.isEmpty {
        Button(details ? "Hide details" : "Show details") { details.toggle() }.buttonStyle(LinkButton(color: Ola.ink3, weight: .regular))
        if details { Text(d).font(OlaFont.mono(Metrics.mono)).foregroundStyle(Ola.ink2).textSelection(.enabled) }
      }
    }
  }
}

/// The approval. A vermilion edge, the exact command or change, and three answers. It sits over the
/// bottom of the conversation, above the composer, until Bart answers: it cannot scroll away. It is
/// the one raised thing on the page, and the only place vermilion fills a mark.
struct ApprovalPanel: View {
  var approval: Approval
  var answer: (OpenCodeClient.Decision) -> Void
  @State private var shown: Set<Int> = [0]
  @State private var busy = false

  var body: some View {
    VStack(alignment: .leading, spacing: Space.m) {
      VStack(alignment: .leading, spacing: Space.xs) {
        HStack(spacing: 6) {
          Circle().fill(Ola.vermilion).frame(width: 6, height: 6)
          Text("Ola asks").font(OlaFont.sans(Metrics.meta, .semibold)).foregroundStyle(Ola.vermilionText)
        }
        Text(approval.title).font(OlaFont.sans(Metrics.heading, .semibold)).foregroundStyle(Ola.ink)
        if let note = approval.note {
          Text(note).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
        }
      }
      VStack(alignment: .leading, spacing: Space.s) {
        ForEach(Array(approval.items.enumerated()), id: \.offset) { i, item in
          VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
              Text(item.label).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink)
              Spacer()
              if item.detail != nil, !item.isCommand {
                Button(shown.contains(i) ? "Hide" : "View") { if shown.contains(i) { shown.remove(i) } else { shown.insert(i) } }
                  .buttonStyle(LinkButton())
              }
            }
            if let d = item.detail, item.isCommand || shown.contains(i) {
              ScrollView([.horizontal, .vertical]) {
                Text(d).font(OlaFont.mono(Metrics.mono)).foregroundStyle(Ola.ink).lineSpacing(2).textSelection(.enabled).fixedSize().padding(Space.m)
              }
              .frame(maxWidth: .infinity, maxHeight: item.isCommand ? 88 : 150, alignment: .topLeading)
              .fixedSize(horizontal: false, vertical: true)
              .background(Ola.details, in: RoundedRectangle(cornerRadius: 4))
            }
          }
        }
      }
      // One row where it fits; on a narrow Mac window the two yeses stay together and No goes
      // under them; on a phone, full width and stacked for the thumb.
      ViewThatFits(in: .horizontal) {
        HStack(spacing: Space.s) { buttons }
        #if os(macOS)
        VStack(alignment: .leading, spacing: Space.s) {
          HStack(spacing: Space.s) { yesButtons(stacked: false) }
          noButton(stacked: false)
        }
        #endif
        VStack(alignment: .leading, spacing: Space.s) { buttonRow(stacked: true) }
      }
      .disabled(busy)
      .padding(.top, Space.xs)
    }
    .padding(Space.l)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ola.field)
    .overlay(alignment: .top) { Rectangle().fill(Ola.vermilion).frame(height: 2) }
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Ola.ruleStrong, lineWidth: 1))
    .shadow(color: .black.opacity(0.14), radius: 18, y: 6)
    .onChange(of: approval.id) { _, _ in busy = false; shown = [0] }
  }

  var buttons: some View { buttonRow(stacked: false) }

  /// Side by side where they fit; on a phone, full-width and stacked for the thumb. Yes is the
  /// filled button (Return), No is on the far right (Escape), as in a Mac alert read left to right.
  @ViewBuilder func buttonRow(stacked: Bool) -> some View {
    yesButtons(stacked: stacked)
    if !stacked { Spacer(minLength: Space.s) }
    noButton(stacked: stacked)
  }

  @ViewBuilder func yesButtons(stacked: Bool) -> some View {
    let w: CGFloat? = stacked ? .infinity : nil
    Button { reply(.once) } label: { Text("Yes, this once").frame(maxWidth: w) }
      .buttonStyle(OlaButton(kind: .primary)).keyboardShortcut(.defaultAction)
    Button { reply(.always) } label: { Text("Yes, for the rest of this session").frame(maxWidth: w) }
      .buttonStyle(OlaButton(kind: .ghost))
  }

  func noButton(stacked: Bool) -> some View {
    Button { reply(.reject) } label: { Text("No, don\u{2019}t").frame(maxWidth: stacked ? .infinity : nil) }
      .buttonStyle(OlaButton(kind: .danger)).keyboardShortcut(.cancelAction)
  }

  func reply(_ d: OpenCodeClient.Decision) {
    busy = true
    answer(d)
  }
}

/// Buttons: primary is the room's blue, ghost a hairline on paper, danger vermilion words on a
/// hairline, onRoom a hairline on the blue. Native height (26 on the Mac), hover and pressed shades.
struct OlaButton: ButtonStyle {
  enum Kind { case primary, ghost, danger, onRoom }
  var kind: Kind
  func makeBody(configuration: Configuration) -> some View { Styled(configuration: configuration, kind: kind) }

  struct Styled: View {
    var configuration: Configuration
    var kind: Kind
    @Environment(\.isEnabled) private var enabled
    @State private var over = false
    #if os(macOS)
    let h: CGFloat = 12, v: CGFloat = 5
    #else
    let h: CGFloat = 16, v: CGFloat = 10
    #endif

    var fill: Color {
      switch kind {
      case .primary: Ola.action
      case .onRoom: configuration.isPressed ? Ola.roomRaised : over ? Ola.roomHover : .clear
      default: configuration.isPressed ? Ola.paperPressed : over ? Ola.paperHover : Ola.field
      }
    }

    var body: some View {
      configuration.label
        .font(OlaFont.sans(Metrics.ui, kind == .primary ? .semibold : .medium))
        .lineLimit(1)
        .padding(.horizontal, h).padding(.vertical, v)
        .foregroundStyle(kind == .primary ? Ola.onAction : kind == .danger ? Ola.vermilionText : kind == .onRoom ? Ola.onRoom : Ola.ink)
        .background(RoundedRectangle(cornerRadius: 6).fill(fill))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(kind == .primary ? .clear : kind == .onRoom ? Ola.roomRule : Ola.ruleStrong, lineWidth: 1))
        .brightness(kind == .primary ? (configuration.isPressed ? -0.1 : over ? -0.05 : 0) : 0)
        .opacity(enabled ? 1 : 0.45)
        .contentShape(Rectangle())
        .onHover { over = $0 && enabled }
    }
  }
}

/// Where Bart types. Return sends; the button turns into Stop while a run works.
struct Composer: View {
  @Binding var text: String
  var running: Bool
  var enabled: Bool
  var send: () -> Void
  var stop: () -> Void
  /// Beside the send button: the engine pull-down (OLA-155), when more than Ola is on.
  var accessory: AnyView? = nil
  @FocusState private var focused: Bool

  var empty: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

  #if os(macOS)
  let button: CGFloat = 22
  /// A field-like box, not a card: the radius of the Mac's own rounded fields grown to two lines.
  let corner: CGFloat = 10
  #else
  let button: CGFloat = 32
  let corner: CGFloat = 8
  #endif

  var body: some View {
    HStack(alignment: .bottom, spacing: Space.s) {
      TextField("Ask, or tell it what to do next", text: $text, axis: .vertical)
        .textFieldStyle(.plain)
        .font(OlaFont.serif(Metrics.reading))
        .foregroundStyle(Ola.ink)
        .lineLimit(1...8)
        .focused($focused)
        .onSubmit { if !running { send() } }
        .padding(.vertical, 3)
      if let accessory { accessory.frame(height: button) }
      if running {
        Button(action: stop) { Image(systemName: "stop.fill").font(.system(size: button * 0.38, weight: .bold)).frame(width: button, height: button) }
          .buttonStyle(.plain).foregroundStyle(Ola.paper).background(Circle().fill(Ola.ink2))
          .help("Stop (\u{2318}.)").accessibilityLabel("Stop")
      } else {
        Button(action: send) { Image(systemName: "arrow.up").font(.system(size: button * 0.46, weight: .bold)).frame(width: button, height: button) }
          .buttonStyle(.plain).foregroundStyle(empty ? Ola.ink3 : Ola.onAction)
          .background(Circle().fill(empty ? Ola.rule : Ola.action))
          .disabled(empty || !enabled)
          .help("Send (Return)").accessibilityLabel("Send")
      }
    }
    .padding(.leading, Space.m).padding(.trailing, 6).padding(.vertical, 6)
    .background(RoundedRectangle(cornerRadius: corner).fill(Ola.field))
    .overlay(RoundedRectangle(cornerRadius: corner).strokeBorder(focused ? Ola.ink3.opacity(0.6) : Ola.ruleStrong, lineWidth: 1))
    .shadow(color: .black.opacity(focused ? 0.06 : 0.03), radius: 3, y: 1)
    #if os(macOS)
    .onAppear { focused = true }
    #endif
  }
}

/// A small, quiet pull-down: the label in small grey type with a chevron, the system menu under it.
/// The engine choice in the box and "Try again with" under an answer (OLA-155, OLA-156).
struct QuietMenu<Items: View>: View {
  var label: String
  var help: String
  @ViewBuilder var items: Items

  var body: some View {
    Menu { items } label: {
      HStack(spacing: 3) {
        Text(label)
        Image(systemName: "chevron.down").font(.system(size: Metrics.meta - 3, weight: .semibold))
      }
      .font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
      .contentShape(Rectangle())
    }
    .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden)
    .controlSize(.small).fixedSize()
    .help(help)
  }
}

/// Who works on the next message, beside the send button: Ola unless chosen otherwise. Only the
/// engines that are on (and the current choice) are listed.
struct EngineMenu: View {
  @Bindable var store: OlaStore

  static func name(_ e: Turn.Engine) -> String {
    switch e {
    case .ola: "Ola"
    case .hosted: "Hosted"
    case .claude: "Claude"
    }
  }

  var body: some View {
    QuietMenu(label: Self.name(store.nextEngine), help: "Who works on your next message") {
      Picker("Who works on this", selection: $store.nextEngine) {
        Text("Ola").tag(Turn.Engine.ola)
        if store.hostedOn || store.nextEngine == .hosted { Text("Hosted").tag(Turn.Engine.hosted) }
        if store.claudeOn || store.nextEngine == .claude { Text("Claude").tag(Turn.Engine.claude) }
      }
      .pickerStyle(.inline).labelsHidden()
    }
  }
}

/// The conversation on paper, newest at the bottom, the approval pinned over it.
struct ConversationPane: View {
  @Bindable var store: OlaStore
  @Binding var draft: String
  var columnWidth: CGFloat = Metrics.column
  var sidePadding: CGFloat = Space.xxl
  /// The larger working figure is out (a long quiet run).
  @State private var largeShown = false
  @Environment(\.workingLarge) private var forcedLarge

  var body: some View {
    let convo = store.conversation
    VStack(spacing: 0) {
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: Space.xxl) {
            if let convo, !convo.turns.isEmpty {
              ForEach(Array(convo.turns.enumerated()), id: \.element.id) { i, t in
                VStack(alignment: .leading, spacing: 0) {
                  TurnView(turn: t, isLast: i == convo.turns.count - 1, askClaude: store.claudeOn ? { Task { await store.askClaude(t.request) } } : nil,
                           askHosted: store.hostedOn ? { Task { await store.askHosted(t.request) } } : nil, hostedProvider: store.hosted.provider, view: store.onView ?? { _ in }, load: { try? await store.read($0) })
                  if i == convo.turns.count - 1, t.isRunning { WorkingStage(turn: t, waiting: convo.approval != nil, shown: $largeShown) }
                }
              }
              .environment(\.workingLargeShown, (forcedLarge ?? largeShown) && convo.approval == nil)
            } else if store.selectedID == nil {
              EmptyConversation(folder: store.projectFolder, runtime: store.runtime)
            } else {
              ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding(.top, 60)
            }
            // Room under the last turn for the approval, so it never hides what it is about.
            Color.clear.frame(height: convo?.approval == nil ? 1 : 300).id("end")
          }
          .frame(maxWidth: columnWidth, alignment: .leading)
          .padding(.horizontal, sidePadding).padding(.top, Space.xl).padding(.bottom, Space.l)
          .frame(maxWidth: .infinity)
        }
        .modifier(ChatAnchor())
        .onChange(of: convo?.turns.last?.answer.count) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
        .onChange(of: convo?.turns.last?.steps.count) { _, _ in withAnimation(.easeOut(duration: 0.12)) { proxy.scrollTo("end", anchor: .bottom) } }
        .onChange(of: store.selectedID) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
        .onChange(of: forcedLarge ?? largeShown) { _, now in if now { withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo("end", anchor: .bottom) } } }
      }
      .overlay(alignment: .bottom) {
        if let a = convo?.approval {
          ZStack(alignment: .bottom) {
            ApprovalPanel(approval: a) { d in Task { await store.answer(d) } }
              .frame(maxWidth: columnWidth + 2 * Space.l)
              .padding(.horizontal, max(Space.s, sidePadding - Space.l)).padding(.bottom, Space.m)
              .transition(.move(edge: .bottom).combined(with: .opacity))
          }
        }
      }
      .animation(.easeOut(duration: 0.18), value: convo?.approval?.id)
      if let p = store.problem {
        HStack(alignment: .firstTextBaseline) {
          ProblemView(problem: p)
          Spacer()
          Button("Dismiss") { store.problem = nil }.buttonStyle(LinkButton(color: Ola.ink3))
        }
        .frame(maxWidth: columnWidth).padding(.horizontal, sidePadding).padding(.top, Space.s)
      }
      if let s = store.suggestion, s.sessionID == nil || s.sessionID == store.selectedID {
        StretchCard(suggestion: s, store: store)
          .frame(maxWidth: columnWidth)
          .padding(.horizontal, sidePadding).padding(.top, Space.s)
      }
      SlashMenu(draft: $draft)
        .frame(maxWidth: columnWidth)
        .padding(.horizontal, sidePadding)
      Composer(text: $draft, running: (convo?.isRunning ?? false) || store.claudeRunning(store.selectedID ?? ""), enabled: store.connection == .open, send: send, stop: { Task { await store.stop() } },
               accessory: store.claudeOn || store.hostedOn || store.nextEngine != .ola ? AnyView(EngineMenu(store: store)) : nil)
        .frame(maxWidth: columnWidth)
        .padding(.horizontal, sidePadding).padding(.top, Space.s).padding(.bottom, Space.l)
    }
    .background(Ola.paper)
  }

  func send() {
    let t = draft
    // An unknown command is not sent: the text stays, and the menu says so.
    if case .unknown = SlashCommand.parse(t.trimmingCharacters(in: .whitespacesAndNewlines)) { return }
    draft = ""
    Task { await store.send(t) }
  }
}

extension Metrics {
  /// The reading column: at 15 pt Literata about 80 characters a line, the measure of a good chat
  /// pane (and room for a table or a code block).
  #if os(macOS)
  static let column: CGFloat = 600
  #else
  static let column: CGFloat = 640
  #endif
}

struct EmptyConversation: View {
  var folder: String
  var runtime: Runtime?

  /// Where this session works, and who else sees it, per runtime (OLA-207: a Local session said it
  /// was on the machine and on the phone; it is on this Mac, and the phone sees it only through
  /// this Mac when paired).
  static func line(folder: String, runtime: Runtime?) -> String {
    #if os(macOS)
    switch runtime {
    case .local: return "It works in \(folder) on this Mac. This session stays on this Mac."
    case .cloud: return "It works in \(folder) on the Ola machine. Your phone can follow this session."
    case nil: return "It works in \(folder)."
    }
    #else
    switch runtime {
    case .local: return "It works in \(folder) on your Mac."
    case .cloud: return "It works in \(folder) on the Ola machine."
    case nil: return "It works in \(folder)."
    }
    #endif
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.xs) {
      #if os(macOS)
      Text("What should Ola do?").font(OlaFont.sans(Metrics.title, .semibold)).foregroundStyle(Ola.ink)
      Text(Self.line(folder: folder, runtime: runtime))
        .font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink3).fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: 480, alignment: .leading)
      #else
      Text("What should Ola do?").font(OlaFont.sans(Metrics.title, .display)).foregroundStyle(Ola.ink)
      Text(Self.line(folder: folder, runtime: runtime))
        .font(OlaFont.serif(Metrics.reading)).foregroundStyle(Ola.ink2).lineSpacing(Metrics.readingLeading).fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: 480, alignment: .leading).padding(.top, Space.xs)
      #endif
    }
    .padding(.top, Space.xxl)
  }
}

extension View {
  /// A text field on paper: a lighter field, a hairline, and when focused the system's focus ring
  /// (its color, about 3 pt, outside the edge).
  func field(focused: Bool = false) -> some View {
    #if os(macOS)
    let h: CGFloat = 8, v: CGFloat = 5
    #else
    let h: CGFloat = 12, v: CGFloat = 10
    #endif
    return padding(.horizontal, h).padding(.vertical, v)
      .background(RoundedRectangle(cornerRadius: 5).fill(Ola.field))
      .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(focused ? Color.olaFocus : Ola.ruleStrong, lineWidth: 1))
      .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color.olaFocus.opacity(focused ? 0.4 : 0), lineWidth: 3).padding(-1.5))
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

/// A line under the toolbar when the machine does not answer: what is wrong, how long, and the one
/// thing to do.
struct ConnectionBar: View {
  var store: OlaStore
  var body: some View {
    switch store.connection {
    case .lost(let since, _):
      bar(icon: "wifi.exclamationmark") {
        TimelineView(.periodic(from: .now, by: 5)) { ctx in
          (Text("The machine is not answering. ").font(OlaFont.sans(Metrics.ui, .semibold))
           + Text("\(store.config?.account == true ? "Is this device online?" : "Is it on, and is this device on Tailscale?") Trying again (\(waited(ctx.date.timeIntervalSince(since)))).").font(OlaFont.sans(Metrics.ui)))
            .monospacedDigit().lineLimit(2)
        }
      } action: {
        Button("Try Now") { store.reconnect() }.buttonStyle(OlaButton(kind: .onRoom))
      }
    case .refused where store.config?.account == true:
      // The cloud (OLA-150): this device's Ola sign-in stopped working.
      bar(icon: "lock") {
        (Text("Signed out on this device. ").font(OlaFont.sans(Metrics.ui, .semibold)) + Text("Sign in to Ola again.").font(OlaFont.sans(Metrics.ui)))
      } action: { EmptyView() }
    case .refused:
      bar(icon: "lock") {
        (Text("The machine refused the saved password. ").font(OlaFont.sans(Metrics.ui, .semibold)) + Text("Connect again with the new one.").font(OlaFont.sans(Metrics.ui)))
      } action: { EmptyView() }
    default:
      EmptyView()
    }
  }

  /// "40 s", then "3 min": how long the machine has been quiet.
  func waited(_ s: TimeInterval) -> String {
    s < 60 ? "\(Int(s))\u{2009}s" : "\(Int(s / 60))\u{2009}min"
  }

  func bar<T: View, A: View>(icon: String, @ViewBuilder text: () -> T, @ViewBuilder action: () -> A) -> some View {
    HStack(spacing: Space.m) {
      Image(systemName: icon).font(.system(size: Metrics.ui, weight: .semibold)).foregroundStyle(Ola.vermilion)
      text().foregroundStyle(Ola.onRoom)
      Spacer(minLength: Space.s)
      action()
    }
    .padding(.horizontal, Space.l).padding(.vertical, Space.s)
    .background(Ola.roomRaised)
    .overlay(alignment: .bottom) { Rectangle().fill(Ola.roomRule).frame(height: 1) }
  }
}


/// Typing "/" shows the commands; an unknown one is named and not sent.
struct SlashMenu: View {
  @Binding var draft: String
  var body: some View {
    let typed = draft.trimmingCharacters(in: .whitespaces)
    let matches = SlashCommand.matches(typed)
    let unknown: Bool = { if case .unknown = SlashCommand.parse(typed), !typed.isEmpty, matches.isEmpty { return true }; return false }()
    if typed.hasPrefix("/") && (!matches.isEmpty || unknown) {
      VStack(alignment: .leading, spacing: 0) {
        if unknown {
          Text("No such command").font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.vermilionText).padding(10)
        }
        ForEach(matches, id: \.self) { c in
          Button {
            draft = "/\(c.rawValue) "
          } label: {
            HStack(spacing: 10) {
              Text("/\(c.rawValue)").font(OlaFont.mono(Metrics.ui)).foregroundStyle(Ola.ink)
              Text(c.summary).font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2)
              Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      .background(RoundedRectangle(cornerRadius: 6).fill(Ola.details))
      .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Ola.rule, lineWidth: 1))
      .padding(.top, 6)
    }
  }
}


/// What a run made, right under its reply: name, kind, View. Four, then "and N more".
struct ResultList: View {
  var items: [ResultItem]
  var view: (ResultItem) -> Void
  @State private var all = false

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array((all ? items : Array(items.prefix(4))).enumerated()), id: \.element.id) { i, item in
        if i > 0 { Rectangle().fill(Ola.rule).frame(height: 1) }
        HStack(spacing: 10) {
          Image(systemName: symbol(item.kind)).font(.system(size: 13)).foregroundStyle(Ola.blue).frame(width: 18)
          VStack(alignment: .leading, spacing: 1) {
            Text(item.name).font(OlaFont.sans(Metrics.ui, .medium)).foregroundStyle(Ola.ink).lineLimit(1).truncationMode(.middle)
            Text(item.kindLabel).font(OlaFont.sans(Metrics.meta)).foregroundStyle(Ola.ink3)
          }
          Spacer(minLength: 8)
          Button("View") { view(item) }
            .buttonStyle(.plain).font(OlaFont.sans(Metrics.ui, .semibold)).foregroundStyle(Ola.blue)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .contentShape(Rectangle())
        .onTapGesture { view(item) }
      }
      if items.count > 4 && !all {
        Rectangle().fill(Ola.rule).frame(height: 1)
        Button("and \(items.count - 4) more") { all = true }
          .buttonStyle(.plain).font(OlaFont.sans(Metrics.meta, .medium)).foregroundStyle(Ola.blue)
          .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 7)
      }
    }
    .background(RoundedRectangle(cornerRadius: 6).fill(Ola.details))
    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Ola.rule, lineWidth: 1))
  }

  func symbol(_ k: ResultItem.Kind) -> String {
    switch k {
    case .page: "doc.richtext"
    case .image: "photo"
    case .table: "tablecells"
    case .document: "doc.text"
    case .text: "doc.plaintext"
    case .file: "doc"
    case .site: "globe"
    }
  }
}

/// The stretch card, in the conversation over the composer: Ola says a request may be a stretch
/// for its own model, or that the person asked for Claude, and the person decides. The approval
/// panel's sibling: the same paper and type, calm, three answers in a row.
struct StretchCard: View {
  var suggestion: StretchSuggestion
  var store: OlaStore
  @State private var consent = false

  var provider: String? { store.hosted.provider }
  var isOn: Bool { suggestion.target == .claude ? store.claudeOn : store.hostedOn }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s) {
      Text(suggestion.reason == .asked ? suggestion.question : FallbackWords.question(suggestion.target, provider: provider))
        .font(OlaFont.sans(Metrics.ui + 1, .semibold)).foregroundStyle(Ola.ink)
      Text(suggestion.whyLine + " " + FallbackWords.leaves(suggestion.target, provider: provider))
        .font(OlaFont.sans(Metrics.ui)).foregroundStyle(Ola.ink2).fixedSize(horizontal: false, vertical: true)
      HStack(spacing: Space.s) {
        Button("Just this once") { Task { await store.answerSuggestion(.once) } }.buttonStyle(OlaButton(kind: .primary))
        Button("Always in this folder") { if isOn { Task { await store.answerSuggestion(.always) } } else { consent = true } }.buttonStyle(OlaButton(kind: .ghost))
        Button("Not now") { Task { await store.answerSuggestion(.notNow) } }.buttonStyle(OlaButton(kind: .ghost))
        Spacer()
        if let o = suggestion.other {
          Button(o == .claude ? "or Claude" : "or the hosted open model") { store.switchSuggestion() }.buttonStyle(LinkButton(color: Ola.blue))
        }
      }
    }
    .padding(Space.l)
    .background(RoundedRectangle(cornerRadius: 8).fill(Ola.field))
    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Ola.ruleStrong, lineWidth: 1))
    .alert(suggestion.target == .claude ? "Turn on Fallback to Claude?" : "Turn on Fallback to the hosted open model?", isPresented: $consent) {
      Button("Turn On") { Task { await store.answerSuggestion(.always) } }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text(suggestion.target == .claude ? FallbackWords.claudeConsent : FallbackWords.hostedConsent(provider))
    }
  }
}
