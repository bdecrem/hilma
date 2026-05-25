import SwiftUI

/// Topics screen — direct port of `TopicsScreen` from feynd-screens.jsx.
/// Library eyebrow, 34pt title, Recent pill, meta strip, rows with mini glyph
/// + 16.5pt title + star meta + kebab. Custom chrome end-to-end.
enum TopicSort: String, CaseIterable, Identifiable {
    case recent, alphabetical
    var id: String { rawValue }
    var label: String { self == .recent ? "Recent" : "A–Z" }
}

struct TopicsView: View {
    @Environment(Session.self) private var session
    @State private var topics: [F2Topic] = []
    @State private var loading = false
    @State private var loadError: String? = nil
    @State private var renameTarget: F2Topic? = nil
    @State private var renameDraft = ""
    @State private var showProfile = false
    /// Persists across launches; defaults to recent.
    @AppStorage("topicsSortMode") private var sortRaw = TopicSort.recent.rawValue

    private var sort: TopicSort { TopicSort(rawValue: sortRaw) ?? .recent }

    private var sortedTopics: [F2Topic] {
        switch sort {
        case .recent:
            // Server already returns by updated_at desc; preserve order.
            return topics
        case .alphabetical:
            return topics.sorted {
                $0.displayLabel.localizedCaseInsensitiveCompare($1.displayLabel) == .orderedAscending
            }
        }
    }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                FeyndTopBar {
                    Text("Library")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(FeyndTheme.text2)
                } trailing: {
                    IconCircleButton(systemImage: "plus") { /* future: ingest */ }
                } onProfileTap: {
                    showProfile = true
                }

                titleRow
                metaStrip

                if topics.isEmpty && loading {
                    ProgressView()
                        .tint(FeyndTheme.text2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if topics.isEmpty {
                    emptyState
                } else {
                    rows
                }
            }
        }
        .sheet(isPresented: $showProfile) { SettingsView() }
        .alert("Rename topic",
               isPresented: Binding(get: { renameTarget != nil },
                                    set: { if !$0 { renameTarget = nil } })) {
            TextField("Title", text: $renameDraft)
            Button("Cancel", role: .cancel) { renameTarget = nil }
            Button("Save") { commitRename() }
        }
        .task {
            if topics.isEmpty { await load() }
            await session.refreshProgress()
        }
    }

    // MARK: - Sections

    private var titleRow: some View {
        HStack(alignment: .bottom) {
            Text("Topics")
                .font(.system(size: 34, weight: .bold))
                .tracking(-0.8)
                .foregroundStyle(FeyndTheme.text)
            Spacer()
            sortMenu
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 14)
    }

    /// Recent / A–Z toggle. Menu lets the user pick; current pick is shown
    /// in the pill so the trailing chevron always has meaning.
    private var sortMenu: some View {
        Menu {
            ForEach(TopicSort.allCases) { option in
                Button {
                    sortRaw = option.rawValue
                } label: {
                    if option == sort {
                        Label(option.label, systemImage: "checkmark")
                    } else {
                        Text(option.label)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(sort.label)
                    .font(.system(size: 12.5, weight: .medium))
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
            }
            .foregroundStyle(FeyndTheme.text2)
            .padding(.leading, 11)
            .padding(.trailing, 10)
            .padding(.vertical, 5)
            .background(FeyndTheme.surface, in: Capsule())
            .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        }
    }

    private var metaStrip: some View {
        HStack {
            Text("\(topics.count) TOPICS")
                .font(.system(size: 12, weight: .semibold))
                .tracking(0.2)
                .foregroundStyle(FeyndTheme.text3)
            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 10)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundStyle(FeyndTheme.text3)
            Text("No topics yet")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(FeyndTheme.text)
            Text("Send F2 a URL or ask a question to get started.")
                .font(.system(size: 13))
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 32)
    }

    private var rows: some View {
        let display = sortedTopics
        return ScrollView {
            // Bottom inset large enough to keep the floating TabPill from
            // covering the last row.
            LazyVStack(spacing: 0) {
                ForEach(Array(display.enumerated()), id: \.element.id) { idx, topic in
                    NavigationLink(value: topic) {
                        TopicListRow(topic: topic,
                                     isLast: idx == display.count - 1,
                                     onRename: { startRename(topic) },
                                     onDelete: { delete(topic) })
                    }
                    .buttonStyle(.plain)
                }
                Color.clear.frame(height: 96)
            }
            .padding(.horizontal, 14)
        }
        .scrollIndicators(.hidden)
        .refreshable {
            await load()
            await session.refreshProgress()
        }
    }

    // MARK: - Data

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
        if let idx = topics.firstIndex(where: { $0.id == target.id }) {
            topics[idx].topic = newName
        }
        Task {
            do { try await F2API.shared.renameTopic(id: target.id, to: newName) }
            catch { await load() }
        }
    }

    private func delete(_ topic: F2Topic) {
        let prev = topics
        topics.removeAll { $0.id == topic.id }
        Task {
            do { try await F2API.shared.deleteTopic(id: topic.id) }
            catch { topics = prev }
        }
    }
}

struct TopicListRow: View {
    let topic: F2Topic
    let isLast: Bool
    let onRename: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                MiniTopicGlyph(size: 36)

                VStack(alignment: .leading, spacing: 4) {
                    Text(topic.displayLabel)
                        .font(.system(size: 16.5, weight: .semibold))
                        .tracking(-0.3)
                        .foregroundStyle(FeyndTheme.text)
                        .lineLimit(1)
                    metaLine
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Menu {
                    Button { onRename() } label: { Label("Rename", systemImage: "pencil") }
                    Button(role: .destructive) { onDelete() } label: { Label("Delete", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                        .padding(8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 14)
            .padding(.leading, 4)
            .padding(.trailing, 6)

            if !isLast {
                Rectangle()
                    .fill(FeyndTheme.borderSoft)
                    .frame(height: 1)
            }
        }
    }

    private var isNew: Bool { topic.stars == 0 && topic.quizCount == 0 }

    @ViewBuilder
    private var metaLine: some View {
        if isNew {
            Text("\(relative(topic.createdAt)) · no quizzes yet")
                .font(.system(size: 12.5))
                .foregroundStyle(FeyndTheme.text3)
                .tracking(-0.1)
        } else {
            HStack(spacing: 8) {
                StarRow(value: topic.stars, max: 5, size: 11, gap: 2)
                Text("·").foregroundStyle(FeyndTheme.text3)
                Text(relative(topic.createdAt))
                    .foregroundStyle(FeyndTheme.text3)
            }
            .font(.system(size: 12.5))
            .tracking(-0.1)
        }
    }
}

/// Compact relative time ("1d", "2d", "3w"), matching the design's "1d ago" style.
func relative(_ date: Date) -> String {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .short
    return f.localizedString(for: date, relativeTo: Date())
}
