import SwiftUI

/// The web-researched study-context summary for a book topic. Opens right
/// after "Generate Book Summary" (showing progress while the server searches
/// and writes) and any time later from "View Book Summary". The markdown is
/// fetched fresh from GET /api/f2/topics/[id]/book-summary — the topics list
/// only carries the status.
struct BookSummaryReaderView: View {
    let topicId: String
    let topicLabel: String

    @Environment(\.dismiss) private var dismiss

    private enum Phase: Equatable {
        case loading
        case generating
        case ready(String)
        case error(String)
    }

    @State private var phase: Phase = .loading

    var body: some View {
        VStack(spacing: 0) {
            grabber
            header
            content
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .task { await watch() }
    }

    // MARK: Chrome

    private var grabber: some View {
        Capsule()
            .fill(FeyndTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            VStack(spacing: 2) {
                Text("Book Summary")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text(topicLabel)
                    .font(.system(size: 12.5))
                    .foregroundStyle(FeyndTheme.text3)
                    .lineLimit(1)
                    .padding(.horizontal, 60)
            }
            HStack {
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                        .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 8)
    }

    // MARK: States

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            Spacer()
            ProgressView().tint(FeyndTheme.accent)
            Spacer()
        case .generating:
            Spacer()
            VStack(spacing: 14) {
                ProgressView().tint(FeyndTheme.accent).scaleEffect(1.3)
                Text("Searching the web and writing the summary…")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(FeyndTheme.text2)
                Text("Usually a minute or two. You can close this — it keeps going.")
                    .font(.system(size: 13))
                    .foregroundStyle(FeyndTheme.text3)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            Spacer()
        case .ready(let markdown):
            ScrollView {
                Text(rendered(markdown))
                    .font(.system(size: 15))
                    .lineSpacing(4)
                    .foregroundStyle(FeyndTheme.text)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 22)
                    .padding(.top, 12)
                    .padding(.bottom, 44)
            }
            .scrollIndicators(.hidden)
        case .error(let message):
            Spacer()
            VStack(spacing: 14) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 26))
                    .foregroundStyle(FeyndTheme.accent)
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(FeyndTheme.text2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)
                Button {
                    Task { await retry() }
                } label: {
                    Text("Try again")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FeyndTheme.accent)
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }

    /// Markdown → AttributedString. Inline-only parsing keeps block syntax
    /// as literal text, so headings become bold lines and rules are dropped
    /// first; bold/italic then render properly with whitespace preserved.
    private func rendered(_ markdown: String) -> AttributedString {
        let cleaned = markdown
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                let s = String(line)
                if s.hasPrefix("#") {
                    let text = s.drop(while: { $0 == "#" })
                        .trimmingCharacters(in: .whitespaces)
                        .replacingOccurrences(of: "**", with: "")
                    return "**\(text)**"
                }
                if s.trimmingCharacters(in: .whitespaces) == "---" { return "" }
                return s
            }
            .joined(separator: "\n")
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: cleaned, options: options))
            ?? AttributedString(markdown)
    }

    // MARK: Data

    /// Fetch, and keep re-fetching while the server is still writing.
    private func watch() async {
        while !Task.isCancelled {
            do {
                let summary = try await F2API.shared.fetchBookSummary(id: topicId)
                switch summary?.status {
                case "ready":
                    phase = .ready(summary?.markdown ?? "")
                    return
                case "generating":
                    phase = .generating
                case "error":
                    phase = .error(summary?.error ?? "Generation failed.")
                    return
                default:
                    phase = .error("No summary yet — use Generate Book Summary in the topic menu.")
                    return
                }
            } catch {
                phase = .error(error.localizedDescription)
                return
            }
            try? await Task.sleep(for: .seconds(6))
        }
    }

    private func retry() async {
        phase = .generating
        do {
            _ = try await F2API.shared.generateBookSummary(id: topicId)
        } catch let F2APIError.http(409, _) {
            // Already generating — just keep watching.
        } catch {
            phase = .error(error.localizedDescription)
            return
        }
        await watch()
    }
}
