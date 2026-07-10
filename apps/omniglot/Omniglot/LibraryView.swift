import SwiftUI

struct LibraryView: View {
    @Environment(AppSession.self) private var session

    @State private var newTopicPresented = false
    @State private var deleteError: String?
    @State private var deleteErrorPresented = false

    private var prebakedByLevel: [(level: Int, topics: [TopicSummary])] {
        guard let all = session.topics?.prebaked else { return [] }
        return (1...6).compactMap { level in
            let t = all.filter { $0.level == level }
            return t.isEmpty ? nil : (level, t)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(prebakedByLevel, id: \.level) { group in
                    Section {
                        ForEach(group.topics) { topic in
                            chapterRow(topic, locked: group.level > session.progress.level)
                        }
                    } header: {
                        Eyebrow(text: "\(levelTitle(group.level))")
                    }
                    .listRowBackground(Theme.surface)
                }

                Section {
                    if let mine = session.topics?.mine {
                        ForEach(mine) { topic in
                            myTopicRow(topic)
                        }
                        .onDelete { indexSet in
                            deleteMine(at: indexSet, from: mine)
                        }
                    }
                    Button {
                        newTopicPresented = true
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "plus.circle")
                                .font(.system(size: 20, weight: .medium))
                                .foregroundStyle(Theme.accent)
                            Text("New topic")
                                .font(.system(size: 17))
                                .foregroundStyle(Theme.accent)
                        }
                    }
                } header: {
                    Eyebrow(text: "Your topics")
                }
                .listRowBackground(Theme.surface)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle("Library")
            .navigationDestination(for: TopicSummary.self) { summary in
                TopicDetailView(summary: summary)
            }
            .sheet(isPresented: $newTopicPresented) {
                NewTopicSheet()
            }
            .alert("Couldn't delete that topic", isPresented: $deleteErrorPresented) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(deleteError ?? "")
            }
        }
        .task {
            if session.topics == nil { await session.refreshTopics() }
        }
        .refreshable { await session.refreshTopics() }
    }

    private func chapterRow(_ topic: TopicSummary, locked: Bool) -> some View {
        Group {
            if locked {
                rowContent(topic, locked: true)
                    .opacity(0.4)
            } else {
                NavigationLink(value: topic) {
                    rowContent(topic, locked: false)
                }
            }
        }
    }

    private func rowContent(_ topic: TopicSummary, locked: Bool) -> some View {
        HStack(spacing: 12) {
            Text("\(topic.sortOrder + 1)")
                .font(.system(size: 15, weight: .regular).monospacedDigit())
                .foregroundStyle(Theme.inkTertiary)
                .frame(width: 22, alignment: .trailing)
            VStack(alignment: .leading, spacing: 2) {
                Text(topic.titleTarget ?? topic.title)
                    .font(.target(17))
                    .foregroundStyle(Theme.ink)
                Text(topic.title)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.inkTertiary)
            }
            Spacer()
            if locked {
                Image(systemName: "lock")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.inkTertiary)
            }
        }
        .padding(.vertical, 2)
    }

    private func myTopicRow(_ topic: TopicSummary) -> some View {
        NavigationLink(value: topic) {
            HStack(spacing: 12) {
                Text(topic.emoji ?? "✳️")
                    .font(.system(size: 20))
                VStack(alignment: .leading, spacing: 3) {
                    Text(topic.titleTarget ?? topic.title)
                        .font(.target(17))
                        .foregroundStyle(Theme.ink)
                    HStack(spacing: 6) {
                        Text(topic.title)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.inkTertiary)
                        if topic.kind == "freeform" {
                            Text("From conversation")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Theme.accent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Theme.accentTint)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func deleteMine(at indexSet: IndexSet, from mine: [TopicSummary]) {
        let doomed = indexSet.map { mine[$0] }
        Task {
            for topic in doomed {
                do {
                    try await API.shared.deleteTopic(id: topic.id)
                } catch {
                    deleteError = error.localizedDescription
                    deleteErrorPresented = true
                }
            }
            await session.refreshTopics()
        }
    }
}

/// "What do you want to talk about?" — one field, a level, and a Create
/// button that builds the whole chapter (dialogue + cards + grammar).
struct NewTopicSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var level: Int = 0 // set from session on appear
    @State private var creating = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow(text: "New topic")
                    TextField("What do you want to talk about?", text: $title, axis: .vertical)
                        .font(.system(size: 17))
                        .padding(16)
                        .background(Theme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.hairline, lineWidth: 1))
                        .disabled(creating)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow(text: "Difficulty")
                    Picker("Difficulty", selection: $level) {
                        ForEach(1...6, id: \.self) { l in
                            Text(levelTitle(l)).tag(l)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.accent)
                    .disabled(creating)
                }

                if creating {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Building your chapter — dialogue, cards, grammar…")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.inkSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let error {
                    Text(error)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.correction)
                }

                Spacer()

                PrimaryButton(
                    title: creating ? "Building…" : "Create chapter",
                    disabled: creating || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ) {
                    create()
                }
            }
            .padding(20)
            .background(Theme.bg)
            .navigationTitle("New topic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(creating)
                }
            }
            .onAppear {
                if level == 0 { level = session.progress.level }
            }
            .interactiveDismissDisabled(creating)
        }
    }

    private func create() {
        creating = true
        error = nil
        Task {
            do {
                _ = try await API.shared.createTopic(
                    title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                    level: level
                )
                await session.refreshTopics()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                creating = false
            }
        }
    }
}
