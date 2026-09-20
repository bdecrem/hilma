import SwiftUI

/// The GLOBAL chat — one conversation across ALL of the user's topics, typed
/// or spoken. Opened from the Topics screen by holding the + button
/// (TopicsView.fabMenu). Full screen, like a call: you step out of the
/// library to talk about the whole of it.
///
/// Server: /api/f2/global-chat (src/lib/f2/global-chat.ts). Dodo carries a
/// digest of every topic and searches the user's own material on each turn;
/// the chips under an answer are the topics it drew on. The mic hands the
/// SAME conversation to the radio — a global voice session's turns are
/// appended to this thread when the call ends.
struct GlobalChatView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session

    @State private var messages: [F2API.GlobalMessage] = []
    @State private var index: F2API.GlobalIndexStatus?
    @State private var draft = ""
    @State private var busy = false
    @State private var loaded = false
    @State private var errorText: String?
    @State private var voicePresented = false
    @State private var confirmNew = false
    @State private var measuredWidth: CGFloat = 390
    @State private var indexing = false

    #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
    private static var autoAsked = false
    #endif

    private static let suggestions = [
        "What connects my topics?",
        "What should I review next?",
        "Quiz me across everything",
    ]

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                GeometryReader { geo in
                    thread
                        .environment(\.chatRowWidth, measuredWidth)
                        .onAppear { measuredWidth = geo.size.width }
                        .onChange(of: geo.size.width) { _, w in measuredWidth = w }
                }
                if let errorText {
                    Text(errorText)
                        .font(.system(size: 12.5))
                        .foregroundStyle(FeyndTheme.blush)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 6)
                }
                FeyndComposer(draft: $draft, busy: busy, placeholder: "Ask across all your topics…") {
                    send(draft)
                }
                .padding(.bottom, 8)
            }
            .feyndContentColumn()
        }
        .task { await load() }
        .sheet(isPresented: $voicePresented, onDismiss: { Task { await load() } }) {
            // The same conversation, out loud. Its turns join this thread
            // when the call ends — hence the reload on dismiss.
            VoiceSessionView(mode: "global", title: "All topics")
        }
        .confirmationDialog("Start a new conversation?", isPresented: $confirmNew, titleVisibility: .visible) {
            Button("New conversation", role: .destructive) { startOver() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This clears the global chat. Your topics are not touched.")
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            IconCircleButton(systemImage: "xmark", cancelShortcut: true) { dismiss() }
                .accessibilityLabel("Close")
            Menu {
                Button(role: .destructive) { confirmNew = true } label: {
                    Label("New conversation", systemImage: "square.and.pencil")
                }
                .disabled(messages.isEmpty)
            } label: {
                VStack(spacing: 3) {
                    HStack(spacing: 5) {
                        Text("All topics")
                            .font(.system(size: 17, weight: .semibold)).tracking(-0.3)
                            .foregroundStyle(FeyndTheme.text)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9.5, weight: .bold))
                            .foregroundStyle(FeyndTheme.text3)
                    }
                    Text(subtitle)
                        .font(.system(size: 12)).tracking(-0.1)
                        .foregroundStyle(FeyndTheme.text2)
                        .contentTransition(.opacity)
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            IconCircleButton(systemImage: "mic.fill", fg: FeyndTheme.accent) {
                dismissKeyboard()
                voicePresented = true
            }
            .accessibilityLabel("Talk across all topics")
            .disabled(busy)
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 10)
    }

    private var subtitle: String {
        guard let index else { return "Dodo is opening your library…" }
        if index.topics == 0 { return "Nothing saved yet" }
        if index.pending > 0 {
            return "Reading \(index.pending) new topic\(index.pending == 1 ? "" : "s")…"
        }
        return "Dodo knows your \(index.topics) topic\(index.topics == 1 ? "" : "s")"
    }

    // MARK: Thread

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    if messages.isEmpty && loaded && !busy {
                        emptyState
                    }
                    ForEach(messages) { msg in
                        row(msg).id(msg.id)
                    }
                    if busy {
                        HStack { TypingDots(); Spacer() }
                            .padding(.horizontal, 16).padding(.vertical, 4)
                            .id("typing")
                    }
                }
                .padding(.vertical, 8)
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

    @ViewBuilder
    private func row(_ msg: F2API.GlobalMessage) -> some View {
        if msg.role == "user" {
            UserBubble(text: msg.text)
                .overlay(alignment: .bottomTrailing) { spokenMark(msg, leading: false) }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                AIBubble { Text(linkified(msg.text)) }
                    .overlay(alignment: .bottomLeading) { spokenMark(msg, leading: true) }
                if let sources = msg.sources, !sources.isEmpty {
                    sourceChips(sources)
                }
            }
        }
    }

    /// A faint waveform beside a turn that was spoken, so a mixed thread reads
    /// honestly without labels.
    @ViewBuilder
    private func spokenMark(_ msg: F2API.GlobalMessage, leading: Bool) -> some View {
        if msg.via == "voice" {
            Image(systemName: "waveform")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(FeyndTheme.text4)
                .padding(leading ? .leading : .trailing, leading ? 52 : 6)
                .offset(y: 7)
                .accessibilityLabel("Spoken")
        }
    }

    /// The topics an answer drew on. A tap closes the chat and opens the topic.
    private func sourceChips(_ sources: [F2API.GlobalSource]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(sources) { source in
                    Button { open(source) } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 9.5, weight: .bold))
                                .foregroundStyle(FeyndTheme.accent)
                            Text(source.topic)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(FeyndTheme.text2)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(FeyndTheme.surface2, in: Capsule())
                        .overlay(Capsule().stroke(FeyndTheme.borderSoft, lineWidth: 1))
                        .frame(maxWidth: 230)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open topic \(source.topic)")
                }
            }
            // Line up with the bubble's text, past Dodo's mini mark.
            .padding(.leading, 50).padding(.trailing, 16)
        }
        .padding(.top, 2).padding(.bottom, 6)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            DodoMiniMark(size: 54)
                .padding(.top, 56)
            Text("Ask across everything")
                .font(.custom("Fredoka", size: 26).weight(.semibold))
                .foregroundStyle(FeyndTheme.text)
            Text(emptyBlurb)
                .font(.system(size: 14.5))
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.horizontal, 36)
            VStack(spacing: 8) {
                ForEach(Self.suggestions, id: \.self) { s in
                    Button { send(s) } label: {
                        Text(s)
                            .font(.system(size: 14.5, weight: .medium))
                            .foregroundStyle(FeyndTheme.text)
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .frame(maxWidth: 280)
                            .background(FeyndTheme.surface, in: Capsule())
                            .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 8)
            .disabled((index?.topics ?? 0) == 0)
            .opacity((index?.topics ?? 0) == 0 ? 0.45 : 1)
        }
        .frame(maxWidth: .infinity)
    }

    private var emptyBlurb: String {
        guard let index, index.topics > 0 else {
            return "Save a topic first — then this is where you talk about all of them at once."
        }
        return "Dodo has read all \(index.topics) of your topics. Ask what connects them, what to go back to, or for any detail — typed here, or out loud with the mic."
    }

    // MARK: Actions

    private func load() async {
        do {
            let state = try await F2API.shared.globalChat()
            messages = state.messages
            index = state.index
            loaded = true
            errorText = nil
            await catchUpIndex()
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            // `-GlobalAsk "question"` — send one message headlessly (once:
            // launch arguments outlive removeObject).
            if !Self.autoAsked, let q = UserDefaults.standard.string(forKey: "GlobalAsk") {
                Self.autoAsked = true
                send(q)
            }
            #endif
        } catch {
            loaded = true
            errorText = "Couldn't open the chat. \(error.localizedDescription)"
        }
    }

    /// Topics added or changed since Dodo last read them: read them now, in
    /// passes, while the subtitle says so. Chatting is allowed meanwhile.
    private func catchUpIndex() async {
        guard !indexing, let pending = index?.pending, pending > 0 else { return }
        indexing = true
        defer { indexing = false }
        for _ in 0..<12 {
            guard let latest = try? await F2API.shared.indexGlobalChat() else { return }
            withAnimation { index = latest }
            if latest.pending == 0 { return }
        }
    }

    private func send(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        errorText = nil
        busy = true
        let optimistic = F2API.GlobalMessage(role: "user", text: text, createdAt: Date(), via: nil, sources: nil)
        messages.append(optimistic)
        Task {
            do {
                let reply = try await F2API.shared.sendGlobalChat(text: text)
                messages = reply.messages
            } catch {
                messages.removeAll { $0.id == optimistic.id }
                draft = text
                errorText = "That didn't go through. \(error.localizedDescription)"
            }
            busy = false
        }
    }

    private func startOver() {
        Task {
            do {
                try await F2API.shared.clearGlobalChat()
                withAnimation { messages = [] }
            } catch {
                errorText = "Couldn't start over. \(error.localizedDescription)"
            }
        }
    }

    private func open(_ source: F2API.GlobalSource) {
        dismiss()
        Task {
            // Let the cover finish closing before the push.
            try? await Task.sleep(for: .milliseconds(450))
            DeepLinkRouter.shared.requestTopicChat(threadId: source.threadId, draft: "")
        }
    }
}
