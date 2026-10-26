import SwiftUI

/// The main menu: the lessons, with the band still playing underneath (the strip at the
/// bottom shows it and can stop it). Settings sits top right.
struct LessonsScreen: View {
    let app: AppModel
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                Text("Takt")
                    .font(.display(compact ? 40 : 52))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                StaffLines()
                    .frame(maxWidth: .infinity)
                TransportButton(symbol: "gearshape", lit: false, size: compact ? 34 : 36, label: "Settings") {
                    app.route = .settings
                }
            }
            .padding(.top, compact ? 8 : 24)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    TodayCard(app: app, compact: compact)
                        .padding(.top, compact ? 18 : 28)

                    Text("Modules")
                        .dataLabel(13, weight: .semibold)
                        .foregroundStyle(Palette.muted)
                        .padding(.top, 14)
                    ForEach(LessonEntry.path.filter(\.module)) { entry in
                        if entry.kind == .earModule {
                            EarModuleCard(app: app, compact: compact)
                        } else if entry.playable {
                            ModuleCard(app: app, code: entry.code, compact: compact)
                        } else {
                            LessonRow(entry: entry, app: app, compact: compact)
                        }
                    }
                }
            }
            .scrollBounceBehavior(.basedOnSize)

            Spacer(minLength: 12)
            if let player = app.player {
                NowPlayingStrip(player: player)
            }
            TabBar(app: app)
                .padding(.top, 10)
                .padding(.bottom, compact ? 4 : 20)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }
}

/// One lesson: code, title, what it is, and where you are in it.
struct LessonRow: View {
    let entry: LessonEntry
    let app: AppModel
    var compact = false

    private var status: EntryStatus { app.status(entry) }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let enabled = status.open
        HStack(alignment: .center, spacing: compact ? 14 : 20) {
            Text(entry.code)
                .font(.display(compact ? 40 : 52))
                .foregroundStyle(enabled ? Palette.text : Palette.muted)
                .frame(width: compact ? 58 : 76, alignment: .leading)
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.title)
                    .font(.display(compact ? 24 : 30))
                    .textCase(.uppercase)
                    .foregroundStyle(enabled ? Palette.text : Palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(entry.meta)
                    .bodyText(14)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                statusLine
            }
            Spacer(minLength: 0)
            if enabled {
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Palette.muted)
            }
        }
        .padding(compact ? 16 : 22)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .contentShape(shape)
        .onTapGesture { app.start(entry) }
        .contextMenu {
            if enabled && entry.module { Button("Start over") { app.restart(lesson: entry.code) } }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(enabled ? .isButton : [])
    }

    @ViewBuilder private var statusLine: some View {
        switch status {
        case .new:
            label("New", lit: true)
        case .inProgress(let n, let of):
            label("Lesson \(n) of \(of)", lit: true)
        case .done(let tempo):
            label(tempo > 0 ? "Done · \(tempo) bpm" : "Done", lit: false)
        case .game(let kind, let level):
            label("Level \(level) · \(kind.levels[level - 1].title)", lit: true)
        case .quizNew:
            label("New · find your level", lit: true)
        case .quizToday(let level):
            label("\(level.title) · today's five", lit: true)
        case .quizDone(let level):
            label("\(level.title) · done today", lit: false)
        case .locked(let after):
            label("After \(after)", lit: false)
        case .soon:
            label("Coming soon", lit: false)
        case .module(let done, let of):
            label("\(done) of \(of) lessons", lit: done < of)
        }
    }

    private func label(_ text: String, lit: Bool) -> some View {
        HStack(spacing: 8) {
            LED(lit: lit, size: 7)
            Text(text)
                .dataLabel(11)
                .foregroundStyle(lit ? Palette.text : Palette.muted)
        }
        .padding(.top, 2)
    }
}

/// The band under the menu: what's playing, play/pause, the tempo.
struct NowPlayingStrip: View {
    let player: Player

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        HStack(spacing: 12) {
            LED(lit: player.playing)
            VStack(alignment: .leading, spacing: 2) {
                Text("The band")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                Text(player.audio.band.name)
                    .bodyText(15, weight: .semibold)
                    .foregroundStyle(Palette.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            TransportButton(symbol: player.playing ? "pause.fill" : "play.fill", lit: player.playing, size: 34,
                            label: player.playing ? "Pause" : "Play", action: player.togglePlay)
            Text("\(player.tempo)")
                .font(.display(28))
                .monospacedDigit()
                .foregroundStyle(Palette.text)
            Text("BPM")
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }
}

/// Today: the streak (the last seven days as LEDs) and today's challenge, one tap to start it.
struct TodayCard: View {
    let app: AppModel
    var compact = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let streak = app.progress.streak()
        let done = app.progress.practicedToday
        let challenge = app.challenge
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(streak)")
                    .font(.display(compact ? 44 : 56))
                    .monospacedDigit()
                    .foregroundStyle(streak > 0 ? Palette.signal : Palette.muted)
                Text("Day streak")
                    .dataLabel(13, weight: .semibold)
                    .foregroundStyle(Palette.text)
                Spacer(minLength: 8)
                WeekLEDs(days: Set(app.progress.snapshot.days))
            }
            Hairline()
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(done ? "Done for today · one more?" : "Today's challenge")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                    Text(challenge.title.prefix(1).uppercased() + challenge.title.dropFirst())
                        .bodyText(16, weight: .semibold)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                if done {
                    QuietButton(title: "Again") { app.startChallenge() }
                } else {
                    PrimaryButton(title: "Start") { app.startChallenge() }
                }
            }
        }
        .padding(compact ? 16 : 22)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// The last seven days, oldest first: lit = practiced.
struct WeekLEDs: View {
    let days: Set<String>

    var body: some View {
        let cal = Calendar.current
        let week = (0..<7).reversed().map { ProgressStore.day(cal.date(byAdding: .day, value: -$0, to: Date())!) }
        HStack(spacing: 5) {
            ForEach(week, id: \.self) { d in LED(lit: days.contains(d), size: 9) }
        }
        .accessibilityLabel("\(week.filter(days.contains).count) of the last 7 days practiced")
    }
}

/// Lessons | Map, at the bottom of both.
struct TabBar: View {
    let app: AppModel

    var body: some View {
        HStack(spacing: 0) {
            tab("Learn", symbol: "list.bullet", route: .lessons)
            tab("Map", symbol: "map", route: .map)
        }
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
    }

    private func tab(_ title: String, symbol: String, route: Route) -> some View {
        let on = app.route == route
        return Button { app.route = route } label: {
            HStack(spacing: 8) {
                Image(systemName: symbol).font(.system(size: 14, weight: .semibold))
                Text(title).dataLabel(12, weight: .semibold)
            }
            .foregroundStyle(on ? Palette.signal : Palette.muted)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }
}
