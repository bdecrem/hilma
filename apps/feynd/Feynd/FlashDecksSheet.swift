import SwiftUI

/// "The stack" — every topic that has flash cards, in one place. Reached
/// from the card-stack button in the Flash tab. Tapping a deck opens the
/// same per-topic hub the Topics tab uses (FlashCardsView), so card editing,
/// adding, and remaking all behave identically here.
struct FlashDecksSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var decks: [FlashDeck] = []
    @State private var loading = true
    @State private var loadError: String? = nil
    @State private var deckTarget: FlashDeck? = nil

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
                            .padding(.vertical, 50)
                    } else if let loadError {
                        message(loadError)
                    } else if decks.isEmpty {
                        message("No decks yet. Open a topic's ⋯ menu and tap Flash cards to build one.")
                    } else {
                        totalsStrip
                        ForEach(decks) { deck in
                            Button { deckTarget = deck } label: { row(deck) }
                                .buttonStyle(.plain)
                            if deck.id != decks.last?.id {
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
        .fullScreenCover(item: $deckTarget) { deck in
            FlashCardsView(topicId: deck.threadId, topicLabel: deck.displayLabel)
                .environment(session)
                // Counts change when cards are added, edited, or buried.
                .onDisappear { Task { await load() } }
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
                Text("The stack")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text("Every deck you're carrying")
                    .font(.system(size: 12))
                    .foregroundStyle(FeyndTheme.text3)
            }
            HStack {
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
            }
            .padding(.trailing, 14)
        }
        .padding(.top, 12)
        .padding(.bottom, 12)
    }

    /// One line of arithmetic across every deck — what Jumbo actually draws from.
    private var totalsStrip: some View {
        let cards = decks.reduce(0) { $0 + $1.cardCount }
        let priority = decks.reduce(0) { $0 + $1.priorityCount }
        let buried = decks.reduce(0) { $0 + $1.buriedCount }
        return HStack(spacing: 14) {
            statBit("\(decks.count)", decks.count == 1 ? "DECK" : "DECKS", FeyndTheme.text)
            statBit("\(cards)", "CARDS", FeyndTheme.text)
            if priority > 0 { statBit("\(priority)", "PRIORITY", FeyndTheme.gold) }
            if buried > 0 { statBit("\(buried)", "BURIED", FeyndTheme.text3) }
            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 10)
    }

    private func statBit(_ value: String, _ label: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(tint)
            Text(label)
                .font(.system(size: 9.5, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(FeyndTheme.text3)
        }
    }

    private func row(_ deck: FlashDeck) -> some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 9)
                    .fill(FeyndTheme.surface2)
                    .frame(width: 38, height: 38)
                Image(systemName: glyph(deck.kind))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(FeyndTheme.accent)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(deck.displayLabel)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text("\(deck.cardCount) card\(deck.cardCount == 1 ? "" : "s")")
                        .font(.system(size: 12))
                        .foregroundStyle(FeyndTheme.text2)
                    if deck.priorityCount > 0 {
                        Label("\(deck.priorityCount)", systemImage: "hand.thumbsup.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(FeyndTheme.gold)
                    }
                    if deck.buriedCount > 0 {
                        Label("\(deck.buriedCount)", systemImage: "hand.thumbsdown.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(FeyndTheme.text3)
                    }
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { i in
                    Image(systemName: i < deck.stars ? "star.fill" : "star")
                        .font(.system(size: 10))
                        .foregroundStyle(i < deck.stars ? FeyndTheme.gold : FeyndTheme.text3.opacity(0.5))
                }
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(FeyndTheme.text3)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private func glyph(_ kind: String?) -> String {
        switch kind {
        case "video": return "play.rectangle"
        case "audio": return "waveform"
        case "chat": return "text.bubble"
        case "web": return "safari"
        default: return "text.alignleft"
        }
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(FeyndTheme.text3)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            .padding(.vertical, 44)
    }

    private func load() async {
        loading = decks.isEmpty
        loadError = nil
        do {
            decks = try await F2API.shared.listFlashDecks()
        } catch {
            loadError = "Couldn't load your decks: \(error.localizedDescription)"
        }
        loading = false
    }
}
