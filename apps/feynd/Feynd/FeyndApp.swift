import SwiftUI

@main
struct FeyndApp: App {
    @State private var session = Session()
    @AppStorage("colorSchemePreference") private var colorSchemeRaw = ColorSchemePreference.system.rawValue

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(
                    ColorSchemePreference(rawValue: colorSchemeRaw)?.resolved
                )
                .task {
                    await session.bootstrap()
                }
        }
        .commands {
            // Escape closes the frontmost sheet/cover. Registered as a menu
            // key equivalent because that's the one key path AppKit reliably
            // delivers on Catalyst — SwiftUI .keyboardShortcut inside sheets
            // and UIKeyCommand on the responder chain both get swallowed
            // before they fire (see FeyndApplication.swift).
            CommandGroup(after: .saveItem) {
                Button("Dismiss Sheet") {
                    dismissTopmostPresentedModal(respectingModalLock: true)
                }
                .keyboardShortcut(.escape, modifiers: [])
            }
        }
    }
}

struct RootView: View {
    @Environment(Session.self) private var session
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding = false
    /// One-second cold-start moment, then the app fades in under it.
    @State private var showSplash = true

    var body: some View {
        ZStack {
            content
            if showSplash {
                LaunchSplashView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .task {
            #if targetEnvironment(simulator)
            // `-HoldSplash 1` — pin the splash for screenshot verification.
            if UserDefaults.standard.bool(forKey: "HoldSplash") { return }
            #endif
            // The system launch screen covers roughly the first half-second,
            // so the splash runs a beat longer than its animation to actually
            // be seen for ~a second.
            try? await Task.sleep(for: .milliseconds(1600))
            withAnimation(.easeOut(duration: 0.35)) { showSplash = false }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch session.state {
        case .loading:
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()
                ProgressView()
            }
        case .signedOut:
            // First run gets the intro; "sign in" from its gate page (or a
            // finished replay) lands on the normal login screen.
            if hasSeenOnboarding {
                // X returns to the intro — its gate offers Try-it (guest)
                // and sign-in, so login is never a dead end.
                LoginView(onBack: { hasSeenOnboarding = false })
            } else {
                OnboardingView(mode: .firstRun) {
                    hasSeenOnboarding = true
                }
                .onDisappear { hasSeenOnboarding = true }
            }
        case .signedIn:
            MainTabsView()
                .onAppear { hasSeenOnboarding = true }
        }
    }
}
