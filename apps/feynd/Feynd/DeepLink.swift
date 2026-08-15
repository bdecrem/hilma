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

    // MARK: Discuss-a-card handoff

    /// "Discuss with Dodo" from the card clinic: land in the card's topic
    /// chat with a prefilled draft. Navigation (tab switch + push) consumes
    /// the thread id; the destination TopicDetailView consumes the draft.
    var topicChatSignal = 0
    var pendingChatThreadId: String?
    var pendingChatDraft: (threadId: String, text: String)?

    func requestTopicChat(threadId: String, draft: String) {
        pendingChatThreadId = threadId
        pendingChatDraft = (threadId, draft)
        topicChatSignal += 1
    }

    func consumeChatNavigation() -> String? {
        defer { pendingChatThreadId = nil }
        return pendingChatThreadId
    }

    /// The draft for THIS topic, at most once.
    func consumeChatDraft(threadId: String) -> String? {
        guard let d = pendingChatDraft, d.threadId == threadId else { return nil }
        pendingChatDraft = nil
        return d.text
    }
}
