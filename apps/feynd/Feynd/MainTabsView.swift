import SwiftUI

/// Custom shell — no iOS TabView, no native nav bars. Hosts Topics and Peck
/// with a floating TabPill at the bottom. Each tab has its own NavigationStack
/// so Topic detail still pushes naturally; nav bars are hidden everywhere.
/// (The old Chat tab was removed 2026-08-13 — new topics start from the +
/// button in Topics, and every conversation lives in its topic.)
struct MainTabsView: View {
    @Environment(Session.self) private var session
    // Dev/testing hook: `simctl launch … -StartTab peck|topics` opens
    // on that tab, so headless screenshot verification can reach every tab.
    @State private var active: FeyndTab = {
        switch UserDefaults.standard.string(forKey: "StartTab") {
        case "peck", "flash": return .flash
        default: return .topics
        }
    }()
    @State private var topicsPath = NavigationPath()
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
                case .topics:
                    NavigationStack(path: $topicsPath) {
                        TopicsView()
                            .toolbar(.hidden, for: .navigationBar)
                            .navigationDestination(for: F2Topic.self) { topic in
                                TopicDetailView(topicId: topic.id)
                                    .toolbar(.hidden, for: .navigationBar)
                            }
                            .navigationDestination(for: QuickChatRoute.self) { route in
                                TopicDetailView(topicId: route.topicId, quickChat: true)
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

            // Deck-ready toast — drops in from the top over any tab, so card
            // generation can run in the background without holding a sheet open.
            if let toast = FlashDeckBuilder.shared.toast {
                VStack {
                    FlashToastBanner(toast: toast)
                        .onTapGesture { FlashDeckBuilder.shared.toast = nil }
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .zIndex(90)
            }

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
        .animation(.spring(response: 0.4, dampingFraction: 0.85),
                   value: FlashDeckBuilder.shared.toast)
        // Deep links land on the Peck tab: dodo://peck (custom scheme) and
        // https://feynd.cc/peck (universal link — the daily iMessage flow
        // texts this one).
        .onOpenURL { route($0) }
        // Card clinic "Discuss with Dodo": switch to Topics and push the
        // card's topic. The destination view picks up the prefilled draft.
        .onChange(of: DeepLinkRouter.shared.topicChatSignal) {
            guard let id = DeepLinkRouter.shared.consumeChatNavigation() else { return }
            active = .topics
            Task {
                if let t = try? await F2API.shared.listTopics().first(where: { $0.id == id }) {
                    // A beat for cover dismissals to settle before the push.
                    try? await Task.sleep(for: .milliseconds(450))
                    topicsPath.append(t)
                }
            }
        }
        // "Just chat" from the New Topic sheet: push the fresh placeholder
        // topic in quick-chat mode once the sheet has settled.
        .onChange(of: DeepLinkRouter.shared.quickChatSignal) {
            guard let id = DeepLinkRouter.shared.consumeQuickChat() else { return }
            active = .topics
            Task {
                try? await Task.sleep(for: .milliseconds(400))
                topicsPath.append(QuickChatRoute(topicId: id))
            }
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL { route(url) }
        }
        #if targetEnvironment(simulator)
        // `simctl launch … -OpenURL dodo://peck` — drives route() without
        // SpringBoard's untappable "Open in Dodo?" dialog, so screenshot
        // loops can verify deep-link behavior end to end.
        .task {
            if let raw = UserDefaults.standard.string(forKey: "OpenURL"),
               let url = URL(string: raw) {
                UserDefaults.standard.removeObject(forKey: "OpenURL")
                route(url)
            }
            // `-OpenTopic <id>` — push straight into a topic's detail screen.
            if let id = UserDefaults.standard.string(forKey: "OpenTopic") {
                UserDefaults.standard.removeObject(forKey: "OpenTopic")
                if let t = try? await F2API.shared.listTopics().first(where: { $0.id == id }) {
                    try? await Task.sleep(for: .seconds(1))
                    topicsPath.append(t)
                }
            }
        }
        #endif
        // No forced color scheme — defer to FeyndApp's @AppStorage preference
        // so the Settings light/dark/system toggle actually drives the UI.
    }

    /// dodo://peck has "peck" as the host; https://feynd.cc/peck has it as
    /// the path. Check both so either form of the link switches tabs.
    /// The peck link means "continue playing": besides switching tabs it
    /// asks the Flash tab to open the current level's set immediately —
    /// after the daily iMessage card, that set arrives with the day's
    /// answers already counted, so the user lands on the next question.
    private func route(_ url: URL) {
        let target = (url.host ?? "") + url.path
        if target.lowercased().contains("peck") {
            active = .flash
            DeepLinkRouter.shared.requestPeckPlay()
        }
    }
}
