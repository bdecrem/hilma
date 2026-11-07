import SwiftUI

/// What the Ask button does and whether it is lit, from the environment: every screen's header,
/// the game's HUD and the lesson's bar draw the same button without knowing the app.
struct Ask {
    var lit = false
    var open: () -> Void = {}
}

private struct AskKey: EnvironmentKey {
    static let defaultValue = Ask()
}

extension EnvironmentValues {
    var ask: Ask {
        get { self[AskKey.self] }
        set { self[AskKey.self] = newValue }
    }
}

/// The way to the teacher from every screen (0.1 (113)): a small square button beside the gear,
/// the knob or the play button. The glyph lights while an answer is on its way, and stays lit
/// until the answer has been seen.
struct AskButton: View {
    var size: CGFloat = 36
    @Environment(\.ask) private var ask

    var body: some View {
        TransportButton(symbol: "questionmark.bubble", lit: ask.lit, size: size, label: "Ask the teacher", action: ask.open)
    }
}

/// The chat with the teacher, over whatever is up: where you are in one line, the thread, the
/// answer as it streams, a composer. An empty thread offers four things to ask, fitted to the
/// screen it was opened from.
struct AskSheet: View {
    let app: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var input = ""
    @State private var confirmClear = false
    @FocusState private var focused: Bool

    private var compact: Bool { sizeClass == .compact }
    private var chat: ChatStore { app.chat }

    var body: some View {
        VStack(spacing: 0) {
            header
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.top, compact ? 18 : 22)
                .padding(.bottom, 14)
            Hairline()
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if chat.messages.isEmpty && !chat.working {
                            intro
                        }
                        ForEach(chat.messages) { m in
                            MessageRow(message: .init(role: m.role == "user" ? "user" : "agent", text: m.text, at: m.at, steps: nil), compact: compact, who: "Teacher")
                        }
                        if chat.working {
                            answering
                        }
                        if let error = chat.error {
                            failed(error)
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.horizontal, compact ? 16 : 24)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollBounceBehavior(.basedOnSize)
                .onAppear { proxy.scrollTo("end", anchor: .bottom) }
                .onChange(of: chat.draft.count) { proxy.scrollTo("end", anchor: .bottom) }
                .onChange(of: chat.messages.count) { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
                .onChange(of: chat.working) { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
            }
            Hairline()
            composer
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.vertical, 14)
        }
        .frame(minWidth: compact ? 0 : 620, minHeight: compact ? 0 : 620)
        .background(Palette.ground.ignoresSafeArea())
        .onAppear(perform: appeared)
        .onChange(of: chat.messages.count) { chat.unread = false }
        .confirmationDialog("Start a new thread?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Clear the thread", role: .destructive) { chat.clear() }
        } message: {
            Text("The teacher still remembers your last two sessions.")
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Ask")
                    .font(.display(compact ? 30 : 40))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.signal)
                Text("The teacher · \(app.chatWhere())")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(compact ? 2 : 1)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            if !chat.messages.isEmpty && !chat.working {
                Button { confirmClear = true } label: {
                    Text("Clear")
                        .dataLabel(11, weight: .semibold)
                        .foregroundStyle(Palette.muted)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear the thread")
            }
            QuietButton(title: "Done") { dismiss() }
        }
    }

    /// Four things to ask, for the screen the sheet opened over.
    private var suggestions: [String] {
        switch app.route {
        case .game:
            return ["What key is this in, and which notes does the line lean on?",
                    "How should I finger the part I keep missing?",
                    "Say the chord progression in numerals.",
                    "Why did I get that grade?"]
        case .lesson, .result:
            if app.player?.currentStep.kind == .free {
                return ["What key is this in, and which notes can I lean on?",
                        "What do I play when the chords change to the iv and the V?",
                        "Give me one simple idea to start a phrase with.",
                        "What did you say about the last take I sent?"]
            }
            return ["Why does the thumb go under here?",
                    "How do I get this even at tempo?",
                    "What is this step for?",
                    "What should I practice next?"]
        default:
            return ["What should I practice today?",
                    "How did my last session go?",
                    "What's the difference between the levels on the Stage?",
                    "Explain the 12-bar blues in a few lines."]
        }
    }

    /// An empty thread: what this is, and four things to ask.
    private var intro: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Ask about what you're playing: the key, the chords, what to lean on, a fingering, how the app works. The teacher knows where you are, and what you did in your last two sessions.")
                .bodyText(compact ? 14 : 15)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            Text("Try one")
                .dataLabel(10)
                .foregroundStyle(Palette.muted)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], alignment: .leading, spacing: 10) {
                ForEach(suggestions, id: \.self) { s in
                    Button { send(s) } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Rectangle().fill(Palette.signal).frame(width: 3)
                            Text(s)
                                .bodyText(13)
                                .foregroundStyle(Palette.text)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                        .padding(.trailing, 12)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// The answer on its way: the step until the first words, then the words as they come.
    private var answering: some View {
        HStack {
            VStack(alignment: .leading, spacing: 5) {
                Text("Teacher")
                    .dataLabel(9, weight: .semibold)
                    .foregroundStyle(Palette.signal)
                if chat.draft.isEmpty {
                    HStack(spacing: 10) {
                        PulseDot()
                        Text(chat.status.isEmpty ? "Thinking it over" : chat.status)
                            .bodyText(compact ? 14 : 15)
                            .foregroundStyle(Palette.muted)
                    }
                } else {
                    Text(chat.draft)
                        .bodyText(compact ? 14 : 15)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: compact ? 24 : 80)
        }
    }

    private func failed(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(error)
                .bodyText(14)
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let again = chat.failed {
                QuietButton(title: "Try again") { app.ask(again) }
            }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(chat.working ? "The teacher is answering…" : (chat.messages.isEmpty ? "Ask about what you're playing" : "Anything else?"), text: $input, axis: .vertical)
                .lineLimit(1...4)
                .bodyText(15)
                .foregroundStyle(Palette.text)
                .textInputAutocapitalization(.sentences)
                .focused($focused)
                .disabled(chat.working)
                .onSubmit { send(input) }
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(focused ? Palette.signal : Palette.line, lineWidth: 1))
            Button { send(input) } label: {
                Text("Send")
                    .dataLabel(13, weight: .semibold)
                    .foregroundStyle(canSend ? Palette.blackKey : Palette.muted)
                    .padding(.horizontal, 20)
                    .frame(height: 44)
                    .background(RoundedRectangle(cornerRadius: 6).fill(canSend ? Palette.signal : Palette.panel))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(canSend ? Palette.signal : Palette.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .keyboardShortcut(.return, modifiers: [.command])
        }
    }

    private var canSend: Bool { !chat.working && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    // MARK: Work

    private func appeared() {
        chat.unread = false
        #if DEBUG
        // `-AskSay "<text>"` sends it the moment the sheet is up.
        if let say = UserDefaults.standard.string(forKey: "AskSay"), !say.isEmpty {
            UserDefaults.standard.removeObject(forKey: "AskSay")
            send(say)
        }
        #endif
    }

    private func send(_ text: String) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !chat.working else { return }
        input = ""
        app.ask(message)
    }
}

/// A dot that breathes in `signal`: something is on its way.
struct PulseDot: View {
    @State private var pulse = false

    var body: some View {
        Circle()
            .fill(Palette.signal)
            .frame(width: 10, height: 10)
            .scaleEffect(pulse ? 1 : 0.6)
            .opacity(pulse ? 1 : 0.4)
            .animation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true), value: pulse)
            .onAppear { pulse = true }
    }
}
