import SwiftUI

/// Daily Voice Checkin (2026-10-12): the 5 pm text carries one high-level
/// question about one active topic and a link here. Dodo asks the question
/// first thing, grades the answer pass/fail out loud, and on a fail explains
/// the idea and asks once more. After End the transcript is graded and the
/// day is recorded (an attempt counts toward the streak like a daily card).
struct VoiceCheckinView: View {
    let topicId: String
    let topicLabel: String

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    private enum Phase: Equatable {
        case talking
        case grading
        case result(VoiceCheckinResult)
        case error(String)
    }

    @State private var phase: Phase = .talking
    @State private var revealed = false
    @State private var reactivated = false

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            switch phase {
            case .talking:
                VoiceSessionView(mode: "voice_checkin", threadId: topicId, title: "Checkin · " + topicLabel) { voiceSessionId in
                    guard let voiceSessionId else { closeModal(dismiss); return }
                    grade(voiceSessionId)
                }
            case .grading:
                ZStack {
                    JellyBubbleBackdrop().ignoresSafeArea()
                    JellyGradingView(text: "Checking your answer…")
                }
            case .result(let r):
                resultView(r)
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
        #if targetEnvironment(simulator)
        // `-MockCheckinResult passed|second|failed|no_answer|inactive|grading` —
        // the result (or the wait) with no session, for screenshots.
        .onAppear {
            guard let m = UserDefaults.standard.string(forKey: "MockCheckinResult") else { return }
            UserDefaults.standard.removeObject(forKey: "MockCheckinResult")
            if m == "grading" { phase = .grading; return }
            // "second" = got it after the explanation, which is a fail since 2026-10-19
            let passed = m == "passed"
            let failed = m == "failed" || m == "second"
            phase = .result(VoiceCheckinResult(
                outcome: passed ? "passed" : failed ? "failed" : m == "inactive" ? "inactive" : "no_answer",
                passed: passed,
                passedOn: passed ? 1 : nil,
                attempts: passed ? 1 : failed ? 2 : 0,
                notes: passed ? "You had the main idea and the reason: one language and one bureaucracy ran every city, so orders meant the same thing everywhere."
                    : m == "second" ? "Your first answer named the conquests but not why the empire held. After the explanation you had it: the shared administration."
                    : m == "failed" ? "You described the conquests but not why the empire held together — the shared administration."
                    : m == "inactive" ? "You retired this topic." : "No answer came through this time.",
                question: "Why did Sargon's empire hold together when earlier city-states never had?",
                counted: passed || failed, streak: 5, xpAwarded: passed ? 30 : failed ? 10 : 0,
                inactive: m == "inactive",
                secondOk: m == "second",
                activelyRead: passed, peckLevel: passed ? 15 : nil, peckXp: passed ? 120 : nil))
        }
        #endif
    }

    private func grade(_ voiceSessionId: String) {
        phase = .grading
        Task {
            do {
                let r = try await F2API.shared.submitVoiceCheckin(topicId: topicId, voiceSessionId: voiceSessionId)
                await session.refreshProgress()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { phase = .result(r) }
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }

    @ViewBuilder
    private func resultView(_ r: VoiceCheckinResult) -> some View {
        ZStack {
            ScrollView {
                VStack(spacing: 18) {
                    Text("DAILY VOICE CHECKIN")
                        .font(.system(size: 12, weight: .heavy))
                        .tracking(1.6)
                        .foregroundStyle(FeyndTheme.text3)
                        .padding(.top, 60)
                    Text(topicLabel)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)

                    if r.outcome == "passed" || r.outcome == "failed" {
                        JellyGradeBall(grade: r.passed ? "✓" : "✗", passed: r.passed)
                            .scaleEffect(revealed ? 1 : 0.4)
                            .opacity(revealed ? 1 : 0)
                            .padding(.vertical, 8)
                    }

                    headline(r)

                    if !r.question.isEmpty && r.outcome != "inactive" {
                        Text(r.question)
                            .font(.system(size: 14, weight: .semibold))
                            .lineSpacing(3)
                            .foregroundStyle(FeyndTheme.text)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 30)
                    }

                    if !r.notes.isEmpty && (r.outcome == "passed" || r.outcome == "failed") {
                        Text(r.notes)
                            .font(.system(size: 14))
                            .lineSpacing(3)
                            .foregroundStyle(FeyndTheme.text2)
                            .padding(14)
                            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.borderSoft, lineWidth: 1))
                            .padding(.horizontal, 22)
                    }

                    if r.inactive && !reactivated {
                        Button {
                            Task {
                                try? await F2API.shared.setTopicKind(id: topicId, kind: "general")
                                reactivated = true
                            }
                        } label: {
                            Text("Actually, keep it active")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(FeyndTheme.accent)
                        }
                        .buttonStyle(.plain)
                    }

                    Button { closeModal(dismiss) } label: {
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
                ConfettiView().allowsHitTesting(false).ignoresSafeArea()
            }
        }
        .onAppear {
            FlashSFX.shared.play(r.passed ? .fanfare : .done)
            withAnimation(.spring(response: 0.5, dampingFraction: 0.48).delay(0.2)) { revealed = true }
        }
    }

    @ViewBuilder
    private func headline(_ r: VoiceCheckinResult) -> some View {
        if r.passed {
            VStack(spacing: 10) {
                pill(icon: "checkmark.seal.fill", text: "Passed")
                if r.activelyRead == true {
                    pill(icon: "star.fill", text: "Actively Read\(r.peckLevel.map { " · Peck level \($0) cleared" } ?? "")")
                }
                if r.counted {
                    pill(icon: "flame.fill", text: "\(r.streak)-day streak\(r.xpAwarded + (r.peckXp ?? 0) > 0 ? " · +\(r.xpAwarded + (r.peckXp ?? 0)) XP" : "")")
                }
            }
        } else {
            Text(r.outcome == "failed"
                 ? (r.secondOk == true
                    ? "You got it after the explanation. A pass has to come on the first answer, so this one is practice\(r.counted ? ", and it still counts: \(r.streak)-day streak, +\(r.xpAwarded) XP" : ""). Tomorrow brings a new question."
                    : r.counted ? "Not this time — but showing up counts: \(r.streak)-day streak, +\(r.xpAwarded) XP. Tomorrow brings a new question." : "Not this time. Tomorrow brings a new question.")
                 : r.outcome == "inactive"
                    ? (reactivated ? "It's active again." : "Got it. This topic is inactive now — no more daily questions on it.")
                    : "No answer came through. Open the checkin again when you have a minute.")
                .font(.system(size: 13.5))
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }

    private func pill(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).foregroundStyle(FeyndTheme.gold)
            Text(text)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(FeyndTheme.text)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(FeyndTheme.surface, in: Capsule())
        .overlay(Capsule().stroke(FeyndTheme.gold.opacity(0.4), lineWidth: 1))
    }
}

/// Item for the checkin cover (item-driven, so the topic is never read stale).
struct VoiceCheckinLaunch: Identifiable, Equatable {
    let threadId: String
    let label: String
    var id: String { threadId }
}
