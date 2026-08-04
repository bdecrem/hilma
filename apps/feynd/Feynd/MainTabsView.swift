import SwiftUI

/// Custom shell — no iOS TabView, no native nav bars. Hosts Chat and Topics
/// with a floating TabPill at the bottom. Each tab has its own NavigationStack
/// so Topic detail still pushes naturally; nav bars are hidden everywhere.
struct MainTabsView: View {
    @Environment(Session.self) private var session
    @State private var active: FeyndTab = .topics
    @State private var topicsPath = NavigationPath()
    @State private var chatPath = NavigationPath()
    @State private var flashPath = NavigationPath()

    var body: some View {
        ZStack(alignment: .bottom) {
            FeyndTheme.bg.ignoresSafeArea()

            // Render only the active tab. The old approach kept BOTH
            // NavigationStacks mounted and toggled opacity — on Catalyst that
            // wedged SwiftUI's update tracking, so the Topics list stopped
            // re-rendering on state changes (pull-to-refresh, re-sort) until an
            // app relaunch. Mounting just the active tab keeps it updating.
            // The path bindings live here in @State, so navigation survives tab
            // switches, and entering Topics re-runs its .task → a fresh load,
            // which means topics added in Chat show up the moment you switch over.
            Group {
                switch active {
                case .chat:
                    NavigationStack(path: $chatPath) {
                        ChatView()
                            .toolbar(.hidden, for: .navigationBar)
                    }
                case .topics:
                    NavigationStack(path: $topicsPath) {
                        TopicsView()
                            .toolbar(.hidden, for: .navigationBar)
                            .navigationDestination(for: F2Topic.self) { topic in
                                TopicDetailView(topicId: topic.id)
                                    .toolbar(.hidden, for: .navigationBar)
                            }
                    }
                case .flash:
                    NavigationStack(path: $flashPath) {
                        FlashTabView()
                            .toolbar(.hidden, for: .navigationBar)
                    }
                }
            }

            // Floating pill — sits above the home indicator.
            TabPill(active: $active)
                .padding(.bottom, 12)

            // Level-up celebration sits on top of everything else when armed.
            // Uses a separate ZStack pass with high zIndex so it survives any
            // current sheets / nav pushes on either tab.
            if let newLevel = session.pendingLevelUp {
                LevelUpView(
                    level: newLevel,
                    progress: session.progress,
                    onDismiss: { session.clearPendingLevelUp() }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
                .zIndex(100)
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.8),
                   value: session.pendingLevelUp)
        // No forced color scheme — defer to FeyndApp's @AppStorage preference
        // so the Settings light/dark/system toggle actually drives the UI.
    }
}
