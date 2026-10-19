import SwiftUI

@main
struct FeyndApp: App {
    /// Push notifications (APNs registration, taps, the "Not interested" action).
    @UIApplicationDelegateAdaptor(DodoAppDelegate.self) private var appDelegate
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
    /// The Wake Up launch (LaunchWake.swift); it ends on the app's paper
    /// and says when, so the app is simply revealed under it.
    @State private var showSplash = true

    var body: some View {
        ZStack {
            #if targetEnvironment(simulator)
            // `-SplashOnly 1` — the splash over a bare background (no prompts),
            // for frame checks with `-SplashT`.
            if UserDefaults.standard.bool(forKey: "SplashOnly") { Color.black.ignoresSafeArea() } else { content }
            #else
            content
            #endif
            if showSplash {
                LaunchSplashView {
                    withAnimation(.easeOut(duration: 0.25)) { showSplash = false }
                }
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .task {
            #if targetEnvironment(simulator)
            // `-ExportPeckWorld <host dir>` — write the Peck island scenery
            // (10/20/30 levels) to PNGs there; design handoff, no sign-in.
            if let dir = UserDefaults.standard.string(forKey: "ExportPeckWorld") {
                exportPeckWorld(to: dir)
            }
            // `-HoldSplash 1` pins the splash; `-SplashT <s>` freezes it at a time
            // (both read by LaunchSplashView).
            #endif
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
