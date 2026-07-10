import SwiftUI

struct TopicDetailView: View {
    @Environment(AppSession.self) private var session
    let summary: TopicSummary

    @State private var detail: TopicDetail?
    @State private var loadError: String?
    @State private var showGloss = true
    @State private var reviewPresented = false
    @State private var talkPresented = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                header
                if let detail {
                    dialogueSection(detail.topic.dialogue)
                    vocabularySection(detail.cards)
                    if let grammar = detail.topic.grammar {
                        grammarSection(grammar)
                    }
                } else if let loadError {
                    Text(loadError)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.correction)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                }
            }
            .padding(20)
            .padding(.bottom, 80)
        }
        .background(Theme.bg)
        .safeAreaInset(edge: .bottom) {
            PrimaryButton(title: "Talk about this chapter") {
                talkPresented = true
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            .background(Theme.bg.opacity(0.94))
        }
        .task { await load() }
        .fullScreenCover(isPresented: $reviewPresented, onDismiss: {
            Task { await load() }
        }) {
            if let detail {
                FlashcardsView(cards: detail.cards)
            }
        }
        .fullScreenCover(isPresented: $talkPresented) {
            TalkView(topic: summary)
        }
    }

    private func load() async {
        do {
            detail = try await API.shared.topicDetail(id: summary.id)
        } catch {
            loadError = error.localizedDescription
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: "Chapter \(summary.sortOrder + 1) · \(levelTitle(summary.level))")
            Text(summary.titleTarget ?? summary.title)
                .font(.target(28, .semibold))
                .foregroundStyle(Theme.ink)
            Text(summary.title)
                .font(.system(size: 15))
                .foregroundStyle(Theme.inkSecondary)
            if let description = summary.description {
                Text(description)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.inkSecondary)
                    .padding(.top, 4)
            }
        }
    }

    // MARK: Dialogue

    private func dialogueSection(_ dialogue: [DialogueLine]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Eyebrow(text: "Dialogue")
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        showGloss.toggle()
                    }
                } label: {
                    Text("Aa")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(showGloss ? Theme.accent : Theme.inkTertiary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(showGloss ? Theme.accentTint : Theme.surfaceInset)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 20) {
                ForEach(Array(dialogue.enumerated()), id: \.offset) { _, line in
                    dialogueRow(line)
                }
            }
            .padding(20)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline, lineWidth: 1))
        }
    }

    private func dialogueRow(_ line: DialogueLine) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(String(line.speaker.prefix(1)))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 28, height: 28)
                .background(Theme.accentTint)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(line.text)
                    .font(.target(20, .medium))
                    .foregroundStyle(Theme.ink)
                if let romanization = line.romanization {
                    Text(romanization)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.inkTertiary)
                }
                if showGloss {
                    Text(line.translation)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.inkSecondary)
                }
            }
        }
    }

    // MARK: Vocabulary

    private func vocabularySection(_ cards: [Card]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Eyebrow(text: "Vocabulary")
            VStack(spacing: 16) {
                // Stacked-deck preview: two edges peeking behind the top card.
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Theme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline, lineWidth: 1))
                        .frame(height: 120)
                        .offset(y: 16)
                        .scaleEffect(0.9)
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Theme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline, lineWidth: 1))
                        .frame(height: 120)
                        .offset(y: 8)
                        .scaleEffect(0.95)
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Theme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline, lineWidth: 1))
                        .frame(height: 120)
                        .overlay {
                            VStack(spacing: 4) {
                                Text(cards.first?.term ?? "")
                                    .font(.target(22, .semibold))
                                    .foregroundStyle(Theme.ink)
                                if let romanization = cards.first?.romanization {
                                    Text(romanization)
                                        .font(.system(size: 14))
                                        .foregroundStyle(Theme.inkTertiary)
                                }
                            }
                        }
                }
                .padding(.bottom, 16)

                HStack {
                    Text("\(cards.count) cards")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.inkTertiary)
                    Spacer()
                    Text(knownSummary(cards))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.inkTertiary)
                }

                PrimaryButton(title: "Review cards", disabled: cards.isEmpty) {
                    reviewPresented = true
                }
            }
            .padding(20)
            .background(Theme.surface.opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private func knownSummary(_ cards: [Card]) -> String {
        let known = cards.filter { ($0.strength ?? 0) >= 2 }.count
        return known > 0 ? "\(known) known" : ""
    }

    // MARK: Grammar

    private func grammarSection(_ grammar: Grammar) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Eyebrow(text: "Grammar")
            VStack(alignment: .leading, spacing: 12) {
                Text(grammar.title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Text(grammar.explanation)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.inkSecondary)
                    .lineSpacing(4)
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(grammar.examples.enumerated()), id: \.offset) { _, ex in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ex.target)
                                .font(.target(17))
                                .foregroundStyle(Theme.ink)
                            if let romanization = ex.romanization {
                                Text(romanization)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.inkTertiary)
                            }
                            Text(ex.translation)
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.inkSecondary)
                        }
                    }
                }
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Theme.surfaceInset)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}
