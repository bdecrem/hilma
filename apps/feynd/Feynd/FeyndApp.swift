import SwiftUI

@main
struct FeyndApp: App {
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
        switch session.state {
        case .loading:
            ZStack {
                Color(.systemGroupedBackground).ignoresSafeArea()
                ProgressView()
            }
        case .signedOut:
            LoginView()
        case .signedIn:
            MainTabsView()
        }
    }
}
