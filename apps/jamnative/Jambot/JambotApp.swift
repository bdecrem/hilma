import SwiftUI

@main
struct JambotApp: App {
    @State private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task {
                    await session.bootstrap()
                }
        }
    }
}

struct RootView: View {
    @Environment(Session.self) private var session

    var body: some View {
        ZStack {
            JBTheme.panel.ignoresSafeArea()
            content
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
