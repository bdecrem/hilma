import SwiftUI

/// "View context" sheet — lists every source attached to a topic (primary
/// URL + content, plus each additional source) with size + a delete button.
///
/// Used to see what the AI is actually reading for this topic, and to remove
/// stale or duplicate material.
struct TopicContextSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session

    let topic: F2Topic

    @State private var sources: [F2API.TopicSource] = []
    @State private var loading = true
    @State private var loadError: String? = nil
    @State private var deleting: Set<String> = []
    @State private var confirmDelete: F2API.TopicSource? = nil

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView {
                VStack(spacing: 0) {
                    if loading {
                        ProgressView()
                            .tint(FeyndTheme.text2)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    } else if let err = loadError {
                        Text(err)
                            .font(.system(size: 13))
                            .foregroundStyle(FeyndTheme.text3)
                            .padding(24)
                    } else if sources.isEmpty {
                        Text("No source material attached to this topic.")
                            .font(.system(size: 13))
                            .foregroundStyle(FeyndTheme.text3)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                            .padding(.vertical, 40)
                    } else {
                        ForEach(sources) { src in
                            row(src)
                            if src.id != sources.last?.id {
                                Rectangle()
                                    .fill(FeyndTheme.borderSoft)
                                    .frame(height: 1)
                                    .padding(.horizontal, 14)
                            }
                        }
                    }
                }
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .task { await load() }
        .alert("Remove this source?",
               isPresented: Binding(get: { confirmDelete != nil },
                                    set: { if !$0 { confirmDelete = nil } })) {
            Button("Cancel", role: .cancel) { confirmDelete = nil }
            Button("Remove", role: .destructive) {
                if let src = confirmDelete {
                    confirmDelete = nil
                    Task { await delete(src) }
                }
            }
        } message: {
            Text("The AI will no longer use this material when answering questions about \"\(topic.displayLabel)\".")
        }
    }

    // MARK: - Pieces

    private var handle: some View {
        Capsule()
            .fill(FeyndTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            VStack(spacing: 2) {
                Text("Topic context")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text(topic.displayLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(FeyndTheme.text3)
                    .lineLimit(1)
            }
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.trailing, 14)
        }
        .padding(.top, 12)
        .padding(.bottom, 14)
    }

    @ViewBuilder
    private func row(_ src: F2API.TopicSource) -> some View {
        let isDeleting = deleting.contains(src.id)
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(src.kind == "primary" ? "PRIMARY" : "ADDITIONAL")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.5)
                        .foregroundStyle(src.kind == "primary" ? FeyndTheme.coral : FeyndTheme.text3)
                    Text(sizeLabel(src.contentLength))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(FeyndTheme.text3)
                }
                if let title = src.title, !title.isEmpty, title != "- YouTube" {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text)
                        .lineLimit(2)
                }
                if let url = src.url, !url.isEmpty {
                    Text(url)
                        .font(.system(size: 11))
                        .foregroundStyle(FeyndTheme.text2)
                        .lineLimit(1)
                        .truncationMode(.middle)
                } else if src.kind == "primary" {
                    Text("Pasted text")
                        .font(.system(size: 11))
                        .foregroundStyle(FeyndTheme.text2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                confirmDelete = src
            } label: {
                if isDeleting {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(FeyndTheme.text2)
                        .frame(width: 28, height: 28)
                } else {
                    Image(systemName: "trash")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                        .frame(width: 28, height: 28)
                        .background(FeyndTheme.surface2, in: Circle())
                }
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    // MARK: - Data

    private func load() async {
        loading = true
        loadError = nil
        do {
            sources = try await F2API.shared.listTopicSources(id: topic.id)
        } catch {
            loadError = error.localizedDescription
        }
        loading = false
    }

    private func delete(_ src: F2API.TopicSource) async {
        deleting.insert(src.id)
        defer { deleting.remove(src.id) }
        do {
            try await F2API.shared.deleteTopicSource(
                id: topic.id,
                kind: src.kind,
                index: src.kind == "additional" ? src.index : nil,
            )
            // Optimistic local update so the row vanishes immediately.
            sources.removeAll { $0.id == src.id }
        } catch {
            loadError = "Couldn't remove: \(error.localizedDescription)"
            // Reload so the UI matches server truth on failure.
            await load()
        }
    }

    private func sizeLabel(_ bytes: Int) -> String {
        if bytes == 0 { return "empty" }
        if bytes < 1000 { return "\(bytes) chars" }
        let k = Double(bytes) / 1000.0
        return String(format: "%.1fk chars", k)
    }
}
