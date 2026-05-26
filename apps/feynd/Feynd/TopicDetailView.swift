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
    @State private var showProfile = false

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                VStack(spacing: 0) {
                    if let t = thread, t.url != nil, let host = t.sourceHost {
                        SourceCard(
                            title: t.topic ?? host,
                            host: host,
                            letter: String((t.topic ?? host).prefix(1)).uppercased()
                        )
                        .padding(.bottom, 4)
                    }

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
                .feyndContentColumn()
            }
        }
        .sheet(isPresented: $showProfile) { ProfileSheet() }
        .sheet(isPresented: $voicePresented) {
            VoiceSessionView(mode: "topic", threadId: topicId)
        }
        .task { await load() }
    }

    // MARK: - Header (back / center / kebab)

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
                    StarRow(value: thread?.stars ?? 0, size: 10, gap: 2)
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
                }
                .font(.system(size: 12))
                .tracking(-0.1)
            }
            .frame(maxWidth: .infinity)

            IconCircleButton(systemImage: "ellipsis", fg: FeyndTheme.text2) { showProfile = true }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 14)
    }

    private var canTakeHardQuiz: Bool {
        (thread?.stars ?? 0) >= 2 && (thread?.hardQuizCompletedAt == nil)
    }

    /// A quiz the user already started but hasn't completed. Drives whether
    /// the chip row shows the start buttons or the Done button.
    private var quizInProgress: Bool {
        thread?.pendingQuizKind != nil
    }

    private var chipRow: some View {
        HStack(spacing: 8) {
            if quizInProgress {
                // Mid-quiz: only Done. Coral coral so it's the obvious primary action.
                ActionChip(label: "Done quiz", systemImage: "checkmark.circle.fill") {
                    completeQuiz()
                }
                .opacity(busy ? 0.5 : 1)
                .allowsHitTesting(!busy)
            } else {
                ActionChip(label: "Quiz me", systemImage: "questionmark.circle") {
                    quiz(kind: "standard")
                }
                .opacity(busy ? 0.5 : 1)
                .allowsHitTesting(!busy)

                if canTakeHardQuiz {
                    // Single-word label so the chip never wraps to two lines
                    // when the row gets crowded on narrower screens.
                    ActionChip(label: "Hard", systemImage: "flame.fill", iconTint: FeyndTheme.gold) {
                        quiz(kind: "hard")
                    }
                    .opacity(busy ? 0.5 : 1)
                    .allowsHitTesting(!busy)
                }

                ActionChip(label: "Talk to F2", systemImage: "mic.fill") {
                    voicePresented = true
                }
                .opacity(busy ? 0.5 : 1)
                .allowsHitTesting(!busy)
            }

            Spacer()

            // Source link — icon-only so it never crowds the main chips.
            if let urlString = thread?.url, let url = URL(string: urlString) {
                IconCircleButton(systemImage: "arrow.up.right", fg: FeyndTheme.text2) {
                    openURL(url)
                }
                .accessibilityLabel("Open source article")
            }
        }
        .padding(.horizontal, 14)
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
                let reply = try await F2API.shared.sendMessage(text: text, threadId: topicId)
                if !reply.isEmpty {
                    messages.append(F2Message(role: "assistant", text: reply, createdAt: Date()))
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
                let res = try await F2API.shared.quizMe(id: topicId, kind: kind)
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

    /// User hit "Done quiz". Award the star, clear the pending state, and
    /// refresh user-wide progress (this is the moment the level can rise).
    private func completeQuiz() {
        guard !busy else { return }
        busy = true
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
                // Now is the right moment — star was just awarded.
                await session.refreshProgress()
            } catch {
                messages.append(F2Message(role: "assistant",
                                          text: "(error: \(error.localizedDescription))",
                                          createdAt: Date()))
            }
            busy = false
        }
    }
}
