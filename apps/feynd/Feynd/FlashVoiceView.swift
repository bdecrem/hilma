import SwiftUI

/// A voice flash set, end to end: run the Realtime quizmaster session over
/// the picked deck, then grade the transcript server-side and show the same
/// results screen the other modes use. Works for topic sets and Jumbo voice
/// levels alike.
struct FlashVoiceView: View {
    let start: FlashStart
    let topicLabel: String?
    var onRecorded: (FlashSubmitResult) -> Void = { _ in }

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    private enum Phase: Equatable {
        case talking
        case grading
        case results(FlashSubmitResult)
        case error(String)
    }

    @State private var phase: Phase = .talking

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            switch phase {
            case .talking:
                VoiceSessionView(
                    mode: "flash",
                    threadId: start.threadId,
                    cardIds: start.questions.map(\.cardId),
                    title: start.jumboLevel != nil
                        ? "Jumbo · Level \(start.jumboLevel!)"
                        : "Flash round" + (topicLabel.map { " · \($0)" } ?? "")
                ) { voiceSessionId in
                    guard let voiceSessionId else {
                        closeModal(dismiss)   // abandoned via X
                        return
                    }
                    grade(voiceSessionId)
                }
            case .grading:
                VStack(spacing: 16) {
                    ProgressView().tint(FeyndTheme.accent).scaleEffect(1.4)
                    Text("Dodo is scoring your round…")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(FeyndTheme.text2)
                }
            case .results(let r):
                FlashResultsView(result: r, jumboLevel: start.jumboLevel, mode: "voice") {
                    closeModal(dismiss)
                }
            case .error(let msg):
                VStack(spacing: 14) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 28))
                        .foregroundStyle(FeyndTheme.accent)
                    Text(msg)
                        .font(.system(size: 14))
                        .foregroundStyle(FeyndTheme.text2)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)
                    Button("Close") { closeModal(dismiss) }.keyboardShortcut(.cancelAction)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FeyndTheme.accent)
                }
            }
        }
        .interactiveDismissDisabled(phase == .grading)
    }

    private func grade(_ voiceSessionId: String) {
        phase = .grading
        Task {
            do {
                let result = try await F2API.shared.submitVoiceFlashSet(
                    threadId: start.threadId,
                    jumboLevel: start.jumboLevel,
                    cardIds: start.questions.map(\.cardId),
                    voiceSessionId: voiceSessionId
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
}

/// The star-3 oral exam: a Final Review voice session followed by an A–F
/// grade reveal. An A awards the third star and marks the topic mastered.
/// The `.secondChance` variant runs the 3-question retake instead; passing
/// it awards the star exactly like a full pass.
struct FinalReviewView: View {
    enum Variant: Equatable {
        case full
        case secondChance
        /// The recertification refresher — 3 questions, B renews the badge.
        case recert
    }

    let topicId: String
    let topicLabel: String
    var onGraded: (FinalReviewResult) -> Void = { _ in }

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    private enum Phase: Equatable {
        case talking
        case grading
        case graded(FinalReviewResult)
        case error(String)
    }

    @State private var phase: Phase = .talking
    @State private var revealed = false
    @State private var showBreakdown = false
    @State private var variant: Variant
    @State private var offerPresented = false

    init(
        topicId: String,
        topicLabel: String,
        variant: Variant = .full,
        onGraded: @escaping (FinalReviewResult) -> Void = { _ in }
    ) {
        self.topicId = topicId
        self.topicLabel = topicLabel
        self.onGraded = onGraded
        _variant = State(initialValue: variant)
    }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            switch phase {
            case .talking:
                VoiceSessionView(
                    mode: variant == .secondChance ? "second_chance"
                        : variant == .recert ? "recert" : "final_review",
                    threadId: topicId,
                    title: (variant == .secondChance ? "Second Chance · "
                        : variant == .recert ? "Refresher · " : "Final Review · ") + topicLabel
                ) { voiceSessionId in
                    guard let voiceSessionId else {
                        closeModal(dismiss)
                        return
                    }
                    grade(voiceSessionId)
                }
            case .grading:
                VStack(spacing: 16) {
                    ProgressView().tint(FeyndTheme.gold).scaleEffect(1.4)
                    Text("Tallying your grade…")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(FeyndTheme.text2)
                }
            case .graded(let r):
                gradeReveal(r)
            case .error(let msg):
                VStack(spacing: 14) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 28))
                        .foregroundStyle(FeyndTheme.accent)
                    Text(msg)
                        .font(.system(size: 14))
                        .foregroundStyle(FeyndTheme.text2)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)
                    Button("Close") { closeModal(dismiss) }.keyboardShortcut(.cancelAction)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FeyndTheme.accent)
                }
            }
        }
        .interactiveDismissDisabled(phase == .grading)
    }

    private func renewalDateSuffix(_ r: FinalReviewResult) -> String {
        guard let due = r.recertDueAt else { return "" }
        let fmt = DateFormatter()
        fmt.dateFormat = "MMM d"
        return " until \(fmt.string(from: due))"
    }

    private func gradeReveal(_ r: FinalReviewResult) -> some View {
        // (SFX for the reveal fires in onAppear below, with the animation.)
        ZStack {
            ScrollView {
                VStack(spacing: 18) {
                    Text(variant == .secondChance ? "SECOND CHANCE"
                        : variant == .recert ? "REFRESHER" : "FINAL REVIEW")
                        .font(.system(size: 12, weight: .heavy))
                        .tracking(1.6)
                        .foregroundStyle(FeyndTheme.text3)
                        .padding(.top, 60)
                    Text(topicLabel)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)

                    // The big letter.
                    ZStack {
                        Circle()
                            .fill(r.passed ? FeyndTheme.gold.opacity(0.14) : FeyndTheme.surface)
                            .frame(width: 160, height: 160)
                            .overlay(Circle().stroke(r.passed ? FeyndTheme.gold : FeyndTheme.border, lineWidth: 2))
                        Text(r.grade)
                            .font(.system(size: 84, weight: .bold))
                            .foregroundStyle(r.passed ? FeyndTheme.gold : FeyndTheme.text)
                    }
                    .scaleEffect(revealed ? 1 : 0.4)
                    .opacity(revealed ? 1 : 0)
                    .padding(.vertical, 8)

                    if r.passed {
                        HStack(spacing: 8) {
                            Image(systemName: variant == .recert ? "seal.fill" : "star.fill")
                                .foregroundStyle(FeyndTheme.gold)
                            Text(variant == .recert
                                ? "Badge renewed — gold\(renewalDateSuffix(r))!"
                                : "Third star earned — topic mastered!")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(FeyndTheme.text)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 11)
                        .background(FeyndTheme.surface, in: Capsule())
                        .overlay(Capsule().stroke(FeyndTheme.gold.opacity(0.4), lineWidth: 1))
                    } else {
                        Text(variant == .recert
                            ? "Not this time — the badge stays dim. Retake whenever you're ready; a B renews it."
                            : variant == .secondChance
                            ? "Not this time — study the weak spots and take the Final Review again."
                            : "An A earns the star. Review and come back — the material isn't going anywhere.")
                            .font(.system(size: 13.5))
                            .foregroundStyle(FeyndTheme.text2)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    if !r.notes.isEmpty {
                        Text(r.notes)
                            .font(.system(size: 14))
                            .lineSpacing(3)
                            .foregroundStyle(FeyndTheme.text2)
                            .multilineTextAlignment(.leading)
                            .padding(14)
                            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.borderSoft, lineWidth: 1))
                            .padding(.horizontal, 22)
                    }

                    if !(r.strengths ?? []).isEmpty || !(r.weaknesses ?? []).isEmpty {
                        Button {
                            showBreakdown = true
                        } label: {
                            HStack(spacing: 7) {
                                Image(systemName: "chart.bar.doc.horizontal")
                                    .font(.system(size: 13, weight: .semibold))
                                Text("Strengths & weaknesses")
                                    .font(.system(size: 14, weight: .semibold))
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 11, weight: .semibold))
                            }
                            .foregroundStyle(FeyndTheme.accent)
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .sheet(isPresented: $showBreakdown) {
                            FinalReviewBreakdownSheet(
                                topicLabel: topicLabel,
                                strengths: r.strengths ?? [],
                                weaknesses: r.weaknesses ?? []
                            )
                        }
                    }

                    Button {
                        // A failed full attempt with a Second Chance on offer:
                        // dismissing the grade pops the offer instead of closing.
                        if !r.passed, variant == .full, r.secondChance?.eligible == true {
                            offerPresented = true
                        } else {
                            closeModal(dismiss)
                        }
                    } label: {
                        Text("Done")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(FeyndTheme.inkOnAccent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(FeyndTheme.accent, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.cancelAction)
                    .padding(.horizontal, 22)
                    .padding(.top, 8)
                    .padding(.bottom, 40)
                }
            }
            .scrollIndicators(.hidden)

            if r.passed {
                ConfettiView()
                    .allowsHitTesting(false)
                    .ignoresSafeArea()
            }
        }
        .onAppear {
            FlashSFX.shared.play(r.passed ? .fanfare : .done)
            withAnimation(.spring(response: 0.55, dampingFraction: 0.65).delay(0.2)) {
                revealed = true
            }
        }
        .alert("Second Chance?", isPresented: $offerPresented) {
            Button("Take it now") { startSecondChance() }
            Button("Not now", role: .cancel) { closeModal(dismiss) }
        } message: {
            Text("Three questions on what you missed. Answer all three at A level and the star is yours. The offer stands for 24 hours.")
        }
    }

    /// Roll straight from the failed grade into the 3-question retake.
    private func startSecondChance() {
        variant = .secondChance
        revealed = false
        showBreakdown = false
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            phase = .talking
        }
    }

    private func grade(_ voiceSessionId: String) {
        phase = .grading
        Task {
            do {
                let result = try await F2API.shared.submitFinalReview(
                    topicId: topicId, voiceSessionId: voiceSessionId)
                onGraded(result)
                await session.refreshProgress()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    phase = .graded(result)
                }
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }
}

/// What the grader flagged as commanded vs needing review — reached from the
/// "Strengths & weaknesses" link on the grade card.
struct FinalReviewBreakdownSheet: View {
    let topicLabel: String
    let strengths: [String]
    let weaknesses: [String]

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(FeyndTheme.surface3)
                .frame(width: 38, height: 4)
                .padding(.top, 8)
                .frame(maxWidth: .infinity)

            Text("Strengths & weaknesses")
                .font(.system(size: 16, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(FeyndTheme.text)
                .padding(.top, 14)
            Text(topicLabel)
                .font(.system(size: 13))
                .foregroundStyle(FeyndTheme.text3)
                .lineLimit(1)
                .padding(.top, 2)
                .padding(.horizontal, 30)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if !strengths.isEmpty {
                        breakdownCard(
                            title: "You had this",
                            items: strengths,
                            icon: "checkmark.circle.fill",
                            tint: FeyndTheme.sprout
                        )
                    }
                    if !weaknesses.isEmpty {
                        breakdownCard(
                            title: "Review these",
                            items: weaknesses,
                            icon: "arrow.uturn.backward.circle.fill",
                            tint: FeyndTheme.accent
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            Button { closeModal(dismiss) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(width: 32, height: 32)
                    .background(FeyndTheme.surface2, in: Circle())
                    .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.cancelAction)
            .padding(.top, 12)
            .padding(.trailing, 14)
        }
        .presentationDetents([.medium, .large])
    }

    private func breakdownCard(title: String, items: [String], icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11.5, weight: .bold))
                .tracking(1.1)
                .foregroundStyle(FeyndTheme.text3)
                .padding(.leading, 6)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: icon)
                            .font(.system(size: 14))
                            .foregroundStyle(tint)
                        Text(item)
                            .font(.system(size: 14.5))
                            .lineSpacing(2)
                            .foregroundStyle(FeyndTheme.text)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    if idx < items.count - 1 {
                        Rectangle()
                            .fill(FeyndTheme.borderSoft)
                            .frame(height: 1)
                            .padding(.leading, 38)
                    }
                }
            }
            .padding(.vertical, 4)
            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.borderSoft, lineWidth: 1))
        }
    }
}
