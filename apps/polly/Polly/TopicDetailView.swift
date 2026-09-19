import SwiftUI

/// Topic detail — matches `TopicConvoScreen` in feynd-screens.jsx.
/// Custom back/title/kebab header, source card, conversation, action chips,
/// flat composer. No iOS chrome.
struct TopicDetailView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let topicId: String
    /// True when this is a "Just chat" session: the topic behind it is a
    /// placeholder, and Back asks whether to name it or discard it.
    var quickChat: Bool = false

    @State private var thread: PollyThread? = nil
    @State private var lessonPresented = false
    @State private var showInfinitySessions = false
    @State private var infinityRefresh = 0
    @State private var lessonLoading = false
    /// A lesson Polly wrote: the step whose card set is being fetched, the
    /// set once it is, and the Talk step's voice session.
    @State private var startingStep: String? = nil
    @State private var stepSet: FlashStart? = nil
    @State private var stepError: String? = nil
    @State private var talkPresented = false
    @State private var messages: [PollyMessage] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var loading = true
    @State private var voicePresented = false
    @State private var playerPresented = false
    @State private var flashPresented = false
    @State private var quotesPresented = false
    /// Mirror of the server-side Refresher toggle (Profile keeps it fresh).
    @AppStorage("recertEnabled") private var recertEnabledPref = true
    @State private var finalReviewPresented = false
    @State private var finalReviewVariant: FinalReviewView.Variant = .full
    @State private var secondChanceDialogPresented = false
    @State private var contextPresented = false
    /// Redraw hook for the first-session banner's dismissal.
    @State private var firstSessionDismissed = false
    // Quick-chat exit: name it (rename + keep) or discard (delete for good).
    @State private var keepChatPrompt = false
    @State private var topicNameDraft = ""
    @State private var closingQuickChat = false

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                // Infinity Chat: the normal chat window, with a prominent study
                // bar on top and the chip pills hidden.
                if thread?.isInfinity == true {
                    InfinityChatBar(topicId: topicId, refresh: infinityRefresh) { showInfinitySessions = true }
                        .padding(.bottom, 4)
                }

                // No column clamp — bubbles + composer grow with the window.
                if let t = thread, t.url != nil, let host = t.sourceHost {
                    SourceCard(
                        title: t.topic ?? host,
                        host: host,
                        letter: String((t.topic ?? host).prefix(1)).uppercased()
                    )
                    .padding(.bottom, 4)
                }

                // A guest lesson's plan — host, key words — one tap from the
                // whole thing. Appears as soon as the backend has extracted it.
                if let t = thread, t.isGuestLesson {
                    LessonCard(lesson: t.lesson, loading: lessonLoading) { lessonPresented = true }
                        .padding(.bottom, 4)
                }

                // A lesson Polly wrote: its scene and its three steps.
                if let t = thread, t.isPollyLesson {
                    LessonStepsCard(thread: t, startingStep: startingStep,
                                    onPlan: { lessonPresented = true },
                                    onTalk: { talkPresented = true },
                                    onCards: { startStep($0) })
                        .padding(.bottom, 4)
                }

                if thread?.isInfinity != true {
                    if thread?.isPollyLesson != true { firstSessionBanner }
                    recertBanner
                }

                if loading && thread == nil {
                    ProgressView().tint(PollyTheme.text2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    if thread?.isPollyLesson == true {
                        ChatScrollView(messages: messages, busy: busy,
                                       emptyHint: "Read the lesson, then do the three steps in any order. Ask me anything about it here.")
                    } else if thread?.isInfinity == true {
                        ChatScrollView(messages: messages, busy: busy,
                                       emptyHint: "Just chat — messy is good, mix in English. Type “Polly …” to ask me to do something. Clean up and quiz from the bar up top.")
                    } else {
                        ChatScrollView(messages: messages, busy: busy)
                    }
                }

                if thread?.isInfinity != true { chipRow }
                PollyComposer(draft: $draft, busy: busy, onSend: send)

                Color.clear.frame(height: 86) // room for floating TabPill
            }
        }
        .sheet(isPresented: $showInfinitySessions, onDismiss: { infinityRefresh += 1 }) {
            InfinityHomeView(topicId: topicId, title: thread?.topic ?? "Infinity Chat").environment(session)
        }
        .sheet(isPresented: $voicePresented) {
            VoiceSessionView(mode: "topic", threadId: topicId)
        }
        // The Talk step: ending the call uploads the transcript, the server
        // marks the step, and the reload picks it up.
        .fullScreenCover(isPresented: $talkPresented) {
            VoiceSessionView(mode: "topic", threadId: topicId, title: thread?.topic) { _ in
                talkPresented = false
                Task { await load() }
            }
        }
        // The Words and Grammar steps: one card set each.
        .fullScreenCover(item: $stepSet) { start in
            FlashSetView(start: start, topicLabel: thread?.topic) { _ in
                Task { await load() }
            }
            .environment(session)
        }
        .alert("Cards", isPresented: Binding(get: { stepError != nil }, set: { if !$0 { stepError = nil } })) {
            Button("OK") { stepError = nil }
        } message: {
            Text(stepError ?? "")
        }
        .sheet(isPresented: $lessonPresented) {
            if let lesson = thread?.lesson {
                LessonSheet(topicLabel: thread?.topic ?? "Topic", lesson: lesson)
            }
        }
        .sheet(isPresented: $contextPresented) {
            TopicContextSheet(topicId: topicId,
                              topicLabel: thread?.topic ?? "Topic",
                              seedFocus: thread?.studyFocus)
                .environment(session)
        }
        .alert("Keep this chat?", isPresented: $keepChatPrompt) {
            TextField("Topic name", text: $topicNameDraft)
            Button("Save topic") { finishQuickChat(keep: true) }
            Button("Discard chat", role: .destructive) { finishQuickChat(keep: false) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Give it a name to keep it as a topic — or discard it for good.")
        }
        .sheet(isPresented: $flashPresented) {
            FlashCardsView(topicId: topicId, topicLabel: thread?.topic ?? "Topic")
                .environment(session)
        }
        .sheet(isPresented: $quotesPresented) {
            PebblesView(threadId: topicId, topicLabel: thread?.topic)
        }
        .fullScreenCover(isPresented: $finalReviewPresented) {
            FinalReviewView(
                topicId: topicId,
                topicLabel: thread?.topic ?? "Topic",
                variant: finalReviewVariant
            ) { result in
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
        .confirmationDialog(
            "You've earned a Second Chance",
            isPresented: $secondChanceDialogPresented,
            titleVisibility: .visible
        ) {
            Button("Second Chance — 3 questions") {
                finalReviewVariant = .secondChance
                finalReviewPresented = true
            }
            Button("Full Final Review") {
                finalReviewVariant = .full
                finalReviewPresented = true
            }
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
            await load()
            // Arriving via the card clinic's "Discuss with Dodo": the
            // composer opens prefilled; the user edits and sends.
            if let text = DeepLinkRouter.shared.consumeChatDraft(threadId: topicId) {
                draft = text
            }
            #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
            // `-OpenFlashCards 1` (with `-OpenTopic <id>`) — straight to this
            // topic's flash hub for screenshot loops.
            if UserDefaults.standard.bool(forKey: "OpenFlashCards") {
                UserDefaults.standard.removeObject(forKey: "OpenFlashCards")
                try? await Task.sleep(for: .milliseconds(600))
                flashPresented = true
            }
            // `-OpenVoice 1` — this topic's voice session (with `-OpenTopic <id>`).
            if UserDefaults.standard.bool(forKey: "OpenVoice") {
                UserDefaults.standard.removeObject(forKey: "OpenVoice")
                try? await Task.sleep(for: .milliseconds(600))
                voicePresented = true
            }
            // `-OpenFinalReview 1` — this topic's final review (the oral
            // exam) as the user would start it, for the showcase captures.
            if UserDefaults.standard.bool(forKey: "OpenFinalReview") {
                UserDefaults.standard.removeObject(forKey: "OpenFinalReview")
                try? await Task.sleep(for: .milliseconds(600))
                finalReviewVariant = .full
                finalReviewPresented = true
            }
            // `-OpenTopicQuotes 1` — this topic's Quotes shelf.
            if UserDefaults.standard.bool(forKey: "OpenTopicQuotes") {
                UserDefaults.standard.removeObject(forKey: "OpenTopicQuotes")
                try? await Task.sleep(for: .milliseconds(600))
                quotesPresented = true
            }
            // `-OpenLesson 1` — a guest lesson's plan sheet (waits for the
            // plan to load first).
            if UserDefaults.standard.bool(forKey: "OpenLesson") {
                UserDefaults.standard.removeObject(forKey: "OpenLesson")
                for _ in 0..<50 where thread?.lesson == nil {
                    try? await Task.sleep(for: .milliseconds(200))
                }
                try? await Task.sleep(for: .milliseconds(400))
                lessonPresented = true
            }
            #endif
        }
    }

    // MARK: - Header (back / center title)

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            IconCircleButton(systemImage: "chevron.left", fg: PollyTheme.text) { back() }

            VStack(spacing: 4) {
                Text(thread?.topic ?? "Topic")
                    .font(.system(size: 17, weight: .semibold))
                    .tracking(-0.3)
                    .foregroundStyle(PollyTheme.text)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    StarRow(value: thread?.stars ?? 0, size: 10, gap: 2, locked: thread?.hardQuizCompletedAt != nil)
                    if let host = thread?.sourceHost {
                        Text("·").foregroundStyle(PollyTheme.text3)
                        Text(host)
                            .italic()
                            .foregroundStyle(PollyTheme.text2)
                    } else if let count = thread?.quizCount, count > 0 {
                        Text("·").foregroundStyle(PollyTheme.text3)
                        Text("\(count) \(count == 1 ? "quiz" : "quizzes")")
                            .foregroundStyle(PollyTheme.text2)
                    }
                    if let t = thread, t.isCertified, !t.recertLapsed, !t.recertDueSoon,
                       let due = t.recertDueAt {
                        Text("·").foregroundStyle(PollyTheme.text3)
                        Text("renews \(due.formatted(.dateTime.month(.abbreviated).day()))")
                            .foregroundStyle(PollyTheme.text3)
                    }
                }
                .font(.system(size: 12))
                .tracking(-0.1)
            }
            .frame(maxWidth: .infinity)

            // Trailing control: the chat-model picker. (Copy is per-message
            // now — long-press any bubble; select normally on the Mac.)
            HStack(spacing: 8) {
                ModelPickerMenu(style: .icon)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 14)
    }

    /// Back: normal topics just pop. A quick chat with something in it asks
    /// to be named or discarded; an untouched one is discarded silently.
    private func back() {
        guard quickChat else { dismiss(); return }
        guard !closingQuickChat else { return }
        if messages.contains(where: { $0.role == "user" }) {
            topicNameDraft = ""
            keepChatPrompt = true
        } else {
            finishQuickChat(keep: false)
        }
    }

    /// Resolve the quick chat: rename the placeholder (keep) or delete it
    /// (discard), then pop. Both calls are quick; awaiting them keeps the
    /// Topics list consistent when it reloads on appear.
    private func finishQuickChat(keep: Bool) {
        closingQuickChat = true
        Task {
            if keep {
                let name = topicNameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty {
                    try? await PollyAPI.shared.renameTopic(id: topicId, to: name, kind: nil)
                }
            } else {
                try? await PollyAPI.shared.deleteTopic(id: topicId)
            }
            dismiss()
        }
    }

    /// Star 3's gate: stars 1+2 earned, not yet mastered.
    /// The recert nudge above the conversation: an alert card once the badge
    /// has dimmed, a soft one-liner in the final week. Both start the
    /// 3-question refresher directly.
    /// Shown only in the session the topic was created in, until dismissed
    /// or until the topic has something to read. Offers the Context sheet;
    /// never opens it uninvited.
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

    /// Non-nil once this topic has a ready Audio Summary — drives the Play chip.
    private var audioSummaryURL: URL? {
        guard let a = thread?.audioSummary, a.status == "ready",
              let urlString = a.url else { return nil }
        return URL(string: urlString)
    }

    /// A standard or hard quiz the user already started but hasn't completed.
    /// Drives whether the chip row shows the start buttons or the Done button.
    /// Reflection quizzes deliberately don't trigger this — they complete on
    /// the user's next chat reply, no Done button needed.
    private var quizInProgress: Bool {
        let kind = thread?.pendingQuizKind
        return kind == "standard" || kind == "hard"
    }

    /// Quiz 2 grading can take a couple of seconds; show that state on the
    /// chip so the user doesn't think the button broke.
    @State private var grading = false

    /// The chip row scrolls horizontally — the ladder can put four chips
    /// here (Flash, Final Review, Talk, Play) and none may wrap or shrink.
    private var chipRow: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                if quizInProgress {
                    // Mid-quiz: only Done — the obvious primary action.
                    ActionChip(
                        label: grading ? "Grading…" : "Done quiz",
                        systemImage: grading ? "hourglass" : "checkmark.circle.fill"
                    ) {
                        completeQuiz()
                    }
                    .opacity((busy || grading) ? 0.5 : 1)
                    .allowsHitTesting(!busy && !grading)
                } else {
                    // Star 1 comes from the quiz; once it's earned the chip
                    // retires and the flash ladder takes over.
                    if (thread?.stars ?? 0) < 1 {
                        ActionChip(label: "Quiz me", systemImage: "questionmark.circle") {
                            quiz(kind: "standard")
                        }
                        .opacity(busy ? 0.5 : 1)
                        .allowsHitTesting(!busy)
                    }

                    ActionChip(label: "Flash", systemImage: "bolt.fill") {
                        flashPresented = true
                    }
                    .opacity(busy ? 0.5 : 1)
                    .allowsHitTesting(!busy)

                    // This topic's shelf of saved quotes (same data as the
                    // Pebbles carousel in Peck, filtered to one topic).
                    // Icon-only: the ❝ reads on its own, and the row is tight.
                    Button { quotesPresented = true } label: {
                        Image(systemName: "quote.opening")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(PollyTheme.accent)
                            .padding(.horizontal, 13)
                            .frame(height: 34)   // same height as ActionChip
                            .background(PollyTheme.surface, in: Capsule())
                            .overlay(Capsule().stroke(PollyTheme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("This topic's saved quotes")
                    .opacity(busy ? 0.5 : 1)
                    .allowsHitTesting(!busy)

                    if canTakeFinalReview {
                        ActionChip(label: "Final Review", systemImage: "checkmark.seal.fill", iconTint: PollyTheme.gold) {
                            // Within 24h of a failed 2nd+ attempt, offer the
                            // 3-question Second Chance alongside the full exam.
                            if thread?.secondChanceAvailable == true {
                                secondChanceDialogPresented = true
                            } else {
                                finalReviewVariant = .full
                                finalReviewPresented = true
                            }
                        }
                        .opacity(busy ? 0.5 : 1)
                        .allowsHitTesting(!busy)
                    }

                    if thread?.isCertified == true && recertEnabledPref {
                        ActionChip(label: "Refresher", systemImage: "arrow.clockwise",
                                   iconTint: (thread?.recertLapsed == true || thread?.recertDueSoon == true) ? PollyTheme.gold : PollyTheme.accent) {
                            finalReviewVariant = .recert
                            finalReviewPresented = true
                        }
                        .opacity(busy ? 0.5 : 1)
                        .allowsHitTesting(!busy)
                    }

                    ActionChip(label: "Talk to Polly", systemImage: "mic.fill") {
                        voicePresented = true
                    }
                    .opacity(busy ? 0.5 : 1)
                    .allowsHitTesting(!busy)

                    if audioSummaryURL != nil {
                        ActionChip(label: "Play", systemImage: "play.fill") {
                            playerPresented = true
                        }
                        .opacity(busy ? 0.5 : 1)
                        .allowsHitTesting(!busy)
                    }
                }

                // The topic's context — sources, notes, study focus. Lives
                // rightmost so it's reachable without leaving the chat.
                ActionChip(label: "Context", systemImage: "doc.text.magnifyingglass") {
                    contextPresented = true
                }

                // Source link — icon-only so it never crowds the main chips.
                if let urlString = thread?.url, let url = URL(string: urlString) {
                    IconCircleButton(systemImage: "arrow.up.right", fg: PollyTheme.text2) {
                        openURL(url)
                    }
                    .accessibilityLabel("Open source article")
                }
            }
            .padding(.horizontal, 14)
        }
        .scrollIndicators(.hidden)
        .padding(.top, 8)
    }

    // MARK: - Data

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let t = try await PollyAPI.shared.getThread(id: topicId)
            thread = t
            messages = t.messages
            if t.isGuestLesson, t.lesson == nil { await warmLesson() }
        } catch {
            messages = []
        }
    }

    /// A guest lesson opened before its plan exists: ask the backend to
    /// extract it now (one slow call) so the Lesson card fills in.
    /// Start the Words or Grammar step: a mixed set of that step's cards.
    /// The decks are built right after the lesson is written, so a lesson
    /// opened in its first seconds may not have them yet.
    private func startStep(_ step: String) {
        guard startingStep == nil else { return }
        startingStep = step
        Task {
            defer { startingStep = nil }
            do {
                stepSet = try await PollyAPI.shared.startFlashSet(threadId: topicId, mode: "mixed", lessonStep: step)
            } catch PollyAPIError.http(409, _) {
                // No cards for this step yet: they are being made, or their
                // build failed — the lesson route builds whatever is missing.
                _ = try? await PollyAPI.shared.ensureLesson(topicId: topicId)
                stepError = "Polly is still making this lesson's cards. Try again in a moment."
            } catch {
                stepError = error.localizedDescription
            }
        }
    }

    private func warmLesson() async {
        guard !lessonLoading else { return }
        lessonLoading = true
        defer { lessonLoading = false }
        if let lesson = try? await PollyAPI.shared.ensureLesson(topicId: topicId) {
            thread?.lesson = lesson
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
