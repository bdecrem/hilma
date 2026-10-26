import SwiftUI

/// A module: its lessons in order, each with its skill and goal, done (✓), next (▶) or locked,
/// and one button for the next lesson. Done lessons can be played again. Lessons that aren't
/// built yet sit at the end, locked.
struct ModuleScreen: View {
    let app: AppModel
    /// The module's entry code ("A1", "S").
    let code: String
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        let content = app.module(code)
        let done = app.lessonsDone(content)
        let finished = app.progress.lesson(content.code).completed != nil
        let next = finished ? nil : min(done, content.lessons.count - 1)
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
            }
            .padding(.top, compact ? 8 : 24)

            HStack(alignment: .firstTextBaseline) {
                Text(content.module.detail)
                    .bodyText(15)
                    .foregroundStyle(Palette.muted)
                Spacer(minLength: 12)
                Text(finished ? "Done" : "\(done) of \(content.lessons.count) lessons")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(finished ? Palette.good : Palette.text)
            }
            .padding(.top, 10)
            ModuleBar(done: done, count: content.lessons.count)
                .padding(.top, 10)

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(Array(content.lessons.enumerated()), id: \.offset) { i, spec in
                        LessonRowView(number: i + 1, title: spec.title, skill: spec.skill, goal: spec.goal,
                                      state: i < done ? .done : i == next ? .next : .locked, compact: compact) {
                            app.start(module: code, lesson: i + 1)
                        }
                    }
                    ForEach(Array((content.later ?? []).enumerated()), id: \.offset) { i, l in
                        LessonRowView(number: content.lessons.count + i + 1, title: l.title, skill: l.skill, goal: "Coming soon",
                                      state: .soon, compact: compact) {}
                    }
                }
                .padding(.top, 16)
                .padding(.bottom, 12)
            }
            .scrollBounceBehavior(.basedOnSize)

            if let n = next {
                PrimaryButton(title: "Start lesson \(n + 1) · \(content.lessons[n].title)") { app.start(module: code, lesson: n + 1) }
                    .padding(.top, 8)
                    .padding(.bottom, compact ? 8 : 24)
            } else {
                QuietButton(title: "Play it again from lesson 1") { app.restart(lesson: code) }
                    .padding(.top, 8)
                    .padding(.bottom, compact ? 8 : 24)
            }
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }
}

/// One segment per lesson, filled as they're done.
struct ModuleBar: View {
    let done: Int
    let count: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<count, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(i < done ? Palette.signal : Palette.line)
                    .frame(height: 6)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(done) of \(count) lessons done")
    }
}

/// A lesson in the module list.
struct LessonRowView: View {
    enum State { case done, next, open, locked, soon }
    let number: Int
    let title: String
    let skill: String
    let goal: String
    let state: State
    var compact = false
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let open = state == .done || state == .next || state == .open
        HStack(alignment: .center, spacing: compact ? 12 : 18) {
            ZStack {
                Circle()
                    .fill(state == .next ? Palette.signal : state == .done ? Palette.good : Palette.ground)
                    .overlay(Circle().strokeBorder(state == .done || state == .next ? Color.clear : Palette.line,
                                                   style: StrokeStyle(lineWidth: 1, dash: state == .soon ? [3, 3] : [])))
                switch state {
                case .done: Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Palette.blackKey)
                case .next: Image(systemName: "play.fill").font(.system(size: 13, weight: .bold)).foregroundStyle(Palette.blackKey)
                case .open: Text("\(number)").dataLabel(12, weight: .semibold).foregroundStyle(Palette.text)
                case .locked: Image(systemName: "lock.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.muted)
                case .soon: Text("\(number)").dataLabel(12, weight: .semibold).foregroundStyle(Palette.muted)
                }
            }
            .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text("Lesson \(number)")
                    .dataLabel(10)
                    .foregroundStyle(state == .next ? Palette.signal : Palette.muted)
                Text(title)
                    .font(.display(compact ? 22 : 26))
                    .textCase(.uppercase)
                    .foregroundStyle(open ? Palette.text : Palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(skill)
                    .bodyText(14)
                    .foregroundStyle(open ? Palette.text : Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Text(goal)
                    .dataLabel(10)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if open {
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Palette.muted)
            }
        }
        .padding(compact ? 14 : 18)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(state == .next ? Palette.signal : Palette.line, lineWidth: 1))
        .contentShape(shape)
        .onTapGesture { if open { action() } }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(open ? .isButton : [])
        .accessibilityLabel("Lesson \(number), \(title), \(skill). \(state == .done ? "Done" : state == .next ? "Next" : state == .open ? "Open" : state == .locked ? "Locked" : "Coming soon")")
    }
}

/// The ear module: three drills as lessons, all open at once. A game is done at its top level,
/// the quiz once it has placed you; the first not done is next.
struct EarModuleScreen: View {
    let app: AppModel
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        let lessons = LessonEntry.earLessons
        let done = lessons.filter { app.earLessonDone($0.entry) }.count
        let next = app.nextEarLesson
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: "Learn") {
                    app.route = .lessons
                }
                Text(LessonEntry.ear.title)
                    .font(.display(compact ? 30 : 44))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                StaffLines()
                    .frame(maxWidth: .infinity)
            }
            .padding(.top, compact ? 8 : 24)

            HStack(alignment: .firstTextBaseline) {
                Text("Hear the chords and the distances, then name them")
                    .bodyText(15)
                    .foregroundStyle(Palette.muted)
                Spacer(minLength: 12)
                Text(done == lessons.count ? "Done" : "\(done) of \(lessons.count) lessons")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(done == lessons.count ? Palette.good : Palette.text)
            }
            .padding(.top, 10)
            ModuleBar(done: done, count: lessons.count)
                .padding(.top, 10)

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(Array(lessons.enumerated()), id: \.offset) { i, l in
                        let isDone = app.earLessonDone(l.entry)
                        LessonRowView(number: i + 1, title: l.title, skill: EarModuleScreen.status(app.status(l.entry)), goal: l.goal,
                                      state: isDone ? .done : l.entry.id == next.id ? .next : .open, compact: compact) {
                            app.start(l.entry)
                        }
                    }
                }
                .padding(.top, 16)
                .padding(.bottom, 12)
            }
            .scrollBounceBehavior(.basedOnSize)

            let n = lessons.firstIndex { $0.entry.id == next.id } ?? 0
            PrimaryButton(title: "\(app.earLessonDone(next) ? "Play" : "Start") lesson \(n + 1) · \(lessons[n].title)") { app.start(next) }
                .padding(.top, 8)
                .padding(.bottom, compact ? 8 : 24)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }

    /// Where you are in a drill, as the row's second line (short: the card's one line).
    static func status(_ s: EntryStatus, short: Bool = false) -> String {
        switch s {
        case .game(let kind, let level): return "Level \(level) of \(kind.levels.count)" + (short ? "" : " · \(kind.levels[level - 1].title)")
        case .quizNew: return "New · the 5-question ear check"
        case .quizToday(let level): return "\(level.title) · today's five are waiting"
        case .quizDone(let level): return "\(level.title) · done today"
        default: return ""
        }
    }
}

/// The ear module on the Learn tab.
struct EarModuleCard: View {
    let app: AppModel
    var compact = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let lessons = LessonEntry.earLessons
        let done = lessons.filter { app.earLessonDone($0.entry) }.count
        let next = app.nextEarLesson
        let n = lessons.firstIndex { $0.entry.id == next.id } ?? 0
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(LessonEntry.ear.title)
                    .font(.display(compact ? 26 : 32))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 8)
                Text(done == lessons.count ? "Done" : "\(done) of \(lessons.count) lessons")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(done == lessons.count ? Palette.good : Palette.muted)
            }
            Text("Hear the chords and the distances, then name them")
                .bodyText(14)
                .foregroundStyle(Palette.muted)
            ModuleBar(done: done, count: lessons.count)
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(done < lessons.count ? "Next · Lesson \(n + 1)" : "Every lesson done")
                        .dataLabel(10)
                        .foregroundStyle(Palette.signal)
                    Text(lessons[n].title + " · " + EarModuleScreen.status(app.status(next), short: true))
                        .bodyText(16, weight: .semibold)
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 8)
                PrimaryButton(title: "Continue") { app.start(next) }
            }
        }
        .padding(compact ? 16 : 22)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .contentShape(shape)
        .onTapGesture { app.route = .earModule }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// The module on the Learn tab: where you are, and one tap into the next lesson.
struct ModuleCard: View {
    let app: AppModel
    let code: String
    var compact = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let content = app.module(code)
        let done = app.lessonsDone(content)
        let finished = app.progress.lesson(content.code).completed != nil
        let next = finished ? nil : content.lessons[min(done, content.lessons.count - 1)]
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(content.module.title)
                    .font(.display(compact ? 26 : 32))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 8)
                Text(finished ? "Done" : "\(done) of \(content.lessons.count) lessons")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(finished ? Palette.good : Palette.muted)
            }
            Text(content.module.detail)
                .bodyText(14)
                .foregroundStyle(Palette.muted)
            ModuleBar(done: done, count: content.lessons.count)
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(next.map { _ in "Next · Lesson \(done + 1)" } ?? "Every lesson done")
                        .dataLabel(10)
                        .foregroundStyle(Palette.signal)
                    Text(next?.title ?? "Play any of them again")
                        .bodyText(16, weight: .semibold)
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                if next != nil {
                    PrimaryButton(title: done == 0 ? "Start" : "Continue") { app.start(module: code, lesson: done + 1) }
                } else {
                    QuietButton(title: "Open") { app.openModule(code) }
                }
            }
        }
        .padding(compact ? 16 : 22)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .contentShape(shape)
        .onTapGesture { app.openModule(code) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
