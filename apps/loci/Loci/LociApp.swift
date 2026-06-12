import SwiftUI

@main
struct LociApp: App {
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
        ZStack {
            Theme.bg.ignoresSafeArea()
            switch session.auth {
            case .loading:
                ProgressView().tint(Theme.ink2)
            case .signedOut:
                LoginView()
            case .signedIn:
                MainView()
            }
        }
        .task { await session.bootstrap() }
    }
}

enum Tab { case today, library }

/// App shell: Today / Library with a center Add button in a custom bottom bar.
struct MainView: View {
    @Environment(AppSession.self) private var session
    @State private var tab: Tab = .today
    @State private var addPresented = false
    @State private var todayPath = NavigationPath()
    @State private var libraryPath = NavigationPath()

    /// The bar belongs to the root screens only — on pushed screens (topic,
    /// chat) it would sit on top of composers and content.
    private var atRoot: Bool {
        switch tab {
        case .today: return todayPath.isEmpty
        case .library: return libraryPath.isEmpty
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.bg.ignoresSafeArea()

            Group {
                switch tab {
                case .today:
                    NavigationStack(path: $todayPath) {
                        TodayView(onSeeAll: { tab = .library })
                            .toolbar(.hidden, for: .navigationBar)
                            .navigationDestination(for: TopicSummary.self) { t in
                                TopicView(topicId: t.id)
                                    .toolbar(.hidden, for: .navigationBar)
                            }
                    }
                case .library:
                    NavigationStack(path: $libraryPath) {
                        LibraryView()
                            .toolbar(.hidden, for: .navigationBar)
                            .navigationDestination(for: TopicSummary.self) { t in
                                TopicView(topicId: t.id)
                                    .toolbar(.hidden, for: .navigationBar)
                            }
                    }
                }
            }

            if atRoot {
                bottomBar
            }
        }
        .sheet(isPresented: $addPresented) {
            AddView().environment(session)
        }
    }

    private var bottomBar: some View {
        HStack(spacing: 0) {
            barItem("sun.max", "Today", .today)
            addButton
            barItem("books.vertical", "Library", .library)
        }
        .padding(.horizontal, 34)
        .padding(.top, 10)
        .padding(.bottom, 4)
        .background(
            Theme.bg.opacity(0.96)
                .overlay(Rectangle().fill(Theme.borderSoft).frame(height: 1), alignment: .top)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private func barItem(_ icon: String, _ label: String, _ target: Tab) -> some View {
        Button {
            tab = target
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 19, weight: .medium))
                Text(label)
                    .font(.system(size: 10.5, weight: .semibold))
            }
            .foregroundStyle(tab == target ? Theme.moss : Theme.ink3)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var addButton: some View {
        Button {
            addPresented = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: 52, height: 52)
                .background(Theme.mossDeep, in: Circle())
                .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .offset(y: -14)
    }
}
