import SwiftUI

@main
struct PollyApp: App {
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
            // before they fire (see PollyApplication.swift).
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
    /// Signed out and the person asked for the login screen (vs the first run).
    @State private var showLogin = false
    /// One-second cold-start moment, then the app fades in under it.
    @State private var showSplash = true

    var body: some View {
        ZStack {
            content
            if let code = session.languageFlip {
                LanguageFlipView(code: code)
                    .transition(.opacity)
                    .zIndex(2)
            }
            if showSplash {
                LaunchSplashView()
                    .transition(.opacity)
                    .zIndex(3)
            }
        }
        .animation(.easeOut(duration: 0.35), value: session.languageFlip)
        .task {
            #if targetEnvironment(simulator)
            // `-ExportPeckWorld <host dir>` — write the Peck island scenery
            // (10/20/30 levels) to PNGs there; design handoff, no sign-in.
            if let dir = UserDefaults.standard.string(forKey: "ExportPeckWorld") {
                exportPeckWorld(to: dir)
            }
            // `-HoldSplash 1` — pin the splash for screenshot verification.
            if UserDefaults.standard.bool(forKey: "HoldSplash") { return }
            #endif
            // The system launch screen covers roughly the first half-second,
            // so the splash runs a beat longer than its animation to actually
            // be seen for ~a second.
            // The v3 launch runs ~2.1s (pop, eyes, wordmark, hello hop).
            try? await Task.sleep(for: .milliseconds(2500))
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
            // Signed out = the first run, every time: intro, language, name.
            // (Dodo remembers a "seen the intro" flag and shows the login
            // screen instead; Polly doesn't — a signed-out person has no
            // account to log into unless they say so, and the flag made a
            // build that had been tapped through once skip the flow for
            // good.) "I already have an account" opens the login screen;
            // its X comes back here.
            if showLogin {
                LoginView(onBack: { showLogin = false })
            } else {
                OnboardingView(mode: .firstRun) {
                    showLogin = true
                }
            }
        case .signedIn(let user):
            // Keyed on the user: switching language is switching profile
            // (Session.switchLanguage), and every tab must start fresh.
            MainTabsView()
                .id(user.id)
        }
    }
}
