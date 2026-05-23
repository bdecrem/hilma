import SwiftUI

// Quiz tab — quizzes generated from the user's own Claude conversation
// history by scripts/quiz-me/. Two screens:
//   · List: titles + question count; taps open a runner.
//   · Runner: all MCQs rendered inline (parity with the web /quiz page),
//     client-side grading on Submit.
// No attempt persistence yet — first pass mirrors the web flow.

// MARK: - List

struct ClaudeQuizListView: View {
    @State private var quizzes: [ClaudeQuizSummary] = []
    @State private var loading = true
    @State private var errorText: String? = nil
    @State private var openQuizId: String? = nil

    private let accent = Color(red: 0.98, green: 0.55, blue: 0.20)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header spacer — `.padding(.top, 58)` on the TabView page clears
            // the top-right pill; this gives the title its own breathing room.
            VStack(alignment: .leading, spacing: 4) {
                Text("FEYND")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.5))
                    .tracking(0.8)
                Text("Quiz me")
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                Text("From conversations you've had with Claude.")
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.white.opacity(0.55))
                    .padding(.top, 2)
            }
            .padding(.horizontal, 18)
            .padding(.top, 4)
            .padding(.bottom, 18)

            if loading {
                Spacer()
                HStack { Spacer(); ProgressView().tint(.white.opacity(0.7)); Spacer() }
                Spacer()
            } else if let err = errorText {
                emptyState(
                    title: "Couldn't load quizzes",
                    body: err
                )
            } else if quizzes.isEmpty {
                emptyState(
                    title: "No quizzes yet",
                    body: "Run scripts/quiz-me/ to generate quizzes from your Claude history, then commit + push public/quiz-data/quizzes.json."
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(quizzes) { q in
                            Button {
                                openQuizId = q.id
                            } label: {
                                QuizCard(quiz: q, accent: accent)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
            }
        }
        .task { await load() }
        .sheet(item: Binding(
            get: { openQuizId.map { ClaudeQuizId(id: $0) } },
            set: { openQuizId = $0?.id }
        )) { wrapper in
            ClaudeQuizRunnerView(
                quizId: wrapper.id,
                onClose: { openQuizId = nil }
            )
        }
    }

    private func load() async {
        loading = true
        errorText = nil
        do {
            let out = try await FeyndAPI.listClaudeQuizzes()
            self.quizzes = out
            self.loading = false
        } catch {
            self.errorText = error.localizedDescription
            self.loading = false
        }
    }

    private func emptyState(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
            Text(body)
                .font(.system(size: 13, design: .rounded))
                .foregroundStyle(.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.05))
        )
        .padding(.horizontal, 14)
    }
}

private struct ClaudeQuizId: Identifiable, Hashable {
    let id: String
}

private struct QuizCard: View {
    let quiz: ClaudeQuizSummary
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(quiz.title)
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .multilineTextAlignment(.leading)
                .lineLimit(2)

            if let topic = quiz.topic, topic != quiz.title, !topic.isEmpty {
                Text(topic)
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(.white.opacity(0.55))
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
            }

            HStack(spacing: 6) {
                Image(systemName: "checklist")
                    .font(.system(size: 10, weight: .bold))
                Text("\(quiz.question_count) question\(quiz.question_count == 1 ? "" : "s")")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
            }
            .foregroundStyle(accent)
            .padding(.top, 4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}

// MARK: - Runner

struct ClaudeQuizRunnerView: View {
    let quizId: String
    let onClose: () -> Void

    @State private var quiz: ClaudeQuiz? = nil
    @State private var loading = true
    @State private var errorText: String? = nil

    // index-in-quiz → picked option index
    @State private var answers: [Int: Int] = [:]
    @State private var submitted = false

    private let accent = Color(red: 0.98, green: 0.55, blue: 0.20)

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.02, blue: 0.06), Color(red: 0.12, green: 0.04, blue: 0.24)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Divider().background(Color.white.opacity(0.1))

                if loading {
                    Spacer()
                    ProgressView().tint(.white.opacity(0.7))
                    Spacer()
                } else if let err = errorText {
                    Spacer()
                    Text(err)
                        .font(.system(size: 13, design: .rounded))
                        .foregroundStyle(.red.opacity(0.9))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                    Spacer()
                } else if let quiz {
                    content(for: quiz)
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await load() }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(.ultraThinMaterial))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text("QUIZ")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.5))
                    .tracking(0.8)
                Text(quiz?.title ?? "Loading…")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func content(for quiz: ClaudeQuiz) -> some View {
        ScrollView {
            VStack(spacing: 14) {
                // Summary banner.
                Text(quiz.summary)
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.white.opacity(0.7))
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.white.opacity(0.05))
                    )

                ForEach(Array(quiz.questions.enumerated()), id: \.offset) { idx, q in
                    QuestionCard(
                        index: idx,
                        question: q,
                        picked: answers[idx],
                        submitted: submitted,
                        accent: accent,
                        onPick: { pick in
                            if !submitted { answers[idx] = pick }
                        }
                    )
                }

                if submitted {
                    scoreCard(quiz: quiz)
                } else {
                    Button(action: { submitted = true }) {
                        Text("Submit")
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color(red: 0.14, green: 0.06, blue: 0.10))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(accent)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(answers.isEmpty)
                    .opacity(answers.isEmpty ? 0.5 : 1)
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
    }

    private func scoreCard(quiz: ClaudeQuiz) -> some View {
        let correct = (0..<quiz.questions.count).filter { idx in
            answers[idx] == quiz.questions[idx].answer_index
        }.count
        return HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Score")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.55))
                    .tracking(0.6)
                Text("\(correct) / \(quiz.questions.count)")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
            Spacer()
            Button(action: reset) {
                Text("Retry")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(accent)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Capsule().fill(accent.opacity(0.15)))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.08))
        )
    }

    private func reset() {
        answers = [:]
        submitted = false
    }

    private func load() async {
        loading = true
        errorText = nil
        do {
            let q = try await FeyndAPI.fetchClaudeQuiz(quizId)
            self.quiz = q
            self.loading = false
        } catch {
            self.errorText = error.localizedDescription
            self.loading = false
        }
    }
}

private struct QuestionCard: View {
    let index: Int
    let question: ClaudeQuizMCQ
    let picked: Int?
    let submitted: Bool
    let accent: Color
    let onPick: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(index + 1). \(question.q)")
                .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 8) {
                ForEach(Array(question.options.enumerated()), id: \.offset) { oi, opt in
                    OptionRow(
                        option: opt,
                        isPicked: picked == oi,
                        isCorrectAnswer: submitted && oi == question.answer_index,
                        isWrongPick: submitted && picked == oi && oi != question.answer_index,
                        submitted: submitted,
                        accent: accent,
                        onTap: { onPick(oi) }
                    )
                }
            }

            if submitted, let picked {
                let correct = picked == question.answer_index
                Text(feedback(correct: correct))
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(correct ? Color.green.opacity(0.85) : Color.red.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if submitted {
                Text("No answer given.")
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private func feedback(correct: Bool) -> String {
        if correct {
            return question.explanation.map { "Correct. \($0)" } ?? "Correct."
        }
        let right = question.options[question.answer_index]
        if let explanation = question.explanation, !explanation.isEmpty {
            return "Correct answer: \(right) — \(explanation)"
        }
        return "Correct answer: \(right)"
    }
}

private struct OptionRow: View {
    let option: String
    let isPicked: Bool
    let isCorrectAnswer: Bool
    let isWrongPick: Bool
    let submitted: Bool
    let accent: Color
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 10) {
                radio
                Text(option)
                    .font(.system(size: 13.5, design: .rounded))
                    .foregroundStyle(.white.opacity(submitted && !isCorrectAnswer && !isPicked ? 0.55 : 0.9))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(rowBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(rowBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(submitted)
    }

    private var radio: some View {
        ZStack {
            Circle()
                .stroke(isPicked ? accent : Color.white.opacity(0.35), lineWidth: 1.5)
                .frame(width: 16, height: 16)
            if isPicked {
                Circle()
                    .fill(accent)
                    .frame(width: 9, height: 9)
            }
        }
        .padding(.top, 2)
    }

    private var rowBackground: Color {
        if isCorrectAnswer { return Color.green.opacity(0.18) }
        if isWrongPick     { return Color.red.opacity(0.18) }
        if isPicked        { return accent.opacity(0.12) }
        return Color.white.opacity(0.03)
    }

    private var rowBorder: Color {
        if isCorrectAnswer { return Color.green.opacity(0.55) }
        if isWrongPick     { return Color.red.opacity(0.55) }
        if isPicked        { return accent.opacity(0.7) }
        return Color.white.opacity(0.06)
    }
}
