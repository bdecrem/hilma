import SwiftUI

/// Chat root — matches `ChatScreen` in feynd-screens.jsx.
/// Custom top bar with F2 tutor center label, custom bubbles, action chips
/// above a flat composer. No iOS material seams.
struct ChatView: View {
    @Environment(Session.self) private var session
    @State private var messages: [F2Message] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var showSettings = false
    @State private var voicePresented = false

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                FeyndTopBar {
                    Text("Chat")
                        .font(.system(size: 16, weight: .semibold))
                        .tracking(-0.2)
                        .foregroundStyle(FeyndTheme.text)
                } trailing: {
                    // Empty by design — paste a URL in the composer to start a
                    // new topic; no need for a dedicated button.
                    EmptyView()
                } onProfileTap: {
                    showSettings = true
                }

                // No content column clamp here — chat reads better when bubbles
                // can grow with the window on Catalyst. Bubble maxWidth handles
                // line-length readability.
                ChatScrollView(messages: messages, busy: busy)

                HStack(spacing: 8) {
                    ActionChip(label: "Quiz me", systemImage: "questionmark.circle") {
                        sendNudge("Quiz me.")
                    }
                    ActionChip(label: "Talk to F2", systemImage: "mic.fill") {
                        voicePresented = true
                    }
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)

                FeyndComposer(draft: $draft, busy: busy, onSend: send)

                // Space for the floating TabPill.
                Color.clear.frame(height: 86)
            }
        }
        // Mac Catalyst sheets present in a separate scene that doesn't always
        // inherit @Observable environment values from the parent — explicitly
        // forward `session` so ProfileSheet's @Environment(Session.self)
        // lookup doesn't crash with "No Observable object of type Session".
        .sheet(isPresented: $showSettings) { ProfileSheet().environment(session) }
        .sheet(isPresented: $voicePresented) { VoiceSessionView(mode: "global") }
        .task { await loadLatest() }
    }

    // MARK: - Actions

    private func loadLatest() async {
        do {
            let thread = try await F2API.shared.latestThread()
            messages = thread?.messages ?? []
        } catch { /* keep empty */ }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        busy = true
        messages.append(F2Message(role: "user", text: text, createdAt: Date()))
        Task {
            do {
                let res = try await F2API.shared.sendMessage(text: text)
                if !res.reply.isEmpty {
                    messages.append(F2Message(role: "assistant", text: res.reply, createdAt: Date()))
                }
                // A reflection-quiz completion bumps the user's star count;
                // refresh progress so the header L<n> badge stays in sync.
                if let st = res.threadState, st.pendingQuizKind == nil {
                    await session.refreshProgress()
                }
            } catch {
                messages.append(F2Message(role: "assistant",
                                          text: "(error: \(error.localizedDescription))",
                                          createdAt: Date()))
            }
            busy = false
        }
    }

    private func sendNudge(_ text: String) {
        guard !busy else { return }
        busy = true
        messages.append(F2Message(role: "user", text: text, createdAt: Date()))
        Task {
            do {
                let res = try await F2API.shared.sendMessage(text: text)
                if !res.reply.isEmpty {
                    messages.append(F2Message(role: "assistant", text: res.reply, createdAt: Date()))
                }
            } catch { /* swallow */ }
            busy = false
        }
    }
}

/// The conversation scroll itself — auto-scrolls to bottom, shows typing dots
/// while a reply is in flight.
///
/// Keyboard dismissal:
///  - `.scrollDismissesKeyboard(.interactively)` peels the keyboard with the
///    finger as the user drags down on the conversation (Messages/WhatsApp idiom).
///  - The empty-area tap gesture is the fallback for short chats where there's
///    nothing to scroll — taps on bubble area resign first responder.
struct ChatScrollView: View {
    let messages: [F2Message]
    let busy: Bool
    @State private var measuredWidth: CGFloat = 390

    var body: some View {
        // Measure the conversation row width once (and on each resize), then
        // hand it to bubbles via the chatRowWidth environment so they cap at
        // 75% of whatever's available — responsive on Catalyst + iPad without
        // needing a per-bubble GeometryReader.
        GeometryReader { geo in
            scroll
                .environment(\.chatRowWidth, measuredWidth)
                .onAppear { measuredWidth = geo.size.width }
                .onChange(of: geo.size.width) { _, w in measuredWidth = w }
        }
    }

    private var scroll: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    if messages.isEmpty && !busy {
                        Text("Paste a URL to learn from, or ask me anything to begin.")
                            .font(.system(size: 14))
                            .foregroundStyle(FeyndTheme.text3)
                            .multilineTextAlignment(.center)
                            .padding(.top, 80)
                            .padding(.horizontal, 32)
                    }
                    ForEach(messages) { msg in
                        if msg.role == "user" {
                            UserBubble(text: msg.text).id(msg.id)
                        } else {
                            AIBubble { Text(msg.text) }.id(msg.id)
                        }
                    }
                    if busy {
                        HStack {
                            TypingDots()
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 4)
                        .id("typing")
                    }
                }
                .padding(.vertical, 8)
                // contentShape extends the tap target to the empty area between
                // bubbles, so a tap anywhere in the scroll content dismisses.
                .contentShape(Rectangle())
                .onTapGesture { dismissKeyboard() }
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: messages.count) { _, _ in
                if let last = messages.last {
                    withAnimation(.spring(duration: 0.25)) { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
            .onChange(of: busy) { _, b in
                if b { withAnimation { proxy.scrollTo("typing", anchor: .bottom) } }
            }
        }
    }
}

/// Resign first responder on the active text field. Used by both the
/// interactive-drag fallback and the tap-anywhere dismissal.
func dismissKeyboard() {
    UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder),
        to: nil, from: nil, for: nil
    )
}

struct TypingDots: View {
    @State private var phase = 0
    private let timer = Timer.publish(every: 0.3, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 8) {
            F2MiniMark(size: 26)
            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(FeyndTheme.text2)
                        .frame(width: 6, height: 6)
                        .opacity(phase == i ? 1.0 : 0.3)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(BubbleShape(isUser: false).fill(FeyndTheme.surface))
            .overlay(BubbleShape(isUser: false).stroke(FeyndTheme.border, lineWidth: 1))
        }
        .onReceive(timer) { _ in phase = (phase + 1) % 3 }
    }
}
