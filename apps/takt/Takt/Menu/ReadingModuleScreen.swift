import SwiftUI

/// The Reading module (2026-11-07): three lessons, the right hand, the left, both, each the same
/// track played from the staff. All three are open; a lesson is done after two clean choruses;
/// the first not done is next.
struct ReadingModuleScreen: View {
    let app: AppModel
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        let content = Reading.bundled
        let done = app.readingDoneCount
        let next = app.nextReadingLesson
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: "Learn") {
                    app.route = .lessons
                }
                Text(content.module.title)
                    .font(.display(compact ? 30 : 44))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                StaffLines()
                    .frame(maxWidth: .infinity)
                AskButton(size: compact ? 34 : 36)
            }
            .padding(.top, compact ? 8 : 24)

            HStack(alignment: .firstTextBaseline) {
                Text(content.module.detail)
                    .bodyText(15)
                    .foregroundStyle(Palette.muted)
                Spacer(minLength: 12)
                Text(done == content.lessons.count ? "Done" : "\(done) of \(content.lessons.count) lessons")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(done == content.lessons.count ? Palette.good : Palette.text)
            }
            .padding(.top, 10)
            ModuleBar(done: done, count: content.lessons.count)
                .padding(.top, 10)

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(Array(content.lessons.enumerated()), id: \.offset) { i, l in
                        let isDone = app.readingDone(i)
                        LessonRowView(number: i + 1, title: l.title, skill: l.clef.title, goal: l.goal,
                                      state: isDone ? .done : i == next ? .next : .open, compact: compact) {
                            app.startReading(i)
                        }
                    }
                }
                .padding(.top, 16)
                .padding(.bottom, 12)
            }
            .scrollBounceBehavior(.basedOnSize)

            PrimaryButton(title: "\(app.readingDone(next) ? "Play" : "Start") lesson \(next + 1) · \(content.lessons[next].title)") {
                app.startReading(next)
            }
            .padding(.top, 8)
            .padding(.bottom, compact ? 8 : 24)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }
}

/// The Reading module on the Learn tab.
struct ReadingModuleCard: View {
    let app: AppModel
    var compact = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let content = Reading.bundled
        let done = app.readingDoneCount
        let n = app.nextReadingLesson
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(content.module.title)
                    .font(.display(compact ? 26 : 32))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 8)
                Text(done == content.lessons.count ? "Done" : "\(done) of \(content.lessons.count) lessons")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(done == content.lessons.count ? Palette.good : Palette.muted)
            }
            Text(content.module.detail)
                .bodyText(14)
                .foregroundStyle(Palette.muted)
            ModuleBar(done: done, count: content.lessons.count)
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(done < content.lessons.count ? "Next · Lesson \(n + 1)" : "Every lesson done")
                        .dataLabel(10)
                        .foregroundStyle(Palette.signal)
                    Text(content.lessons[n].title + " · " + content.lessons[n].clef.title)
                        .bodyText(16, weight: .semibold)
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 8)
                PrimaryButton(title: done == 0 ? "Start" : "Continue") { app.startReading(n) }
            }
        }
        .padding(compact ? 16 : 22)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .contentShape(shape)
        .onTapGesture { app.route = .readingModule }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
