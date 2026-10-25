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

            Text("Lessons")
                .dataLabel(13, weight: .semibold)
                .foregroundStyle(Palette.muted)
                .padding(.top, compact ? 22 : 32)
                .padding(.bottom, 12)

            Text("Level 1 · The blues")
                .bodyText(15)
                .foregroundStyle(Palette.muted)
                .padding(.bottom, 16)

            ScrollView {
                VStack(spacing: 12) {
                    ForEach(LessonEntry.catalog) { entry in
                        LessonRow(entry: entry, app: app, compact: compact)
                    }
                }
            }
            .scrollBounceBehavior(.basedOnSize)

            Spacer(minLength: 12)
            if let player = app.player {
                NowPlayingStrip(player: player)
                    .padding(.bottom, compact ? 8 : 24)
            }
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

    private enum Status { case new, inProgress(step: Int, of: Int), done(tempo: Int), locked(after: String), soon }

    private var status: Status {
        if let after = entry.after, app.progress.lesson(after).completed == nil { return .locked(after: after) }
        guard entry.playable else { return .soon }
        let record = app.progress.lesson(entry.code)
        if record.completed != nil { return .done(tempo: record.bestTempo) }
        let live = app.player?.lesson
        let step = max(record.reachedStep, live?.step ?? 1)
        return step > 1 ? .inProgress(step: step, of: live?.stepCount ?? 6) : .new
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let enabled: Bool = { if case .locked = status { return false }; if case .soon = status { return false }; return true }()
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
        .onTapGesture { if enabled { app.open(lesson: entry.code) } }
        .contextMenu {
            if enabled { Button("Start over") { app.restart(lesson: entry.code) } }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(enabled ? .isButton : [])
    }

    @ViewBuilder private var statusLine: some View {
        switch status {
        case .new:
            label("New", lit: true)
        case .inProgress(let step, let of):
            label("Step \(step) of \(of)", lit: true)
        case .done(let tempo):
            label(tempo > 0 ? "Done · \(tempo) bpm" : "Done", lit: false)
        case .locked(let after):
            label("After \(after)", lit: false)
        case .soon:
            label("Coming soon", lit: false)
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
