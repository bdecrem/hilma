import SwiftUI

struct HomeView: View {
    @Environment(AppSession.self) private var session

    @State private var talkTopic: TopicSummary?
    @State private var talkFreeform = false
    @State private var breathing = false

    /// The chapter the hero button practices: first prebaked chapter at the
    /// user's level, falling back to the first chapter of the course.
    private var currentChapter: TopicSummary? {
        guard let topics = session.topics else { return nil }
        return topics.prebaked.first { $0.level == session.progress.level }
            ?? topics.prebaked.first
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 32) {
                    header
                    talkHero
                        .frame(maxWidth: .infinity)
                    if let chapter = currentChapter {
                        chapterCard(chapter)
                    }
                    freeformRow
                }
                .padding(20)
            }
            .background(Theme.bg)
            .navigationDestination(for: TopicSummary.self) { summary in
                TopicDetailView(summary: summary)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            if session.topics == nil { await session.refreshTopics() }
        }
        .refreshable { await session.refreshTopics() }
        .fullScreenCover(item: $talkTopic) { topic in
            TalkView(topic: topic)
        }
        .fullScreenCover(isPresented: $talkFreeform) {
            TalkView(topic: nil)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(session.currentLanguage.nativeName)
                .font(.target(28, .semibold))
                .foregroundStyle(Theme.ink)
            Text("\(levelTitle(session.progress.level)) · Level \(session.progress.level) · \(session.progress.xp) XP")
                .font(.system(size: 13))
                .foregroundStyle(Theme.inkTertiary)
        }
        .padding(.top, 8)
    }

    private var talkHero: some View {
        Button {
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            if let chapter = currentChapter {
                talkTopic = chapter
            } else {
                talkFreeform = true
            }
        } label: {
            VStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(Theme.accent)
                        .frame(width: 104, height: 104)
                    Image(systemName: "waveform")
                        .font(.system(size: 40, weight: .medium))
                        .foregroundStyle(.white)
                }
                .scaleEffect(breathing ? 1.02 : 1.0)

                VStack(spacing: 4) {
                    Text("Start conversation")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    if let chapter = currentChapter {
                        Text("Chapter \(chapter.sortOrder + 1) · \(chapter.titleTarget ?? chapter.title)")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.inkTertiary)
                    }
                }
            }
            .padding(.vertical, 16)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("startConversation")
        .onAppear {
            guard !UIAccessibility.isReduceMotionEnabled else { return }
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) {
                breathing = true
            }
        }
    }

    private func chapterCard(_ chapter: TopicSummary) -> some View {
        NavigationLink(value: chapter) {
            VStack(alignment: .leading, spacing: 12) {
                Eyebrow(text: "Chapter \(chapter.sortOrder + 1) · \(levelTitle(chapter.level))")
                VStack(alignment: .leading, spacing: 2) {
                    Text(chapter.titleTarget ?? chapter.title)
                        .font(.target(22, .semibold))
                        .foregroundStyle(Theme.ink)
                    Text(chapter.title)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.inkSecondary)
                }
                ChapterThread()
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var freeformRow: some View {
        Button {
            talkFreeform = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "bubble.left.and.text.bubble.right")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Theme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Freeform conversation")
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.ink)
                    Text("Talk about anything — we'll make a chapter from it.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.inkTertiary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.inkTertiary)
            }
            .padding(16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// The chapter progress device: Dialogue · Cards · Grammar as three nodes on
/// a thread. Decorative in v1 (no per-part completion tracking yet).
struct ChapterThread: View {
    var body: some View {
        HStack(spacing: 0) {
            node("Dialogue", ringed: true)
            line
            node("Cards", ringed: false)
            line
            node("Grammar", ringed: false)
        }
    }

    private var line: some View {
        Rectangle()
            .fill(Theme.accentTint)
            .frame(height: 2)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 6)
            .offset(y: -9) // center on the 8pt node, above the caption
    }

    private func node(_ label: String, ringed: Bool) -> some View {
        VStack(spacing: 6) {
            Circle()
                .strokeBorder(ringed ? Theme.accent : Theme.accentTint, lineWidth: 2)
                .frame(width: 10, height: 10)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.inkTertiary)
        }
    }
}
