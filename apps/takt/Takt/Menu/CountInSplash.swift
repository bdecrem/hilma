import AVFoundation
import SwiftUI
#if !targetEnvironment(macCatalyst)
import UIKit
#endif

/// The launch: one bar of count-in at the band's tempo, "Four Letters" (2026-10-29, picked
/// over Now Line and Dub Stab). Takt has four letters and a bar four beats, so the word is the
/// count: T, A, K, T land one per beat at full height, `signal` on its beat, `cue` for the next,
/// an outline still to come. On the 1 of the next bar it hands off and the band comes in on that
/// downbeat. Tap skips. Reduce Motion: beat 1 lit, held 0.6 s. The iPhone ticks a haptic on each
/// beat (stronger on the 1); the Mac has none. The count sounds (0.1 (76)): the launch set from
/// Settings → Sound (`LaunchSound`, blues by default) plays a cue on each letter, a swell into
/// the landing and the landing on the 1, scheduled on the host clock the lights run on. Always dark, in
/// either theme: the stage before the lights come up. Four across from 700 pt wide (a Mac
/// window), stacked one letter to a row under it (the iPhone).
///
/// The name says itself (0.1 (78)): the header is a dictionary line, the count is in German
/// beside the letters, and the 1 is a hit, the whole screen `signal` with AUF DIE EINS for two
/// beats while the band comes in underneath, then the fade.
struct CountInSplash: View {
    let bpm: Double
    let bandTitle: String
    var sound: LaunchSound? = nil
    /// The 1 of the next bar, or a skip: the band comes in.
    let onDownbeat: () -> Void
    /// The landing has been held: the splash goes.
    let onFinished: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var beat: Int?
    @State private var landed = false
    @State private var didDownbeat = false
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
                // No transition: it lands on the beat, like the letters.
                if landed { landing(wide: geo.size.width >= Self.wideBreakpoint) }
            }
        }
        .environment(\.colorScheme, .dark)
        .contentShape(Rectangle())
        .onTapGesture { finish() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Takt: the bar, the beat, the pulse. Counting in at \(bpmLabel) BPM.")
        .accessibilityHint("Tap to skip.")
        .accessibilityAddTraits(.isButton)
        .task { await run() }
    }

    // MARK: Clock

    /// The sound is scheduled this far ahead, and the lights wait for the same instant: both
    /// run on the mach clock (ContinuousClock, AVAudioTime's host time).
    private static let lead = 0.08

    /// The landing holds two beats, however fast the band: long enough to read, short enough
    /// not to sit on the band.
    private var landingHold: Double { min(max(2 * 60 / tempo, 0.7), 1.2) }

    private func run() async {
        #if DEBUG
        // `-Splash 1 -SplashBeat n` holds a beat (0–3) or the landing (4), for a screenshot.
        if UserDefaults.standard.object(forKey: "SplashBeat") != nil {
            let n = UserDefaults.standard.integer(forKey: "SplashBeat")
            if n == 4 { beat = 3; landed = true } else { beat = n }
            return
        }
        #endif
        if reduceMotion {
            beat = 0
            try? await Task.sleep(for: .seconds(0.6))
            sound?.landNow()
            await land()
            return
        }
        let seconds = 60 / tempo
        let interval = Duration.seconds(seconds)
        let start = ContinuousClock.now + .seconds(Self.lead)
        sound?.schedule(startHostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: Self.lead), interval: seconds)
        try? await Task.sleep(until: start, clock: .continuous)
        for i in 0..<4 {
            if didFinish || Task.isCancelled { return }
            beat = i
            tick(downbeat: i == 0)
            // Against the start, not the last wake-up, so the bar doesn't drift.
            try? await Task.sleep(until: start + interval * (i + 1), clock: .continuous)
        }
        if didFinish || Task.isCancelled { return }
        await land()  // the 1 of the next bar
    }

    /// The hit: the line, the band, then the hold.
    private func land() async {
        landed = true
        tick(downbeat: true)
        downbeat()
        try? await Task.sleep(for: .seconds(landingHold))
        finish()
    }

    private func downbeat() {
        guard !didDownbeat else { return }
        didDownbeat = true
        sound?.skip()  // a tap before the landing lands now; after it, nothing more
        onDownbeat()
    }

    private func finish() {
        guard !didFinish else { return }
        didFinish = true
        downbeat()
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
            header(showsBPM: false)  // no room beside the line; the band card has it
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
            header(showsBPM: true)
                .padding(.top, 22)
            GeometryReader { geo in
                // Four columns, 32 pt apart. The letter fills the column's height unless the
                // column is too narrow for it: a compressed heavy cap is at most ~0.55 em wide,
                // and the beat's word needs ~70 pt beside it.
                let gap: CGFloat = 32
                let column = (geo.size.width - gap * 3) / 4
                let size = min(geo.size.height * 1.18, (column - 70) / 0.6)
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

    /// The dictionary line: what the word means, under the word's own count.
    private func header(showsBPM: Bool) -> some View {
        HStack {
            Text("\(Text("Takt").fontWeight(.bold).foregroundStyle(Palette.signal)) \(Text("(m.)").italic().foregroundStyle(Palette.muted))\(Text(": the bar, the beat, the pulse."))")
                .bodyText(14)
                .foregroundStyle(Palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if showsBPM {
                Spacer(minLength: 16)
                Text("\(bpmLabel) BPM")
                    .dataLabel(12)
                    .foregroundStyle(Palette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cell(_ i: Int, size: CGFloat) -> some View {
        LetterCell(letter: Self.letters[i], word: Self.count[i], state: state(i), size: max(size, 24))
    }

    private static let letters = ["T", "A", "K", "T"]
    private static let count = ["Eins", "Zwei", "Drei", "Vier"]

    /// The 1: the whole screen `signal`, the line as big as it goes, its gloss under it. Stacked
    /// on the iPhone like the letters it replaces.
    private func landing(wide: Bool) -> some View {
        ZStack {
            Palette.signal.ignoresSafeArea()
            GeometryReader { geo in
                VStack(alignment: .leading, spacing: 0) {
                    if wide {
                        Text("AUF DIE EINS")
                            .font(.display(geo.size.height * 0.8))
                            .lineLimit(1)
                            .minimumScaleFactor(0.05)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    } else {
                        // EINS is the widest row, ~0.35 em a letter: it spans the width.
                        let row = (geo.size.height - 28) / 3
                        let size = min(row * 1.18, geo.size.width / (4 * 0.35))
                        ForEach(["AUF", "DIE", "EINS"], id: \.self) { word in
                            // An overlay: the font's line height is taller than the row.
                            Color.clear.overlay(alignment: .leading) {
                                Text(word)
                                    .font(.display(size))
                                    .fixedSize()
                            }
                        }
                    }
                    Text("On the one")
                        .dataLabel(13, weight: .semibold)
                        .frame(height: 28, alignment: .bottomLeading)
                }
                .foregroundStyle(Palette.ground)
            }
            .padding(.horizontal, wide ? 80 : 28)
            .padding(.vertical, wide ? 56 : 24)
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

/// One beat: its letter at full height on a rule, the beat counted in German at the right. The
/// letter is an outline until its beat, `signal` on it, then text.
private struct LetterCell: View {
    let letter: String
    let word: String
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
                        Text(word.uppercased())
                            .font(.display(min(max(size * 0.14, 20), 30)))
                            .tracking(0.6)
                            .foregroundStyle(state == .now ? Palette.signal : Palette.muted)
                    }
                    .padding(.bottom, 8)
                }
            Rectangle()
                .fill(Palette.line)
                .frame(height: 1)
        }
        // No animation: a fade crossed the outline into the fill (an orange letter with a blue
        // edge, a peach one) for a tenth of every beat. The letter lands on the beat.
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

/// The small triangle beside the next beat's word.
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
/// fades out over 0.25 s once the landing has been held.
struct CountInHost<Content: View>: View {
    let bpm: Double
    let bandTitle: String
    var sound: LaunchSound? = nil
    let onFinished: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var showing = !CountInLaunch.counted && CountInSplash.enabled

    var body: some View {
        ZStack {
            content()
            if showing {
                CountInSplash(bpm: bpm, bandTitle: bandTitle, sound: sound, onDownbeat: {
                    CountInLaunch.counted = true
                    onFinished()
                }, onFinished: {
                    withAnimation(.easeOut(duration: 0.25)) { showing = false }
                })
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
