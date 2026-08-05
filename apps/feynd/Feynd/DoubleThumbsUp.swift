import SwiftUI

/// The double thumbs up — two thumbs, always, on or off. There is no single
/// thumbs up anywhere in the app: the only two verdicts a card can get are
/// one thumb down (bury it) and this (drill me on it).
struct DoubleThumbsUp: View {
    let active: Bool
    var size: CGFloat = 13

    var body: some View {
        HStack(spacing: -size * 0.28) {
            thumb
            thumb
        }
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(active ? FeyndTheme.gold : FeyndTheme.text3)
    }

    private var thumb: some View {
        Image(systemName: active ? "hand.thumbsup.fill" : "hand.thumbsup")
    }
}
