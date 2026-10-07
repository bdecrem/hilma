import SwiftUI
import Observation

/// Actively Read (2026-10-07): once a day the server picks one of the user's
/// topics that isn't Actively Read yet. The app offers it in the main UI's
/// one banner slot; tapping it (or the push, or the iMessage link) opens an
/// `actively_read` voice session where "I'm ready" starts a three-question
/// test. A- or better: first star + the next Peck level.
@Observable
@MainActor
final class ActivelyReadStore {
    static let shared = ActivelyReadStore()
    private(set) var pick: ActivelyReadPick?

    /// Quiet refresh: a failure keeps what we had.
    func refresh() async {
        #if targetEnvironment(simulator)
        // `-MockActivelyRead "<topic>"` — a banner with no server pick, for screenshots.
        if let mock = UserDefaults.standard.string(forKey: "MockActivelyRead") {
            pick = ActivelyReadPick(day: Self.today, threadId: UserDefaults.standard.string(forKey: "MockActivelyReadId") ?? "mock", topic: mock, resolved: nil)
            return
        }
        #endif
        do { pick = try await F2API.shared.activelyReadPick() } catch { /* keep what we had */ }
    }

    func clearLocally(threadId: String) {
        if pick?.threadId == threadId { pick = nil }
    }

    static var today: String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "America/Los_Angeles")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}

/// "Today's read: Sargon of Akkad. Talk it through, then take the quick test."
/// Same quiet card as the streak and refresher banners, in the sky colour.
struct ActivelyReadBanner: View {
    let pick: ActivelyReadPick

    @AppStorage("activelyReadBannerDismissed") private var dismissed = ""
    @State private var declining = false

    static let sky = Color(hex: 0x4A9BE8)
    static let dismissKey = "activelyReadBannerDismissed"

    /// Shown while today's pick is open and not dismissed for the day.
    static func isActive(_ pick: ActivelyReadPick?) -> Bool {
        guard let pick, pick.resolved == nil else { return false }
        return UserDefaults.standard.string(forKey: dismissKey) != pick.day
    }

    var body: some View {
        Button {
            DeepLinkRouter.shared.requestActivelyRead(threadId: pick.threadId, label: pick.topic)
        } label: {
            HStack(alignment: .top, spacing: 11) {
                Image(systemName: "book.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Self.sky)
                    .frame(width: 28, height: 28)
                    .background(Self.sky.opacity(0.14), in: Circle())

                VStack(alignment: .leading, spacing: 5) {
                    (Text("Today's read: ").foregroundColor(FeyndTheme.text2)
                     + Text(pick.topic).bold().foregroundColor(FeyndTheme.text)
                     + Text(". Talk it through, then take the quick test.").foregroundColor(FeyndTheme.text2))
                        .font(.system(size: 13.5))
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button {
                        decline()
                    } label: {
                        Text(declining ? "Taking it off…" : "Not interested")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(FeyndTheme.text3)
                            .underline()
                    }
                    .buttonStyle(.plain)
                    .disabled(declining)
                }

                Button {
                    withAnimation(.easeOut(duration: 0.2)) { dismissed = pick.day }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9.5, weight: .bold))
                        .foregroundStyle(FeyndTheme.text3)
                        .frame(width: 26, height: 26)
                        .background(FeyndTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss for today")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(Self.sky.opacity(0.4), lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func decline() {
        declining = true
        Task {
            try? await F2API.shared.declineActivelyRead(threadId: pick.threadId)
            withAnimation(.easeOut(duration: 0.2)) { ActivelyReadStore.shared.clearLocally(threadId: pick.threadId) }
            await ActivelyReadStore.shared.refresh()
            declining = false
        }
    }
}

/// The main UI's one banner slot. Several things can be pending at once —
/// today's read, a Peck streak at risk, a refresher due this week — but only
/// the most important undismissed one shows; dismissing it reveals the next.
struct HomeBannerSlot: View {
    let jumbo: JumboState?
    let topics: [F2Topic]
    /// Topics tab can push into a topic; Peck renders the refresher card without navigation.
    var navigable: Bool = false

    // Observed so a dismissal anywhere re-evaluates the slot.
    @AppStorage(ActivelyReadBanner.dismissKey) private var arDismissed = ""
    @AppStorage("peckWeekBannerDismissed") private var peckDismissed = ""
    @AppStorage("thisWeekBannerDismissed") private var weekDismissed = ""

    var body: some View {
        let pick = ActivelyReadStore.shared.pick
        Group {
            if ActivelyReadBanner.isActive(pick), let pick {
                ActivelyReadBanner(pick: pick)
            } else if PeckWeekBanner.isActive(jumbo) {
                PeckWeekBanner(state: jumbo)
            } else if ThisWeekBanner.isActive(topics) {
                ThisWeekBanner(topics: topics, navigable: navigable)
            }
        }
        .transition(.opacity)
        .animation(.easeOut(duration: 0.2), value: pick)
        .animation(.easeOut(duration: 0.2), value: arDismissed + peckDismissed + weekDismissed)
    }
}

/// The Actively Read session: the voice conversation (Dodo speaks first; "I'm
/// ready" starts the three questions), then the grade.
struct ActivelyReadView: View {
    let topicId: String
    let topicLabel: String

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    private enum Phase: Equatable {
        case talking
        case grading
        case result(ActivelyReadResult)
        case error(String)
    }

    @State private var phase: Phase = .talking
    @State private var revealed = false
    @State private var showBreakdown = false
    @State private var undone = false

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            switch phase {
            case .talking:
                VoiceSessionView(mode: "actively_read", threadId: topicId, title: "Actively Read · " + topicLabel) { voiceSessionId in
                    guard let voiceSessionId else { closeModal(dismiss); return }
                    grade(voiceSessionId)
                }
            case .grading:
                ZStack {
                    JellyBubbleBackdrop().ignoresSafeArea()
                    JellyGradingView(text: "Tallying your grade…")
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
        // `-MockARResult passed|failed|declined|conversation|grading` — the
        // result (or the wait) with no session, for screenshots.
        .onAppear {
            guard let m = UserDefaults.standard.string(forKey: "MockARResult") else { return }
            UserDefaults.standard.removeObject(forKey: "MockARResult")
            if m == "grading" { phase = .grading; return }
            let passed = m == "passed"
            phase = .result(ActivelyReadResult(
                outcome: m == "declined" ? "declined" : m == "conversation" ? "conversation" : "tested",
                grade: m == "passed" ? "A-" : m == "failed" ? "B" : nil,
                passed: passed,
                questionsAnswered: m == "passed" || m == "failed" ? 3 : 0,
                notes: passed ? "You explained all three clearly; the second answer could use one more concrete example."
                    : m == "failed" ? "The big picture is there; the why behind the empire's collapse needs another pass."
                    : m == "declined" ? "You said this one isn't for you." : "You talked it through but didn't take the test.",
                strengths: passed ? ["Unifying the city-states", "Akkadian as the language of rule"] : m == "failed" ? ["The big picture"] : [],
                weaknesses: m == "failed" ? ["Why the empire fell"] : [],
                stars: passed ? 1 : 0, peckLevelCleared: passed ? 12 : nil, xpAwarded: passed ? 150 : 0,
                notInterested: m == "declined"))
        }
        #endif
    }

    private func grade(_ voiceSessionId: String) {
        phase = .grading
        Task {
            do {
                let r = try await F2API.shared.submitActivelyRead(topicId: topicId, voiceSessionId: voiceSessionId)
                await session.refreshProgress()
                await ActivelyReadStore.shared.refresh()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { phase = .result(r) }
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }

    @ViewBuilder
    private func resultView(_ r: ActivelyReadResult) -> some View {
        ZStack {
            ScrollView {
                VStack(spacing: 18) {
                    Text("ACTIVELY READ")
                        .font(.system(size: 12, weight: .heavy))
                        .tracking(1.6)
                        .foregroundStyle(FeyndTheme.text3)
                        .padding(.top, 60)
                    Text(topicLabel)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)

                    if r.outcome == "tested", let g = r.grade {
                        JellyGradeBall(grade: g, passed: r.passed)
                            .scaleEffect(revealed ? 1 : 0.4)
                            .opacity(revealed ? 1 : 0)
                            .padding(.vertical, 8)
                    }

                    headline(r)

                    if !r.notes.isEmpty && r.outcome == "tested" {
                        Text(r.notes)
                            .font(.system(size: 14))
                            .lineSpacing(3)
                            .foregroundStyle(FeyndTheme.text2)
                            .padding(14)
                            .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.borderSoft, lineWidth: 1))
                            .padding(.horizontal, 22)
                    }

                    if !r.strengths.isEmpty || !r.weaknesses.isEmpty {
                        Button { showBreakdown = true } label: {
                            HStack(spacing: 7) {
                                Image(systemName: "chart.bar.doc.horizontal").font(.system(size: 13, weight: .semibold))
                                Text("Strengths & weaknesses").font(.system(size: 14, weight: .semibold))
                                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold))
                            }
                            .foregroundStyle(FeyndTheme.accent)
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .sheet(isPresented: $showBreakdown) {
                            FinalReviewBreakdownSheet(topicLabel: topicLabel, strengths: r.strengths, weaknesses: r.weaknesses)
                        }
                    }

                    if r.notInterested && !undone {
                        Button {
                            Task {
                                try? await F2API.shared.setActivelyReadInactive(id: topicId, inactive: false)
                                undone = true
                                await ActivelyReadStore.shared.refresh()
                            }
                        } label: {
                            Text("Actually, keep it in my picks")
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
    private func headline(_ r: ActivelyReadResult) -> some View {
        if r.passed {
            VStack(spacing: 10) {
                pill(icon: "star.fill", text: "Actively read — first star earned!")
                if let level = r.peckLevelCleared {
                    pill(icon: "flag.checkered", text: "Peck level \(level) cleared\(r.xpAwarded > 0 ? " · +\(r.xpAwarded) XP" : "")")
                }
            }
        } else {
            Text(r.outcome == "tested"
                 ? (r.questionsAnswered < 3
                    ? "All three questions count. Talk it through again and take the test from the topic page."
                    : "A- or better makes it actively read. Talk it through again and retake it from the topic page.")
                 : r.outcome == "declined"
                    ? (undone ? "It's back in your daily picks." : "Got it. This one is off your daily picks.")
                    : "No test this time. Say \"I'm ready\" in the conversation when you want the three questions.")
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

/// Item for the Actively Read cover (item-driven, so the topic is never read stale).
struct ActivelyReadLaunch: Identifiable, Equatable {
    let threadId: String
    let label: String
    var id: String { threadId }
}
