import SwiftUI

/// The thumbs up — one thumb, on or off. The up-side verdict is binary
/// (drill me on it); only the down side has two degrees, expressed by thumb
/// count — see ThumbsDownStateIcon.
struct ThumbsUpIcon: View {
    let active: Bool
    var size: CGFloat = 13

    var body: some View {
        Image(systemName: active ? "hand.thumbsup.fill" : "hand.thumbsup")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(active ? FeyndTheme.gold : FeyndTheme.text3)
    }
}

/// Double thumbs down — the bury verdict ("I hate this").
struct DoubleThumbsDown: View {
    let active: Bool
    var size: CGFloat = 13

    var body: some View {
        HStack(spacing: -size * 0.28) {
            thumb
            thumb
        }
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(active ? Color(hex: 0xE0635A) : FeyndTheme.text3)
    }

    private var thumb: some View {
        Image(systemName: active ? "hand.thumbsdown.fill" : "hand.thumbsdown")
    }
}

/// The down button's face for each rating state: unset shows the outline
/// double (first tap = bury, the main gesture), "down" shows it filled red,
/// "down1" shows a single filled thumb — the "show rarely" state.
struct ThumbsDownStateIcon: View {
    let rating: String?
    var size: CGFloat = 13

    var body: some View {
        if rating == "down1" {
            Image(systemName: "hand.thumbsdown.fill")
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(Color(hex: 0xE0635A))
        } else {
            DoubleThumbsDown(active: rating == "down", size: size)
        }
    }
}

/// The thumbs-down tap cycle. First tap = double thumbs down (bury) — the
/// headline behavior. A second tap within a beat downgrades to the single
/// thumbs down ("exotica": keep it around, serve at most one per set). A
/// later tap on either state clears it back to normal.
enum ThumbsDownCycle {
    static let window: TimeInterval = 1.0

    static func next(from current: String?, lastTap: Date?) -> String? {
        if current == "down", let t = lastTap, Date().timeIntervalSince(t) < window {
            return "down1"
        }
        if current == "down" || current == "down1" { return nil }
        return "down"
    }

    static func accessibilityLabel(for rating: String?) -> String {
        switch rating {
        case "down": return "Buried — tap again quickly to show rarely instead"
        case "down1": return "Shown rarely — tap to restore"
        default: return "Bury this card"
        }
    }
}
