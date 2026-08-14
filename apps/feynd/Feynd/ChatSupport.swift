import SwiftUI


/// The conversation scroll itself — auto-scrolls to bottom, shows typing dots
/// while a reply is in flight.
///
/// Keyboard dismissal:
///  - `.scrollDismissesKeyboard(.interactively)` peels the keyboard with the
///    finger as the user drags down on the conversation (Messages/WhatsApp idiom).
///  - The empty-area tap gesture is the fallback for short chats where there's
///    nothing to scroll — taps on bubble area resign first responder.
struct ChatScrollView<Header: View>: View {
    let messages: [F2Message]
    let busy: Bool
    /// Bump to jump the transcript back to its top (oldest message).
    var scrollToTop: Int = 0
    /// Optional content rendered above the oldest message — the Chat tab
    /// puts its big scrolling screen title here.
    @ViewBuilder var header: () -> Header
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
                    header()
                        .id("chat-top")
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
                            AIBubble { Text(linkified(msg.text)) }.id(msg.id)
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
            .onChange(of: scrollToTop) { _, _ in
                withAnimation(.easeOut(duration: 0.3)) {
                    proxy.scrollTo("chat-top", anchor: .top)
                }
            }
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
            DodoMiniMark(size: 26)
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

extension ChatScrollView where Header == EmptyView {
    /// Headerless variant — Topic detail uses the plain transcript.
    init(messages: [F2Message], busy: Bool) {
        self.init(messages: messages, busy: busy) { EmptyView() }
    }
}
