import SwiftUI

/// A quiz: one question at a time. A listening question plays its sound on the piano as it
/// comes up (Hear it again replays it); an answer locks in, the right option lights in `signal`,
/// one line says why, then Next. The end shows the score and, after the ear check, the level.
struct QuizScreen: View {
    let app: AppModel
    let session: QuizSession
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: "Leave the quiz") {
                    app.leaveQuiz()
                }
                Text(session.mode == .placement ? "Ear check" : "Today's five")
                    .font(.display(compact ? 34 : 44))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                StaffLines()
                    .frame(maxWidth: .infinity)
            }
            .padding(.top, compact ? 8 : 24)

            ProgressDots(session: session)
                .padding(.top, 18)

            if let q = session.current {
                question(q, compact: compact)
            } else {
                summary(compact: compact)
            }
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }

    @ViewBuilder private func question(_ q: Question, compact: Bool) -> some View {
        Text(q.kind == .listen ? "Listen" : "The blues")
            .dataLabel(11)
            .foregroundStyle(Palette.muted)
            .padding(.top, 24)
        Text(q.prompt)
            .bodyText(compact ? 22 : 26, weight: .semibold, relativeTo: .title2)
            .foregroundStyle(Palette.text)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 6)
        if q.sound != nil {
            QuietButton(title: "Hear it again") { app.playCurrent() }
                .padding(.top, 14)
        }
        VStack(spacing: 10) {
            ForEach(Array(q.options.enumerated()), id: \.offset) { i, option in
                OptionButton(title: option, state: optionState(q, i)) { app.answer(i) }
            }
        }
        .padding(.top, 22)
        if session.answered {
            let right = session.results[q.id] == true
            Text((right ? "Right. " : "Not quite. ") + q.explain)
                .bodyText(15)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 16)
        }
        Spacer(minLength: 16)
        if session.answered {
            PrimaryButton(title: session.index == session.questions.count - 1 ? "See how you did" : "Next") { app.nextQuestion() }
                .padding(.bottom, compact ? 8 : 24)
        }
    }

    @ViewBuilder private func summary(compact: Bool) -> some View {
        let level = app.progress.snapshot.quiz.level
        Text("\(session.score) of \(session.questions.count)")
            .font(.display(compact ? 64 : 80))
            .foregroundStyle(Palette.signal)
            .padding(.top, 28)
        if session.mode == .placement, let level {
            Text(level.title)
                .bodyText(compact ? 22 : 26, weight: .semibold, relativeTo: .title2)
                .foregroundStyle(Palette.text)
                .padding(.top, 8)
            Text(level.line)
                .bodyText(15)
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
        } else {
            Text(session.score == session.questions.count ? "All five." : "The ones you missed come back first next time.")
                .bodyText(17, weight: .semibold)
                .foregroundStyle(Palette.text)
                .padding(.top, 8)
        }
        let streak = app.progress.streak()
        HStack(spacing: 10) {
            WeekLEDs(days: Set(app.progress.snapshot.days))
            Text("\(streak)-day streak")
                .dataLabel(12, weight: .semibold)
                .foregroundStyle(Palette.text)
        }
        .padding(.top, 22)
        Spacer(minLength: 16)
        PrimaryButton(title: "Done") { app.leaveQuiz() }
            .padding(.bottom, compact ? 8 : 24)
    }

    private func optionState(_ q: Question, _ i: Int) -> OptionButton.State {
        guard session.answered, let chosen = session.choices.last else { return .open }
        if i == q.answer { return .right }
        return i == chosen ? .wrong : .other
    }
}

/// One square per question: done ones filled, the current one lit.
private struct ProgressDots: View {
    let session: QuizSession

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<session.questions.count, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(i < session.index ? Palette.text.opacity(0.6) : i == session.index ? Palette.signal : Palette.line)
                    .frame(height: 6)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Question \(min(session.index + 1, session.questions.count)) of \(session.questions.count)")
    }
}

/// An answer. After answering: the right one in `signal`, a wrong pick crossed out, the rest dim.
/// (Never red and green: the palette has one accent for "this".)
private struct OptionButton: View {
    enum State { case open, right, wrong, other }
    let title: String
    let state: State
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        Button(action: action) {
            HStack {
                Text(title)
                    .bodyText(18, weight: .semibold)
                    .strikethrough(state == .wrong)
                    .foregroundStyle(state == .right ? Palette.blackKey : state == .open ? Palette.text : Palette.muted)
                Spacer()
                if state == .right { Image(systemName: "checkmark").font(.system(size: 16, weight: .bold)).foregroundStyle(Palette.blackKey) }
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 56)
            .background(shape.fill(state == .right ? Palette.signal : Palette.panel))
            .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        // Not .disabled: that dims the right answer too. The session ignores a second answer.
        .allowsHitTesting(state == .open)
        .accessibilityLabel(title + (state == .right ? ", right answer" : state == .wrong ? ", your answer, wrong" : ""))
    }
}
