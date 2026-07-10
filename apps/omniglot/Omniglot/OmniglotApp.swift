import SwiftUI

@main
struct OmniglotApp: App {
    @State private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
        }
    }
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
        .task { await session.bootstrap() }
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
