import SwiftUI

/// First-run intro: two swipeable pages (Next → Done), and on first run a
/// closing gate page — "Try it" starts a seeded guest account, or jump to
/// sign-in. Replayable any time from Profile → "See the intro again".
struct OnboardingView: View {
    enum Mode { case firstRun, replay }
    let mode: Mode
    /// firstRun: the user chose "sign in" instead of trying as a guest.
    var onSignIn: () -> Void = {}

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var page = 0
    @State private var startingGuest = false
    @State private var guestError: String? = nil

    private var pageCount: Int { mode == .firstRun ? 3 : 2 }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                TabView(selection: $page) {
                    pageOne.tag(0)
                    pageTwo.tag(1)
                    if mode == .firstRun {
                        gatePage.tag(2)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                dots
                    .padding(.bottom, 14)

                bottomBar
                    .padding(.horizontal, 24)
                    .padding(.bottom, 28)
            }
        }
        .alert("Dodo", isPresented: Binding(
            get: { guestError != nil }, set: { if !$0 { guestError = nil } }
        )) {
            Button("OK") { guestError = nil }
        } message: { Text(guestError ?? "") }
        #if targetEnvironment(simulator)
        .onAppear {
            // `-OnboardingPage <n>` — open on that page for screenshot runs;
            // `-AutoTryDodo 1` — drive the guest path with zero taps.
            let p = UserDefaults.standard.integer(forKey: "OnboardingPage")
            if p > 0, p < pageCount {
                UserDefaults.standard.removeObject(forKey: "OnboardingPage")
                page = p
            }
            if UserDefaults.standard.bool(forKey: "AutoTryDodo"), mode == .firstRun {
                UserDefaults.standard.removeObject(forKey: "AutoTryDodo")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { startGuest() }
            }
        }
        #endif
    }

    // MARK: - Pages

    private var pageOne: some View {
        VStack(spacing: 20) {
            Spacer()
            DodoTraveler(size: 150)
            Text("Meet Dodo")
                .font(.custom("Fredoka", size: 32).weight(.semibold))
                .foregroundStyle(FeyndTheme.text)
            Text("Feed it a book, an article, or a YouTube video. Dodo turns it into a topic you can talk with — and helps you actually remember it.")
                .font(.system(size: 16))
                .lineSpacing(4)
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
            Spacer()
        }
    }

    private var pageTwo: some View {
        VStack(spacing: 0) {
            Spacer()
            Text("Learn it. Keep it.")
                .font(.custom("Fredoka", size: 28).weight(.semibold))
                .foregroundStyle(FeyndTheme.text)
                .padding(.bottom, 28)
            VStack(alignment: .leading, spacing: 22) {
                introRow(icon: "bolt.fill",
                         title: "Flash cards that schedule themselves",
                         sub: "Played by tap, by typing, or out loud — they come back right before you'd forget.")
                introRow(icon: "headphones",
                         title: "Summaries you can listen to",
                         sub: "Every topic gets a written recap and a narrated one for walks.")
                introRow(icon: "quote.opening",
                         title: "Pebbles",
                         sub: "Save the lines worth keeping. Dodos swallowed little stones to digest their food — same idea.")
                introRow(icon: "person.2",
                         title: "Community topics",
                         sub: "Add another learner's topic — flash cards included — or share your own.")
            }
            .padding(.horizontal, 44)
            Spacer()
            Spacer()
        }
    }

    private var gatePage: some View {
        VStack(spacing: 16) {
            Spacer()
            DodoMiniMark(size: 74)
            Text("Your first topic is waiting")
                .font(.custom("Fredoka", size: 26).weight(.semibold))
                .foregroundStyle(FeyndTheme.text)
            Text("It's about the dodo itself — chat, cards, audio, the lot. No account needed to try it; sign up later and everything you've done comes along.")
                .font(.system(size: 15.5))
                .lineSpacing(4)
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 42)
            Spacer()
            Spacer()
        }
    }

    private func introRow(icon: String, title: String, sub: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(FeyndTheme.accent)
                .frame(width: 40, height: 40)
                .background(FeyndTheme.accentSoft, in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text)
                Text(sub)
                    .font(.system(size: 13.5))
                    .lineSpacing(2)
                    .foregroundStyle(FeyndTheme.text2)
            }
        }
    }

    // MARK: - Chrome

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(0..<pageCount, id: \.self) { i in
                Capsule()
                    .fill(i == page ? FeyndTheme.accent : FeyndTheme.text4)
                    .frame(width: i == page ? 20 : 7, height: 7)
            }
        }
        .animation(.easeOut(duration: 0.2), value: page)
    }

    @ViewBuilder
    private var bottomBar: some View {
        if mode == .firstRun && page == pageCount - 1 {
            VStack(spacing: 12) {
                Button {
                    startGuest()
                } label: {
                    HStack(spacing: 8) {
                        if startingGuest { ProgressView().tint(FeyndTheme.inkOnAccent) }
                        Text(startingGuest ? "Setting up…" : "Try Dodo — no account needed")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(FeyndTheme.inkOnAccent)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(FeyndTheme.accent, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(startingGuest)

                Button { onSignIn() } label: {
                    Text("I already have an account")
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(FeyndTheme.accent)
                }
                .buttonStyle(.plain)
            }
        } else {
            Button {
                if page < pageCount - 1 {
                    withAnimation(.easeOut(duration: 0.25)) { page += 1 }
                } else {
                    closeModal(dismiss)
                }
            } label: {
                Text(page < pageCount - 1 ? "Next" : "Done")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(FeyndTheme.inkOnAccent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(FeyndTheme.accent, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private func startGuest() {
        startingGuest = true
        Task {
            await session.startGuest()
            if case .signedIn = session.state {
                // RootView switches to the tabs on its own.
            } else {
                guestError = session.loginError ?? "Couldn't start — try again."
            }
            startingGuest = false
        }
    }
}
