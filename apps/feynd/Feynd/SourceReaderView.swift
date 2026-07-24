import SwiftUI

/// Full-text reader for one topic source (a pasted body, an article, or a
/// video/audio transcript). The body isn't in the context-list payload, so it
/// is fetched on demand when the reader opens. Read-only.
struct SourceReaderView: View {
    @Environment(\.dismiss) private var dismiss

    let topicId: String
    let source: F2API.TopicSource
    let heading: String

    @State private var content: String? = nil
    @State private var loadError: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let url = source.url, !url.isEmpty {
                        Link(destination: URL(string: url) ?? URL(string: "https://feynd.cc")!) {
                            HStack(spacing: 6) {
                                Image(systemName: "link")
                                    .font(.system(size: 11, weight: .semibold))
                                Text(url)
                                    .font(.system(size: 13))
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                            .foregroundStyle(FeyndTheme.coral)
                        }
                    }

                    if let err = loadError {
                        Text(err)
                            .font(.system(size: 13))
                            .foregroundStyle(FeyndTheme.text3)
                    } else if let text = content {
                        Text(text.isEmpty ? "This source has no readable text." : text)
                            .font(.system(size: 16))
                            .lineSpacing(6)
                            .foregroundStyle(FeyndTheme.text)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ProgressView()
                            .tint(FeyndTheme.text2)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .task { await load() }
    }

    private func load() async {
        do {
            let res = try await F2API.shared.readSourceText(
                id: topicId, kind: source.kind, index: source.index,
            )
            content = res.content
        } catch {
            loadError = "Couldn't load this source: \(error.localizedDescription)"
        }
    }

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
                Text(heading)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                    .lineLimit(1)
                Text("Source text")
                    .font(.system(size: 12))
                    .foregroundStyle(FeyndTheme.text3)
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
}
