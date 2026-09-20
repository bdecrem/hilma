import SwiftUI

// One conversation, two inputs (Direction 2b). Every screen that carries the
// pair — the Infinity home, a chat's page, a film/podcast topic, a lesson —
// runs the same flow: talk or type, hand the conversation from one to the
// other mid-way, clean it up, quiz it. This is that flow, so the screens only
// say what the chat is about.

/// What is on screen over the host.
enum ChatFlowStep: Identifiable {
    case voice(continuing: InfinityChat?)
    case text(TextChatContext)
    case cleanup(InfinityChat)
    case quiz(InfinityQuizSheet)

    var id: String {
        switch self {
        case .voice(let c): return "voice-\(c?.id ?? "new")"
        case .text(let c): return "text-\(c.id)"
        case .cleanup(let c): return "cleanup-\(c.id)"
        case .quiz(let q): return "quiz-\(q.id)"
        }
    }
}

@Observable
final class ChatFlow {
    var step: ChatFlowStep? = nil
    /// The chat whose clean-up / quiz is being prepared (spinners).
    var preparingCleanupId: String? = nil
    var preparingQuizId: String? = nil
    var errorText: String? = nil
    /// Bumped whenever chats may have changed; hosts reload on it.
    var changes = 0

    var threadId: String = ""
    var title: String = ""
    /// The voice session's mode title (the radio's tape).
    var voiceTitle: String? = nil
    /// Builds the text chat's context for this host (source pill, "about …").
    var textContext: (InfinityChat?) -> TextChatContext = { _ in TextChatContext(threadId: nil, title: "Polly") }
    /// Extra work when a voice session ends (a lesson's Talk step reloads).
    var onVoiceFinished: () -> Void = {}

    func talk(continuing chat: InfinityChat? = nil) { NSLog("POLLY_FLOW talk %@", chat?.id ?? "new"); step = .voice(continuing: chat) }
    func type(continuing chat: InfinityChat? = nil) { NSLog("POLLY_FLOW type %@", chat?.id ?? "new"); step = .text(textContext(chat)) }

    /// Swap one full-screen cover for another: SwiftUI wants the first gone.
    private func go(_ next: ChatFlowStep?) {
        step = nil
        guard let next else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(550))
            self.step = next
        }
    }

    func cleanUp(_ chat: InfinityChat) {
        guard preparingCleanupId == nil else { return }
        preparingCleanupId = chat.id
        Task { @MainActor in
            defer { preparingCleanupId = nil }
            do {
                let ready = try await PollyAPI.shared.cleanUpInfinityChat(id: chat.id)
                changes += 1
                if ready.analysis?.walkFixes.isEmpty == false {
                    go(.cleanup(ready))
                } else {
                    // Nothing worth fixing — mark it done.
                    _ = try? await PollyAPI.shared.completeInfinityCleanup(id: chat.id, cleanupSessionId: nil)
                    changes += 1
                    errorText = "That one was already pretty clean — nice. Nothing to fix."
                }
            } catch {
                errorText = "Couldn't clean that up: \(error.localizedDescription)"
            }
        }
    }

    /// The walk again, for a chat that has been cleaned up already.
    func review(_ chat: InfinityChat) { step = .cleanup(chat) }

    func quiz(_ chat: InfinityChat) {
        guard preparingQuizId == nil else { return }
        preparingQuizId = chat.id
        Task { @MainActor in
            defer { preparingQuizId = nil }
            do {
                let start = try await PollyAPI.shared.infinityQuiz(chatId: chat.id)
                step = .quiz(InfinityQuizSheet(chat: chat, start: start))
            } catch {
                errorText = "Couldn't build the quiz: \(error.localizedDescription)"
            }
        }
    }

    // MARK: endings

    /// The radio hung up. A continued chat already has its new turns (the
    /// finish call appended them); a fresh one becomes a chat now.
    @MainActor
    fileprivate func voiceEnded(sessionId: String?, continuing: InfinityChat?, toKeyboard: Bool) async {
        var chat = continuing
        if continuing == nil, let sessionId {
            chat = try? await PollyAPI.shared.createInfinityChat(threadId: threadId, voiceSessionId: sessionId)
        }
        changes += 1
        onVoiceFinished()
        if toKeyboard {
            go(.text(textContext(chat)))
        } else {
            step = nil
        }
    }

    @MainActor
    fileprivate func textEnded(_ outcome: TextChatOutcome) {
        changes += 1
        switch outcome {
        case .left:
            step = nil
        case .cleanUp(let chat):
            step = nil
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(550))
                cleanUp(chat)
            }
        case .voice(let chat):
            go(.voice(continuing: chat))
        }
    }
}

extension View {
    /// Attach the conversation flow's covers to a host screen.
    func chatFlow(_ flow: ChatFlow, session: Session) -> some View {
        modifier(ChatFlowModifier(flow: flow, session: session))
    }
}

private struct ChatFlowModifier: ViewModifier {
    @Bindable var flow: ChatFlow
    let session: Session

    func body(content: Content) -> some View {
        content
            .fullScreenCover(item: $flow.step) { step in
                switch step {
                case .voice(let continuing):
                    VoiceSessionView(
                        mode: "topic", threadId: flow.threadId, title: flow.voiceTitle ?? flow.title,
                        subject: continuing?.displayTitle, continueChatId: continuing?.id,
                        onKeyboard: { id in Task { await flow.voiceEnded(sessionId: id, continuing: continuing, toKeyboard: true) } },
                        onFinished: { id in Task { await flow.voiceEnded(sessionId: id, continuing: continuing, toKeyboard: false) } })
                    .environment(session)
                case .text(let context):
                    TextChatView(context: context) { outcome in flow.textEnded(outcome) }
                        .environment(session)
                case .cleanup(let chat):
                    InfinityCleanupView(chat: chat) {
                        flow.step = nil
                        flow.changes += 1
                    }
                    .environment(session)
                case .quiz(let q):
                    FlashSetView(start: q.start, topicLabel: q.chat.displayTitle) { result in
                        // A pass masters the conversation (the flash-quality bar).
                        if result.total > 0 && result.score * 5 >= result.total * 4 {
                            Task {
                                _ = try? await PollyAPI.shared.masterInfinityChat(chatId: q.chat.id)
                                flow.changes += 1
                            }
                        }
                    }
                    .environment(session)
                }
            }
            .alert("Hmm", isPresented: Binding(get: { flow.errorText != nil }, set: { if !$0 { flow.errorText = nil } })) {
                Button("OK") { flow.errorText = nil }
            } message: { Text(flow.errorText ?? "") }
    }
}

// MARK: - The journey rail

/// A topic's conversations as a journey, newest first: a node and a line down
/// the left (the path list's drawing), one status line per chat, and an action
/// only on the chat that needs one.
struct ChatRail: View {
    let chats: [InfinityChat]
    @Bindable var flow: ChatFlow
    let onOpen: (InfinityChat) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(chats.enumerated()), id: \.element.id) { i, chat in
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        node(chat)
                        if i < chats.count - 1 {
                            Rectangle().fill(PollyTheme.border).frame(width: 2).frame(maxHeight: .infinity)
                        }
                    }
                    .frame(width: 26)
                    card(chat).padding(.bottom, 12)
                }
            }
        }
    }

    private func node(_ chat: InfinityChat) -> some View {
        let needs = chat.isOpen || chat.wantsCleanup
        let fill: Color = chat.isMastered ? PollyTheme.gold : needs ? PollyTheme.accent : chat.isCleanedUp ? PollyTheme.sprout : PollyTheme.surface2
        return ZStack {
            Circle().fill(fill).frame(width: 26, height: 26)
            Image(systemName: needs ? "sparkles" : "checkmark")
                .font(.system(size: 11, weight: .heavy))
                .foregroundStyle(chat.isMastered || needs || chat.isCleanedUp ? PollyTheme.inkOnAccent : PollyTheme.text3)
        }
        .padding(.top, 14)
    }

    private func card(_ chat: InfinityChat) -> some View {
        let needs = chat.isOpen || chat.wantsCleanup
        return VStack(alignment: .leading, spacing: 10) {
            Button { onOpen(chat) } label: {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(chat.displayTitle)
                            .font(.custom("Fredoka", size: 17).weight(.semibold))
                            .foregroundStyle(PollyTheme.text).lineLimit(1)
                        statusLine(chat)
                    }
                    Spacer(minLength: 4)
                    if chat.isMastered {
                        Image(systemName: "star.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(PollyTheme.gold)
                            .padding(6).background(PollyTheme.gold.opacity(0.16), in: Circle())
                    } else {
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(PollyTheme.text4)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // One action, only where one is needed.
            if chat.isOpen {
                actionButton(L("Pick it back up", "Riprendila", "Reprends-la", "이어서 하기"), symbol: "keyboard", busy: false) { flow.type(continuing: chat) }
            } else if chat.wantsCleanup {
                actionButton(flow.preparingCleanupId == chat.id
                             ? L("Polly's reading it back…", "Polly la rilegge…", "Polly la relit…", "Polly가 다시 읽는 중…")
                             : L("Clean it up · 2 min", "Sistemala · 2 min", "Ranger · 2 min", "정리하기 · 2분"),
                             symbol: "sparkles", busy: flow.preparingCleanupId == chat.id) { flow.cleanUp(chat) }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(PollyTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(needs ? PollyTheme.accentDim : PollyTheme.border, lineWidth: 1))
    }

    private func actionButton(_ title: String, symbol: String, busy: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 7) {
                if busy { ProgressView().tint(PollyTheme.inkOnAccent).scaleEffect(0.75) }
                else { Image(systemName: symbol).font(.system(size: 13, weight: .bold)) }
                Text(title).font(.system(size: 14.5, weight: .semibold))
            }
            .foregroundStyle(PollyTheme.inkOnAccent)
            .frame(maxWidth: .infinity).padding(.vertical, 11)
            .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(flow.preparingCleanupId != nil)
    }

    /// "Today · 🎤 6 min · ready to clean up"
    private func statusLine(_ chat: InfinityChat) -> some View {
        let state: String
        let tint: Color
        if chat.isOpen { state = L("still open", "ancora aperta", "encore ouverte", "진행 중"); tint = PollyTheme.accent }
        else if chat.wantsCleanup { state = L("ready to clean up", "da sistemare", "à ranger", "정리 전"); tint = PollyTheme.accent }
        else if chat.isMastered { state = L("Mastered", "Padroneggiata", "Maîtrisée", "마스터"); tint = PollyTheme.gold }
        else if chat.isCleanedUp { state = L("Cleaned up · quiz to master", "Sistemata · quiz per padroneggiarla", "Rangée · quiz pour la maîtriser", "정리됨 · 퀴즈로 마스터"); tint = PollyTheme.sprout }
        else { state = L("Walk it through", "Da ripassare", "À parcourir", "살펴보기"); tint = PollyTheme.accent }
        return HStack(spacing: 5) {
            Text(chatDay(chat.createdAt))
            Text("·")
            Image(systemName: chat.inputSymbol).font(.system(size: 10, weight: .semibold))
            if chat.isMixed { Image(systemName: "keyboard").font(.system(size: 10, weight: .semibold)) }
            if chat.isTyped { Text(L("typed", "scritta", "écrite", "입력")) }
            else if let m = chat.minutes { Text("\(m) min") }
            Text("·")
            Text(state).lineLimit(1)
        }
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(tint)
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }
}

/// "Today", "Yesterday", "Sep 17".
func chatDay(_ date: Date) -> String {
    let cal = Calendar.current
    if cal.isDateInToday(date) { return L("Today", "Oggi", "Aujourd’hui", "오늘") }
    if cal.isDateInYesterday(date) { return L("Yesterday", "Ieri", "Hier", "어제") }
    return date.formatted(.dateTime.month(.abbreviated).day())
}
