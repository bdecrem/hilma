import SwiftUI

@main
struct JambotApp: App {
    @State private var session = Session()

    var body: some Scene {
        WindowGroup {
            if CommandLine.arguments.contains("-engineSmoke") {
                // Headless engine verification (see Engine/EngineSmoke.swift):
                // xcrun simctl launch --console-pty "iPhone 16" com.bartdecrem.Jambot -engineSmoke
                EngineSmokeView()
            } else {
                RootView()
                    .environment(session)
                    .task {
                        await session.bootstrap()
                    }
            }
        }
    }
}

struct RootView: View {
    @Environment(Session.self) private var session

    var body: some View {
        ZStack(alignment: .topLeading) {
            JBTheme.panel.ignoresSafeArea()
            // The engine's hidden web view lives here for the life of the
            // app (2×2 pt, behind everything, not interactive). WebKit
            // throttles an unparented web view as a background page.
            if let host = EngineFactory.host {
                EngineHostAnchor(host: host)
                    .frame(width: 2, height: 2)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            content
        }
        .task {
            // Warm the engine while the user is still in the Library so the
            // first track opens without waiting for the bundle to load.
            try? await EngineFactory.shared.ready()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch session.state {
        case .loading:
            ProgressView().tint(JBTheme.orange)
        case .signedOut:
            LoginView()
        case .signedIn:
            LibraryView()
        }
    }
}
