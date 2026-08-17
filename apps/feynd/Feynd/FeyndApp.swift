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

    var body: some View {
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
                LoginView()
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
