import SwiftUI

@main
struct OmniglotApp: App {
    @State private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
            // Light-only is declared via UIUserInterfaceStyle in Info.plist
            // (a SwiftUI-level .preferredColorScheme(.light) override made
            // XCUITest's synthesized taps unreliable on dark-mode devices).
            // The Talk booth opts into dark itself.
        }
    }
}

/// UI tests launch with this flag: skips infinite animations (XCUITest's
/// synthesized taps are unreliable against a perpetually-animating tree)
/// and starts signed out for deterministic runs.
var isUITest: Bool {
    ProcessInfo.processInfo.arguments.contains("-omni-uitest")
}

struct RootView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        Group {
            switch session.auth {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.bg)
            case .signedOut:
                LoginView()
            case .signedIn:
                MainView()
            }
        }
        .task {
            if isUITest { API.shared.clearSessionCookie() }
            await session.bootstrap()
        }
    }
}

struct MainView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Learn", systemImage: "waveform") }
            LibraryView()
                .tabItem { Label("Library", systemImage: "book.closed") }
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person") }
        }
        .tint(Theme.accent)
    }
}

/// ChinesePod-style level names, mirrored from the backend.
func levelTitle(_ level: Int) -> String {
    let names = ["Newbie", "Elementary", "Intermediate", "Upper Intermediate", "Advanced", "Master"]
    guard level >= 1, level <= names.count else { return "Level \(level)" }
    return names[level - 1]
}
