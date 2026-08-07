import SwiftUI
import UIKit

/// One flash set, start to finish: play the questions (multiple choice with
/// instant feedback, or type-your-answer), submit for grading, celebrate.
/// Used by both topic sets and Jumbo levels; voice sets route through
/// FlashVoiceView instead of the play phase.
struct FlashSetView: View {
    let start: FlashStart
    /// Topic name for the header; nil for Jumbo sets.
    let topicLabel: String?
    /// Called after a set was successfully recorded (refresh decks/maps).
    var onRecorded: (FlashSubmitResult) -> Void = { _ in }

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    private enum Phase: Equatable {
        case playing
        case grading
        case results(FlashSubmitResult)
        case error(String)
    }

    @State private var phase: Phase = .playing
    @State private var questions: [FlashQuestion]
    @State private var answers: [String?]
    @State private var index = 0
    /// Choice mode: the tapped choice for the current question while the
    /// right/wrong flash is showing. Nil = not yet answered.
    @State private var picked: String? = nil
    @State private var editTarget: FlashCard? = nil
    /// Optimistic per-card rating state, keyed by card id. Seeded from the
    /// questions the server sent so a card rated in an earlier round shows
    /// its state immediately.
    @State private var ratings: [String: String] = [:]
    @State private var draft = ""
    @FocusState private var draftFocused: Bool

    init(start: FlashStart, topicLabel: String?, onRecorded: @escaping (FlashSubmitResult) -> Void = { _ in }) {
        self.start = start
        self.topicLabel = topicLabel
        self.onRecorded = onRecorded
        _questions = State(initialValue: start.questions)
        _answers = State(initialValue: Array(repeating: nil, count: start.questions.count))
        var seeded: [String: String] = [:]
        for q in start.questions where q.rating != nil {
            seeded[q.cardId] = q.rating
        }
        _ratings = State(initialValue: seeded)
    }

    private var isChoice: Bool { start.mode == "choice" }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            switch phase {
            case .playing: playView
            case .grading: gradingView
            case .results(let r): FlashResultsView(
                result: r,
                jumboLevel: start.jumboLevel,
                mode: start.mode,
                onDone: { dismiss() }
            )
            case .error(let msg): errorView(msg)
            }
        }
        .sheet(item: $editTarget) { card in
            FlashCardEditSheet(card: card) { edited in
                applyEdit(edited)
            } onDelete: {
                applyDelete(card.id)
            }
        }
        .interactiveDismissDisabled(phase == .grading)
    }

    // MARK: - Play

    private var playView: some View {
        VStack(spacing: 0) {
            header
            progressRow
            Spacer(minLength: 8)
            if index < questions.count {
                questionCard(questions[index])
                Spacer(minLength: 8)
                if isChoice {
                    choiceButtons(questions[index])
                } else {
                    textAnswerRow
                }
            }
            Spacer(minLength: 24)
        }
        .padding(.horizontal, 18)
    }

    private var header: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(width: 32, height: 32)
                    .background(FeyndTheme.surface2, in: Circle())
                    .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            Spacer()
            VStack(spacing: 2) {
                Text(start.jumboLevel != nil ? "PECK · LEVEL \(start.jumboLevel!)" : "FLASH ROUND")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.2)
                    .foregroundStyle(FeyndTheme.accent)
                if let topicLabel {
                    Text(topicLabel)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(FeyndTheme.text2)
                        .lineLimit(1)
                }
            }
            Spacer()
            // Balance the X so the title stays centered.
            Color.clear.frame(width: 32, height: 32)
        }
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    /// Ten little segments that fill as you go — the "how far in am I" bar.
    private var progressRow: some View {
        HStack(spacing: 4) {
            ForEach(0..<questions.count, id: \.self) { i in
                Capsule()
                    .fill(i < index ? FeyndTheme.accent : (i == index ? FeyndTheme.accentDim : FeyndTheme.surface2))
                    .frame(height: 5)
            }
        }
        .animation(.easeOut(duration: 0.25), value: index)
        .padding(.top, 6)
    }

    private func questionCard(_ q: FlashQuestion) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text("\(index + 1) of \(questions.count)")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.4)
                    .foregroundStyle(FeyndTheme.text3)
                Spacer()
                thumbsRow(q)
                // Inline deck editing lives right here in the set UI.
                Button {
                    editTarget = FlashCard(
                        id: q.cardId,
                        question: q.question,
                        answer: q.answer ?? "",
                        distractors: (q.choices ?? []).filter { $0 != q.answer }
                    )
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .opacity(isChoice ? 1 : 0)   // text mode has no answer to edit safely
            }
            // Which topic this card belongs to — essential in Jumbo sets,
            // where "according to the book…" could mean any of the decks.
            if let cardTopic = q.topic ?? topicLabel {
                Text(cardTopic.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(FeyndTheme.text3)
                    .lineLimit(1)
                    .padding(.top, 8)
            }
            Text(q.question)
                .font(.system(size: 22, weight: .semibold))
                .tracking(-0.4)
                .lineSpacing(4)
                .foregroundStyle(FeyndTheme.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 6)
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 170, alignment: .topLeading)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(FeyndTheme.border, lineWidth: 1))
        .id(q.cardId) // fresh transition per card
        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                removal: .move(edge: .leading).combined(with: .opacity)))
    }

    // MARK: Rating the card

    /// Two verdicts only, by design: one thumb DOWN buries the card for good,
    /// and a DOUBLE thumbs up makes it a priority card. There is no single
    /// thumbs up — "fine, I guess" isn't a signal worth scheduling on.
    /// Tapping the state you're already in clears it, so neither is a trap.
    private func thumbsRow(_ q: FlashQuestion) -> some View {
        let rating = ratings[q.cardId]
        return HStack(spacing: 2) {
            Button { rate(q.cardId, rating == "down" ? nil : "down") } label: {
                Image(systemName: rating == "down" ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(rating == "down" ? Color(hex: 0xE0635A) : FeyndTheme.text3)
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(rating == "down" ? "Un-bury this card" : "Bury this card")

            Button { rate(q.cardId, rating == "priority" ? nil : "priority") } label: {
                DoubleThumbsUp(active: rating == "priority", size: 13)
                    .frame(minWidth: 36, minHeight: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(rating == "priority" ? "Remove priority" : "Mark as priority")
        }
        .animation(.easeOut(duration: 0.15), value: rating)
    }

    private func rate(_ cardId: String, _ rating: String?) {
        if let rating { ratings[cardId] = rating } else { ratings.removeValue(forKey: cardId) }
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
        Task {
            // Fire-and-forget: a failed rating shouldn't interrupt the round.
            // The optimistic state stands; the next set reloads server truth.
            try? await F2API.shared.rateFlashCard(cardId: cardId, rating: rating)
        }
    }

    // MARK: Choice mode

    private func choiceButtons(_ q: FlashQuestion) -> some View {
        VStack(spacing: 10) {
            ForEach(q.choices ?? [], id: \.self) { choice in
                Button {
                    pick(choice, for: q)
                } label: {
                    HStack {
                        Text(choice)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(choiceTextColor(choice, q: q))
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 8)
                        if picked != nil {
                            if choice == q.answer {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Color(hex: 0x46D18A))
                            } else if choice == picked {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(Color(hex: 0xE0635A))
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(choiceFill(choice, q: q), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(choiceStroke(choice, q: q), lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .disabled(picked != nil)
            }
        }
        .animation(.easeOut(duration: 0.18), value: picked)
    }

    private func choiceFill(_ choice: String, q: FlashQuestion) -> Color {
        guard picked != nil else { return FeyndTheme.surface }
        if choice == q.answer { return Color(hex: 0x46D18A).opacity(0.16) }
        if choice == picked { return Color(hex: 0xE0635A).opacity(0.14) }
        return FeyndTheme.surface
    }

    private func choiceStroke(_ choice: String, q: FlashQuestion) -> Color {
        guard picked != nil else { return FeyndTheme.border }
        if choice == q.answer { return Color(hex: 0x46D18A).opacity(0.8) }
        if choice == picked { return Color(hex: 0xE0635A).opacity(0.8) }
        return FeyndTheme.borderSoft
    }

    private func choiceTextColor(_ choice: String, q: FlashQuestion) -> Color {
        guard picked != nil else { return FeyndTheme.text }
        if choice == q.answer || choice == picked { return FeyndTheme.text }
        return FeyndTheme.text3
    }

    private func pick(_ choice: String, for q: FlashQuestion) {
        guard picked == nil else { return }
        picked = choice
        answers[index] = choice
        FlashSFX.shared.play(choice == q.answer ? .correct : .wrong)
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(choice == q.answer ? .success : .error)
        // Right answers move fast; misses linger so the correction registers.
        let delay: Double = choice == q.answer ? 0.7 : 1.5
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            advance()
        }
    }

    // MARK: Text mode

    private var textAnswerRow: some View {
        VStack(spacing: 10) {
            TextField("Type your answer…", text: $draft, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 16))
                .foregroundStyle(FeyndTheme.text)
                .tint(FeyndTheme.accent)
                .lineLimit(1...4)
                .focused($draftFocused)
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .background(FeyndTheme.bgRaised, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(FeyndTheme.border, lineWidth: 1))

            HStack(spacing: 10) {
                Button {
                    answers[index] = nil
                    draft = ""
                    advance()
                } label: {
                    Text("Skip")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 12)
                        .background(FeyndTheme.surface2, in: Capsule())
                }
                .buttonStyle(.plain)

                Button {
                    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    answers[index] = text.isEmpty ? nil : text
                    draft = ""
                    advance()
                } label: {
                    Text(index == questions.count - 1 ? "Finish" : "Next")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(FeyndTheme.inkOnAccent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(FeyndTheme.accent, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
            }
        }
        .onAppear { draftFocused = true }
    }

    // MARK: Flow

    private func advance() {
        picked = nil
        if index + 1 < questions.count {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                index += 1
            }
            if !isChoice { draftFocused = true }
        } else {
            submit()
        }
    }

    private func submit() {
        phase = .grading
        Task {
            do {
                let payload = zip(questions, answers).map {
                    F2API.FlashAnswer(card_id: $0.cardId, answer: $1)
                }
                let result = try await F2API.shared.submitFlashSet(
                    mode: start.mode,
                    threadId: start.threadId,
                    jumboLevel: start.jumboLevel,
                    answers: Array(payload)
                )
                onRecorded(result)
                await session.refreshProgress()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    phase = .results(result)
                }
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }

    // MARK: Card edits mid-set

    private func applyEdit(_ card: FlashCard) {
        guard let i = questions.firstIndex(where: { $0.cardId == card.id }) else { return }
        var choices = card.distractors + [card.answer]
        choices.shuffle()
        questions[i] = FlashQuestion(
            cardId: card.id,
            question: card.question,
            choices: isChoice ? choices : nil,
            answer: isChoice ? card.answer : nil,
            rating: ratings[card.id],
            topic: questions[i].topic
        )
    }

    private func applyDelete(_ cardId: String) {
        guard let i = questions.firstIndex(where: { $0.cardId == cardId }) else { return }
        questions.remove(at: i)
        answers.remove(at: i)
        if questions.isEmpty {
            dismiss()
        } else if index >= questions.count {
            submit()
        }
    }

    // MARK: Grading / error

    private var gradingView: some View {
        VStack(spacing: 16) {
            ProgressView().tint(FeyndTheme.accent).scaleEffect(1.4)
            Text(start.mode == "text" ? "Dodo is grading your answers…" : "Tallying your round…")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(FeyndTheme.text2)
        }
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundStyle(FeyndTheme.accent)
            Text(msg)
                .font(.system(size: 14))
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            Button {
                submit()
            } label: {
                Text("Try again")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(FeyndTheme.inkOnAccent)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 12)
                    .background(FeyndTheme.accent, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Results

/// Score reveal: ring, XP count-up, star/level banners, misses, confetti on
/// a perfect round.
struct FlashResultsView: View {
    let result: FlashSubmitResult
    let jumboLevel: Int?
    /// Mode the set was played in — the Jumbo pass bar depends on it
    /// (voice 7, text 8, choice 9).
    var mode: String = "choice"
    let onDone: () -> Void

    @State private var ringProgress: CGFloat = 0
    @State private var shownXp = 0

    private var isPerfect: Bool { result.total > 0 && result.score == result.total }
    private var fraction: CGFloat { result.total > 0 ? CGFloat(result.score) / CGFloat(result.total) : 0 }
    private var passedJumbo: Bool {
        jumboLevel != nil && result.total >= 10 && result.score >= jumboPassScore(mode: mode)
    }

    var body: some View {
        ZStack {
            ScrollView {
                VStack(spacing: 18) {
                    Text(headline)
                        .font(.system(size: 26, weight: .bold))
                        .tracking(-0.5)
                        .foregroundStyle(FeyndTheme.text)
                        .padding(.top, 40)

                    scoreRing

                    // XP pill — counts up so it feels like winnings.
                    HStack(spacing: 6) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(FeyndTheme.gold)
                        Text("+\(shownXp) XP")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(FeyndTheme.text)
                            .contentTransition(.numericText())
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .background(FeyndTheme.surface, in: Capsule())
                    .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))

                    banners

                    if !misses.isEmpty {
                        missList
                    }

                    Button(action: onDone) {
                        Text("Done")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(FeyndTheme.inkOnAccent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(FeyndTheme.accent, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 6)
                    .padding(.bottom, 40)
                }
                .padding(.horizontal, 22)
            }
            .scrollIndicators(.hidden)

            if isPerfect {
                ConfettiView()
                    .allowsHitTesting(false)
                    .ignoresSafeArea()
            }
        }
        .task {
            FlashSFX.shared.play(isPerfect ? .fanfare : .done)
            withAnimation(.spring(response: 0.9, dampingFraction: 0.8).delay(0.15)) {
                ringProgress = fraction
            }
            // XP count-up in ~12 steps.
            let step = max(1, result.xpAwarded / 12)
            while shownXp < result.xpAwarded {
                try? await Task.sleep(for: .milliseconds(45))
                withAnimation(.linear(duration: 0.04)) {
                    shownXp = min(result.xpAwarded, shownXp + step)
                }
            }
        }
    }

    private var headline: String {
        if isPerfect { return "Perfect!" }
        if fraction >= 0.9 { return "So close to perfect!" }
        if fraction >= 0.7 { return "Nice round!" }
        if fraction >= 0.4 { return "Getting there." }
        return "Tough round."
    }

    private var scoreRing: some View {
        ZStack {
            Circle()
                .stroke(FeyndTheme.surface2, lineWidth: 12)
            Circle()
                .trim(from: 0, to: ringProgress)
                .stroke(
                    isPerfect ? FeyndTheme.gold : FeyndTheme.accent,
                    style: StrokeStyle(lineWidth: 12, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text("\(result.score)")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundStyle(FeyndTheme.text)
                Text("of \(result.total)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text3)
            }
        }
        .frame(width: 150, height: 150)
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private var banners: some View {
        if result.star2Awarded {
            bannerRow(icon: "star.fill", tint: FeyndTheme.gold,
                      text: "Second star earned — two 9+ rounds in a row!")
        } else if result.consecutiveHighSets == 1 && (result.stars ?? 2) < 2 && jumboLevel == nil {
            bannerRow(icon: "flame.fill", tint: FeyndTheme.accent,
                      text: "9+ round! One more in a row for the second star.")
        }
        if passedJumbo {
            bannerRow(icon: "checkmark.seal.fill", tint: FeyndTheme.gold,
                      text: "Level \(jumboLevel!) cleared — the path continues!")
        }
    }

    private func bannerRow(icon: String, tint: Color, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(tint)
            Text(text)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FeyndTheme.text)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(tint.opacity(0.35), lineWidth: 1))
    }

    private var misses: [FlashResultRow] { result.results.filter { !$0.correct } }

    private var missList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("TO REVIEW")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.0)
                .foregroundStyle(FeyndTheme.text3)
            ForEach(misses) { m in
                VStack(alignment: .leading, spacing: 5) {
                    Text(m.question)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text)
                    Text(m.answer)
                        .font(.system(size: 13.5))
                        .foregroundStyle(FeyndTheme.accent)
                    if let given = m.given, !given.isEmpty {
                        Text("You said: \(given)")
                            .font(.system(size: 12.5))
                            .foregroundStyle(FeyndTheme.text3)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(13)
                .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(FeyndTheme.borderSoft, lineWidth: 1))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Confetti (perfect rounds)

/// Lightweight falling confetti — 46 pieces on fixed pseudo-random tracks,
/// driven by TimelineView. No physics engine, no external deps.
struct ConfettiView: View {
    private let colors: [Color] = [
        FeyndTheme.accent, FeyndTheme.gold, Color(hex: 0x46D18A),
        Color(hex: 0x6FB3FF), Color(hex: 0xF6C46A),
    ]

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { ctx, size in
                let t = timeline.date.timeIntervalSinceReferenceDate
                for i in 0..<46 {
                    // Deterministic per-piece params from the index.
                    let fi = Double(i)
                    let x0 = size.width * (0.06 + 0.88 * frac(fi * 0.6180339887))
                    let speed = 90.0 + 130.0 * frac(fi * 0.7548776662)
                    let phase = frac(fi * 0.3247179572) * 6.28
                    let sway = 18.0 + 26.0 * frac(fi * 0.207879576)
                    let fall = (t * speed + fi * 61).truncatingRemainder(dividingBy: Double(size.height) + 80) - 40
                    let x = x0 + sin(t * 1.7 + phase) * sway
                    let rot = t * (1.5 + frac(fi * 0.91)) + phase
                    let w = 7.0 + 5.0 * frac(fi * 0.53)
                    var rect = ctx
                    rect.translateBy(x: x, y: fall)
                    rect.rotate(by: .radians(rot))
                    rect.fill(
                        Path(roundedRect: CGRect(x: -w / 2, y: -w / 4, width: w, height: w / 2), cornerRadius: 1.5),
                        with: .color(colors[i % colors.count].opacity(0.9))
                    )
                }
            }
        }
    }

    private func frac(_ v: Double) -> Double { v - v.rounded(.down) }
}
