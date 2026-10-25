import SwiftUI

/// Calibration (brief §5.9): before the first lesson, and from Settings. Four clicks to listen,
/// eight to tap along with, on any key: the MIDI keyboard, the computer keys, or the pad here.
/// Twelve squares light with the clicks; a tapped one shows how far off the tap was.
struct CalibrationScreen: View {
    let app: AppModel
    let player: Player
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        let c = player.calibration
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: "Back") {
                    player.endCalibration()
                    app.leaveCalibration()
                }
                Text("Timing")
                    .font(.display(compact ? 34 : 44))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                StaffLines()
                    .frame(maxWidth: .infinity)
            }
            .padding(.top, compact ? 8 : 24)
            .padding(.bottom, 20)

            Text(headline(c))
                .bodyText(compact ? 17 : 20, weight: .semibold, relativeTo: .title3)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            Text(detail(c))
                .bodyText(15)
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)

            ClickRow(calibration: c, heard: player.calibrationDone ? nil : player.calibrationClick)
                .padding(.top, 28)

            if c != nil && !player.calibrationDone {
                TapPad(player: player)
                    .frame(maxWidth: .infinity)
                    .frame(height: compact ? 180 : 140)
                    .padding(.top, 24)
            }

            Spacer(minLength: 16)
            HStack(spacing: 10) {
                if c == nil {
                    PrimaryButton(title: "Start") { player.startCalibration() }
                    QuietButton(title: "Skip") {
                        player.skipCalibration()
                        app.leaveCalibration()
                    }
                } else if player.calibrationDone {
                    if c?.result != nil {
                        PrimaryButton(title: "Continue") {
                            player.endCalibration()
                            app.leaveCalibration()
                        }
                    }
                    QuietButton(title: "Again") { player.startCalibration() }
                }
                Spacer()
            }
            .padding(.bottom, compact ? 8 : 24)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }

    private func headline(_ c: Calibration?) -> String {
        guard let c else { return "Tap any key with the clicks." }
        guard player.calibrationDone else { return (player.calibrationClick ?? 0) < Calibration.listen ? "Listen." : "Tap with the clicks." }
        guard let r = c.result else { return "\(c.tapped) of \(Calibration.taps) taps. Once more, with every click." }
        return "You play \(Calibration.words(r))."
    }

    private func detail(_ c: Calibration?) -> String {
        guard let c else {
            return "Four clicks to listen, then eight to play along with. Line up the sound of your note with the click, the way you will with the band. Takt measures how early or late that lands on this setup and takes it out of your timing."
        }
        guard player.calibrationDone else { return "Any key: your keyboard, the computer keys, or the pad." }
        guard let r = c.result else { return "Taps more than \(Int(Calibration.maxOffsetMs)) ms from a click don't count." }
        return abs(r) < 3 ? "Nothing to take out. Your notes are scored as you play them."
                          : "Takt moves your notes \(Int(abs(r).rounded())) ms \(r < 0 ? "later" : "earlier") before it scores them. Run it again in Settings whenever the setup changes."
    }
}

/// Twelve squares, one per click: four to listen, eight to tap. Lit = the click being heard; a
/// tapped square carries its offset.
struct ClickRow: View {
    let calibration: Calibration?
    let heard: Int?

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<(Calibration.listen + Calibration.taps), id: \.self) { k in
                VStack(spacing: 6) {
                    let shape = RoundedRectangle(cornerRadius: 3)
                    ZStack {
                        if heard == k {
                            shape.fill(Palette.signal)
                        } else if calibration?.offsets[k] != nil {
                            shape.fill(Palette.cue.opacity(0.35))
                        } else {
                            shape.strokeBorder(k < Calibration.listen ? Palette.line : Palette.muted, lineWidth: 1)
                        }
                    }
                    .frame(height: 22)
                    Text(calibration?.offsets[k].map { "\(Int($0.rounded()))" } ?? (k < Calibration.listen ? "\(k + 1)" : " "))
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(heard.map { $0 < Calibration.listen ? "Listening, click \($0 + 1)" : "Tap, click \($0 - Calibration.listen + 1) of \(Calibration.taps)" }
                            ?? "\(calibration?.tapped ?? 0) of \(Calibration.taps) clicks tapped")
    }
}

/// A big key to tap on: it plays and scores like a key on the keyboard strip (middle C).
struct TapPad: View {
    let player: Player
    @State private var down = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        shape.fill(down ? Palette.signal.opacity(0.25) : Palette.panel)
            .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
            .overlay(Text("Tap").dataLabel(13, weight: .semibold).foregroundStyle(Palette.muted))
            .contentShape(shape)
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !down else { return }
                    down = true
                    player.press(60)
                }
                .onEnded { _ in
                    down = false
                    player.release(60)
                })
            .accessibilityElement()
            .accessibilityLabel("Tap pad")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { player.press(60); player.release(60) }
    }
}
