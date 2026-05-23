import SwiftUI

struct TopicsView: View {
    @State private var topics: [F2Topic] = []
    @State private var loading = false
    @State private var loadError: String? = nil
    @State private var renameTarget: F2Topic? = nil
    @State private var renameDraft = ""

    var body: some View {
        Group {
            if topics.isEmpty && loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if topics.isEmpty {
                ContentUnavailableView(
                    "No topics yet",
                    systemImage: "list.bullet.rectangle",
                    description: Text("Send F2 a URL or ask a question to get started.")
                )
            } else {
                List {
                    ForEach(topics) { t in
                        NavigationLink(value: t) {
                            TopicRowView(topic: t)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) { delete(t) } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button { startRename(t) } label: {
                                Label("Rename", systemImage: "pencil")
                            }.tint(.blue)
                        }
                        .contextMenu {
                            Button { startRename(t) } label: { Label("Rename", systemImage: "pencil") }
                            Button(role: .destructive) { delete(t) } label: { Label("Delete", systemImage: "trash") }
                        }
                    }
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
        .navigationTitle("Topics")
        .navigationDestination(for: F2Topic.self) { TopicDetailView(topicId: $0.id) }
        .alert("Rename topic", isPresented: Binding(get: { renameTarget != nil }, set: { if !$0 { renameTarget = nil } })) {
            TextField("Title", text: $renameDraft)
            Button("Cancel", role: .cancel) { renameTarget = nil }
            Button("Save") { commitRename() }
        }
        .task { if topics.isEmpty { await load() } }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            topics = try await F2API.shared.listTopics()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func startRename(_ topic: F2Topic) {
        renameDraft = topic.topic ?? topic.displayLabel
        renameTarget = topic
    }

    private func commitRename() {
        guard let target = renameTarget else { return }
        let newName = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        renameTarget = nil
        guard !newName.isEmpty, newName != target.topic else { return }

        // Optimistic update
        if let idx = topics.firstIndex(where: { $0.id == target.id }) {
            topics[idx].topic = newName
        }
        Task {
            do {
                try await F2API.shared.renameTopic(id: target.id, to: newName)
            } catch {
                // Rollback by reloading
                await load()
            }
        }
    }

    private func delete(_ topic: F2Topic) {
        let prev = topics
        topics.removeAll { $0.id == topic.id }
        Task {
            do {
                try await F2API.shared.deleteTopic(id: topic.id)
            } catch {
                topics = prev
            }
        }
    }
}

struct TopicRowView: View {
    let topic: F2Topic

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(topic.displayLabel)
                .font(.body)
                .lineLimit(2)
            HStack(spacing: 6) {
                Text("Added \(relative(topic.createdAt))")
                if topic.quizCount > 0 {
                    Text("·")
                    Text("Quizzed \(topic.quizCount)×")
                    if let last = topic.lastQuizzedAt {
                        Text("· last \(relative(last))")
                    }
                } else {
                    Text("·")
                    Text("No quizzes yet")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

func relative(_ date: Date) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: Date())
}
