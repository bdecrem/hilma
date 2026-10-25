import SwiftUI

/// The Ear Trainer. Top: the level, its meter (the last ten answers at this level; 8 lit opens
/// the next), the score and the combo. Middle: Hear it again, and one big button per chord
/// quality. A right answer lights in `signal` and the next chord comes; a miss shows the right
/// one, says what to listen for, and plays the chord again. Bottom: the levels you've opened.
struct EarGameScreen: View {
    let app: AppModel
    let run: EarGame.Run
    let round: EarGame.Round
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        let level = EarGame.levels[run.level - 1]
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: "Leave the game") {
                    app.leaveEarGame()
                }
                Text("Ear Trainer")
                    .font(.display(compact ? 34 : 44))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                StaffLines()
                    .frame(maxWidth: .infinity)
            }
            .padding(.top, compact ? 8 : 24)

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Level \(level.number) of \(EarGame.levels.count)")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                    Text(level.title)
                        .font(.display(compact ? 28 : 34))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                    Text(level.detail)
                        .bodyText(14)
                        .foregroundStyle(Palette.muted)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 4) {
                    Text("\(run.score)")
                        .font(.display(compact ? 34 : 40))
                        .monospacedDigit()
                        .foregroundStyle(Palette.text)
                    Text(run.multiplier > 1 ? "Combo ×\(run.multiplier)" : "Points")
                        .dataLabel(11, weight: .semibold)
                        .foregroundStyle(run.multiplier > 1 ? Palette.signal : Palette.muted)
                }
            }
            .padding(.top, 20)

            Meter(run: run)
                .padding(.top, 14)

            Spacer(minLength: 12)

            if run.leveledUp && app.earPicked != nil {
                Text("Level \(run.level): \(level.title)")
                    .font(.display(compact ? 30 : 36))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.signal)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 12)
            }

            Button(action: app.playEar) {
                HStack(spacing: 10) {
                    Image(systemName: "speaker.wave.2.fill").font(.system(size: 18, weight: .semibold))
                    Text("Hear it again").dataLabel(13, weight: .semibold)
                }
                .foregroundStyle(Palette.text)
                .frame(maxWidth: .infinity)
                .frame(height: 64)
                .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
            }
            .buttonStyle(.plain)

            let columns = round.options.count > 2 ? [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
                                                  : [GridItem(.flexible(), spacing: 10)]
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(Array(round.options.enumerated()), id: \.offset) { i, q in
                    ChordButton(title: q.name, state: state(i)) { app.answerEar(i) }
                }
            }
            .padding(.top, 10)

            Text(feedback)
                .bodyText(15)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: 44, alignment: .topLeading)
                .padding(.top, 12)

            Spacer(minLength: 12)
            LevelChips(app: app, current: run.level, opened: app.progress.snapshot.ear.level)
                .padding(.bottom, compact ? 8 : 24)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }

    private var feedback: String {
        guard let picked = app.earPicked else { return round.broken ? "One note after another: which chord is it?" : "Which chord?" }
        let name = "\(round.rootName) \(round.quality.name.lowercased())"
        if picked == round.answer {
            return "\(name). +\(app.earPoints)"
        }
        return "It was \(name). \(round.quality.hint)"
    }

    private func state(_ i: Int) -> ChordButton.State {
        guard let picked = app.earPicked else { return .open }
        if i == round.answer { return .right }
        return i == picked ? .wrong : .other
    }
}

/// The last ten answers at this level, oldest first; 8 lit opens the next.
private struct Meter: View {
    let run: EarGame.Run

    var body: some View {
        let last = Array(run.recent.suffix(EarGame.window))
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                ForEach(0..<EarGame.window, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(i < last.count ? (last[i] ? Palette.signal : Palette.muted.opacity(0.35)) : Palette.line)
                        .frame(height: 8)
                }
            }
            Text(run.level < EarGame.levels.count
                 ? "\(run.rightOfWindow) of your last \(EarGame.window) right · \(EarGame.needed) opens level \(run.level + 1)"
                 : "\(run.rightOfWindow) of your last \(EarGame.window) right · the top level")
                .dataLabel(10)
                .foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(run.rightOfWindow) of the last \(EarGame.window) right")
    }
}

private struct ChordButton: View {
    enum State { case open, right, wrong, other }
    let title: String
    let state: State
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        Button(action: action) {
            Text(title)
                .font(.display(26))
                .textCase(.uppercase)
                .strikethrough(state == .wrong)
                .foregroundStyle(state == .right ? Palette.blackKey : state == .open ? Palette.text : Palette.muted)
                .frame(maxWidth: .infinity)
                .frame(height: 76)
                .background(shape.fill(state == .right ? Palette.signal : Palette.panel))
                .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
                .contentShape(shape)
        }
        .buttonStyle(.plain)
        .allowsHitTesting(state == .open)
        .accessibilityLabel(title + (state == .right ? ", right" : state == .wrong ? ", your answer, wrong" : ""))
    }
}

/// The seven levels: opened ones can be played again, the rest wait.
private struct LevelChips: View {
    let app: AppModel
    let current: Int
    let opened: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(EarGame.levels, id: \.number) { l in
                let open = l.number <= opened
                Button { app.goEar(level: l.number) } label: {
                    Text("\(l.number)")
                        .dataLabel(12, weight: .semibold)
                        .foregroundStyle(l.number == current ? Palette.blackKey : open ? Palette.text : Palette.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background(RoundedRectangle(cornerRadius: 6).fill(l.number == current ? Palette.signal : Palette.panel))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, style: StrokeStyle(lineWidth: 1, dash: open ? [] : [3, 3])))
                }
                .buttonStyle(.plain)
                .allowsHitTesting(open && l.number != current)
                .accessibilityLabel("Level \(l.number), \(l.title)\(open ? "" : ", locked")")
            }
        }
    }
}
