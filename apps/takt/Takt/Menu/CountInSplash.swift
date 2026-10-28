import SwiftUI
#if !targetEnvironment(macCatalyst)
import UIKit
#endif

/// The launch: one bar of count-in at the band's tempo (misc/takt-countin.zip, concept 2
/// "Count-in"). TAKT, four beat squares lit one at a time, the band and its tempo; on the 1 of
/// the next bar it hands off and the band comes in on that downbeat. Tap skips. Reduce Motion:
/// beat 1 lit, held 0.6 s. The iPhone ticks a haptic on each beat (stronger on the 1) and the
/// count makes no sound. Always dark, in either theme: the stage before the lights come up. A
/// wide layout from 700 pt (the Mac), a stacked one under it (the iPhone).
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

    /// The iPhone: the label, TAKT over the beats, the band; spaced evenly.
    private var compact: some View {
        VStack(alignment: .leading, spacing: 0) {
            label
            Spacer(minLength: 24)
            VStack(alignment: .leading, spacing: 28) {
                wordmark(148)
                beats(gap: 10, height: 76, radius: 10, numeral: 34)
            }
            Spacer(minLength: 24)
            band(title: 18, bpm: 40, padH: 20, padV: 16)
        }
        .padding(.horizontal, 28)
        .padding(.top, 24)
        .padding(.bottom, 20)
    }

    /// The Mac window: the label top right, TAKT and the beats on one line, the band below.
    private var wide: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                label
            }
            .padding(.top, 22)
            Spacer(minLength: 24)
            HStack(alignment: .bottom, spacing: 48) {
                wordmark(300)
                Spacer(minLength: 0)
                beats(gap: 14, height: 120, radius: 14, numeral: 52)
                    .frame(maxWidth: 520)
                    .padding(.bottom, 6)
            }
            Spacer(minLength: 24)
            band(title: 22, bpm: 48, padH: 28, padV: 20)
                .padding(.bottom, 56)
        }
        .padding(.horizontal, 80)
    }

    // MARK: Pieces

    private var label: some View {
        Text("Count-in · 4/4")
            .dataLabel(12, weight: .semibold)
            .foregroundStyle(Palette.signal)
    }

    private func wordmark(_ size: CGFloat) -> some View {
        Text("Takt")
            .font(.display(size))
            .textCase(.uppercase)
            .foregroundStyle(Palette.text)
            .lineLimit(1)
            .minimumScaleFactor(0.4)
    }

    private func beats(gap: CGFloat, height: CGFloat, radius: CGFloat, numeral: CGFloat) -> some View {
        HStack(spacing: gap) {
            ForEach(0..<4, id: \.self) { i in
                BeatSquare(number: i + 1, lit: beat == i, height: height, radius: radius, numeral: numeral)
            }
        }
    }

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

/// One beat: lit `signal` with the numeral in the ground, or an outline.
private struct BeatSquare: View {
    let number: Int
    let lit: Bool
    let height: CGFloat
    let radius: CGFloat
    let numeral: CGFloat

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        ZStack {
            shape.fill(lit ? Palette.signal : Color.clear)
            shape.strokeBorder(lit ? Color.clear : Palette.line, lineWidth: 1.5)
            Text("\(number)")
                .font(.display(numeral))
                .foregroundStyle(lit ? Palette.ground : Palette.muted)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .animation(.easeOut(duration: 0.08), value: lit)
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
