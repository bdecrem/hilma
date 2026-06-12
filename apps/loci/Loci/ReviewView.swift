import SwiftUI

/// One review session: the due cards, one at a time. The user answers from
/// memory in their own words and the model grades it; "Show answer" is the
/// honest fallback (reveal + self-grade). Ends on a small summary screen.
struct ReviewView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    enum Phase: Equatable {
        case loading
        case empty
        case answering
        case grading
        case result(ReviewResult)
        case revealed            // self-grade path
        case done
    }

    @State private var queue: [Card] = []
    @State private var index = 0
    @State private var phase: Phase = .loading
    @State private var draft = ""
    @State private var errorNote: String? = nil
    @FocusState private var inputFocused: Bool

    // Session tallies for the summary screen.
    @State private var tally = [0, 0, 0]

    private var card: Card? { queue.indices.contains(index) ? queue[index] : nil }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                switch phase {
                case .loading:
                    Spacer()
                    ProgressView().tint(Theme.ink2)
                    Spacer()
                case .empty:
                    emptyState
                case .done:
                    summary
                default:
                    if let card {
                        cardView(card)
                    }
                }
            }
        }
    }

    // MARK: Top bar

    private var topBar: some View {
        VStack(spacing: 10) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink2)
                        .frame(width: 36, height: 36)
                        .background(Theme.raised, in: Circle())
                }
                .buttonStyle(.plain)
                Spacer()
                if !queue.isEmpty && phase != .done {
                    Text("\(min(index + 1, queue.count)) of \(queue.count)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink2)
                }
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }
            if !queue.isEmpty && phase != .done {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.raised)
                        Capsule()
                            .fill(Theme.moss)
                            .frame(width: geo.size.width * CGFloat(index) / CGFloat(max(1, queue.count)))
                    }
                }
                .frame(height: 3)
                .animation(.easeOut(duration: 0.3), value: index)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .task { await loadQueue() }
    }

    // MARK: Card

    @ViewBuilder
    private func cardView(_ card: Card) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let topic = card.topic {
                    Eyebrow(text: topic)
                        .padding(.top, 28)
                }

                Text(card.prompt)
                    .font(.system(size: 24, weight: .medium, design: .serif))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)

                switch phase {
                case .answering, .grading:
                    answerInput
                        .padding(.top, 28)
                case .result(let result):
                    resultPanel(result, card: card)
                        .padding(.top, 28)
                case .revealed:
                    revealPanel(card)
                        .padding(.top, 28)
                default:
                    EmptyView()
                }

                Color.clear.frame(height: 40)
            }
            .padding(.horizontal, 22)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }

    private var answerInput: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Answer from memory…", text: $draft, axis: .vertical)
                .lineLimit(3...8)
                .font(.system(size: 16))
                .foregroundStyle(Theme.ink)
                .focused($inputFocused)
                .padding(14)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border, lineWidth: 1))
                .disabled(phase == .grading)

            if let errorNote {
                Text(errorNote)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.clay)
            }

            PrimaryButton(
                label: phase == .grading ? "Checking…" : "Check my answer",
                disabled: phase == .grading || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ) {
                submit()
            }

            Button {
                phase = .revealed
                inputFocused = false
            } label: {
                Text("Show the answer instead")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink2)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
            .disabled(phase == .grading)
        }
    }

    // MARK: Result (LLM-graded)

    private func resultPanel(_ result: ReviewResult, card: Card) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            gradePill(result.grade)

            if let feedback = result.feedback, !feedback.isEmpty {
                Text(feedback)
                    .font(.system(size: 15))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(text: "The idea")
                Text(result.answer)
                    .font(.system(size: 15, design: .serif))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.borderSoft, lineWidth: 1))

            Text("You'll see this \(result.nextDueLabel).")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.ink3)

            PrimaryButton(label: index + 1 < queue.count ? "Next" : "Finish") {
                advance()
            }
        }
    }

    private func gradePill(_ grade: Int) -> some View {
        let (label, icon, color): (String, String, Color) = switch grade {
        case 2: ("Solid", "checkmark.circle.fill", Theme.solid)
        case 1: ("Shaky", "circle.bottomhalf.filled", Theme.ochre)
        default: ("Forgot", "arrow.counterclockwise.circle.fill", Theme.clay)
        }
        return HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 14, weight: .semibold))
            Text(label).font(.system(size: 14, weight: .semibold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(color.opacity(0.13), in: Capsule())
    }

    // MARK: Reveal + self-grade

    private func revealPanel(_ card: Card) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(text: "The idea")
                Text(card.answer)
                    .font(.system(size: 16, design: .serif))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border, lineWidth: 1))

            Text("Did you have it?")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.ink2)

            HStack(spacing: 8) {
                selfGradeButton("Forgot", grade: 0, color: Theme.clay)
                selfGradeButton("Shaky", grade: 1, color: Theme.ochre)
                selfGradeButton("Got it", grade: 2, color: Theme.solid)
            }
        }
    }

    private func selfGradeButton(_ label: String, grade: Int, color: Color) -> some View {
        Button {
            selfGrade(grade)
        } label: {
            Text(label)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(color)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    // MARK: Empty + summary

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 34))
                .foregroundStyle(Theme.moss)
            Text("Nothing due")
                .font(.system(size: 22, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Text("Come back when ideas are ready for review.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink2)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 32)
    }

    private var summary: some View {
        VStack(spacing: 0) {
            Spacer()
            Text("Done.")
                .font(.system(size: 40, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Text(summaryLine)
                .font(.system(size: 15, design: .serif))
                .italic()
                .foregroundStyle(Theme.ink2)
                .padding(.top, 10)

            HStack(spacing: 18) {
                summaryStat(tally[2], "solid", Theme.solid)
                summaryStat(tally[1], "shaky", Theme.ochre)
                summaryStat(tally[0], "forgot", Theme.clay)
            }
            .padding(.top, 28)

            Spacer()
            PrimaryButton(label: "Close") { dismiss() }
                .padding(.horizontal, 28)
                .padding(.bottom, 30)
        }
    }

    private var summaryLine: String {
        let total = tally.reduce(0, +)
        if tally[2] == total && total > 0 { return "All \(total) still with you." }
        return "\(total) \(total == 1 ? "idea" : "ideas") reviewed."
    }

    private func summaryStat(_ n: Int, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(n)")
                .font(.system(size: 24, weight: .semibold, design: .serif))
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.ink3)
        }
        .frame(minWidth: 60)
    }

    // MARK: Actions

    private func loadQueue() async {
        guard phase == .loading else { return }
        do {
            queue = try await API.shared.reviewQueue(limit: 20)
            phase = queue.isEmpty ? .empty : .answering
        } catch {
            phase = .empty
        }
    }

    private func submit() {
        guard let card else { return }
        let answer = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !answer.isEmpty else { return }
        phase = .grading
        errorNote = nil
        inputFocused = false
        Task {
            do {
                let result = try await API.shared.submitAnswer(cardId: card.id, answer: answer)
                tally[result.grade] += 1
                withAnimation(.easeOut(duration: 0.25)) { phase = .result(result) }
            } catch APIError.graderUnavailable {
                // Grader down — fall back to reveal + self-grade, nothing lost.
                withAnimation { phase = .revealed }
            } catch {
                errorNote = "Couldn't check that — try again."
                phase = .answering
            }
        }
    }

    private func selfGrade(_ grade: Int) {
        guard let card else { return }
        phase = .grading
        Task {
            do {
                let result = try await API.shared.submitSelfGrade(cardId: card.id, grade: grade)
                tally[result.grade] += 1
                withAnimation(.easeOut(duration: 0.25)) { phase = .result(result) }
            } catch {
                errorNote = "Couldn't save that — try again."
                phase = .revealed
            }
        }
    }

    private func advance() {
        draft = ""
        errorNote = nil
        if index + 1 < queue.count {
            index += 1
            withAnimation(.easeOut(duration: 0.25)) { phase = .answering }
        } else {
            withAnimation { phase = .done }
        }
    }
}
