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
                        dismiss()   // abandoned via X
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
                    dismiss()
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
                    Button("Close") { dismiss() }
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
struct FinalReviewView: View {
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

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            switch phase {
            case .talking:
                VoiceSessionView(
                    mode: "final_review",
                    threadId: topicId,
                    title: "Final Review · \(topicLabel)"
                ) { voiceSessionId in
                    guard let voiceSessionId else {
                        dismiss()
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
                    Button("Close") { dismiss() }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FeyndTheme.accent)
                }
            }
        }
        .interactiveDismissDisabled(phase == .grading)
    }

    private func gradeReveal(_ r: FinalReviewResult) -> some View {
        // (SFX for the reveal fires in onAppear below, with the animation.)
        ZStack {
            ScrollView {
                VStack(spacing: 18) {
                    Text("FINAL REVIEW")
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
                            Image(systemName: "star.fill")
                                .foregroundStyle(FeyndTheme.gold)
                            Text("Third star earned — topic mastered!")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(FeyndTheme.text)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 11)
                        .background(FeyndTheme.surface, in: Capsule())
                        .overlay(Capsule().stroke(FeyndTheme.gold.opacity(0.4), lineWidth: 1))
                    } else {
                        Text("An A earns the star. Review and come back — the material isn't going anywhere.")
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

                    Button {
                        dismiss()
                    } label: {
                        Text("Done")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(FeyndTheme.inkOnAccent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(FeyndTheme.accent, in: Capsule())
                    }
                    .buttonStyle(.plain)
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
