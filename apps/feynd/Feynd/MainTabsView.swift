import SwiftUI

struct MainTabsView: View {
    var body: some View {
        TabView {
            NavigationStack {
                ChatView()
            }
            .tabItem {
                Label("Chat", systemImage: "bubble.left.and.bubble.right.fill")
            }

            NavigationStack {
                TopicsView()
            }
            .tabItem {
                Label("Topics", systemImage: "list.bullet.rectangle")
            }
        }
        .tint(Color.primary)
    }
}
