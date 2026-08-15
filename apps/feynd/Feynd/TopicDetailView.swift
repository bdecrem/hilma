import SwiftUI

/// Topic detail — matches `TopicConvoScreen` in feynd-screens.jsx.
/// Custom back/title/kebab header, source card, conversation, action chips,
/// flat composer. No iOS chrome.
struct TopicDetailView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let topicId: String

    @State private var thread: F2Thread? = nil
    @State private var messages: [F2Message] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var loading = true
    @State private var voicePresented = false
    @State private var playerPresented = false
    @State private var flashPresented = false
    @State private var finalReviewPresented = false
    @State private var finalReviewVariant: FinalReviewView.Variant = .full
    @State private var secondChanceDialogPresented = false

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                // No column clamp — bubbles + composer grow with the window.
                if let t = thread, t.url != nil, let host = t.sourceHost {
                    SourceCard(
                        title: t.topic ?? host,
                        host: host,
                        letter: String((t.topic ?? host).prefix(1)).uppercased()
                    )
                    .padding(.bottom, 4)
                }

                recertBanner

                if loading && thread == nil {
                    ProgressView().tint(FeyndTheme.text2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ChatScrollView(messages: messages, busy: busy)
                }

                chipRow
                FeyndComposer(draft: $draft, busy: busy, onSend: send)

                Color.clear.frame(height: 86) // room for floating TabPill
            }
        }
        .sheet(isPresented: $voicePresented) {
            VoiceSessionView(mode: "topic", threadId: topicId)
        }
        .sheet(isPresented: $flashPresented) {
            FlashCardsView(topicId: topicId, topicLabel: thread?.topic ?? "Topic")
                .environment(session)
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
        .task { await load() }
    }

    // MARK: - Header (back / center title)

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            IconCircleButton(systemImage: "chevron.left", fg: FeyndTheme.text) { dismiss() }

            VStack(spacing: 4) {
                Text(thread?.topic ?? "Topic")
                    .font(.system(size: 17, weight: .semibold))
                    .tracking(-0.3)
                    .foregroundStyle(FeyndTheme.text)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    StarRow(value: thread?.stars ?? 0, size: 10, gap: 2, locked: thread?.hardQuizCompletedAt != nil)
                    if let host = thread?.sourceHost {
                        Text("·").foregroundStyle(FeyndTheme.text3)
                        Text(host)
                            .italic()
                            .foregroundStyle(FeyndTheme.text2)
                    } else if let count = thread?.quizCount, count > 0 {
                        Text("·").foregroundStyle(FeyndTheme.text3)
                        Text("\(count) \(count == 1 ? "quiz" : "quizzes")")
                            .foregroundStyle(FeyndTheme.text2)
                    }
                    if let t = thread, t.isCertified, !t.recertLapsed, !t.recertDueSoon,
                       let due = t.recertDueAt {
                        Text("·").foregroundStyle(FeyndTheme.text3)
                        Text("renews \(due.formatted(.dateTime.month(.abbreviated).day()))")
                            .foregroundStyle(FeyndTheme.text3)
                    }
                }
                .font(.system(size: 12))
                .tracking(-0.1)
            }
            .frame(maxWidth: .infinity)

            // Trailing controls: copy-the-chat + the chat-model picker.
            HStack(spacing: 8) {
                CopyChatButton(messages: messages)
                ModelPickerMenu(style: .icon)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 14)
    }

    /// Star 3's gate: stars 1+2 earned, not yet mastered.
    /// The recert nudge above the conversation: an alert card once the badge
    /// has dimmed, a soft one-liner in the final week. Both start the
    /// 3-question refresher directly.
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
                        .foregroundStyle(FeyndTheme.gold.opacity(0.55))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Your mastery badge dimmed")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(FeyndTheme.text)
                        Text("A 5-minute refresher — 3 questions — brings back the gold.")
                            .font(.system(size: 12.5))
                            .foregroundStyle(FeyndTheme.text2)
                    }
                    Spacer()
                    Text("Refresh")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(FeyndTheme.inkOnAccent)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(FeyndTheme.accent, in: Capsule())
                }
                .padding(12)
                .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.gold.opacity(0.4), lineWidth: 1))
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
                        .foregroundStyle(FeyndTheme.gold)
                    Text("Refresher due \(dueInWords(due)) — 3 questions keeps the badge gold.")
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(FeyndTheme.text2)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.borderSoft, lineWidth: 1))
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

                    if canTakeFinalReview {
                        ActionChip(label: "Final Review", systemImage: "checkmark.seal.fill", iconTint: FeyndTheme.gold) {
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

                    if thread?.isCertified == true {
                        ActionChip(label: "Refresher", systemImage: "arrow.clockwise",
                                   iconTint: (thread?.recertLapsed == true || thread?.recertDueSoon == true) ? FeyndTheme.gold : FeyndTheme.accent) {
                            finalReviewVariant = .recert
                            finalReviewPresented = true
                        }
                        .opacity(busy ? 0.5 : 1)
                        .allowsHitTesting(!busy)
                    }

                    ActionChip(label: "Talk to Dodo", systemImage: "mic.fill") {
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

                // Source link — icon-only so it never crowds the main chips.
                if let urlString = thread?.url, let url = URL(string: urlString) {
                    IconCircleButton(systemImage: "arrow.up.right", fg: FeyndTheme.text2) {
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
            let t = try await F2API.shared.getThread(id: topicId)
            thread = t
            messages = t.messages
        } catch {
            messages = []
        }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        busy = true
        messages.append(F2Message(role: "user", text: text, createdAt: Date()))
        Task {
            do {
                let res = try await F2API.shared.sendMessage(text: text, threadId: topicId, model: F2ChatModel.current.rawValue)
                if !res.reply.isEmpty {
                    messages.append(F2Message(role: "assistant", text: res.reply, createdAt: Date()))
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
                messages.append(F2Message(role: "assistant",
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
        messages.append(F2Message(role: "user", text: prompt, createdAt: Date()))
        Task {
            do {
                let res = try await F2API.shared.quizMe(id: topicId, kind: kind, model: F2ChatModel.current.rawValue)
                if !res.reply.isEmpty {
                    messages.append(F2Message(role: "assistant", text: res.reply, createdAt: Date()))
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
                messages.append(F2Message(role: "assistant",
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
                let res = try await F2API.shared.completeQuiz(id: topicId)
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
                    messages.append(F2Message(role: "assistant", text: resultText, createdAt: Date()))
                }
                // Refresh user-wide progress (level may have ticked up).
                await session.refreshProgress()
            } catch {
                messages.append(F2Message(role: "assistant",
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
    private func describeQuizResult(_ res: F2API.QuizCompleteResponse) -> String {
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
