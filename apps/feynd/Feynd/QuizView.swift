import SwiftUI

// Full-screen quiz sheet for a single course video. Fetches the cached quiz
// (lazy-generates on first open), walks the user through 6 multiple-choice
// questions, grades, shows a final score + per-question recap, and posts
// the attempt to the backend.

struct QuizView: View {
    let courseId: String
    let video: CourseVideo
    let onClose: () -> Void

    @State private var quiz: FeyndQuiz? = nil
    @State private var loading = true
    @State private var errorText: String? = nil

    @State private var currentIdx = 0
    @State private var selectedIdx: Int? = nil
    @State private var revealed = false
    @State private var answers: [Answer] = []
    @State private var finished = false
    @State private var submitting = false

    private let accent = Color(red: 0.98, green: 0.55, blue: 0.20)

    struct Answer: Identifiable {
        let id: String              // question.id
        let user_idx: Int
        let correct: Bool
        let question: FeyndQuizQuestion
    }

    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.02, blue: 0.06), Color(red: 0.12, green: 0.04, blue: 0.24)],
                startPoint: .top, endPoint: .bottom
            ).ignoresSafeArea()

            if loading {
                loadingState
            } else if let errorText {
                errorState(errorText)
            } else if let quiz {
                if finished {
                    resultsView(quiz)
                } else if currentIdx < quiz.questions.count {
                    questionView(quiz.questions[currentIdx], total: quiz.questions.count)
                } else {
                    loadingState
                }
            }

            closeButton
        }
        .preferredColorScheme(.dark)
        .task { await bootstrap() }
    }

    // MARK: States

    private var loadingState: some View {
        VStack(spacing: 14) {
            Spacer()
            ProgressView().tint(.white.opacity(0.7))
            Text("Writing your quiz…")
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.6))
            Text("First open can take ~10s while Opus reads the transcript.")
                .font(.system(size: 11, design: .rounded))
                .foregroundStyle(.white.opacity(0.4))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
    }

    private func errorState(_ msg: String) -> some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 36))
                .foregroundStyle(.red.opacity(0.8))
            Text("Couldn't load the quiz")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
            Text(msg)
                .font(.system(size: 12, design: .rounded))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
    }

    private var closeButton: some View {
        HStack {
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(.ultraThinMaterial))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
    }

    // MARK: Question

    private func questionView(_ q: FeyndQuizQuestion, total: Int) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text("Question \(currentIdx + 1) of \(total)")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(accent)
                        .tracking(0.4)
                    Spacer()
                    ProgressView(value: Double(currentIdx) / Double(total))
                        .progressViewStyle(.linear)
                        .tint(accent)
                        .frame(width: 80)
                }
                Text(video.title)
                    .font(.system(size: 12, design: .rounded))
                    .foregroundStyle(.white.opacity(0.45))
                    .lineLimit(1)
            }

            Text(q.q)
                .font(.system(size: 21, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
                .lineSpacing(3)

            VStack(spacing: 10) {
                ForEach(Array(q.options.enumerated()), id: \.offset) { idx, opt in
                    optionButton(q: q, idx: idx, text: opt)
                }
            }

            if revealed {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: selectedIdx == q.correct_idx ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(selectedIdx == q.correct_idx ? Color.green : Color.red.opacity(0.9))
                        Text(selectedIdx == q.correct_idx ? "Correct" : "Not quite")
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .foregroundStyle(.white)
                    }
                    Text(q.explanation)
                        .font(.system(size: 13, design: .rounded))
                        .foregroundStyle(.white.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                        .lineSpacing(2)
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.white.opacity(0.06))
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            Spacer()

            Button(action: advance) {
                Text(revealed ? (currentIdx + 1 == total ? "See results" : "Next question") : "Submit")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color(red: 0.14, green: 0.06, blue: 0.10))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Capsule().fill(canAdvance ? accent : Color.white.opacity(0.15)))
            }
            .buttonStyle(.plain)
            .disabled(!canAdvance)
        }
        .padding(.horizontal, 20)
        .padding(.top, 60)
        .padding(.bottom, 20)
    }

    private func optionButton(q: FeyndQuizQuestion, idx: Int, text: String) -> some View {
        let selected = selectedIdx == idx
        let isCorrect = idx == q.correct_idx
        let bgFill: Color = {
            if !revealed { return selected ? accent.opacity(0.25) : Color.white.opacity(0.06) }
            if isCorrect { return Color.green.opacity(0.22) }
            if selected && !isCorrect { return Color.red.opacity(0.22) }
            return Color.white.opacity(0.04)
        }()
        let strokeColor: Color = {
            if !revealed { return selected ? accent : Color.white.opacity(0.1) }
            if isCorrect { return Color.green.opacity(0.6) }
            if selected && !isCorrect { return Color.red.opacity(0.6) }
            return Color.white.opacity(0.08)
        }()

        return Button {
            if revealed { return }
            selectedIdx = idx
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Text(letterFor(idx))
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(selected || (revealed && isCorrect) ? accent : .white.opacity(0.5))
                    .frame(width: 22, height: 22)
                    .background(
                        Circle().fill((selected || (revealed && isCorrect)) ? accent.opacity(0.2) : Color.white.opacity(0.08))
                    )
                Text(text)
                    .font(.system(size: 14, design: .rounded))
                    .foregroundStyle(.white.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                Spacer()
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(bgFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(strokeColor, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(revealed)
    }

    private func letterFor(_ i: Int) -> String {
        ["A","B","C","D","E","F"][min(i, 5)]
    }

    private var canAdvance: Bool {
        selectedIdx != nil
    }

    private func advance() {
        guard let quiz else { return }
        if !revealed {
            guard let sel = selectedIdx else { return }
            let q = quiz.questions[currentIdx]
            let ans = Answer(id: q.id, user_idx: sel, correct: sel == q.correct_idx, question: q)
            answers.append(ans)
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                revealed = true
            }
            return
        }
        // Was revealed — move to next or finish.
        revealed = false
        selectedIdx = nil
        if currentIdx + 1 >= quiz.questions.count {
            finished = true
            Task { await submit() }
        } else {
            currentIdx += 1
        }
    }

    // MARK: Results

    private func resultsView(_ quiz: FeyndQuiz) -> some View {
        let correct = answers.filter { $0.correct }.count
        let total = answers.count
        let pct = total > 0 ? Int(Double(correct) / Double(total) * 100) : 0
        let headline: String
        switch pct {
        case 100:           headline = "Perfect."
        case 83...:         headline = "Nailed it."
        case 66...:         headline = "Solid."
        case 50...:         headline = "Getting there."
        default:            headline = "Rewatch & try again."
        }

        return ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 6) {
                    Text("\(correct) / \(total)")
                        .font(.system(size: 48, weight: .black, design: .rounded))
                        .foregroundStyle(accent)
                    Text(headline)
                        .font(.system(size: 18, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                    Text(video.title)
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
                .padding(.top, 50)

                VStack(spacing: 10) {
                    ForEach(answers) { a in
                        resultRow(a)
                    }
                }
                .padding(.horizontal, 16)

                VStack(spacing: 10) {
                    Button(action: { restart() }) {
                        Text("Retake quiz")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Capsule().fill(Color.white.opacity(0.1)))
                    }
                    .buttonStyle(.plain)

                    Button(action: onClose) {
                        Text("Done")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color(red: 0.14, green: 0.06, blue: 0.10))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Capsule().fill(accent))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)

                Spacer(minLength: 40)
            }
        }
        .scrollIndicators(.hidden)
    }

    private func resultRow(_ a: Answer) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: a.correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(a.correct ? Color.green : Color.red.opacity(0.9))
                .font(.system(size: 16))
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                Text(a.question.q)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                if !a.correct {
                    Text("You answered: " + a.question.options[a.user_idx])
                        .font(.system(size: 11, design: .rounded))
                        .foregroundStyle(.red.opacity(0.85))
                }
                Text("Correct: " + a.question.options[a.question.correct_idx])
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(.white.opacity(0.65))
            }
            Spacer()
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.04))
        )
    }

    private func restart() {
        currentIdx = 0
        selectedIdx = nil
        revealed = false
        answers = []
        finished = false
    }

    // MARK: Network

    private func bootstrap() async {
        do {
            let q = try await FeyndAPI.fetchQuiz(courseId: courseId, videoId: video.id)
            self.quiz = q
            self.loading = false
        } catch {
            self.errorText = error.localizedDescription
            self.loading = false
        }
    }

    private func submit() async {
        guard let quiz, !submitting else { return }
        submitting = true
        let payload: [[String: Any]] = answers.map { a in
            ["question_id": a.id, "user_idx": a.user_idx, "correct": a.correct]
        }
        let correct = answers.filter { $0.correct }.count
        do {
            _ = try await FeyndAPI.submitQuizAttempt(
                courseId: courseId,
                videoId: video.id,
                quizId: quiz.id,
                answers: payload,
                score: correct,
                total: answers.count
            )
        } catch {
            NSLog("FEYND_QUIZ_SUBMIT_ERR \(error)")
        }
        submitting = false
    }
}
