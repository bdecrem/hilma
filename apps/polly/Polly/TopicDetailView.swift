import SwiftUI

/// A topic's screen (Direction 2b). What used to be one chat window with
/// things stacked above it is now three screens, and none of them has a
/// composer: text chat is the quieter line under the voice button (TalkPair),
/// and opens full screen (TextChatView).
///   infinity                → InfinityHomeView (the hero + the journey)
///   lesson (Polly wrote it) → LessonTopicView (read it, the pair, three steps)
///   everything else         → SourceTopicView (the source, the pair, steps, chats)
struct TopicDetailView: View {
    let topicId: String
    /// What the list already knows, so the right screen opens at once.
    var kind: String? = nil
    var title: String? = nil

    @State private var resolvedKind: String? = nil
    @State private var resolvedTitle: String? = nil

    var body: some View {
        Group {
            switch kind ?? resolvedKind {
            case "infinity":
                InfinityHomeView(topicId: topicId, title: title ?? resolvedTitle ?? "Infinity Chat")
            case "lesson":
                LessonTopicView(topicId: topicId)
            case .some:
                SourceTopicView(topicId: topicId)
            case .none:
                ZStack {
                    PollyTheme.bg.ignoresSafeArea()
                    ProgressView().tint(PollyTheme.text2)
                }
                .navigationBarBackButtonHidden(true)
            }
        }
        .task {
            guard kind == nil, resolvedKind == nil else { return }
            let t = try? await PollyAPI.shared.getThread(id: topicId)
            resolvedTitle = t?.topic
            resolvedKind = t?.kind ?? "general"
        }
    }
}
