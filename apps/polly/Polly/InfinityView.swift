import SwiftUI

// Infinity Chat — the consumer-app face of an endless conversation.
//   InfinityHomeView   the topic screen: a big TALK card + a feed of past
//                      chats, each with Clean up / Vocab / Grammar.
//   InfinityCleanupView   the voice + before/after-card walk (its own file).
// Talk messy, clean it up, drill, repeat. Playful, not a dashboard.

struct InfinityHomeView: View {
    let topicId: String
    var title: String = "Infinity Chat"

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var chats: [InfinityChat] = []
    @State private var loading = true
    @State private var talkPresented = false
    @State private var cleanupChat: InfinityChat? = nil
    @State private var vocabChat: InfinityChat? = nil
    @State private var grammarChat: InfinityChat? = nil
    @State private var preparingId: String? = nil
    @State private var quizPreparingId: String? = nil
    @State private var quizSheet: InfinityQuizSheet? = nil
    @State private var errorText: String? = nil


    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 16) {
                        talkCard
                        if !chats.isEmpty {
                            HStack {
                                Text(L("Your chats", "Le tue chat", "Tes discussions", "내 대화")).font(.system(size: 13, weight: .semibold))
                                    .tracking(0.3).foregroundStyle(PollyTheme.text3)
                                Spacer()
                            }
                            .padding(.top, 4)
                            ForEach(chats) { chatCard($0) }
                        } else if loading {
                            ProgressView().tint(PollyTheme.text3).padding(.top, 30)
                        } else {
                            emptyState
                        }
                    }
                    .pollyContentColumn()
                    .padding(16)
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .task {
            await load()
            #if targetEnvironment(simulator)
            // `-OpenInfinityDrill vocab|grammar` — present a drill for the first
            // cleaned-up chat, for screenshot loops.
            if let which = UserDefaults.standard.string(forKey: "OpenInfinityDrill"),
               let ready = chats.first(where: { $0.hasAnalysis }) {
                UserDefaults.standard.removeObject(forKey: "OpenInfinityDrill")
                try? await Task.sleep(for: .milliseconds(600))
                if which == "vocab" { vocabChat = ready }
                else if which == "grammar" { grammarChat = ready }
                else if which == "quiz" { await startQuiz(ready) }
            }
            #endif
        }
        .fullScreenCover(isPresented: $talkPresented) {
            VoiceSessionView(mode: "topic", threadId: topicId, title: title) { sessionId in
                talkPresented = false
                if let sessionId { Task { await recordChat(sessionId) } }
            }
            .environment(session)
        }
        .fullScreenCover(item: $cleanupChat) { chat in
            InfinityCleanupView(chat: chat) {
                cleanupChat = nil
                Task { await load() }
            }
            .environment(session)
        }
        .sheet(item: $vocabChat) { chat in
            InfinityVocabView(chat: chat).environment(session)
        }
        .sheet(item: $grammarChat) { chat in
            InfinityGrammarView(chat: chat).environment(session)
        }
        .fullScreenCover(item: $quizSheet, onDismiss: { Task { await load() } }) { q in
            FlashSetView(start: q.start, topicLabel: "Infinity Chat") { result in
                // A pass masters the conversation (Dodo's flash-quality bar).
                if result.total > 0 && result.score * 5 >= result.total * 4 {
                    Task { _ = try? await PollyAPI.shared.masterInfinityChat(chatId: q.chat.id) }
                }
            }
            .environment(session)
        }
        .alert("Hmm", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
            Button("OK") { errorText = nil }
        } message: { Text(errorText ?? "") }
    }

    // MARK: header

    private var header: some View {
        HStack(spacing: 10) {
            IconCircleButton(systemImage: "chevron.left", fg: PollyTheme.text) { dismiss() }
            HStack(spacing: 7) {
                MiniTopicGlyph(kind: "infinity", size: 22)
                Text(title)
                    .font(.system(size: 17, weight: .semibold)).tracking(-0.3)
                    .foregroundStyle(PollyTheme.text)
            }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
    }

    // MARK: the TALK card

    private var talkCard: some View {
        Button { talkPresented = true } label: {
            VStack(spacing: 14) {
                ZStack {
                    Circle().fill(PollyTheme.accentSoft).frame(width: 72, height: 72)
                    DodoMiniMark(size: 60)
                }
                VStack(spacing: 5) {
                    Text(L("Let's talk", "Parliamo", "Parlons", "이야기해요"))
                        .font(.custom("Fredoka", size: 24).weight(.semibold))
                        .foregroundStyle(PollyTheme.text)
                    Text(L("Just chat — messy is good, mix in English, don't worry. We tidy it up after.", "Chiacchiera e basta — va bene fare pasticci, mescola pure l’inglese. Sistemiamo tutto dopo.", "Discute, c’est tout — le désordre c’est bien, mélange l’anglais. On range après.", "그냥 편하게 이야기해요 — 엉망이어도, 영어를 섞어도 괜찮아요. 나중에 정리해요."))
                        .font(.system(size: 13.5)).foregroundStyle(PollyTheme.text2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    Image(systemName: "mic.fill").font(.system(size: 15, weight: .bold))
                    Text(L("Start a chat", "Inizia una chat", "Commencer une discussion", "대화 시작")).font(.system(size: 16, weight: .semibold))
                }
                .foregroundStyle(PollyTheme.inkOnAccent)
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(PollyTheme.surface))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(PollyTheme.accentDim, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: a chat in the feed

    private func chatCard(_ chat: InfinityChat) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(chat.displayTitle)
                        .font(.custom("Fredoka", size: 18).weight(.semibold))
                        .foregroundStyle(PollyTheme.text)
                        .lineLimit(1)
                    statusChip(chat)
                }
                Spacer(minLength: 0)
            }
            if chat.hasAnalysis {
                VStack(spacing: 8) {
                    if chat.hasAnalysis {
                        Button { Task { await startQuiz(chat) } } label: {
                            HStack(spacing: 8) {
                                if quizPreparingId == chat.id {
                                    ProgressView().tint(PollyTheme.inkOnAccent).scaleEffect(0.8)
                                    Text(L("Loading quiz…","Carico il quiz…","Chargement du quiz…","퀴즈 불러오는 중…")).font(.system(size: 15, weight: .semibold))
                                } else {
                                    Image(systemName: chat.isMastered ? "checkmark.seal.fill" : "graduationcap.fill")
                                        .font(.system(size: 14, weight: .bold))
                                    Text(chat.isMastered ? L("Quiz again","Rifai il quiz","Refaire le quiz","퀴즈 다시 풀기") : L("Quiz · master it","Quiz · padroneggiala","Quiz · maîtrise-la","퀴즈 · 마스터하기")).font(.system(size: 15, weight: .semibold))
                                }
                            }
                            .foregroundStyle(PollyTheme.inkOnAccent)
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background((chat.isMastered ? PollyTheme.sprout : PollyTheme.accent), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(quizPreparingId != nil)
                    }
                    HStack(spacing: 8) {
                        pill(L("Review","Rivedi","Revoir","다시 보기"), "sparkles") { cleanupChat = chat }
                        if (chat.analysis?.vocab.isEmpty == false) {
                            pill(L("Vocab","Vocaboli","Vocab","단어"), "rectangle.on.rectangle.angled") { vocabChat = chat }
                        }
                        if (chat.analysis?.grammar.isEmpty == false) {
                            pill(L("Grammar","Grammatica","Grammaire","문법"), "puzzlepiece.fill") { grammarChat = chat }
                        }
                    }
                }
            } else {
                Button { Task { await startCleanup(chat) } } label: {
                    HStack(spacing: 8) {
                        if preparingId == chat.id {
                            ProgressView().tint(PollyTheme.inkOnAccent).scaleEffect(0.8)
                            Text(L("Polly's reading it back…","Polly la rilegge…","Polly la relit…","Polly가 다시 읽는 중…")).font(.system(size: 14.5, weight: .semibold))
                        } else {
                            Image(systemName: "sparkles").font(.system(size: 14, weight: .bold))
                            Text(L("Clean it up","Sistemala","Ranger","정리하기")).font(.system(size: 15, weight: .semibold))
                        }
                    }
                    .foregroundStyle(PollyTheme.inkOnAccent)
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(preparingId != nil)
            }
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(PollyTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(chat.isMastered ? PollyTheme.gold.opacity(0.7) : chat.isCleanedUp ? PollyTheme.sprout.opacity(0.5) : PollyTheme.border, lineWidth: chat.isMastered ? 1.5 : 1))
    }

    private func statusChip(_ chat: InfinityChat) -> some View {
        let mastered = chat.isMastered, cleaned = chat.isCleanedUp
        return HStack(spacing: 5) {
            Image(systemName: mastered ? "checkmark.seal.fill" : cleaned ? "checkmark.circle.fill" : "sparkles")
                .font(.system(size: 10, weight: .bold))
            Text(mastered ? L("Mastered","Padroneggiata","Maîtrisée","마스터") : cleaned ? L("Cleaned up","Sistemata","Rangée","정리됨") : L("Ready to clean up","Da sistemare","À ranger","정리 전"))
                .font(.system(size: 11.5, weight: .semibold))
        }
        .foregroundStyle(mastered ? PollyTheme.gold : cleaned ? PollyTheme.sprout : PollyTheme.accent)
    }

    private func pill(_ title: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 12, weight: .semibold))
                Text(title).font(.system(size: 13, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.75)
            }
            .foregroundStyle(PollyTheme.text)
            .padding(.horizontal, 8).padding(.vertical, 9)
            .frame(maxWidth: .infinity)
            .background(PollyTheme.surface2.opacity(0.7), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Text(L("No chats yet", "Ancora nessuna chat", "Aucune discussion pour l’instant", "아직 대화가 없어요"))
                .font(.custom("Fredoka", size: 18).weight(.semibold))
                .foregroundStyle(PollyTheme.text2)
            Text(L("Tap Start a chat and just talk. Your conversations show up here to clean up.", "Tocca «Inizia una chat» e parla. Le tue conversazioni compaiono qui, pronte da sistemare.", "Touche «\u{00A0}Commencer une discussion\u{00A0}» et parle. Tes conversations apparaissent ici, à ranger.", "‘대화 시작’을 누르고 이야기해요. 대화가 여기에 나타나 정리할 수 있어요."))
                .font(.system(size: 13.5)).foregroundStyle(PollyTheme.text3)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 24).padding(.horizontal, 20)
    }

    // MARK: actions

    private func load() async {
        do {
            chats = try await PollyAPI.shared.listInfinityChats(threadId: topicId)
        } catch {
            errorText = error.localizedDescription
        }
        loading = false
    }

    private func recordChat(_ voiceSessionId: String) async {
        do {
            _ = try await PollyAPI.shared.createInfinityChat(threadId: topicId, voiceSessionId: voiceSessionId)
            await load()
        } catch {
            errorText = "Couldn't save that chat: \(error.localizedDescription)"
        }
    }

    private func startQuiz(_ chat: InfinityChat) async {
        quizPreparingId = chat.id
        defer { quizPreparingId = nil }
        do {
            let start = try await PollyAPI.shared.infinityQuiz(chatId: chat.id)
            quizSheet = InfinityQuizSheet(chat: chat, start: start)
        } catch {
            errorText = "Couldn't build the quiz: \(error.localizedDescription)"
        }
    }

    private func startCleanup(_ chat: InfinityChat) async {
        preparingId = chat.id
        defer { preparingId = nil }
        do {
            let ready = try await PollyAPI.shared.cleanUpInfinityChat(id: chat.id)
            if ready.hasAnalysis {
                cleanupChat = ready
            } else {
                // Nothing worth fixing — mark it done and refresh.
                _ = try? await PollyAPI.shared.completeInfinityCleanup(id: chat.id, cleanupSessionId: nil)
                await load()
                errorText = "That one was already pretty clean — nice. Nothing to fix."
            }
        } catch {
            errorText = "Couldn't clean that up: \(error.localizedDescription)"
        }
    }
}

/// Identifiable wrapper so a conversation's quiz can drive a fullScreenCover.
struct InfinityQuizSheet: Identifiable {
    let id = UUID()
    let chat: InfinityChat
    let start: FlashStart
}

/// The prominent study bar pinned atop the Infinity chat window. It summarizes
/// the newest conversation and opens the full study sheet (TALK, clean-up,
/// quiz, drills). `refresh` bumps when that sheet closes so it re-reads.
struct InfinityChatBar: View {
    let topicId: String
    var refresh: Int = 0
    var onSessions: () -> Void

    @Environment(Session.self) private var session
    @State private var chats: [InfinityChat] = []
    @State private var loaded = false

    private var active: InfinityChat? { chats.first }

    var body: some View {
        Button(action: onSessions) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(PollyTheme.accentSoft).frame(width: 40, height: 40)
                    MiniTopicGlyph(kind: "infinity", size: 24)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(PollyTheme.text).lineLimit(1)
                    Text(subtitle).font(.system(size: 12.5))
                        .foregroundStyle(active?.isMastered == true ? PollyTheme.gold : PollyTheme.text2).lineLimit(1)
                }
                Spacer(minLength: 0)
                Text(cta)
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(PollyTheme.inkOnAccent)
                    .padding(.horizontal, 13).padding(.vertical, 7)
                    .background(PollyTheme.accent, in: Capsule())
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(PollyTheme.surface))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(PollyTheme.accentDim, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 14)
        .task(id: refresh) { await load() }
    }

    private var title: String {
        guard let a = active else { return L("Talk to Polly", "Parla con Polly", "Parle avec Polly", "Polly와 대화") }
        return a.displayTitle
    }
    private var subtitle: String {
        guard let a = active else {
            return loaded ? L("Start a chat, then clean it up", "Inizia una chat, poi sistemala", "Commence, puis range-la", "대화를 시작하고 정리해요")
                          : L("Loading…", "Caricamento…", "Chargement…", "불러오는 중…")
        }
        let n = chats.count
        let tail = n > 1 ? L(" · \(n) chats", " · \(n) chat", " · \(n) discussions", " · 대화 \(n)개") : ""
        if a.isMastered { return L("Mastered", "Padroneggiata", "Maîtrisée", "마스터") + tail }
        if a.hasAnalysis { return L("Quiz to master it", "Fai il quiz per padroneggiarla", "Quiz pour la maîtriser", "퀴즈로 마스터하기") + tail }
        return L("Ready to clean up", "Da sistemare", "À ranger", "정리 전") + tail
    }
    private var cta: String {
        guard let a = active else { return L("Start", "Inizia", "Commencer", "시작") }
        if a.hasAnalysis && !a.isMastered { return L("Quiz", "Quiz", "Quiz", "퀴즈") }
        if a.isMastered { return L("Study", "Studia", "Réviser", "학습") }
        return L("Clean up", "Sistema", "Ranger", "정리") }

    private func load() async {
        chats = (try? await PollyAPI.shared.listInfinityChats(threadId: topicId)) ?? []
        loaded = true
    }
}

