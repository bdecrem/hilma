import SwiftUI

/// One topic: its primer ("read for this"), its idea cards, and the door
/// into a clarifying conversation. Distillation lives here too — after more
/// reading or chat, "Add new ideas" pulls out what's new.
struct TopicView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let topicId: String

    @State private var cards: [Card] = []
    @State private var primer: [String]? = nil
    @State private var topicTitle: String? = nil
    @State private var sourceURL: URL? = nil
    @State private var loading = true
    @State private var distilling = false
    @State private var distillNote: String? = nil
    @State private var voicePresented = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                if let primer, !primer.isEmpty {
                    primerCard(primer)
                        .padding(.top, 18)
                }

                ideasSection
                    .padding(.top, 24)

                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
        .background(Theme.bg)
        .task { await load() }
        .fullScreenCover(isPresented: $voicePresented, onDismiss: {
            Task {
                await load()
                await session.refreshHome()
            }
        }) {
            VoiceView(topicId: topicId, topicTitle: topicTitle).environment(session)
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 36, height: 36)
                        .background(Theme.raised, in: Circle())
                }
                .buttonStyle(.plain)
                Spacer()
                if let sourceURL {
                    Button { openURL(sourceURL) } label: {
                        Image(systemName: "safari")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.ink2)
                            .frame(width: 36, height: 36)
                            .background(Theme.raised, in: Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 10)

            Text(topicTitle ?? "Topic")
                .font(.system(size: 27, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 16)

            HStack(spacing: 8) {
                if let host = sourceURL?.host?.replacingOccurrences(of: "www.", with: "") {
                    Text(host)
                        .font(.system(size: 13))
                        .italic()
                        .foregroundStyle(Theme.ink2)
                    Text("·").foregroundStyle(Theme.ink3)
                }
                Text("\(cards.count) \(cards.count == 1 ? "idea" : "ideas")")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink2)
            }
            .padding(.top, 6)

            HStack(spacing: 8) {
                NavigationLink {
                    ChatView(topicId: topicId, topicTitle: topicTitle)
                        .toolbar(.hidden, for: .navigationBar)
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 13, weight: .medium))
                        Text("Discuss")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundStyle(Theme.moss)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Theme.mossSoft, in: Capsule())
                }
                .buttonStyle(.plain)

                Button {
                    voicePresented = true
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: "waveform")
                            .font(.system(size: 13, weight: .medium))
                        Text("Talk it through")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundStyle(Theme.moss)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Theme.mossSoft, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 14)
        }
    }

    // MARK: Primer

    private func primerCard(_ questions: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: "Read for this")
            ForEach(Array(questions.enumerated()), id: \.offset) { i, q in
                HStack(alignment: .top, spacing: 10) {
                    Text("\(i + 1)")
                        .font(.system(size: 12, weight: .semibold, design: .serif))
                        .foregroundStyle(Theme.moss)
                        .frame(width: 18, height: 18)
                        .background(Theme.mossSoft, in: Circle())
                    Text(q)
                        .font(.system(size: 14.5, design: .serif))
                        .lineSpacing(2)
                        .foregroundStyle(Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.borderSoft, lineWidth: 1))
    }

    // MARK: Ideas

    private var ideasSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Eyebrow(text: "Ideas")
                Spacer()
                Button {
                    distill()
                } label: {
                    HStack(spacing: 5) {
                        if distilling {
                            ProgressView().controlSize(.mini).tint(Theme.moss)
                        } else {
                            Image(systemName: "sparkles")
                                .font(.system(size: 11.5, weight: .medium))
                        }
                        Text(distilling ? "Distilling…" : (cards.isEmpty ? "Make ideas" : "Add new ideas"))
                            .font(.system(size: 12.5, weight: .semibold))
                    }
                    .foregroundStyle(Theme.moss)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 6)
                    .background(Theme.mossSoft, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(distilling)
            }

            if let distillNote {
                Text(distillNote)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.ink3)
            }

            if loading {
                ProgressView().tint(Theme.ink2)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 30)
            } else if cards.isEmpty {
                Text("No ideas yet. Distill this topic to pull out what's worth remembering.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.ink2)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 8) {
                    ForEach(cards) { card in
                        IdeaRow(card: card, onDelete: { deleteCard(card) })
                    }
                }
            }
        }
    }

    // MARK: Data

    private func load() async {
        loading = true
        defer { loading = false }
        // Cards + primer and the thread (for title/url) in parallel.
        async let cardsTask = API.shared.topicCards(threadId: topicId)
        async let threadTask = API.shared.thread(id: topicId)
        if let res = try? await cardsTask {
            cards = res.cards
            primer = res.primer
        }
        if let t = try? await threadTask {
            topicTitle = t.topic ?? t.url
            sourceURL = t.url.flatMap(URL.init(string:))
        }
    }

    private func distill() {
        distilling = true
        distillNote = nil
        Task {
            do {
                let res = try await API.shared.distill(threadId: topicId)
                cards = res.cards
                distillNote = res.added == 0
                    ? "Nothing new to add — the existing ideas cover it."
                    : "\(res.added) new \(res.added == 1 ? "idea" : "ideas") added."
                await session.refreshHome()
            } catch {
                distillNote = "Distillation failed — try again."
            }
            distilling = false
        }
    }

    private func deleteCard(_ card: Card) {
        cards.removeAll { $0.id == card.id }
        Task {
            try? await API.shared.deleteCard(id: card.id)
            await session.refreshHome()
        }
    }
}

/// One idea card row — tap to flip between prompt and answer.
struct IdeaRow: View {
    let card: Card
    let onDelete: () -> Void
    @State private var showAnswer = false

    var body: some View {
        Button {
            withAnimation(.easeOut(duration: 0.18)) { showAnswer.toggle() }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(stateColor)
                        .frame(width: 7, height: 7)
                        .padding(.top, 6)
                    Text(showAnswer ? card.answer : card.prompt)
                        .font(.system(size: 14.5, design: showAnswer ? .serif : .default))
                        .lineSpacing(2)
                        .foregroundStyle(showAnswer ? Theme.ink2 : Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack {
                    Text(stateLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.ink3)
                    Spacer()
                    Text(showAnswer ? "tap for question" : "tap for answer")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.ink3.opacity(0.7))
                }
                .padding(.leading, 17)
            }
            .padding(14)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.borderSoft, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) { onDelete() } label: {
                Label("Remove idea", systemImage: "trash")
            }
        }
    }

    private var stateColor: Color {
        switch card.state {
        case "review": return Theme.moss
        case "learning": return Theme.ochre
        default: return Theme.ink3
        }
    }

    private var stateLabel: String {
        switch card.state {
        case "review":
            let days = Int(card.intervalDays.rounded())
            return "every \(max(1, days)) \(days <= 1 ? "day" : "days")"
        case "learning": return "learning"
        default: return "new"
        }
    }
}
