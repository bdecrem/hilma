import SwiftUI

/// Custom shell — no iOS TabView, no native nav bars. Hosts Chat and Topics
/// with a floating TabPill at the bottom. Each tab has its own NavigationStack
/// so Topic detail still pushes naturally; nav bars are hidden everywhere.
struct MainTabsView: View {
    @State private var active: FeyndTab = .chat
    @State private var topicsPath = NavigationPath()
    @State private var chatPath = NavigationPath()

    var body: some View {
        ZStack(alignment: .bottom) {
            FeyndTheme.bg.ignoresSafeArea()

            // Switch screens with opacity rather than swapping the view tree —
            // keeps each tab's NavigationStack state alive.
            ZStack {
                NavigationStack(path: $chatPath) {
                    ChatView()
                        .toolbar(.hidden, for: .navigationBar)
                }
                .opacity(active == .chat ? 1 : 0)
                .allowsHitTesting(active == .chat)

                NavigationStack(path: $topicsPath) {
                    TopicsView()
                        .toolbar(.hidden, for: .navigationBar)
                        .navigationDestination(for: F2Topic.self) { topic in
                            TopicDetailView(topicId: topic.id)
                                .toolbar(.hidden, for: .navigationBar)
                        }
                }
                .opacity(active == .topics ? 1 : 0)
                .allowsHitTesting(active == .topics)
            }

            // Floating pill — sits above the home indicator.
            TabPill(active: $active)
                .padding(.bottom, 12)
        }
        .preferredColorScheme(.dark)
    }
}
