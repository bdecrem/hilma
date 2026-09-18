import SwiftUI

/// The Lesson card at the top of a guest lesson: who made it and the key
/// words, one line each. Tapping opens LessonSheet with the whole plan.
struct LessonCard: View {
    let lesson: PollyLesson?
    /// True while the backend is still extracting the plan.
    var loading: Bool = false
    var onOpen: () -> Void = {}

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 11) {
                MiniTopicGlyph(kind: "guest_lesson", size: 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(lesson?.byline ?? "Lesson")
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(PollyTheme.text)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 11.5))
                        .foregroundStyle(PollyTheme.text3)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                if loading {
                    ProgressView().tint(PollyTheme.text3).scaleEffect(0.8)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PollyTheme.text3)
                }
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.border, lineWidth: 1))
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
        .disabled(lesson == nil)
    }

    private var subtitle: String {
        if let lesson {
            let words = lesson.keyWords.map(\.term)
            return words.isEmpty ? "\(lesson.phrases.count) expressions" : words.joined(separator: " · ")
        }
        return loading ? "Reading the lesson…" : "No plan yet"
    }
}

/// The whole lesson plan: key words with meanings and their sentences from
/// the story, further expressions, the story in brief (target language,
/// with an English toggle), the host's usage point and closing question.
struct LessonSheet: View {
    @Environment(\.dismiss) private var dismiss
    let topicLabel: String
    let lesson: PollyLesson
    @State private var storyInEnglish = false

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    // A lesson Polly wrote leads with its conversation; a
                    // guest lesson with the host's key words.
                    if let lines = lesson.dialogue, !lines.isEmpty {
                        conversation(lines)
                    }
                    if !lesson.keyWords.isEmpty {
                        section(lesson.dialogue == nil ? "Key words" : "Words", lesson.keyWords)
                    }
                    if !lesson.phrases.isEmpty {
                        section(lesson.dialogue == nil ? "From the story" : "Expressions", lesson.phrases)
                    }
                    if lesson.dialogue == nil { story }
                    if let g = lesson.grammarPoint, !g.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            eyebrow(lesson.dialogue == nil ? "Usage" : "Grammar")
                            Text(g)
                                .font(.system(size: 14, weight: lesson.grammarExplained == nil ? .regular : .semibold))
                                .foregroundStyle(PollyTheme.text)
                            if let more = lesson.grammarExplained, !more.isEmpty {
                                Text(more)
                                    .font(.system(size: 14))
                                    .lineSpacing(3)
                                    .foregroundStyle(PollyTheme.text2)
                            }
                        }
                    }
                    if let q = lesson.closingQuestion, !q.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            eyebrow((lesson.host ?? "The host") + " asks")
                            Text(q)
                                .font(.system(size: 15, weight: .semibold))
                                .italic()
                                .foregroundStyle(PollyTheme.accent)
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
        }
        .background(PollyTheme.bg.ignoresSafeArea())
    }

    private var handle: some View {
        Capsule()
            .fill(PollyTheme.surface3)
            .frame(width: 38, height: 4)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
    }

    private var header: some View {
        ZStack {
            VStack(spacing: 2) {
                Text(lesson.byline)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(PollyTheme.text)
                    .lineLimit(1)
                Text(topicLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(PollyTheme.text3)
                    .lineLimit(1)
            }
            .padding(.horizontal, 56)
            HStack {
                Spacer()
                Button { closeModal(dismiss) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PollyTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(PollyTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    private func eyebrow(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(PollyTheme.text3)
    }

    private func section(_ title: String, _ terms: [PollyLessonTerm]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            eyebrow(title)
            VStack(spacing: 0) {
                ForEach(Array(terms.enumerated()), id: \.offset) { i, t in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(t.term)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(PollyTheme.accent)
                            Text(t.meaning)
                                .font(.system(size: 13.5))
                                .foregroundStyle(PollyTheme.text)
                        }
                        if !t.sentence.isEmpty {
                            Text("“\(t.sentence)”")
                                .font(.system(size: 13))
                                .italic()
                                .foregroundStyle(PollyTheme.text2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    if i < terms.count - 1 {
                        Rectangle().fill(PollyTheme.borderSoft).frame(height: 1)
                            .padding(.horizontal, 14)
                    }
                }
            }
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.border, lineWidth: 1))
        }
    }

    /// The model conversation of a lesson Polly wrote: each line with its
    /// English under it (the toggle hides the English, to test yourself).
    private func conversation(_ lines: [PollyDialogueLine]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                eyebrow("The conversation")
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { storyInEnglish.toggle() }
                } label: {
                    Text(storyInEnglish ? "Hide English" : "Show English")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PollyTheme.accent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(PollyTheme.surface2, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 11) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, d in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(d.speaker.uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .tracking(0.7)
                            .foregroundStyle(d.speaker == "You" ? PollyTheme.accent : PollyTheme.text3)
                        Text(d.line)
                            .font(.system(size: 15.5, weight: .medium))
                            .foregroundStyle(PollyTheme.text)
                        if storyInEnglish {
                            Text(d.english)
                                .font(.system(size: 13))
                                .foregroundStyle(PollyTheme.text2)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.border, lineWidth: 1))
        }
    }

    private var story: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                eyebrow("The story")
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { storyInEnglish.toggle() }
                } label: {
                    Text(storyInEnglish ? lesson.language : "English")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PollyTheme.accent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(PollyTheme.surface2, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            Text(storyInEnglish ? lesson.storySummaryEnglish : lesson.storySummary)
                .font(.system(size: 15))
                .lineSpacing(3)
                .foregroundStyle(PollyTheme.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(PollyTheme.border, lineWidth: 1))
        }
    }
}
