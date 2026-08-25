import SwiftUI

/// Review history for one topic — every graded Final Review (plus Second
/// Chance retakes and refreshers), newest first. Tap an attempt for the
/// grade sheet the exam ended with: notes, strengths, weaknesses.
/// Quizzes may join this list later.
struct ReviewsSheet: View {
    @Environment(\.dismiss) private var dismiss

    let topicId: String
    let topicLabel: String

    @State private var reviews: [F2API.ReviewAttempt] = []
    @State private var loading = true
    @State private var loadError: String? = nil

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                handle
                header
                content
            }
            .background(FeyndTheme.bgRaised.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: F2API.ReviewAttempt.self) { attempt in
                ReviewDetailView(topicLabel: topicLabel, attempt: attempt)
            }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .tint(FeyndTheme.text2)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let err = loadError {
            Text(err)
                .font(.system(size: 13))
                .foregroundStyle(FeyndTheme.text3)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(24)
        } else if reviews.isEmpty {
            VStack(spacing: 10) {
                Image(systemName: "checkmark.seal")
                    .font(.system(size: 30))
                    .foregroundStyle(FeyndTheme.text3)
                Text("No reviews yet")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text)
                Text("Take a Final Review from this topic's chat — every graded attempt lands here.")
                    .font(.system(size: 13))
                    .foregroundStyle(FeyndTheme.text2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 36)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(reviews) { attempt in
                        NavigationLink(value: attempt) {
                            row(attempt)
                        }
                        .buttonStyle(.plain)
                        if attempt.id != reviews.last?.id {
                            Rectangle()
                                .fill(FeyndTheme.borderSoft)
                                .frame(height: 1)
                                .padding(.horizontal, 18)
                        }
                    }
                }
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func row(_ attempt: F2API.ReviewAttempt) -> some View {
        HStack(spacing: 14) {
            GradeBadge(grade: attempt.grade, size: 40)
            VStack(alignment: .leading, spacing: 3) {
                Text(attempt.modeLabel)
                    .font(.system(size: 15.5, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text(attempt.gradedAt.formatted(.dateTime.month(.abbreviated).day().year().hour().minute()))
                    .font(.system(size: 12.5))
                    .foregroundStyle(FeyndTheme.text3)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(FeyndTheme.text3)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            reviews = try await F2API.shared.listReviews(topicId: topicId)
        } catch {
            loadError = "Couldn't load reviews: \(error.localizedDescription)"
        }
    }

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
                Text("Reviews")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text(topicLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(FeyndTheme.text3)
                    .lineLimit(1)
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
        .padding(.bottom, 10)
    }
}

/// The letter grade in a colored circle — gold for an A (with or without
/// modifier), theme accent otherwise.
struct GradeBadge: View {
    let grade: String
    var size: CGFloat = 40

    private var isA: Bool { grade.uppercased().hasPrefix("A") }

    var body: some View {
        Text(grade.uppercased())
            .font(.system(size: size * 0.42, weight: .bold))
            .foregroundStyle(isA ? Color(hex: 0x3A2B00) : FeyndTheme.text)
            .frame(width: size, height: size)
            .background(isA ? FeyndTheme.gold : FeyndTheme.surface2, in: Circle())
            .overlay(Circle().stroke(isA ? FeyndTheme.gold : FeyndTheme.border, lineWidth: 1))
    }
}

/// One attempt's full grade sheet — exactly what the exam's closing screen
/// showed: grade, examiner's notes, strengths, and weaknesses.
struct ReviewDetailView: View {
    @Environment(\.dismiss) private var dismiss

    let topicLabel: String
    let attempt: F2API.ReviewAttempt

    var body: some View {
        VStack(spacing: 0) {
            detailHeader
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(spacing: 14) {
                        GradeBadge(grade: attempt.grade, size: 56)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(attempt.modeLabel)
                                .font(.system(size: 18, weight: .bold))
                                .tracking(-0.3)
                                .foregroundStyle(FeyndTheme.text)
                            Text(attempt.gradedAt.formatted(.dateTime.month(.wide).day().year().hour().minute()))
                                .font(.system(size: 13))
                                .foregroundStyle(FeyndTheme.text3)
                        }
                    }
                    .padding(.top, 8)

                    if let notes = attempt.notes, !notes.isEmpty {
                        section("Examiner's notes") {
                            Text(notes)
                                .font(.system(size: 14.5))
                                .foregroundStyle(FeyndTheme.text)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    if !attempt.strengths.isEmpty {
                        section("Strengths") {
                            bulletList(attempt.strengths, systemImage: "checkmark",
                                       tint: FeyndTheme.accent)
                        }
                    }

                    if !attempt.weaknesses.isEmpty {
                        section("To work on") {
                            bulletList(attempt.weaknesses, systemImage: "arrow.up.right",
                                       tint: Color(hex: 0xE0635A))
                        }
                    }

                    Spacer(minLength: 24)
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
        .background(FeyndTheme.bgRaised.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private var detailHeader: some View {
        ZStack {
            VStack(spacing: 2) {
                Text("Review")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(FeyndTheme.text)
                Text(topicLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(FeyndTheme.text3)
                    .lineLimit(1)
            }
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(FeyndTheme.text2)
                        .frame(width: 36, height: 36)
                        .background(FeyndTheme.surface2, in: Circle())
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.leading, 14)
        }
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    @ViewBuilder
    private func section(_ title: String, @ViewBuilder body: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(FeyndTheme.text3)
            body()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(FeyndTheme.borderSoft, lineWidth: 1))
    }

    private func bulletList(_ items: [String], systemImage: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .firstTextBaseline, spacing: 9) {
                    Image(systemName: systemImage)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(tint)
                    Text(item)
                        .font(.system(size: 14))
                        .foregroundStyle(FeyndTheme.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

extension F2API.ReviewAttempt: Hashable {
    static func == (lhs: F2API.ReviewAttempt, rhs: F2API.ReviewAttempt) -> Bool {
        lhs.id == rhs.id
    }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
