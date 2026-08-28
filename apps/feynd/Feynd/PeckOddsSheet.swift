import SwiftUI
import UIKit

/// "The odds" — per-topic Peck draw weights. Reached from the die button in
/// the deck stack. Each included deck gets a colored slice of the draw bar
/// and a four-chip weight dial (×½ ×1 ×2 ×5). The bar and percentages are
/// the honest arithmetic (weight × cards / total); the scheduler's own
/// boosts (due, priority, lapses) still apply inside that mix.
struct PeckOddsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var decks: [FlashDeck]

    private static let weights: [Double] = [0.5, 1, 2, 5]
    private static let palette: [UInt32] = [
        0xDD9420, 0x5E9E8F, 0xC96F51, 0x8B7BC7, 0x7FBA66, 0x5B8DBE,
        0xB5893B, 0x4E8A7A, 0xA95E8C, 0x6C7DBE,
    ]

    private var included: [FlashDeck] {
        decks.filter { !($0.peckExcluded ?? false) && $0.cardCount > 0 }
    }

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            if included.isEmpty {
                Text("Every deck is switched out of Peck — nothing to weigh.")
                    .font(.system(size: 13))
                    .foregroundStyle(FeyndTheme.text3)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 44)
                Spacer()
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        shareBar
                            .padding(.horizontal, 18)
                            .padding(.top, 6)
                            .padding(.bottom, 16)
                        ForEach(Array(included.enumerated()), id: \.element.id) { i, deck in
                            row(deck, color: color(i))
                            if deck.id != included.last?.id {
                                Rectangle()
                                    .fill(FeyndTheme.borderSoft)
                                    .frame(height: 1)
                                    .padding(.horizontal, 14)
                            }
                        }
                        Text("Rough odds by topic. Due, flagged, and missed cards still get their usual boost inside the mix.")
                            .font(.system(size: 11.5))
                            .foregroundStyle(FeyndTheme.text3)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 28)
                            .padding(.top, 18)
                    }
                    .padding(.bottom, 32)
                }
                .scrollIndicators(.hidden)
            }
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
    }

    // MARK: - Chrome

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
                Text("The odds")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text("Who gets pecked, and how often")
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

    // MARK: - The draw bar

    /// One capsule, sliced proportionally to each deck's share of the draw.
    private var shareBar: some View {
        GeometryReader { geo in
            let total = totalPull
            HStack(spacing: 2) {
                ForEach(Array(included.enumerated()), id: \.element.id) { i, deck in
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color(i))
                        .frame(width: max(4, (geo.size.width - CGFloat(included.count - 1) * 2) * pull(deck) / total))
                }
            }
            .animation(.spring(duration: 0.45), value: weightKey)
        }
        .frame(height: 16)
    }

    private func pull(_ deck: FlashDeck) -> CGFloat {
        CGFloat(Double(deck.cardCount) * (deck.peckWeight ?? 1))
    }

    private var totalPull: CGFloat {
        max(0.001, included.reduce(0) { $0 + pull($1) })
    }

    /// Animation key: the weights as one string, so any chip tap re-springs the bar.
    private var weightKey: String {
        included.map { "\($0.id):\($0.peckWeight ?? 1)" }.joined()
    }

    private func color(_ index: Int) -> Color {
        Color(hex: Self.palette[index % Self.palette.count])
    }

    // MARK: - Rows

    private func row(_ deck: FlashDeck, color: Color) -> some View {
        let share = pull(deck) / totalPull
        return HStack(alignment: .center, spacing: 12) {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 4) {
                Text(deck.displayLabel)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(kindLabel(deck.kind))
                        .font(.system(size: 9, weight: .bold))
                        .tracking(0.6)
                        .foregroundStyle(FeyndTheme.text2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2.5)
                        .background(FeyndTheme.surface2, in: Capsule())
                    Text("\(deck.cardCount) card\(deck.cardCount == 1 ? "" : "s")")
                        .font(.system(size: 12))
                        .foregroundStyle(FeyndTheme.text2)
                }
            }
            Spacer(minLength: 10)
            VStack(alignment: .trailing, spacing: 6) {
                Text(percentLabel(share))
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(FeyndTheme.text)
                    .contentTransition(.numericText())
                    .animation(.spring(duration: 0.35), value: weightKey)
                chips(deck)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    private func chips(_ deck: FlashDeck) -> some View {
        HStack(spacing: 4) {
            ForEach(Self.weights, id: \.self) { w in
                let selected = abs((deck.peckWeight ?? 1) - w) < 0.01
                Button { setWeight(deck, w) } label: {
                    Text(chipLabel(w))
                        .font(.system(size: 11.5, weight: .bold))
                        .foregroundStyle(selected ? Color(hex: 0x261C06) : FeyndTheme.text2)
                        .frame(width: 32, height: 24)
                        .background(
                            selected ? FeyndTheme.accent : FeyndTheme.surface2,
                            in: Capsule(),
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Draw weight \(chipLabel(w))")
            }
        }
    }

    private func setWeight(_ deck: FlashDeck, _ w: Double) {
        guard let i = decks.firstIndex(where: { $0.id == deck.id }) else { return }
        guard abs((decks[i].peckWeight ?? 1) - w) > 0.01 else { return }
        decks[i].peckWeight = w
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        // Optimistic; the server clamps and is the tie-breaker on next load.
        Task { try? await F2API.shared.setPeckWeight(id: deck.threadId, weight: w) }
    }

    private func chipLabel(_ w: Double) -> String {
        w == 0.5 ? "×½" : "×\(Int(w))"
    }

    private func percentLabel(_ share: CGFloat) -> String {
        let pct = share * 100
        if pct < 1 { return "<1%" }
        return "\(Int(pct.rounded()))%"
    }

    private func kindLabel(_ kind: String?) -> String {
        switch kind {
        case "book": return "BOOK"
        case "mini": return "MINI"
        case "video": return "VIDEO"
        case "audio": return "AUDIO"
        case "web": return "WEB"
        case "paste": return "PASTE"
        case "chat": return "CHAT"
        default: return "TOPIC"
        }
    }
}
