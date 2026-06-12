import SwiftUI

/// All topics, strongest signal first: what's fading and what's due.
struct LibraryView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Library")
                    .font(.system(size: 36, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.ink)
                    .padding(.top, 12)

                Text("\(session.home.topics.count) topics · \(session.home.cardCount) ideas")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink3)
                    .padding(.top, 4)
                    .padding(.bottom, 16)

                if session.home.topics.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "books.vertical")
                            .font(.system(size: 30))
                            .foregroundStyle(Theme.ink3)
                        Text("Nothing here yet")
                            .font(.system(size: 17, weight: .semibold, design: .serif))
                            .foregroundStyle(Theme.ink)
                        Text("Tap + to add your first article or video.")
                            .font(.system(size: 13.5))
                            .foregroundStyle(Theme.ink2)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 80)
                } else {
                    VStack(spacing: 10) {
                        ForEach(session.home.topics) { t in
                            NavigationLink(value: t) {
                                TopicRow(topic: t)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button(role: .destructive) {
                                    delete(t)
                                } label: {
                                    Label("Delete topic", systemImage: "trash")
                                }
                            }
                        }
                    }
                }

                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
        .background(Theme.bg)
        .refreshable { await session.refreshHome() }
        .task { await session.refreshHome() }
    }

    private func delete(_ topic: TopicSummary) {
        Task {
            try? await API.shared.deleteTopic(id: topic.id)
            await session.refreshHome()
        }
    }
}
