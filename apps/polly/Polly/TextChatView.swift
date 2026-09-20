import SwiftUI

// The text chat (Direction 2b) — one full-screen thread for every mode, reached
// from the "type instead" line under a voice button. No modes: the server
// reads each turn (src/lib/polly/talk.ts). The studied language is practice —
// Polly answers in it, with at most one fix folded under her reply; English is
// a question (answered) or an instruction (the agent does it and a card says
// what it made), after which Polly picks the conversation back up herself.
// On a topic the conversation is a chat like any spoken one: it lands in the
// journey with a ⌨ mark and gets the same clean-up, words, grammar and quiz.

/// What a text chat is about.
struct TextChatContext: Identifiable {
    let id = UUID()
    /// The topic it belongs to. Nil = "Ask Polly" from anywhere: nothing is stored.
    var threadId: String?
    var title: String
    /// Follows "typing ·" in the header ("about the episode"); nil shows the minutes.
    var about: String? = nil
    /// The source pill at the top of the thread (a film, an episode, a card).
    var pill: String? = nil
    var pillLetter: String? = nil
    /// Continue this chat (typed or spoken) instead of starting one.
    var chatId: String? = nil
    /// The Peck miss clinic: the chat is about this card, and is not stored.
    var cardId: String? = nil

    var isStored: Bool { threadId != nil && cardId == nil }
}

/// How a text chat ended, for the screen that opened it.
enum TextChatOutcome {
    /// ✕ — closed quietly. The chat (if anything was said) is in the journey.
    case left(InfinityChat?)
    /// "Finish & clean up" — go straight to the clean-up.
    case cleanUp(InfinityChat)
    /// The header's mic — carry this conversation on out loud.
    case voice(InfinityChat?)
}

struct TextChatView: View {
    let context: TextChatContext
    let onClose: (TextChatOutcome) -> Void

    @Environment(Session.self) private var session
    @State private var turns: [ChatTurn] = []
    @State private var chat: InfinityChat? = nil
    @State private var draft = ""
    @State private var busy = false
    @State private var closing = false
    @State private var started = false
    @State private var openedAt = Date()
    @State private var expandedFix: String? = nil
    @State private var practiceSet: FlashStart? = nil
    @State private var deckTarget: TalkCard? = nil
    @State private var preparingDeck = false
    @State private var measuredWidth: CGFloat = 390

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                GeometryReader { geo in
                    thread
                        .environment(\.chatRowWidth, measuredWidth)
                        .onAppear { measuredWidth = geo.size.width }
                        .onChange(of: geo.size.width) { _, w in measuredWidth = w }
                }
                PollyComposer(draft: $draft, busy: busy || closing, placeholder: placeholder, onSend: send)
                footer
            }
            .pollyContentColumn()
        }
        .task { await start() }
        .fullScreenCover(item: $practiceSet) { start in
            FlashSetView(start: start, topicLabel: deckTarget?.title).environment(session)
        }
        .sheet(item: $deckTarget) { card in
            FlashCardsView(topicId: card.threadId, topicLabel: card.title).environment(session)
        }
    }

    // MARK: header

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            IconCircleButton(systemImage: "xmark", fg: PollyTheme.text, cancelShortcut: true) { leave() }
                .accessibilityLabel("Close")
            VStack(spacing: 3) {
                Text(context.title)
                    .font(.system(size: 17, weight: .semibold)).tracking(-0.3)
                    .foregroundStyle(PollyTheme.text).lineLimit(1)
                TimelineView(.periodic(from: .now, by: 30)) { _ in
                    HStack(spacing: 5) {
                        Image(systemName: "keyboard").font(.system(size: 10.5, weight: .medium))
                        Text(subtitle).font(.system(size: 12)).tracking(-0.1)
                    }
                    .foregroundStyle(PollyTheme.text2)
                }
            }
            .frame(maxWidth: .infinity)
            if context.isStored {
                // The peer relationship goes both ways: hand this same
                // conversation to the radio.
                IconCircleButton(systemImage: "mic.fill", fg: PollyTheme.accent) { handOff() }
                    .accessibilityLabel("Carry on out loud")
                    .disabled(busy || closing)
            } else {
                Color.clear.frame(width: 36, height: 36)
            }
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 10)
    }

    private var subtitle: String {
        let typing = L("typing", "scrivi", "à l’écrit", "입력 중")
        if let about = context.about { return "\(typing) · \(about)" }
        let minutes = max(1, Int(Date().timeIntervalSince(openedAt) / 60) + (chat?.minutes ?? 0))
        return turns.contains(where: { $0.role == "user" }) ? "\(typing) · \(minutes) min" : typing
    }

    // MARK: the thread

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    if let pill = context.pill {
                        HStack(spacing: 7) {
                            if let letter = context.pillLetter {
                                Text(letter).font(.system(size: 10.5, weight: .bold)).foregroundStyle(.white)
                                    .frame(width: 18, height: 18)
                                    .background(Color(hex: 0x1F1814), in: RoundedRectangle(cornerRadius: 5))
                            }
                            Text(pill).font(.system(size: 12, weight: .medium)).foregroundStyle(PollyTheme.text2).lineLimit(1)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(PollyTheme.surface2.opacity(0.7), in: Capsule())
                        .padding(.top, 4).padding(.bottom, 8)
                    }
                    if turns.isEmpty && !busy && context.threadId == nil {
                        Text(L("Ask me anything about the language — or tell me what to make: “20 cards about food”, “what are my weak spots?”",
                               "Chiedimi qualsiasi cosa sulla lingua — o dimmi che cosa preparare: «20 carte sul cibo», «quali sono i miei punti deboli?»",
                               "Demande-moi n’importe quoi sur la langue — ou dis-moi quoi préparer : « 20 cartes sur la nourriture », « quels sont mes points faibles ? »",
                               "언어에 대해 무엇이든 물어보세요 — 아니면 만들 것을 말해 주세요: “음식 카드 20장”, “내 약점은?”"))
                            .font(.system(size: 14)).foregroundStyle(PollyTheme.text3)
                            .multilineTextAlignment(.center)
                            .padding(.top, 80).padding(.horizontal, 32)
                    }
                    ForEach(turns) { turn in
                        row(turn).id(turn.id)
                    }
                    if busy {
                        HStack { TypingDots(); Spacer() }
                            .padding(.horizontal, 16).padding(.vertical, 4).id("typing")
                    }
                    Color.clear.frame(height: 6).id("end")
                }
                .padding(.vertical, 8)
                .contentShape(Rectangle())
                .onTapGesture { dismissKeyboard() }
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: turns.count) { _, _ in
                withAnimation(.spring(duration: 0.25)) { proxy.scrollTo("end", anchor: .bottom) }
            }
            .onChange(of: busy) { _, b in
                if b { withAnimation { proxy.scrollTo("typing", anchor: .bottom) } }
            }
        }
    }

    @ViewBuilder
    private func row(_ turn: ChatTurn) -> some View {
        if turn.role == "user" {
            UserBubble(text: turn.text)
        } else {
            AIBubble {
                VStack(alignment: .leading, spacing: 7) {
                    Text(linkified(turn.text))
                    if let fix = turn.fix { fixNote(fix, id: turn.id) }
                }
            }
            if let card = turn.card { deckCard(card) }
        }
    }

    /// The folded fix: a whisper under Polly's reply. Tap for what you wrote.
    private func fixNote(_ fix: TalkFix, id: String) -> some View {
        Button {
            withAnimation(.easeOut(duration: 0.15)) { expandedFix = expandedFix == id ? nil : id }
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                if expandedFix == id {
                    Text("“\(fix.said)”").strikethrough().font(.system(size: 12.5)).foregroundStyle(PollyTheme.text3)
                }
                (Text(Image(systemName: "pencil")).font(.system(size: 10.5, weight: .semibold)) + Text(" ")
                 + Text(fix.better).fontWeight(.semibold).foregroundColor(PollyTheme.accent)
                 + Text(fix.why.isEmpty ? "" : " — \(fix.why)"))
                    .font(.system(size: 12.5))
                    .foregroundStyle(PollyTheme.text2)
                    .multilineTextAlignment(.leading)
            }
            .padding(.top, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) { Rectangle().fill(PollyTheme.border).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// What the agent made, as a card under its one-line report.
    private func deckCard(_ card: TalkCard) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(card.title) · \(card.count) \(card.count == 1 ? "card" : "cards")")
                        .font(.system(size: 14.5, weight: .semibold)).foregroundStyle(PollyTheme.text).lineLimit(1)
                    Text(L("gap · choice · say it", "spazi · scelta · dillo", "trous · choix · dis-le", "빈칸 · 선택 · 말하기"))
                        .font(.system(size: 12)).foregroundStyle(PollyTheme.text3)
                }
                Spacer(minLength: 6)
                HStack(spacing: 4) {
                    Image(systemName: "rectangle.on.rectangle.angled").font(.system(size: 10, weight: .bold))
                    Text("deck").font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(PollyTheme.accent)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(PollyTheme.accentSoft, in: Capsule())
            }
            HStack(spacing: 8) {
                Button { practice(card) } label: {
                    HStack(spacing: 6) {
                        if preparingDeck { ProgressView().tint(PollyTheme.inkOnAccent).scaleEffect(0.7) }
                        Text(L("Practice now", "Esercitati ora", "S’entraîner", "지금 연습")).font(.system(size: 13.5, weight: .semibold))
                    }
                    .foregroundStyle(PollyTheme.inkOnAccent)
                    .frame(maxWidth: .infinity).padding(.vertical, 9)
                    .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                }
                .buttonStyle(.plain).disabled(preparingDeck)
                Button { deckTarget = card } label: {
                    Text(L("See cards", "Vedi le carte", "Voir les cartes", "카드 보기")).font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(PollyTheme.text)
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(PollyTheme.surface2.opacity(0.7), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(13)
        .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(PollyTheme.border, lineWidth: 1))
        .padding(.leading, 50).padding(.trailing, 16).padding(.vertical, 4)
    }

    // MARK: footer

    /// "Finish & clean up · n fixes so far" — only once there is something to
    /// clean up, and only where the conversation is kept.
    @ViewBuilder
    private var footer: some View {
        let said = turns.contains { $0.role == "user" }
        if context.isStored, said, let chat {
            let n = chat.fixesSoFar ?? turns.filter { $0.fix != nil }.count
            Button { finishAndCleanUp() } label: {
                HStack(spacing: 5) {
                    if closing { ProgressView().tint(PollyTheme.accent).scaleEffect(0.7) }
                    (Text(L("Finish & clean up", "Finisci e sistema", "Terminer et ranger", "끝내고 정리하기")).fontWeight(.bold).foregroundColor(PollyTheme.accent)
                     + Text(n == 0 ? "" : " · \(n) \(n == 1 ? L("fix", "correzione", "correction", "수정") : L("fixes", "correzioni", "corrections", "수정")) \(L("so far", "finora", "jusqu’ici", "지금까지"))").foregroundColor(PollyTheme.text3))
                        .font(.system(size: 12.5))
                }
                .frame(maxWidth: .infinity, minHeight: 30)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(busy || closing)
            .padding(.bottom, 8)
        } else {
            Color.clear.frame(height: 10)
        }
    }

    /// The composer asks for the language being studied, whatever the UI is in.
    private var placeholder: String {
        if case let .signedIn(user) = session.state {
            switch user.language {
            case "it": return "Scrivi in italiano…"
            case "fr": return "Écris en français…"
            case "ko": return "한국어로 써 보세요…"
            default: break
            }
        }
        return "Write to Polly…"
    }

    // MARK: actions

    private func start() async {
        // One conversation per screen: a re-fired .task must not greet again.
        guard !started else { return }
        started = true
        NSLog("POLLY_TALK start chat=%@", context.chatId ?? "new")
        openedAt = Date()
        if let chatId = context.chatId, let loaded = try? await PollyAPI.shared.getInfinityChat(id: chatId) {
            chat = loaded
            turns = loaded.transcript ?? []
            // An open chat whose last word was Polly's is waiting for the learner.
            if loaded.isOpen, turns.last?.role == "assistant" { return }
        }
        // "Ask Polly" (no topic): the learner came to ask — Polly doesn't
        // open with small talk.
        if context.threadId != nil { await exchange(text: nil) }
        #if targetEnvironment(simulator)
        await runScript()
        #endif
    }

    #if targetEnvironment(simulator)
    /// `-AutoTalk "first message|second message"` types a scripted conversation
    /// (the simulator has no keyboard to drive); `-AutoTalkEnd finish|leave|voice`
    /// then ends it the way that button would.
    private func runScript() async {
        let d = UserDefaults.standard
        guard let script = d.string(forKey: "AutoTalk"), LaunchOnce.take("AutoTalk") else { return }
        for line in script.split(separator: "|").map({ $0.trimmingCharacters(in: .whitespaces) }) where !line.isEmpty {
            try? await Task.sleep(for: .milliseconds(900))
            draft = line
            send()
            try? await Task.sleep(for: .milliseconds(300))
            while busy { try? await Task.sleep(for: .milliseconds(200)) }
        }
        guard let end = d.string(forKey: "AutoTalkEnd") else { return }
        d.removeObject(forKey: "AutoTalkEnd")
        try? await Task.sleep(for: .seconds(d.integer(forKey: "AutoTalkHold") > 0 ? Double(d.integer(forKey: "AutoTalkHold")) : 2))
        switch end {
        case "finish": finishAndCleanUp()
        case "voice": handOff()
        default: leave()
        }
    }
    #endif

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        turns.append(ChatTurn(role: "user", text: text, via: "text", at: ISO8601DateFormatter().string(from: Date())))
        Task { await exchange(text: text) }
    }

    private func exchange(text: String?) async {
        busy = true
        defer { busy = false }
        do {
            let res = try await PollyAPI.shared.talk(
                text: text, threadId: context.threadId, chatId: chat?.id ?? context.chatId, cardId: context.cardId,
                history: text == nil ? turns : Array(turns.dropLast()),
                model: PollyChatModel.current.rawValue)
            if let c = res.chat { chat = c }
            let now = ISO8601DateFormatter().string(from: Date())
            for (i, m) in res.messages.enumerated() {
                // Two turns (the agent's answer, then the resume) arrive together;
                // a beat between them reads as Polly coming back to the thread.
                if i > 0 { try? await Task.sleep(for: .milliseconds(500)) }
                var t = m
                t.at = "\(now)-\(i)"
                turns.append(t)
            }
        } catch {
            turns.append(ChatTurn(role: "assistant", text: "(\(error.localizedDescription))", via: "text",
                                  at: ISO8601DateFormatter().string(from: Date()), lane: "agent"))
        }
    }

    private func practice(_ card: TalkCard) {
        guard !preparingDeck else { return }
        preparingDeck = true
        Task {
            defer { preparingDeck = false }
            if let start = try? await PollyAPI.shared.startFlashSet(threadId: card.threadId, mode: "mixed") {
                practiceSet = start
            }
        }
    }

    /// ✕ — finish quietly. (Left alone it would finish itself after an hour.)
    private func leave() {
        guard !closing else { return }
        guard context.isStored, let chat else { onClose(.left(nil)); return }
        closing = true
        Task {
            let finished = (try? await PollyAPI.shared.finishInfinityChat(id: chat.id)) ?? nil
            onClose(.left(finished))
        }
    }

    private func finishAndCleanUp() {
        guard !closing, let chat else { return }
        closing = true
        Task {
            if let finished = (try? await PollyAPI.shared.finishInfinityChat(id: chat.id)) ?? nil {
                onClose(.cleanUp(finished))
            } else {
                onClose(.left(nil))
            }
        }
    }

    private func handOff() {
        guard !closing else { return }
        // Nothing said yet: the radio simply starts the conversation.
        let said = turns.contains { $0.role == "user" }
        guard let chat, said else {
            closing = true
            Task {
                if let chat { _ = try? await PollyAPI.shared.finishInfinityChat(id: chat.id) }
                onClose(.voice(nil))
            }
            return
        }
        onClose(.voice(chat))
    }
}
