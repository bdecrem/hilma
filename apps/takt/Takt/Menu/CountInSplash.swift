import SwiftUI
#if !targetEnvironment(macCatalyst)
import UIKit
#endif

/// The launch: one bar of count-in at the band's tempo, "Four Letters" (2026-10-29, picked
/// over Now Line and Dub Stab). Takt has four letters and a bar four beats, so the word is the
/// count: T, A, K, T land one per beat at full height, `signal` on its beat, `cue` for the next,
/// an outline still to come. On the 1 of the next bar it hands off and the band comes in on that
/// downbeat. Tap skips. Reduce Motion: beat 1 lit, held 0.6 s. The iPhone ticks a haptic on each
/// beat (stronger on the 1); the Mac has none, and the count makes no sound. Always dark, in
/// either theme: the stage before the lights come up. Four across from 700 pt wide (a Mac
/// window), stacked one letter to a row under it (the iPhone).
struct CountInSplash: View {
    let bpm: Double
    let bandTitle: String
    let onFinished: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var beat: Int?
    @State private var didFinish = false

    static let wideBreakpoint: CGFloat = 700

    private var tempo: Double { min(max(bpm, 40), 200) }
    private var bpmLabel: String { "\(Int(tempo.rounded()))" }

    /// Shown once per launch, not on DEBUG's headless launches (`-Silent`, `-Route`, snapshots);
    /// `-Splash 1` or `-Splash 0` decides outright.
    static var enabled: Bool {
        let d = UserDefaults.standard
        if d.object(forKey: "Splash") != nil { return d.bool(forKey: "Splash") }
        #if DEBUG
        for key in ["Silent", "Route", "SnapshotAt", "PreviewFrame", "LessonCheck", "RenderTo"] where d.object(forKey: key) != nil {
            return false
        }
        #endif
        return true
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Palette.ground.ignoresSafeArea()
                if geo.size.width >= Self.wideBreakpoint { wide } else { compact }
            }
        }
        .environment(\.colorScheme, .dark)
        .contentShape(Rectangle())
        .onTapGesture { finish() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Takt. Counting in at \(bpmLabel) BPM.")
        .accessibilityHint("Tap to skip.")
        .accessibilityAddTraits(.isButton)
        .task { await run() }
    }

    // MARK: Clock

    private func run() async {
        if reduceMotion {
            beat = 0
            try? await Task.sleep(for: .seconds(0.6))
            finish()
            return
        }
        let start = ContinuousClock.now
        let interval = Duration.seconds(60 / tempo)
        for i in 0..<4 {
            if didFinish || Task.isCancelled { return }
            beat = i
            tick(downbeat: i == 0)
            // Against the start, not the last wake-up, so the bar doesn't drift.
            try? await Task.sleep(until: start + interval * (i + 1), clock: .continuous)
        }
        finish()  // the 1 of the next bar
    }

    private func finish() {
        guard !didFinish else { return }
        didFinish = true
        onFinished()
    }

    private func tick(downbeat: Bool) {
        #if !targetEnvironment(macCatalyst)
        UIImpactFeedbackGenerator(style: downbeat ? .medium : .light).impactOccurred()
        #endif
    }

    // MARK: Layouts

    /// Each letter's part in the bar: past, now (`signal`), next (`cue`), still to come.
    private func state(_ i: Int) -> LetterState {
        guard let beat else { return .future }
        if i < beat { return .past }
        if i == beat { return .now }
        return i == beat + 1 ? .next : .future
    }

    /// The iPhone: the label, T A K T stacked one to a row, the band.
    private var compact: some View {
        VStack(spacing: 0) {
            header
            GeometryReader { geo in
                // A letter's cap height is ~0.70 em (SF Pro), so 1.18 x the row puts the caps at
                // ~83% of it, sitting on the row's rule.
                let row = (geo.size.height - 4) / 4
                VStack(spacing: 0) {
                    ForEach(0..<4, id: \.self) { i in cell(i, size: row * 1.18) }
                }
            }
            .padding(.top, 14)
            .padding(.bottom, 24)
            band(title: 18, bpm: 40, padH: 20, padV: 16)
        }
        .padding(.horizontal, 28)
        .padding(.top, 24)
        .padding(.bottom, 20)
    }

    /// The Mac window: the label, T A K T four across, the band below.
    private var wide: some View {
        VStack(spacing: 0) {
            header
                .padding(.top, 22)
            GeometryReader { geo in
                // Four columns, 32 pt apart. The letter fills the column's height unless the
                // column is too narrow for it: a compressed heavy cap is at most ~0.55 em wide,
                // and the numeral needs ~40 pt beside it.
                let gap: CGFloat = 32
                let column = (geo.size.width - gap * 3) / 4
                let size = min(geo.size.height * 1.18, (column - 40) / 0.6)
                // The row is as tall as the letters need, centered in what's left.
                HStack(spacing: gap) {
                    ForEach(0..<4, id: \.self) { i in cell(i, size: size) }
                }
                .frame(height: min(geo.size.height, size / 1.18))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .padding(.top, 28)
            .padding(.bottom, 32)
            band(title: 22, bpm: 48, padH: 28, padV: 20)
                .padding(.bottom, 56)
        }
        .padding(.horizontal, 80)
    }

    // MARK: Pieces

    private var header: some View {
        HStack {
            Text("Count-in · 4/4")
                .dataLabel(12, weight: .semibold)
                .foregroundStyle(Palette.signal)
            Spacer(minLength: 16)
            Text("\(bpmLabel) BPM")
                .dataLabel(12)
                .foregroundStyle(Palette.muted)
        }
    }

    private func cell(_ i: Int, size: CGFloat) -> some View {
        LetterCell(letter: Self.letters[i], number: i + 1, state: state(i), size: max(size, 24))
    }

    private static let letters = ["T", "A", "K", "T"]

    private func band(title: CGFloat, bpm size: CGFloat, padH: CGFloat, padV: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        return HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("The band")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                Text(bandTitle)
                    .bodyText(title, weight: .semibold)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
            }
            Spacer(minLength: 16)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(bpmLabel)
                    .font(.display(size))
                    .foregroundStyle(Palette.text)
                Text("BPM")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
            }
        }
        .padding(.horizontal, padH)
        .padding(.vertical, padV)
        .frame(maxWidth: .infinity)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }
}

private enum LetterState {
    case future, next, now, past

    /// The outline of a letter still to come (`line`) or next (`cue`); a played one is filled.
    var stroke: Color {
        switch self {
        case .future: Palette.line
        case .next: Palette.cue
        case .now: Palette.signal
        case .past: Palette.text
        }
    }

    var filled: Bool { self == .now || self == .past }
}

/// One beat: its letter at full height on a rule, the beat's numeral at the right. The letter
/// is an outline until its beat, `signal` on it, then text.
private struct LetterCell: View {
    let letter: String
    let number: Int
    let state: LetterState
    let size: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            Color.clear
                // An overlay doesn't size the cell, so the letter's ascent can rise past the row;
                // its baseline sits just above the rule.
                .overlay(alignment: .bottomLeading) {
                    glyph
                        .fixedSize()
                        .scaleEffect(state == .now ? 1.035 : 1, anchor: .bottomLeading)
                        .offset(y: -size * 0.03)
                        .alignmentGuide(.bottom) { $0[.lastTextBaseline] }
                }
                .overlay(alignment: .bottomTrailing) {
                    HStack(spacing: 6) {
                        if state == .next { CueMark().fill(Palette.cue).frame(width: 8, height: 8) }
                        Text("\(number)")
                            .dataLabel(13)
                            .foregroundStyle(state == .now ? Palette.signal : Palette.muted)
                    }
                    .padding(.bottom, 8)
                }
            Rectangle()
                .fill(Palette.line)
                .frame(height: 1)
        }
        .animation(.easeOut(duration: 0.1), value: state)
    }

    /// SwiftUI has no text stroke, so an outline is the letter drawn a hair off in twelve
    /// directions in the stroke color, with the ground on top.
    @ViewBuilder private var glyph: some View {
        let text = Text(letter).font(.display(size))
        if state.filled {
            text.foregroundStyle(state.stroke)
        } else {
            let w = max(1.5, size * 0.009)
            text.foregroundStyle(Palette.ground)
                .background {
                    ZStack {
                        ForEach(0..<12, id: \.self) { k in
                            let a = Double(k) * .pi / 6
                            text.foregroundStyle(state.stroke)
                                .offset(x: w * cos(a), y: w * sin(a))
                        }
                    }
                }
        }
    }
}

/// The small triangle beside the next beat's numeral.
private struct CueMark: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

/// The splash over the app, once per launch (once per app on the Mac, not per window); it
/// fades out over 0.25 s when the count lands.
struct CountInHost<Content: View>: View {
    let bpm: Double
    let bandTitle: String
    let onFinished: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var showing = !CountInLaunch.counted && CountInSplash.enabled

    var body: some View {
        ZStack {
            content()
            if showing {
                CountInSplash(bpm: bpm, bandTitle: bandTitle) {
                    CountInLaunch.counted = true
                    onFinished()
                    withAnimation(.easeOut(duration: 0.25)) { showing = false }
                }
                .transition(.opacity)
                .zIndex(1)
            }
        }
    }
}

/// Process-wide: the count-in has run this launch.
@MainActor enum CountInLaunch {
    static var counted = false
    /// Whether the launch will count in (the band waits for the downbeat).
    static var pending: Bool { !counted && CountInSplash.enabled }
}
