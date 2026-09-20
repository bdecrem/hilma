import SwiftUI

// MARK: - A source topic: film, podcast episode, book, article, pasted text…

/// The topic screen for anything anchored to a source (and for plain topics):
/// the source and the teacher's plan where they always were, then the pair
/// ("Parliamone"), the ways to work with it as steps — not chips over a
/// composer — and the chats about it underneath, like the Infinity journey.
struct SourceTopicView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let topicId: String

    @State private var thread: PollyThread? = nil
    @State private var chats: [InfinityChat] = []
    @State private var cardCount: Int? = nil
    @State private var loading = true
    @State private var flow = ChatFlow()
    @State private var openChat: InfinityChat? = nil
    @State private var lessonPresented = false
    @State private var lessonLoading = false
    @State private var playerPresented = false
    @State private var flashPresented = false
    @State private var quotesPresented = false
    @State private var quizPresented = false
    @AppStorage("recertEnabled") private var recertEnabledPref = true
    @State private var finalReviewPresented = false
    @State private var finalReviewVariant: FinalReviewView.Variant = .full
    @State private var secondChanceDialogPresented = false
    @State private var contextPresented = false
    @State private var firstSessionDismissed = false

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if loading && thread == nil {
                    ProgressView().tint(PollyTheme.text2).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            if let t = thread, let urlString = t.url, let host = t.sourceHost {
                                Button { if let u = URL(string: urlString) { openURL(u) } } label: {
                                    SourceCard(title: t.topic ?? host, host: host,
                                               letter: String((t.topic ?? host).prefix(1)).uppercased())
                                }
                                .buttonStyle(.plain)
                            }
                            if let t = thread, t.isGuestLesson {
                                LessonCard(lesson: t.lesson, loading: lessonLoading) { lessonPresented = true }
                            }
                            firstSessionBanner
                            recertBanner
                            pairCard.padding(.horizontal, 16)
                            steps.padding(.horizontal, 16)
                            if !chats.isEmpty {
                                HStack {
                                    Text(L("Your chats about this", "Le tue chat su questo", "Tes discussions là-dessus", "이 주제의 대화"))
                                        .font(.system(size: 13, weight: .semibold)).tracking(0.3)
                                        .foregroundStyle(PollyTheme.text3)
                                    Spacer()
                                }
                                .padding(.horizontal, 16).padding(.top, 6)
                                ChatRail(chats: chats, flow: flow) { openChat = $0 }
                                    .padding(.horizontal, 16)
                            }
                            Color.clear.frame(height: 86) // room for the floating TabPill
                        }
                        .pollyContentColumn()
                        .padding(.top, 2)
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .navigationDestination(item: $openChat) { chat in
            InfinityChatPage(chatId: chat.id, seed: chat, topicId: topicId, topicTitle: thread?.topic ?? "Topic")
                .toolbar(.hidden, for: .navigationBar)
        }
        .chatFlow(flow, session: session)
        .sheet(isPresented: $lessonPresented) {
            if let lesson = thread?.lesson {
                LessonSheet(topicLabel: thread?.topic ?? "Topic", lesson: lesson)
            }
        }
        .sheet(isPresented: $contextPresented) {
            TopicContextSheet(topicId: topicId, topicLabel: thread?.topic ?? "Topic", seedFocus: thread?.studyFocus)
                .environment(session)
        }
        .sheet(isPresented: $flashPresented, onDismiss: { Task { await loadCards() } }) {
            FlashCardsView(topicId: topicId, topicLabel: thread?.topic ?? "Topic").environment(session)
        }
        .sheet(isPresented: $quotesPresented) {
            PebblesView(threadId: topicId, topicLabel: thread?.topic)
        }
        .fullScreenCover(isPresented: $quizPresented, onDismiss: { Task { await load() } }) {
            TopicQuizView(topicId: topicId, title: thread?.topic ?? "Topic").environment(session)
        }
        .fullScreenCover(isPresented: $finalReviewPresented) {
            FinalReviewView(topicId: topicId, topicLabel: thread?.topic ?? "Topic", variant: finalReviewVariant) { result in
                if var t = thread {
                    t.stars = result.stars
                    if result.mastered { t.hardQuizCompletedAt = Date() }
                    thread = t
                }
                // Refetch so second_chance_until reflects this attempt.
                Task { await load() }
            }
            .environment(session)
        }
        .confirmationDialog("You've earned a Second Chance", isPresented: $secondChanceDialogPresented, titleVisibility: .visible) {
            Button("Second Chance — 3 questions") { finalReviewVariant = .secondChance; finalReviewPresented = true }
            Button("Full Final Review") { finalReviewVariant = .full; finalReviewPresented = true }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Answer 3 questions at A level to earn the star, or retake the full review.")
        }
        .sheet(isPresented: $playerPresented) {
            if let url = audioSummaryURL {
                AudioSummaryPlayerView(title: thread?.topic ?? "Topic", url: url)
            }
        }
        .task {
            flow.threadId = topicId
            flow.textContext = { [topicId] chat in
                var c = TextChatContext(threadId: topicId, title: thread?.topic ?? "Topic", chatId: chat?.id)
                if let t = thread {
                    c.about = t.isGuestLesson ? L("about the episode", "sull’episodio", "sur l’épisode", "에피소드에 대해")
                        : (t.url != nil || t.kind == "immersion") ? L("about this", "su questo", "là-dessus", "이것에 대해") : nil
                    if let lesson = t.lesson, t.isGuestLesson {
                        c.pill = lesson.host.map { "\($0)\u{2019}s \(L("episode", "episodio", "épisode", "에피소드"))" } ?? (t.topic ?? "")
                        c.pillLetter = String((t.topic ?? "L").prefix(1)).uppercased()
                    } else if t.url != nil || t.kind == "immersion" {
                        c.pill = t.topic
                        c.pillLetter = String((t.topic ?? "•").prefix(1)).uppercased()
                    }
                }
                return c
            }
            await load()
            // The miss clinic used to hand a draft to this screen's composer;
            // it opens the text chat itself now. Drop a stale one.
            _ = DeepLinkRouter.shared.consumeChatDraft(threadId: topicId)
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            await runLaunchHooks()
            #endif
        }
        .onChange(of: flow.changes) { Task { await loadChats() } }
    }

    // MARK: header — stars · host, and the kebab where the model button was

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            IconCircleButton(systemImage: "chevron.left", fg: PollyTheme.text) { dismiss() }
            VStack(spacing: 4) {
                Text(thread?.topic ?? "Topic")
                    .font(.system(size: 17, weight: .semibold)).tracking(-0.3)
                    .foregroundStyle(PollyTheme.text).lineLimit(1)
                HStack(spacing: 6) {
                    StarRow(value: thread?.stars ?? 0, size: 10, gap: 2, locked: thread?.hardQuizCompletedAt != nil)
                    if let host = thread?.sourceHost {
                        Text("·").foregroundStyle(PollyTheme.text3)
                        Text(host).italic().foregroundStyle(PollyTheme.text2)
                    } else if let count = thread?.quizCount, count > 0 {
                        Text("·").foregroundStyle(PollyTheme.text3)
                        Text("\(count) \(count == 1 ? "quiz" : "quizzes")").foregroundStyle(PollyTheme.text2)
                    }
                    if let t = thread, t.isCertified, !t.recertLapsed, !t.recertDueSoon, let due = t.recertDueAt {
                        Text("·").foregroundStyle(PollyTheme.text3)
                        Text("renews \(due.formatted(.dateTime.month(.abbreviated).day()))").foregroundStyle(PollyTheme.text3)
                    }
                }
                .font(.system(size: 12)).tracking(-0.1)
            }
            .frame(maxWidth: .infinity)
            Menu {
                Button { contextPresented = true } label: { Label("Context — sources & notes", systemImage: "doc.text.magnifyingglass") }
                if audioSummaryURL != nil {
                    Button { playerPresented = true } label: { Label(L("Play the summary", "Ascolta il riassunto", "Écouter le résumé", "요약 듣기"), systemImage: "play.fill") }
                }
                if let urlString = thread?.url, let url = URL(string: urlString) {
                    Button { openURL(url) } label: { Label("Open the source", systemImage: "arrow.up.right") }
                }
                ChatModelMenuItems()
            } label: { TopicKebab() }
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
    }

    // MARK: the pair

    private var pairCard: some View {
        VStack(spacing: 10) {
            VStack(spacing: 3) {
                Text(L("Let's talk about it", "Parliamone", "Parlons-en", "이야기해 봐요"))
                    .font(.custom("Fredoka", size: 20).weight(.semibold))
                    .foregroundStyle(PollyTheme.text)
                Text(pairHint)
                    .font(.system(size: 13)).foregroundStyle(PollyTheme.text2)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
            TalkPair(voiceLabel: L("Talk about it", "Parlane", "Parles-en", "이야기하기"), compact: true,
                     onVoice: { flow.talk() }, onType: { flow.type() })
        }
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(PollyTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(PollyTheme.accentDim, lineWidth: 1))
    }

    private var pairHint: String {
        guard let t = thread else { return "" }
        if t.isGuestLesson {
            if let host = t.lesson?.host, !host.isEmpty {
                return L("Retell the story, then \(host)\u{2019}s question.", "Racconta la storia, poi la domanda di \(host).", "Raconte l’histoire, puis la question de \(host).", "이야기를 다시 말해 보고, \(host)의 질문에 답해요.")
            }
            return L("Retell the story, then the closing question.", "Racconta la storia, poi la domanda finale.", "Raconte l’histoire, puis la question finale.", "이야기를 다시 말해 보고, 마지막 질문에 답해요.")
        }
        if t.url != nil || t.kind == "immersion" {
            return L("What happened, what you thought, what a line meant.", "Che cosa succede, che cosa ne pensi, che cosa voleva dire una frase.", "Ce qui se passe, ce que tu en penses, ce qu’une phrase voulait dire.", "무슨 일이 있었는지, 어떻게 생각했는지, 대사가 무슨 뜻인지.")
        }
        return L("Messy is good. Mix in English. We tidy up after.", "Va bene fare pasticci. Mescola pure l’inglese. Sistemiamo dopo.", "Le désordre, c’est bien. Mélange l’anglais. On range après.", "엉망이어도 좋아요. 영어를 섞어도 돼요. 나중에 정리해요.")
    }

    // MARK: steps — Cards · Quiz (the star ladder's next rung) · Quotes

    private var steps: some View {
        HStack(spacing: 8) {
            stepTile(cardCount.map { "\(L("Cards", "Carte", "Cartes", "카드")) · \($0)" } ?? L("Cards", "Carte", "Cartes", "카드"),
                     symbol: "rectangle.on.rectangle.angled") { flashPresented = true }
            ladderTile
            stepTile(L("Quotes", "Citazioni", "Citations", "인용"), symbol: "quote.opening") { quotesPresented = true }
        }
    }

    /// The middle tile follows the star ladder: the quiz (star 1), the Final
    /// Review once it unlocks, the refresher on a mastered topic.
    @ViewBuilder
    private var ladderTile: some View {
        if thread?.isCertified == true && recertEnabledPref {
            stepTile(L("Refresher", "Ripasso", "Révision", "복습"), symbol: "arrow.clockwise",
                     tint: (thread?.recertLapsed == true || thread?.recertDueSoon == true) ? PollyTheme.gold : PollyTheme.accent) {
                finalReviewVariant = .recert
                finalReviewPresented = true
            }
        } else if canTakeFinalReview {
            stepTile(L("Final Review", "Esame finale", "Examen final", "최종 시험"), symbol: "checkmark.seal.fill", tint: PollyTheme.gold) {
                // Within 24h of a failed 2nd+ attempt, offer the 3-question
                // Second Chance alongside the full exam.
                if thread?.secondChanceAvailable == true { secondChanceDialogPresented = true }
                else { finalReviewVariant = .full; finalReviewPresented = true }
            }
        } else {
            stepTile(quizInProgress ? L("Finish quiz", "Finisci il quiz", "Finir le quiz", "퀴즈 끝내기") : L("Quiz", "Quiz", "Quiz", "퀴즈"),
                     symbol: (thread?.stars ?? 0) >= 1 ? "checkmark.circle.fill" : "questionmark.circle",
                     highlighted: quizInProgress) { quizPresented = true }
        }
    }

    private func stepTile(_ title: String, symbol: String, tint: Color = PollyTheme.accent, highlighted: Bool = false,
                          action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 15, weight: .bold)).foregroundStyle(tint)
                    .frame(width: 34, height: 34)
                    .background(PollyTheme.accentSoft, in: Circle())
                Text(title).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(PollyTheme.text)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 11)
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(highlighted ? PollyTheme.accentDim : PollyTheme.border, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: banners

    @ViewBuilder
    private var firstSessionBanner: some View {
        if !firstSessionDismissed,
           DeepLinkRouter.shared.isFresh(topicId: topicId),
           let t = thread, t.url == nil {
            HStack(spacing: 10) {
                Image(systemName: "text.book.closed")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(PollyTheme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Give Polly something to read")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(PollyTheme.text)
                    Text("A link or your notes — Polly answers from them.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(PollyTheme.text2)
                }
                Spacer(minLength: 6)
                Button {
                    contextPresented = true
                } label: {
                    Text("Add")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(PollyTheme.inkOnAccent)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(PollyTheme.accent, in: Capsule())
                }
                .buttonStyle(.plain)
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { firstSessionDismissed = true }
                    DeepLinkRouter.shared.endFirstSession(topicId: topicId)
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PollyTheme.text2)
                        .frame(width: 28, height: 28)
                        .background(PollyTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss")
            }
            .padding(12)
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.accent.opacity(0.35), lineWidth: 1))
            .padding(.horizontal, 14)
            .padding(.bottom, 6)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    @ViewBuilder
    private var recertBanner: some View {
        if let t = thread, t.recertLapsed {
            Button {
                finalReviewVariant = .recert
                finalReviewPresented = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "seal")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(PollyTheme.gold.opacity(0.55))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Your mastery badge dimmed")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(PollyTheme.text)
                        Text("A 5-minute refresher — 3 questions — brings back the gold.")
                            .font(.system(size: 12.5))
                            .foregroundStyle(PollyTheme.text2)
                    }
                    Spacer()
                    Text("Refresh")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(PollyTheme.inkOnAccent)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(PollyTheme.accent, in: Capsule())
                }
                .padding(12)
                .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.gold.opacity(0.4), lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.bottom, 6)
        } else if let t = thread, t.recertDueSoon, let due = t.recertDueAt {
            Button {
                finalReviewVariant = .recert
                finalReviewPresented = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(PollyTheme.gold)
                    Text("Refresher due \(dueInWords(due)) — 3 questions keeps the badge gold.")
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(PollyTheme.text2)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PollyTheme.text3)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(PollyTheme.borderSoft, lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.bottom, 6)
        }
    }

    private func dueInWords(_ due: Date) -> String {
        let days = Int(ceil(due.timeIntervalSinceNow / 86_400))
        if days <= 0 { return "today" }
        if days == 1 { return "tomorrow" }
        return "in \(days) days"
    }

    private var canTakeFinalReview: Bool {
        (thread?.stars ?? 0) >= 2 && (thread?.hardQuizCompletedAt == nil)
    }

    private var quizInProgress: Bool {
        let kind = thread?.pendingQuizKind
        return kind == "standard" || kind == "hard"
    }

    /// Non-nil once this topic has a ready Audio Summary.
    private var audioSummaryURL: URL? {
        guard let a = thread?.audioSummary, a.status == "ready", let urlString = a.url else { return nil }
        return URL(string: urlString)
    }

    // MARK: data

    private func load() async {
        loading = true
        defer { loading = false }
        if let t = try? await PollyAPI.shared.getThread(id: topicId) {
            thread = t
            flow.title = t.topic ?? "Topic"
            if t.isGuestLesson, t.lesson == nil { await warmLesson() }
        }
        await loadChats()
        await loadCards()
    }

    private func loadChats() async {
        if let fetched = try? await PollyAPI.shared.listInfinityChats(threadId: topicId) { chats = fetched }
    }

    private func loadCards() async {
        if let flash = try? await PollyAPI.shared.getTopicFlash(id: topicId) { cardCount = flash.cards.count }
    }

    /// A guest lesson opened before its plan exists: ask the backend to
    /// extract it now (one slow call) so the Lesson card fills in.
    private func warmLesson() async {
        guard !lessonLoading else { return }
        lessonLoading = true
        defer { lessonLoading = false }
        if let lesson = try? await PollyAPI.shared.ensureLesson(topicId: topicId) { thread?.lesson = lesson }
    }

    #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
    /// `-OpenFlashCards`, `-OpenVoice`, `-OpenTextChat`, `-OpenTopicQuiz`,
    /// `-OpenFinalReview`, `-OpenTopicQuotes`, `-OpenLesson` (with `-OpenTopic <id>`).
    private func runLaunchHooks() async {
        let d = UserDefaults.standard
        // Launch arguments outlive removeObject — take each hook once per launch.
        func take(_ key: String) -> Bool { d.bool(forKey: key) && LaunchOnce.take(key) }
        try? await Task.sleep(for: .milliseconds(600))
        if take("OpenFlashCards") { flashPresented = true }
        if take("OpenVoice") { flow.talk() }
        if take("OpenTextChat") { flow.type() }
        if take("OpenTopicQuiz") { quizPresented = true }
        if take("OpenFinalReview") { finalReviewVariant = .full; finalReviewPresented = true }
        if take("OpenTopicQuotes") { quotesPresented = true }
        if take("OpenLesson") {
            for _ in 0..<50 where thread?.lesson == nil { try? await Task.sleep(for: .milliseconds(200)) }
            lessonPresented = true
        }
    }
    #endif
}

// MARK: - A lesson Polly wrote

/// Read it, talk it, the three steps. No chat window: the Talk step is the
/// pair, and typing is the quieter way to play the same scene (the step itself
/// stays a speaking step).
struct LessonTopicView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let topicId: String

    @State private var thread: PollyThread? = nil
    @State private var chats: [InfinityChat] = []
    @State private var flow = ChatFlow()
    @State private var openChat: InfinityChat? = nil
    @State private var lessonPresented = false
    @State private var startingStep: String? = nil
    @State private var stepSet: FlashStart? = nil
    @State private var stepError: String? = nil

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if thread == nil {
                    ProgressView().tint(PollyTheme.text2).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            readCard
                            pairCard
                            stepTiles
                            Text(L("Three steps, any order. The next lesson is written when they're done.", "Tre passi, in qualsiasi ordine. La prossima lezione arriva quando li hai finiti.", "Trois étapes, dans n’importe quel ordre. La leçon suivante s’écrit quand elles sont faites.", "세 단계, 순서는 자유예요. 다 끝내면 다음 레슨이 만들어져요."))
                                .font(.system(size: 12.5)).foregroundStyle(PollyTheme.text3)
                                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                                .padding(.horizontal, 20)
                            if !chats.isEmpty {
                                HStack {
                                    Text(L("Your chats about this", "Le tue chat su questo", "Tes discussions là-dessus", "이 주제의 대화"))
                                        .font(.system(size: 13, weight: .semibold)).tracking(0.3).foregroundStyle(PollyTheme.text3)
                                    Spacer()
                                }
                                .padding(.top, 8)
                                ChatRail(chats: chats, flow: flow) { openChat = $0 }
                            }
                            Color.clear.frame(height: 86)
                        }
                        .pollyContentColumn()
                        .padding(.horizontal, 16).padding(.top, 2)
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .navigationDestination(item: $openChat) { chat in
            InfinityChatPage(chatId: chat.id, seed: chat, topicId: topicId, topicTitle: thread?.topic ?? "Lesson")
                .toolbar(.hidden, for: .navigationBar)
        }
        .chatFlow(flow, session: session)
        .fullScreenCover(item: $stepSet) { start in
            FlashSetView(start: start, topicLabel: thread?.topic) { _ in Task { await load() } }
                .environment(session)
        }
        .alert("Cards", isPresented: Binding(get: { stepError != nil }, set: { if !$0 { stepError = nil } })) {
            Button("OK") { stepError = nil }
        } message: { Text(stepError ?? "") }
        .sheet(isPresented: $lessonPresented) {
            if let lesson = thread?.lesson { LessonSheet(topicLabel: thread?.topic ?? "Lesson", lesson: lesson) }
        }
        .task {
            flow.threadId = topicId
            // Ending the call uploads the transcript, the server marks the
            // Talk step, and the reload picks it up.
            flow.onVoiceFinished = { Task { await load() } }
            flow.textContext = { [topicId] chat in
                var c = TextChatContext(threadId: topicId, title: thread?.topic ?? "Lesson", chatId: chat?.id)
                c.about = partner.map { L("the scene, with \($0)", "la scena, con \($0)", "la scène, avec \($0)", "\($0)와(과)의 장면") }
                return c
            }
            await load()
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            let d = UserDefaults.standard
            try? await Task.sleep(for: .milliseconds(600))
            if d.bool(forKey: "OpenVoice"), LaunchOnce.take("OpenVoice") { flow.talk() }
            if d.bool(forKey: "OpenTextChat"), LaunchOnce.take("OpenTextChat") { flow.type() }
            if d.bool(forKey: "OpenLesson"), LaunchOnce.take("OpenLesson") { lessonPresented = true }
            #endif
        }
        .onChange(of: flow.changes) { Task { await load() } }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            IconCircleButton(systemImage: "chevron.left", fg: PollyTheme.text) { dismiss() }
            VStack(spacing: 3) {
                Text(thread?.topic ?? "Lesson")
                    .font(.system(size: 17, weight: .semibold)).tracking(-0.3)
                    .foregroundStyle(PollyTheme.text).lineLimit(1)
                Text([thread?.pathPosition.map { "\(L("Lesson", "Lezione", "Leçon", "레슨")) \($0)" }, thread?.lesson?.level].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 12)).foregroundStyle(PollyTheme.text2)
            }
            .frame(maxWidth: .infinity)
            Menu { ChatModelMenuItems() } label: { TopicKebab() }
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
    }

    private var readCard: some View {
        Button { lessonPresented = true } label: {
            HStack(spacing: 11) {
                MiniTopicGlyph(kind: "lesson", size: 30, verified: thread?.lessonDoneAt != nil)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text("\(thread?.pathPosition.map { "\(L("Lesson", "Lezione", "Leçon", "레슨")) \($0)" } ?? L("Lesson", "Lezione", "Leçon", "레슨")) · \(L("Read it", "Leggila", "Lis-la", "읽기"))")
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(PollyTheme.text)
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(PollyTheme.accent)
                    }
                    Text(thread?.lesson?.scene ?? "")
                        .font(.system(size: 12.5)).foregroundStyle(PollyTheme.text2)
                        .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(PollyTheme.border, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// The other person in the scene (the first speaker who isn't "You").
    private var partner: String? {
        let me: Set<String> = ["you", "tu", "toi", "io", "moi", "나", "me"]
        return thread?.lesson?.dialogue?.map(\.speaker).first { !me.contains($0.lowercased()) }
    }

    private var pairCard: some View {
        VStack(spacing: 10) {
            VStack(spacing: 3) {
                Text(partner.map { L("Talk with \($0)", "Parla con \($0)", "Parle avec \($0)", "\($0)와(과) 말하기") } ?? L("Play the scene", "Recita la scena", "Joue la scène", "장면 연기하기"))
                    .font(.custom("Fredoka", size: 20).weight(.semibold)).foregroundStyle(PollyTheme.text)
                Text(partner.map { L("Polly plays \($0). Your turn in the scene.", "Polly fa \($0). Tocca a te nella scena.", "Polly joue \($0). À toi dans la scène.", "Polly가 \($0) 역할을 해요. 장면 속 당신 차례예요.") } ?? L("Polly plays the other person.", "Polly fa l’altra persona.", "Polly joue l’autre personne.", "Polly가 상대 역할을 해요."))
                    .font(.system(size: 13)).foregroundStyle(PollyTheme.text2).multilineTextAlignment(.center)
            }
            TalkPair(voiceLabel: L("Talk", "Parla", "Parle", "말하기"), compact: true,
                     onVoice: { flow.talk() }, onType: { flow.type() })
        }
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(PollyTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(PollyTheme.accentDim, lineWidth: 1))
    }

    private var stepTiles: some View {
        let s = thread?.lessonSteps
        return HStack(spacing: 8) {
            tile(L("Talk", "Parla", "Parle", "말하기"), "mic.fill", done: s?.talk != nil, busy: false) { flow.talk() }
            tile(L("Words", "Parole", "Mots", "단어"), "rectangle.on.rectangle.angled", done: s?.words != nil, busy: startingStep == "words") { startStep("words") }
            tile(L("Grammar", "Grammatica", "Grammaire", "문법"), "puzzlepiece.fill", done: s?.grammar != nil, busy: startingStep == "grammar") { startStep("grammar") }
        }
    }

    private func tile(_ title: String, _ symbol: String, done: Bool, busy: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    if busy { ProgressView().tint(PollyTheme.text3).scaleEffect(0.8) }
                    else {
                        Image(systemName: done ? "checkmark" : symbol).font(.system(size: 14, weight: .bold))
                            .foregroundStyle(done ? PollyTheme.inkOnAccent : PollyTheme.accent)
                    }
                }
                .frame(width: 34, height: 34)
                .background(done ? PollyTheme.accent : PollyTheme.accentSoft, in: Circle())
                Text(title).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(PollyTheme.text)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 11)
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(done ? PollyTheme.accentDim : PollyTheme.border, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func load() async {
        if let t = try? await PollyAPI.shared.getThread(id: topicId) {
            thread = t
            flow.title = t.topic ?? "Lesson"
        }
        if let fetched = try? await PollyAPI.shared.listInfinityChats(threadId: topicId) { chats = fetched }
    }

    /// Start the Words or Grammar step: a mixed set of that step's cards. The
    /// decks are built right after the lesson is written, so a lesson opened
    /// in its first seconds may not have them yet.
    private func startStep(_ step: String) {
        guard startingStep == nil else { return }
        startingStep = step
        Task {
            defer { startingStep = nil }
            do {
                stepSet = try await PollyAPI.shared.startFlashSet(threadId: topicId, mode: "mixed", lessonStep: step)
            } catch PollyAPIError.http(409, _) {
                _ = try? await PollyAPI.shared.ensureLesson(topicId: topicId)
                stepError = "Polly is still making this lesson's cards. Try again in a moment."
            } catch {
                stepError = error.localizedDescription
            }
        }
    }
}

// MARK: - The topic quiz (star 1)

/// The quiz that earns a topic's first star is a written exchange: Polly asks,
/// you answer, "Done quiz" grades it. It used to happen in the chat window
/// under the topic; with that gone it has its own full-screen page, opened from
/// the Quiz step. Anything written to Polly on this topic before Direction 2b
/// is still here above it.
struct TopicQuizView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let topicId: String
    let title: String

    @State private var thread: PollyThread? = nil
    @State private var messages: [PollyMessage] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var grading = false
    @State private var loaded = false

    private var quizInProgress: Bool {
        let kind = thread?.pendingQuizKind
        return kind == "standard" || kind == "hard"
    }

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    IconCircleButton(systemImage: "xmark", fg: PollyTheme.text, cancelShortcut: true) { closeModal(dismiss) }
                    VStack(spacing: 3) {
                        Text(title).font(.system(size: 17, weight: .semibold)).tracking(-0.3)
                            .foregroundStyle(PollyTheme.text).lineLimit(1)
                        HStack(spacing: 5) {
                            StarRow(value: thread?.stars ?? 0, size: 10, gap: 2, locked: thread?.hardQuizCompletedAt != nil)
                            Text("· Quiz").font(.system(size: 12)).foregroundStyle(PollyTheme.text2)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    Color.clear.frame(width: 36, height: 36)
                }
                .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 10)

                ChatScrollView(messages: messages, busy: busy,
                               emptyHint: "Polly asks a few questions about this topic. Answer in your own words, then tap Done quiz.")

                if quizInProgress {
                    Button { completeQuiz() } label: {
                        HStack(spacing: 8) {
                            Image(systemName: grading ? "hourglass" : "checkmark.circle.fill").font(.system(size: 14, weight: .bold))
                            Text(grading ? "Grading…" : "Done quiz").font(.system(size: 15, weight: .semibold))
                        }
                        .foregroundStyle(PollyTheme.inkOnAccent)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(busy || grading)
                    .padding(.horizontal, 14).padding(.top, 6)
                } else if loaded && !busy {
                    Button { quiz(kind: "standard") } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "questionmark.circle").font(.system(size: 14, weight: .bold))
                            Text((thread?.stars ?? 0) >= 1 ? "Quiz me again" : "Quiz me").font(.system(size: 15, weight: .semibold))
                        }
                        .foregroundStyle(PollyTheme.inkOnAccent)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(PollyTheme.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 14).padding(.top, 6)
                }
                PollyComposer(draft: $draft, busy: busy, placeholder: "Your answer…", onSend: send)
            }
            .pollyContentColumn()
        }
        .task {
            if let t = try? await PollyAPI.shared.getThread(id: topicId) {
                thread = t
                messages = t.messages
            }
            loaded = true
            // Straight into the quiz the first time: that's what the tile said.
            if !quizInProgress, messages.isEmpty { quiz(kind: "standard") }
        }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        busy = true
        messages.append(PollyMessage(role: "user", text: text, createdAt: Date()))
        Task {
            do {
                let res = try await PollyAPI.shared.sendMessage(text: text, threadId: topicId, model: PollyChatModel.current.rawValue)
                if !res.reply.isEmpty {
                    messages.append(PollyMessage(role: "assistant", text: res.reply, createdAt: Date()))
                }
                // Reflection-quiz turns return a thread_state snapshot — both
                // when the quiz starts (pending_quiz_kind=reflection) and when
                // it completes on the user's reply (pending cleared, stars+1,
                // hard_quiz_completed_at set). Mirror it locally so the header
                // stars + locked state update without a refetch.
                if let st = res.threadState, var t = thread {
                    t.pendingQuizKind = st.pendingQuizKind
                    t.stars = st.stars
                    t.quizCount = st.quizCount
                    t.hardQuizCompletedAt = st.hardQuizCompletedAt
                    thread = t
                    // On completion, the user's level may have ticked up.
                    if st.pendingQuizKind == nil {
                        await session.refreshProgress()
                    }
                }
            } catch {
                messages.append(PollyMessage(role: "assistant",
                                          text: "(error: \(error.localizedDescription))",
                                          createdAt: Date()))
            }
            busy = false
        }
    }

    private func quiz(kind: String) {
        guard !busy else { return }
        busy = true
        let prompt = kind == "hard" ? "Give me the Hard Quiz." : "Quiz me on this topic."
        messages.append(PollyMessage(role: "user", text: prompt, createdAt: Date()))
        Task {
            do {
                let res = try await PollyAPI.shared.quizMe(id: topicId, kind: kind, model: PollyChatModel.current.rawValue)
                if !res.reply.isEmpty {
                    messages.append(PollyMessage(role: "assistant", text: res.reply, createdAt: Date()))
                }
                if var t = thread {
                    if let s = res.stars { t.stars = s }
                    if let c = res.quizCount { t.quizCount = c }
                    if let h = res.hardQuizCompletedAt { t.hardQuizCompletedAt = h }
                    // Server set pending state; mirror it locally so the Done
                    // chip renders without waiting for another fetch.
                    t.pendingQuizKind = res.pendingQuizKind ?? kind
                    t.lastQuizzedAt = Date()
                    thread = t
                }
                // No level change yet — quiz hasn't been "completed".
            } catch {
                messages.append(PollyMessage(role: "assistant",
                                          text: "(error: \(error.localizedDescription))",
                                          createdAt: Date()))
            }
            busy = false
        }
    }

    /// User hit "Done quiz". For Quiz 1 / Hard the server just awards the
    /// star. For Quiz 2 the server grades the conversation first; we surface
    /// the result inline as an F2 message so the user knows why they did or
    /// didn't earn the next star.
    private func completeQuiz() {
        guard !busy && !grading else { return }
        grading = true
        Task {
            do {
                let res = try await PollyAPI.shared.completeQuiz(id: topicId)
                if var t = thread {
                    if let s = res.stars { t.stars = s }
                    if let c = res.quizCount { t.quizCount = c }
                    if let h = res.hardQuizCompletedAt { t.hardQuizCompletedAt = h }
                    t.pendingQuizKind = nil
                    thread = t
                }
                // Inline result message — gives the user a clear signal
                // whether the Done tap earned a star or not.
                let resultText = describeQuizResult(res)
                if !resultText.isEmpty {
                    messages.append(PollyMessage(role: "assistant", text: resultText, createdAt: Date()))
                }
                // Refresh user-wide progress (level may have ticked up).
                await session.refreshProgress()
            } catch {
                messages.append(PollyMessage(role: "assistant",
                                          text: "(error: \(error.localizedDescription))",
                                          createdAt: Date()))
            }
            grading = false
        }
    }

    /// Renders the result of a /quiz/complete call as a short F2 message.
    /// Quiz 1 and Hard quizzes return passed:true with no accepted/total —
    /// emit a quiet acknowledgement. Quiz 2 returns accepted/total — show
    /// the score either way so the user knows what just happened.
    private func describeQuizResult(_ res: PollyAPI.QuizCompleteResponse) -> String {
        let passed = res.passed ?? true
        if let accepted = res.accepted, let total = res.total {
            if passed {
                return "Nice — you got \(accepted) of \(total) right. You earned a star."
            } else {
                return "You got \(accepted) of \(total) — need 3 to earn the star. Try again whenever you'd like."
            }
        }
        if passed {
            return "Star earned. Nice work."
        }
        return ""
    }
}
