import SwiftUI
import Observation

/// Runs deck generation in the background so no sheet has to stay open while
/// the LLM writes cards (20-60s). Owns the in-app toast that announces the
/// finished deck. Singleton — outlives whichever view kicked off the build.
@MainActor
@Observable
final class FlashDeckBuilder {
    static let shared = FlashDeckBuilder()

    struct Toast: Equatable {
        let message: String
        let isError: Bool
    }

    private(set) var buildingTopicIds: Set<String> = []
    var toast: Toast? = nil
    private var toastDismissTask: Task<Void, Never>? = nil

    func isBuilding(_ topicId: String) -> Bool {
        buildingTopicIds.contains(topicId)
    }

    /// Fire-and-forget deck build. The caller dismisses its UI immediately;
    /// completion (or failure) surfaces as a toast over whatever screen the
    /// user is on by then.
    func generate(topicId: String, topicLabel: String, count: Int, model: String?) {
        guard !buildingTopicIds.contains(topicId) else { return }
        buildingTopicIds.insert(topicId)
        Task {
            do {
                let cards = try await F2API.shared.generateFlashCards(
                    topicId: topicId, count: count, model: model)
                show(Toast(message: "\(cards.count) new cards ready · \(topicLabel)", isError: false))
            } catch {
                show(Toast(message: "Couldn't write cards for \(topicLabel) — try again.", isError: true))
            }
            buildingTopicIds.remove(topicId)
        }
    }

    private func show(_ t: Toast) {
        toastDismissTask?.cancel()
        toast = t
        FlashSFX.shared.play(.ding)
        toastDismissTask = Task {
            try? await Task.sleep(for: .seconds(4.5))
            if !Task.isCancelled {
                toast = nil
            }
        }
    }
}

/// The drop-down banner itself — rendered by MainTabsView above everything.
struct FlashToastBanner: View {
    let toast: FlashDeckBuilder.Toast

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: toast.isError ? "exclamationmark.triangle.fill" : "bolt.fill")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(toast.isError ? Color(hex: 0xE0635A) : FeyndTheme.gold)
            Text(toast.message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FeyndTheme.text)
                .lineLimit(2)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(FeyndTheme.surface, in: Capsule())
        .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        .shadow(color: .black.opacity(0.35), radius: 18, y: 6)
        .padding(.horizontal, 24)
    }
}
