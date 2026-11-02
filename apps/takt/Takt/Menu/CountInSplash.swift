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
/// The name says itself (0.1 (79)): under the word is its dictionary line, and the count pops
/// up in German beside the letters. Each word is nothing until its beat, then its letters
/// spring up from behind the rule one after the other while the rule strikes across in
/// `signal`, the only things on this screen that move rather than land.
struct CountInSplash: View {
    let bpm: Double
    let bandTitle: String
    var sound: LaunchSound? = nil
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
        .accessibilityLabel("Takt: the bar, the beat, the pulse. Counting in at \(bpmLabel) BPM.")
        .accessibilityHint("Tap to skip.")
        .accessibilityAddTraits(.isButton)
        .task { await run() }
    }

    // MARK: Clock

    /// The sound is scheduled this far ahead, and the lights wait for the same instant: both
    /// run on the mach clock (ContinuousClock, AVAudioTime's host time).
    private static let lead = 0.08

    private func run() async {
        #if DEBUG
        // `-Splash 1 -SplashBeat n` holds a beat (0–3), for a screenshot.
        if UserDefaults.standard.object(forKey: "SplashBeat") != nil {
            beat = UserDefaults.standard.integer(forKey: "SplashBeat")
            return
        }
        #endif
        if reduceMotion {
            beat = 0
            try? await Task.sleep(for: .seconds(0.6))
            sound?.landNow()
            finish()
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
        finish()  // the 1 of the next bar
    }

    private func finish() {
        guard !didFinish else { return }
        didFinish = true
        sound?.skip()  // a tap before the landing lands now; after it, nothing more
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

    /// The iPhone: T A K T stacked one to a row, its dictionary line, the band.
    private var compact: some View {
        VStack(spacing: 0) {
            GeometryReader { geo in
                // A letter's cap height is ~0.70 em (SF Pro), so 1.18 x the row puts the caps at
                // ~83% of it, sitting on the row's rule.
                let row = (geo.size.height - 4) / 4
                VStack(spacing: 0) {
                    // The rows leave the words room to be big.
                    ForEach(0..<4, id: \.self) { i in cell(i, size: row * 1.18, word: row * 0.36) }
                }
            }
            definition(16)
                .padding(.top, 16)
                .padding(.bottom, 20)
            band(title: 18, bpm: 40, padH: 20, padV: 16)
        }
        .padding(.horizontal, 28)
        .padding(.top, 24)
        .padding(.bottom, 20)
    }

    /// The Mac window: T A K T four across, its dictionary line, the band below.
    private var wide: some View {
        VStack(spacing: 0) {
            GeometryReader { geo in
                // Four columns, 32 pt apart. The letter fills the column's height unless the
                // column is too narrow for it: a compressed heavy cap is at most ~0.55 em wide,
                // and the beat's word needs ~80 pt beside it.
                let gap: CGFloat = 32
                let column = (geo.size.width - gap * 3) / 4
                let size = min(geo.size.height * 1.18, (column - 80) / 0.6)
                // The row is as tall as the letters need, centered with its line in what's left.
                VStack(spacing: 22) {
                    HStack(spacing: gap) {
                        ForEach(0..<4, id: \.self) { i in cell(i, size: size, word: 34) }
                    }
                    .frame(height: min(geo.size.height - 50, size / 1.18))
                    definition(20)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .padding(.top, 44)
            .padding(.bottom, 32)
            band(title: 22, bpm: 48, padH: 28, padV: 20)
                .padding(.bottom, 56)
        }
        .padding(.horizontal, 80)
    }

    // MARK: Pieces

    /// The dictionary line under the word: what it means.
    private func definition(_ size: CGFloat) -> some View {
        Text("\(Text("Takt").fontWeight(.bold).foregroundStyle(Palette.signal)) \(Text("(m.)").italic().foregroundStyle(Palette.muted))\(Text(": the bar, the beat, the pulse."))")
            .bodyText(size)
            .foregroundStyle(Palette.text)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cell(_ i: Int, size: CGFloat, word: CGFloat) -> some View {
        LetterCell(letter: Self.letters[i], word: Self.count[i], state: state(i), size: max(size, 24), wordSize: word)
    }

    private static let letters = ["T", "A", "K", "T"]
    private static let count = ["Eins", "Zwei", "Drei", "Vier"]

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
/// letter is an outline until its beat, `signal` on it, then text. The word isn't there until
/// its beat (Reduce Motion: it always is, and nothing moves).
private struct LetterCell: View {
    let letter: String
    let word: String
    let state: LetterState
    let size: CGFloat
    let wordSize: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var struck: Bool { state == .now || state == .past }

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
                        PopWord(word: word, size: wordSize, up: struck || reduceMotion,
                                color: state == .now ? Palette.signal : Palette.muted)
                    }
                    .padding(.bottom, 6)
                }
            // The strike: on the beat the rule shoots out from under the word, `signal`, and
            // goes back to being a rule when the next beat takes over.
            Rectangle()
                .fill(Palette.line)
                .frame(height: 1)
                .overlay {
                    Rectangle()
                        .fill(Palette.signal)
                        .frame(height: 2)
                        .scaleEffect(x: state == .now && !reduceMotion ? 1 : 0, anchor: .trailing)
                        .opacity(state == .now ? 1 : 0)
                        .animation(state == .now ? .easeOut(duration: 0.22) : nil, value: state)
                }
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

/// A beat's word popping up: each letter comes from behind the rule, small and tilted, on a
/// loose spring that throws it past its place and lets it settle, the next letter a moment
/// behind. The spring starts on the beat and is most of the way home in 100 ms, so even at the
/// top of the tempo range a word is up before the next one starts.
private struct PopWord: View {
    let word: String
    let size: CGFloat
    let up: Bool
    let color: Color

    private static let stagger = 0.028
    private static let spring = Animation.spring(response: 0.26, dampingFraction: 0.52)

    var body: some View {
        HStack(spacing: size * 0.03) {
            ForEach(Array(word.uppercased().enumerated()), id: \.offset) { i, letter in
                Text(String(letter))
                    .font(.display(size))
                    .foregroundStyle(color)
                    .scaleEffect(up ? 1 : 0.35, anchor: .bottom)
                    .rotationEffect(.degrees(up ? 0 : i % 2 == 0 ? -14 : 14), anchor: .bottom)
                    .offset(y: up ? 0 : size * 1.1)
                    .opacity(up ? 1 : 0)
                    .animation(Self.spring.delay(Double(i) * Self.stagger), value: up)
            }
        }
        // Behind the rule: cut off below, free to overshoot above.
        .mask(Rectangle().padding(.top, -size).padding(.horizontal, -size * 0.3))
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
/// fades out over 0.25 s when the count lands.
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
                CountInSplash(bpm: bpm, bandTitle: bandTitle, sound: sound) {
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
