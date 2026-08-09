import SwiftUI

@main
struct TapTapDodoApp: App {
    @StateObject private var app = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .preferredColorScheme(.dark)
                .onOpenURL { app.handleDeepLink($0) }
                .onAppear {
                    // Test hook: SIMCTL_CHILD_TTD_AUTORUN="taptapdodo://play?..."
                    // drives straight into a run without the SpringBoard
                    // deep-link confirmation.
                    if let auto = ProcessInfo.processInfo.environment["TTD_AUTORUN"],
                       let url = URL(string: auto) {
                        app.handleDeepLink(url)
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        ZStack {
            switch app.route {
            case .title:
                TitleScreen()
            case .setSelect:
                SetSelectScreen()
            case .game(let config):
                GameView(config: config)
                    .id(config)   // fresh scene per run
            case .results(let config):
                ResultsScreen(config: config)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: app.route)
    }
}
