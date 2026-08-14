import Foundation
import Observation

/// Cross-view deep-link intents. URL handling lands in MainTabsView (it owns
/// the tab switch); views that must ACT on a link observe this instead of
/// re-parsing URLs. `pending` survives the destination view not being
/// mounted yet (cold start / other tab): the view consumes it on appear.
@Observable
final class DeepLinkRouter {
    static let shared = DeepLinkRouter()

    /// Bumped every time a peck link wants the current set opened — the
    /// daily-card iMessage flow's "keep going in Dodo" link. Views on
    /// screen react via onChange; `pendingPeckPlay` covers mount races.
    var peckPlaySignal = 0
    var pendingPeckPlay = false

    func requestPeckPlay() {
        pendingPeckPlay = true
        peckPlaySignal += 1
    }

    /// True at most once per request — the consumer that gets `true` runs
    /// the auto-play.
    func consumePeckPlay() -> Bool {
        guard pendingPeckPlay else { return false }
        pendingPeckPlay = false
        return true
    }
}
