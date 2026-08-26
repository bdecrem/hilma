import SwiftUI

/// Topics screen — direct port of `TopicsScreen` from feynd-screens.jsx.
/// Library eyebrow, 34pt title, Recent pill, meta strip, rows with mini glyph
/// + 16.5pt title + star meta + kebab. Custom chrome end-to-end.
enum TopicSort: String, CaseIterable, Identifiable {
    case recent, alphabetical, byStars
    var id: String { rawValue }
    var label: String {
        switch self {
        case .recent: return "Recent"
        case .alphabetical: return "A–Z"
        case .byStars: return "By stars"
        }
    }
}

struct TopicsView: View {
    @Environment(Session.self) private var session
    @State private var topics: [F2Topic] = []
    @State private var loading = false
    @State private var loadError: String? = nil
    @State private var renameTarget: F2Topic? = nil
    @State private var showNewTopic = false
    @State private var showProfile = false
    @State private var contextTarget: TopicContextTarget? = nil
    @State private var reviewsTarget: TopicContextTarget? = nil
    @State private var communityPresented = false
    @State private var shareError: String? = nil
    @State private var flashTarget: F2Topic? = nil
    @State private var audioError: String? = nil
    /// True while a background task is polling for in-flight audio or book
    /// summaries.
    @State private var pollingAudio = false
    @State private var bookReaderTarget: F2Topic? = nil
    @State private var bookError: String? = nil
    /// Whether the big in-scroll title is on screen (bar echoes it when not).
    @State private var bigTitleVisible = true
    /// Bumped by double-tapping the bar — the list scrolls back to the top.
    @State private var scrollTopSignal = 0
    /// Persists across launches; defaults to recent.
    @AppStorage("topicsSortMode") private var sortRaw = TopicSort.recent.rawValue

    private var sort: TopicSort { TopicSort(rawValue: sortRaw) ?? .recent }

    /// Apply the active sort to an arbitrary slice of topics.
    private func applySort(_ list: [F2Topic]) -> [F2Topic] {
        switch sort {
        case .recent:
            // Server already returns by updated_at desc; preserve order.
            return list
        case .alphabetical:
            return list.sorted {
                $0.displayLabel.localizedCaseInsensitiveCompare($1.displayLabel) == .orderedAscending
            }
        case .byStars:
            // 0-star topics first (what needs work), then 1, 2, 3.
            // Within a star bucket, preserve the server's recent-first order.
            return list.sorted { $0.stars < $1.stars }
        }
    }

    /// Pinned topics float above everything, newest-pinned first, regardless
    /// of the active sort.
    private var pinnedTopics: [F2Topic] {
        topics.filter(\.isPinned).sorted {
            ($0.pinnedAt ?? .distantPast) > ($1.pinnedAt ?? .distantPast)
        }
    }

    /// Everything not pinned, in the active sort order.
    private var unpinnedTopics: [F2Topic] {
        applySort(topics.filter { !$0.isPinned })
    }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                FeyndTopBar {
                    BarTitle(text: "Topics", bigTitleVisible: bigTitleVisible)
                } trailing: {
                    // The sort pill lives in the pinned bar so it stays
                    // reachable however far the list is scrolled.
                    sortMenu
                } onProfileTap: {
                    showProfile = true
                } onDoubleTap: {
                    scrollTopSignal += 1
                }

                // Center + clamp the column so wide Mac windows don't stretch
                // the row labels edge-to-edge. No-op on phone widths.
                VStack(spacing: 0) {
                    if topics.isEmpty && loading {
                        titleRow
                        ProgressView()
                            .tint(FeyndTheme.text2)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if topics.isEmpty {
                        titleRow
                        emptyState
                    } else {
                        rows
                    }
                }
                .feyndContentColumn()
            }

            // Floating new-topic button, tucked in the bottom-right corner
            // beside the tab pill.
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    newTopicButton
                }
            }
            .feyndContentColumn()
            .padding(.trailing, 8)
            .padding(.bottom, 66)
        }
        // Catalyst sheets don't always inherit @Observable env values — pass
        // `session` through explicitly (see dismissTopmostPresentedModal in
        // FeyndChrome.swift for the underlying Catalyst bug).
        .sheet(isPresented: $showProfile) { ProfileSheet().environment(session) }
        .sheet(item: $contextTarget) { target in
            TopicContextSheet(topicId: target.id, topicLabel: target.label,
                              seedFocus: target.seedFocus)
                .environment(session)
        }
        .sheet(item: $reviewsTarget) { target in
            ReviewsSheet(topicId: target.id, topicLabel: target.label)
        }
        .sheet(isPresented: $communityPresented) {
            CommunitySheet(onForked: {
                Task { await load() }
            })
            .environment(session)
        }
        .alert("Community",
               isPresented: Binding(get: { shareError != nil },
                                    set: { if !$0 { shareError = nil } })) {
            Button("OK") { shareError = nil }
        } message: {
            Text(shareError ?? "")
        }
        .sheet(item: $flashTarget) { topic in
            FlashCardsView(topicId: topic.id, topicLabel: topic.displayLabel)
                .environment(session)
        }
        .sheet(item: $bookReaderTarget) { topic in
            BookSummaryReaderView(topicId: topic.id, topicLabel: topic.displayLabel)
        }
        .sheet(item: $renameTarget) { topic in
            RenameTopicSheet(topic: topic) { newName, newKind in
                commitRename(topic, newName: newName, newKind: newKind)
            }
        }
        .sheet(isPresented: $showNewTopic) {
            NewTopicSheet { id, title in
                Task {
                    await load()
                    // Optional second step: the same Topic Context sheet, so
                    // material can go in right away. Waits a beat for the
                    // create sheet's dismissal to settle; cancel is free.
                    try? await Task.sleep(for: .milliseconds(550))
                    contextTarget = TopicContextTarget(id: id, label: title)
                }
            } onQuickChat: { id in
                Task { await load() }
                DeepLinkRouter.shared.requestQuickChat(topicId: id)
            }
        }
        .alert("Audio summary",
               isPresented: Binding(get: { audioError != nil },
                                    set: { if !$0 { audioError = nil } })) {
            Button("OK") { audioError = nil }
        } message: {
            Text(audioError ?? "")
        }
        .alert("Book summary",
               isPresented: Binding(get: { bookError != nil },
                                    set: { if !$0 { bookError = nil } })) {
            Button("OK") { bookError = nil }
        } message: {
            Text(bookError ?? "")
        }
        .onTitleVisibility { bigTitleVisible = $0 }
        // Cached list first (instant paint), then reload on every appearance —
        // keeps stars/level in sync with quizzes completed on the Topic
        // detail screen (no stale data when returning).
        .task {
            if topics.isEmpty, let cached: [F2Topic] = ScreenCache.load(key: ScreenCache.topics) {
                topics = cached
            }
            #if targetEnvironment(simulator)
            // `-OpenCommunity 1` — straight to the community directory for
            // screenshot loops.
            if UserDefaults.standard.bool(forKey: "OpenCommunity") {
                UserDefaults.standard.removeObject(forKey: "OpenCommunity")
                Task {
                    try? await Task.sleep(for: .milliseconds(900))
                    communityPresented = true
                }
            }
            #endif
            await load()
            await session.refreshProgress()
        }
        .onChange(of: session.progress) { _, _ in
            Task { await load() }
        }
    }

    // MARK: - Sections

    private var titleRow: some View {
        ScreenTitle(text: "Topics")
            .titleVisibilityMarker()
    }

    /// Floating + in the bottom-right corner. With the Chat tab gone this
    /// is THE way to start anything new, so it's a full-size FAB.
    private var newTopicButton: some View {
        Button { showNewTopic = true } label: {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(FeyndTheme.inkOnAccent)
                .frame(width: 54, height: 54)
                .background(FeyndTheme.accent, in: Circle())
                .shadow(color: .black.opacity(0.4), radius: 8, y: 3)
                .padding(6)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("New topic")
    }

    /// Recent / A–Z toggle. Menu lets the user pick; current pick is shown
    /// in the pill so the trailing chevron always has meaning.
    private var sortMenu: some View {
        Menu {
            ForEach(TopicSort.allCases) { option in
                Button {
                    sortRaw = option.rawValue
                } label: {
                    if option == sort {
                        Label(option.label, systemImage: "checkmark")
                    } else {
                        Text(option.label)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(sort.label)
                    .font(.system(size: 12.5, weight: .medium))
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
            }
            .foregroundStyle(FeyndTheme.text2)
            .padding(.leading, 11)
            .padding(.trailing, 10)
            .padding(.vertical, 5)
            .background(FeyndTheme.surface, in: Capsule())
            .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
        }
    }

    private var metaStrip: some View {
        HStack {
            Text("\(topics.count) TOPICS")
                .font(.system(size: 12, weight: .semibold))
                .tracking(0.2)
                .foregroundStyle(FeyndTheme.text3)
            Spacer()
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundStyle(FeyndTheme.text3)
            Text("No topics yet")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(FeyndTheme.text)
            Text("Send F2 a URL or ask a question to get started.")
                .font(.system(size: 13))
                .foregroundStyle(FeyndTheme.text2)
                .multilineTextAlignment(.center)
            // The other way in: pick up something another learner shared.
            Button { communityPresented = true } label: {
                Label("Browse community topics", systemImage: "person.2")
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(FeyndTheme.accent)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .background(FeyndTheme.surface, in: Capsule())
                    .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 32)
    }

    /// Quiet footer under the last topic row — the door to the community
    /// directory.
    private var communityRow: some View {
        Button { communityPresented = true } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.2")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(FeyndTheme.accent)
                Text("Community topics")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 10)
    }

    private var rows: some View {
        let pinned = pinnedTopics
        let unpinned = unpinnedTopics
        let hasPinned = !pinned.isEmpty
        return ScrollViewReader { proxy in
            ScrollView {
            // Bottom inset large enough to keep the floating TabPill from
            // covering the last row.
            LazyVStack(spacing: 0) {
                titleRow.padding(.horizontal, -14)
                    .id("topics-top")
                metaStrip
                if hasPinned {
                    sectionHeader("Pinned")
                    topicList(pinned)
                    // Only label the second group when there's a pinned group
                    // above it to distinguish; otherwise it's just "the list".
                    sectionHeader("All topics")
                }
                topicList(unpinned)
                communityRow
                Color.clear.frame(height: 96)
            }
            .padding(.horizontal, 14)
            }
            .scrollIndicators(.hidden)
            .refreshable {
                await load()
                await session.refreshProgress()
            }
            .onChange(of: scrollTopSignal) { _, _ in
                withAnimation(.easeOut(duration: 0.3)) {
                    proxy.scrollTo("topics-top", anchor: .top)
                }
            }
        }
    }

    @ViewBuilder
    private func topicList(_ display: [F2Topic]) -> some View {
        ForEach(Array(display.enumerated()), id: \.element.id) { idx, topic in
            NavigationLink(value: topic) {
                TopicListRow(topic: topic,
                             isLast: idx == display.count - 1,
                             onRename: { startRename(topic) },
                             onDelete: { delete(topic) },
                             onViewContext: {
                                 contextTarget = TopicContextTarget(
                                     id: topic.id, label: topic.displayLabel,
                                     seedFocus: topic.studyFocus)
                             },
                             onReviews: {
                                 reviewsTarget = TopicContextTarget(
                                     id: topic.id, label: topic.displayLabel)
                             },
                             onToggleShare: { toggleShare(topic) },
                             onGenerateAudio: { generateAudio(topic) },
                             onGenerateBook: { generateBook(topic) },
                             onViewBookSummary: { bookReaderTarget = topic },
                             onTogglePin: { togglePin(topic) },
                             onFlashCards: { flashTarget = topic })
            }
            .buttonStyle(.plain)
        }
    }

    private func sectionHeader(_ text: String) -> some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(FeyndTheme.text3)
            Spacer()
        }
        .padding(.horizontal, 4)
        .padding(.top, 18)
        .padding(.bottom, 6)
    }

    // MARK: - Data

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            topics = try await F2API.shared.listTopics()
            ScreenCache.save(topics, key: ScreenCache.topics)
            // Keep the on-device badge-refresher reminders in step with the
            // freshest recert due dates.
            RecertNotifications.sync(topics: topics)
        } catch {
            loadError = error.localizedDescription
        }
        startAudioPollingIfNeeded()
    }

    /// Fire off summary generation, mirror the pending state locally, and
    /// start polling so the row flips to Play when the server finishes.
    private func generateAudio(_ topic: F2Topic) {
        Task {
            do {
                let pending = try await F2API.shared.generateAudioSummary(
                    id: topic.id, model: F2ChatModel.current.rawValue)
                if let idx = topics.firstIndex(where: { $0.id == topic.id }) {
                    topics[idx].audioSummary = pending ?? F2AudioSummary(
                        status: "generating", url: nil, scale: nil,
                        durationSecs: nil, error: nil, updatedAt: nil)
                }
                startAudioPollingIfNeeded()
            } catch {
                audioError = error.localizedDescription
            }
        }
    }

    /// Kick off the study summary for a book topic and open the reader — it
    /// shows progress while the server searches and writes, then the text.
    private func generateBook(_ topic: F2Topic) {
        Task {
            do {
                let pending = try await F2API.shared.generateBookSummary(id: topic.id)
                if let idx = topics.firstIndex(where: { $0.id == topic.id }) {
                    topics[idx].bookSummary = pending
                        ?? F2BookSummary(status: "generating", error: nil, updatedAt: nil)
                }
            } catch let F2APIError.http(409, _) {
                // Already generating — fall through to the reader to watch it.
            } catch {
                bookError = error.localizedDescription
                return
            }
            bookReaderTarget = topic
            startAudioPollingIfNeeded()
        }
    }

    private var anySummaryGenerating: Bool {
        topics.contains {
            $0.audioSummary?.status == "generating" || $0.bookSummary?.status == "generating"
        }
    }

    /// One poller at a time; re-fetches the list every few seconds while any
    /// audio or book summary is still generating. Book-scale audio takes a
    /// few minutes; book summaries a minute or two.
    private func startAudioPollingIfNeeded() {
        guard !pollingAudio, anySummaryGenerating else { return }
        pollingAudio = true
        Task {
            defer { pollingAudio = false }
            while anySummaryGenerating {
                try? await Task.sleep(for: .seconds(6))
                do { topics = try await F2API.shared.listTopics() } catch { break }
            }
        }
    }

    private func startRename(_ topic: F2Topic) {
        renameTarget = topic
    }

    private func commitRename(_ target: F2Topic, newName: String, newKind: String?) {
        renameTarget = nil
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        let kindChanged = newKind != nil && newKind != (target.kind ?? "fallback")
        guard name != target.topic || kindChanged else { return }
        if let idx = topics.firstIndex(where: { $0.id == target.id }) {
            topics[idx].topic = name
            if kindChanged, let newKind { topics[idx].kind = newKind }
        }
        Task {
            do {
                try await F2API.shared.renameTopic(
                    id: target.id, to: name, kind: kindChanged ? newKind : nil)
            } catch { await load() }
        }
    }

    private func delete(_ topic: F2Topic) {
        let prev = topics
        topics.removeAll { $0.id == topic.id }
        Task {
            do { try await F2API.shared.deleteTopic(id: topic.id) }
            catch { topics = prev }
        }
    }

    /// Share / unshare in the community directory. Optimistic flip so the
    /// menu label updates immediately; reverts on failure.
    private func toggleShare(_ topic: F2Topic) {
        let willShare = !(topic.shared ?? false)
        let prev = topics
        if let i = topics.firstIndex(where: { $0.id == topic.id }) {
            topics[i].shared = willShare
        }
        Task {
            do { try await F2API.shared.setShared(topicId: topic.id, shared: willShare) }
            catch {
                topics = prev
                shareError = "Couldn't \(willShare ? "share" : "unshare"): \(error.localizedDescription)"
            }
        }
    }

    private func togglePin(_ topic: F2Topic) {
        let willPin = !topic.isPinned
        let prev = topics
        // Optimistic: flip pinnedAt locally so the row jumps sections at once.
        if let i = topics.firstIndex(where: { $0.id == topic.id }) {
            topics[i].pinnedAt = willPin ? Date() : nil
        }
        Task {
            do { try await F2API.shared.setPinned(id: topic.id, pinned: willPin) }
            catch { topics = prev }
        }
    }
}

struct TopicListRow: View {
    let topic: F2Topic
    let isLast: Bool
    let onRename: () -> Void
    let onDelete: () -> Void
    let onViewContext: () -> Void
    let onReviews: () -> Void
    let onToggleShare: () -> Void
    let onGenerateAudio: () -> Void
    let onGenerateBook: () -> Void
    let onViewBookSummary: () -> Void
    let onTogglePin: () -> Void
    let onFlashCards: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                MiniTopicGlyph(kind: topic.kind, size: 36, verified: topic.stars >= 3, dimmed: topic.recertLapsed)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 5) {
                        if topic.isPinned {
                            Image(systemName: "pin.fill")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(FeyndTheme.accent)
                                .rotationEffect(.degrees(45))
                        }
                        Text(topic.displayLabel)
                            .font(.system(size: 16.5, weight: .semibold))
                            .tracking(-0.3)
                            .foregroundStyle(FeyndTheme.text)
                            .lineLimit(1)
                    }
                    metaLine
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Menu {
                    Button { onTogglePin() } label: {
                        Label(topic.isPinned ? "Unpin" : "Pin",
                              systemImage: topic.isPinned ? "pin.slash" : "pin")
                    }
                    Button { onFlashCards() } label: { Label("Flash cards", systemImage: "bolt.fill") }
                    Button { onRename() } label: { Label("Rename", systemImage: "pencil") }
                    Button { onViewContext() } label: { Label("View context", systemImage: "doc.text.magnifyingglass") }
                    Button { onReviews() } label: { Label("Reviews", systemImage: "checkmark.seal") }
                    Button { onToggleShare() } label: {
                        topic.shared == true
                            ? Label("Remove from community", systemImage: "minus.circle")
                            : Label("Share to community", systemImage: "person.2")
                    }
                    audioMenuItem
                    if topic.kind == "book" { bookMenuItems }
                    Button(role: .destructive) { onDelete() } label: { Label("Delete", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text3)
                        .padding(8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 14)
            .padding(.leading, 4)
            .padding(.trailing, 6)

            if !isLast {
                Rectangle()
                    .fill(FeyndTheme.borderSoft)
                    .frame(height: 1)
            }
        }
    }

    private var isNew: Bool { topic.stars == 0 && topic.quizCount == 0 }

    /// One state-aware entry in the kebab menu. While a summary is cooking
    /// the item is disabled so a double-tap can't double-spend.
    @ViewBuilder
    private var audioMenuItem: some View {
        switch topic.audioSummary?.status {
        case "generating":
            Button {} label: { Label("Generating audio…", systemImage: "hourglass") }
                .disabled(true)
        case "ready":
            Button { onGenerateAudio() } label: {
                Label("Regenerate Audio Summary", systemImage: "waveform")
            }
        case "error":
            Button { onGenerateAudio() } label: {
                Label("Retry Audio Summary", systemImage: "waveform.badge.exclamationmark")
            }
        default:
            Button { onGenerateAudio() } label: {
                Label("Generate Audio Summary", systemImage: "waveform")
            }
        }
    }

    /// Book topics only: generate / watch / read the web-researched study
    /// summary. Same state dance as the audio entry; the reader sheet shows
    /// progress while a generation is in flight.
    @ViewBuilder
    private var bookMenuItems: some View {
        switch topic.bookSummary?.status {
        case "generating":
            Button { onViewBookSummary() } label: {
                Label("Book summary (writing…)", systemImage: "hourglass")
            }
        case "ready":
            Button { onViewBookSummary() } label: {
                Label("View Book Summary", systemImage: "text.book.closed")
            }
            Button { onGenerateBook() } label: {
                Label("Regenerate Book Summary", systemImage: "arrow.clockwise")
            }
        case "error":
            Button { onGenerateBook() } label: {
                Label("Retry Book Summary", systemImage: "exclamationmark.triangle")
            }
        default:
            Button { onGenerateBook() } label: {
                Label("Generate Book Summary", systemImage: "text.book.closed")
            }
        }
    }

    /// Trailing note on the meta line while audio is generating or failed.
    private var audioNote: String? {
        switch topic.audioSummary?.status {
        case "generating": return "making audio…"
        case "error": return "audio failed"
        default: return nil
        }
    }

    @ViewBuilder
    private var metaLine: some View {
        if isNew {
            Text("\(relative(topic.createdAt)) · no quizzes yet\(audioNote.map { " · \($0)" } ?? "")")
                .font(.system(size: 12.5))
                .foregroundStyle(FeyndTheme.text3)
                .tracking(-0.1)
        } else {
            HStack(spacing: 8) {
                StarRow(value: topic.stars, size: 11, gap: 2, locked: topic.hardQuizCompletedAt != nil)
                Text("·").foregroundStyle(FeyndTheme.text3)
                Text(relative(topic.createdAt) + (audioNote.map { " · \($0)" } ?? ""))
                    .foregroundStyle(FeyndTheme.text3)
            }
            .font(.system(size: 12.5))
            .tracking(-0.1)
        }
    }
}

/// Compact relative time ("1d", "2d", "3w"), matching the design's "1d ago" style.
func relative(_ date: Date) -> String {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .short
    return f.localizedString(for: date, relativeTo: Date())
}

/// What the Topic Context sheet needs to open — decoupled from F2Topic so
/// the sheet can also be shown for a topic created seconds ago, or from a
/// chat screen that only holds a thread.
struct TopicContextTarget: Identifiable {
    let id: String
    let label: String
    var seedFocus: String? = nil
}

/// The placeholder title a quick chat is born with — replaced when the user
/// names it on the way out.
let quickChatPlaceholderTitle = "Quick chat"

/// The + button's sheet: type a title, pick a type, done. The topic starts
/// bare — chat and the context sheet give it substance later. The footer
/// offers the no-setup path: just start chatting.
struct NewTopicSheet: View {
    /// Called after the topic was created server-side — (id, title).
    let onCreated: (String, String) -> Void
    /// Called after a quick-chat placeholder topic was created — (id).
    let onQuickChat: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var kind = "general"
    @State private var busy = false
    @State private var quickBusy = false
    @State private var errorMessage: String? = nil
    @FocusState private var titleFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("What are you learning?", text: $title, axis: .vertical)
                        .lineLimit(1...3)
                        .focused($titleFocused)
                }
                Section("Type") {
                    HStack(spacing: 12) {
                        MiniTopicGlyph(kind: kind, size: 30)
                        // Only the three human types here — the source kinds
                        // (web/video/…) describe material, and a typed-in
                        // topic has none yet.
                        Picker("Type", selection: $kind) {
                            Text("Book").tag("book")
                            Text("Mini Topic").tag("mini")
                            Text("General Topic").tag("general")
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        Spacer()
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
                Section {
                    Button { startQuickChat() } label: {
                        VStack(spacing: 3) {
                            Text(quickBusy ? "Starting…" : "Just chat")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(FeyndTheme.accent)
                            Text("No topic — name it later if it's a keeper.")
                                .font(.system(size: 12))
                                .foregroundStyle(FeyndTheme.text3)
                        }
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(busy || quickBusy)
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("New topic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { closeModal(dismiss) }.keyboardShortcut(.cancelAction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Creating…" : "Create") { create() }
                        .disabled(busy || quickBusy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { titleFocused = true }
        }
        .presentationDetents([.medium])
    }

    private func create() {
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        busy = true
        Task {
            do {
                let id = try await F2API.shared.createTopic(title: name, kind: kind)
                onCreated(id, name)
                closeModal(dismiss)
            } catch {
                errorMessage = "Couldn't create: \(error.localizedDescription)"
                busy = false
            }
        }
    }

    /// "Just chat": create the placeholder topic, dismiss, and let the host
    /// push the quick-chat screen.
    private func startQuickChat() {
        guard !busy && !quickBusy else { return }
        quickBusy = true
        Task {
            do {
                let id = try await F2API.shared.createTopic(
                    title: quickChatPlaceholderTitle, kind: "chat")
                onQuickChat(id)
                closeModal(dismiss)
            } catch {
                errorMessage = "Couldn't start a chat: \(error.localizedDescription)"
                quickBusy = false
            }
        }
    }
}

/// Rename + type editor. The type is the small glyph on the topic row —
/// auto-classified at creation, user-overridable here. Book and Mini Topic
/// are the two main types; General Topic covers non-book subjects.
struct RenameTopicSheet: View {
    let topic: F2Topic
    /// (newName, newKind) — kind is the raw value the picker landed on.
    let onSave: (String, String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft: String
    @State private var kind: String

    /// Dropdown order: the main user types first, the auto source kinds
    /// after, the unclassified default last.
    static let kindOptions: [(value: String, label: String)] = [
        ("book", "Book"),
        ("mini", "Mini Topic"),
        ("general", "General Topic"),
        ("web", "Web page"),
        ("video", "Video"),
        ("audio", "Audio"),
        ("paste", "Pasted text"),
        ("chat", "Chat"),
        ("fallback", "Default"),
    ]

    init(topic: F2Topic, onSave: @escaping (String, String?) -> Void) {
        self.topic = topic
        self.onSave = onSave
        _draft = State(initialValue: topic.topic ?? topic.displayLabel)
        _kind = State(initialValue: topic.kind ?? "fallback")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Title", text: $draft, axis: .vertical)
                        .lineLimit(1...3)
                }
                Section("Type") {
                    HStack(spacing: 12) {
                        MiniTopicGlyph(kind: kind, size: 30)
                        Picker("Type", selection: $kind) {
                            ForEach(Self.kindOptions, id: \.value) { option in
                                Text(option.label).tag(option.value)
                            }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        Spacer()
                    }
                }
            }
            .navigationTitle("Rename topic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { closeModal(dismiss) }.keyboardShortcut(.cancelAction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(draft, kind)
                        closeModal(dismiss)
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
