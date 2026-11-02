import AVFoundation
import SwiftUI
#if !targetEnvironment(macCatalyst)
import UIKit
#endif

/// The launch: one bar of count-in at the band's tempo, "Four Letters" (2026-10-29, picked
/// over Now Line and Dub Stab). Takt has four letters and a bar four beats, so the word is the
/// count: T, A, K, T land one per beat at full height, `signal` on its beat, `cue` for the next,
/// an outline still to come. On the 1 of the next bar it hands off and the band comes in on that
/// downbeat. Reduce Motion: beat 1 lit, held 0.6 s. The iPhone ticks a haptic on each
/// beat (stronger on the 1); the Mac has none. The count sounds (0.1 (76)): the launch set from
/// Settings → Sound (`LaunchSound`, blues by default) plays a cue on each letter, a swell into
/// the landing and the landing on the 1, scheduled on the host clock the lights run on. Always dark, in
/// either theme: the stage before the lights come up. Four across from 700 pt wide (a Mac
/// window), stacked one letter to a row under it (the iPhone).
///
/// The count pops up in German beside the letters (0.1 (79)): each word is nothing until its
/// beat, then its letters spring up from behind the rule one after the other while the rule
/// strikes across in `signal`.
///
/// You count the band in (0.1 (80)): a touch, a click, a computer key or a note on the
/// keyboard on a beat is a hit, and the letter slams in under your finger: it jumps, holds for a
/// frame, springs back, and the screen shakes. Beat one is a gift (nobody reacts to a cold
/// launch in time); hit ZWEI, DREI and VIER with no stray taps and SAUBER is stamped across the
/// screen and rides out over the band. Once you've hit anything, a beat you missed stays an
/// outline. Do nothing and it counts itself in, as before. No skip: it's one bar.
struct CountInSplash: View {
    let bpm: Double
    let bandTitle: String
    var sound: LaunchSound? = nil
    /// Called on the 1 with whether the bar was stamped.
    let onFinished: (_ stamped: Bool) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var beat: Int?
    @State private var didFinish = false
    /// When beat one sounds, in host time; hits are measured against it.
    @State private var startHost: UInt64?
    @State private var hits = Set<Int>()
    @State private var strays = 0
    @State private var punch: [Int: CGFloat] = [:]
    @State private var shake: CGSize = .zero
    @State private var stamped = false
    @State private var definitionShown = false

    /// A hit is this close to its beat, either side: lenient for touch latency, tight enough
    /// that mashing between beats misses.
    static let window = 0.11

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
                Group {
                    if geo.size.width >= Self.wideBreakpoint { wide } else { compact }
                }
                .offset(shake)
                if stamped { stamp(size: geo.size.width >= Self.wideBreakpoint ? 110 : 76) }
            }
        }
        .environment(\.colorScheme, .dark)
        .contentShape(Rectangle())
        // On touch-down, not release: a tap's release is ~100 ms late.
        .gesture(DragGesture(minimumDistance: 0).onChanged { g in
            if g.translation == .zero { hit(at: mach_absolute_time()) }
        })
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Takt. Counting in at \(bpmLabel) BPM.")
        .accessibilityHint("Tap along on the beat.")
        .accessibilityAction { finish() }
        .task { await run() }
        .onAppear { CountInLaunch.onHit = { hit(at: $0) } }
        .onDisappear { CountInLaunch.onHit = nil }
    }

    // MARK: Hits

    private func hit(at host: UInt64) {
        guard let startHost, !didFinish else { return }
        let t = host >= startHost ? AVAudioTime.seconds(forHostTime: host - startHost)
                                  : -AVAudioTime.seconds(forHostTime: startHost - host)
        let seconds = 60 / tempo
        let i = Int((t / seconds).rounded())
        guard (0..<4).contains(i), abs(t - Double(i) * seconds) <= Self.window, !hits.contains(i) else {
            strays += 1
            return
        }
        hits.insert(i)
        impact()
        if !reduceMotion { slam(i) }
        if !stamped, strays == 0, hits.isSuperset(of: [1, 2, 3]) {
            withAnimation(.spring(response: 0.24, dampingFraction: 0.55)) { stamped = true }
        }
    }

    /// The hit: the letter jumps and holds for a frame (the hit-stop), then springs home while
    /// the screen shakes off a kick in a random direction, harder for the stamp.
    private func slam(_ i: Int) {
        punch[i] = 1.16
        let a = Double.random(in: 0..<(2 * .pi))
        let kick: CGFloat = i == 3 && hits.isSuperset(of: [1, 2, 3]) ? 12 : 7
        shake = CGSize(width: kick * cos(a), height: kick * sin(a))
        withAnimation(.spring(response: 0.2, dampingFraction: 0.3)) { shake = .zero }
        Task {
            try? await Task.sleep(for: .milliseconds(50))
            withAnimation(.spring(response: 0.22, dampingFraction: 0.45)) { punch[i] = 1 }
        }
    }

    private func impact() {
        #if !targetEnvironment(macCatalyst)
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 1)
        #endif
    }

    // MARK: Clock

    /// The sound is scheduled this far ahead, and the lights wait for the same instant: both
    /// run on the mach clock (ContinuousClock, AVAudioTime's host time).
    private static let lead = 0.08

    private func run() async {
        #if DEBUG
        let d = UserDefaults.standard
        // `-Splash 1 -SplashBeat n` holds a beat (0–3), for a screenshot; `-SplashHits 1,3`
        // with it marks those beats hit (1,2,3 stamps).
        if d.object(forKey: "SplashBeat") != nil {
            beat = d.integer(forKey: "SplashBeat")
            hits = Set((d.string(forKey: "SplashHits") ?? "").split(separator: ",").compactMap { Int($0) })
            stamped = hits.isSuperset(of: [1, 2, 3])
            return
        }
        // `-SplashTaps "1,2,3"` taps those beats `-SplashTapLate` ms late (default 20) on the
        // real clock, through the same path as a touch.
        let taps = (d.string(forKey: "SplashTaps") ?? "").split(separator: ",").compactMap { Double($0) }
        let late = d.object(forKey: "SplashTapLate") != nil ? d.double(forKey: "SplashTapLate") / 1000 : 0.02
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
        let host = mach_absolute_time() + AVAudioTime.hostTime(forSeconds: Self.lead)
        startHost = host
        sound?.schedule(startHostTime: host, interval: seconds)
        #if DEBUG
        for b in taps {
            let at = (b * seconds + late)
            Task {
                try? await Task.sleep(until: start + .seconds(at), clock: .continuous)
                hit(at: host + AVAudioTime.hostTime(forSeconds: at))
            }
        }
        #endif
        try? await Task.sleep(until: start, clock: .continuous)
        for i in 0..<4 {
            if didFinish || Task.isCancelled { return }
            beat = i
            if hits.isEmpty && strays == 0 { tick(downbeat: i == 0) }  // once you play, the haptics are yours
            // Against the start, not the last wake-up, so the bar doesn't drift.
            try? await Task.sleep(until: start + interval * (i + 1), clock: .continuous)
        }
        finish()  // the 1 of the next bar
    }

    private func finish() {
        guard !didFinish else { return }
        didFinish = true
        sound?.skip()  // a tap before the landing lands now; after it, nothing more
        CountInLaunch.onHit = nil
        onFinished(stamped)
    }

    private func tick(downbeat: Bool) {
        #if !targetEnvironment(macCatalyst)
        UIImpactFeedbackGenerator(style: downbeat ? .medium : .light).impactOccurred()
        #endif
    }

    // MARK: Layouts

    /// Each letter's part in the bar: past, now (`signal`), next (`cue`), still to come; one
    /// you hit a hair early is lit by your hit; once you've played, one you missed is `missed`.
    private func state(_ i: Int) -> LetterState {
        if hits.contains(i), beat.map({ i >= $0 }) ?? true { return .now }
        guard let beat else { return .future }
        if i < beat {
            let played = !hits.isEmpty || strays > 0
            return played && i >= 1 && !hits.contains(i) ? .missed : .past
        }
        if i == beat { return .now }
        return i == beat + 1 ? .next : .future
    }

    /// The iPhone: T A K T stacked one to a row, the band.
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
            definition(size: 11)
                .padding(.top, 14)
                .padding(.bottom, 18)
            band(title: 18, bpm: 40, padH: 20, padV: 16)
        }
        .padding(.horizontal, 28)
        .padding(.top, 24)
        .padding(.bottom, 20)
    }

    /// The Mac window: T A K T four across, the band below.
    private var wide: some View {
        VStack(spacing: 0) {
            GeometryReader { geo in
                // Four columns, 32 pt apart. The letter fills the column's height unless the
                // column is too narrow for it: a compressed heavy cap is at most ~0.55 em wide,
                // and the beat's word needs ~80 pt beside it.
                let gap: CGFloat = 32
                let column = (geo.size.width - gap * 3) / 4
                let size = min(geo.size.height * 1.18, (column - 80) / 0.6)
                // The row is as tall as the letters need, centered in what's left.
                HStack(spacing: gap) {
                    ForEach(0..<4, id: \.self) { i in cell(i, size: size, word: 34) }
                }
                .frame(height: min(geo.size.height, size / 1.18))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .padding(.top, 44)
            .padding(.bottom, 24)
            definition(size: 12)
                .padding(.bottom, 20)
            band(title: 22, bpm: 48, padH: 28, padV: 20)
                .padding(.bottom, 56)
        }
        .padding(.horizontal, 80)
    }

    // MARK: Pieces

    /// The name, set like a dictionary entry: small monospace, left-aligned above the band.
    /// It fades in once and then sits still; the count is the show.
    private func definition(size: CGFloat) -> some View {
        let mono = { (w: Font.Weight) in Font.system(size: size, weight: w, design: .monospaced) }
        return VStack(alignment: .leading, spacing: size * 0.45) {
            (Text("takt").font(mono(.bold)).foregroundColor(Palette.text)
             + Text("  /tɑkt/  ").font(mono(.regular)).foregroundColor(Palette.muted)
             + Text("n.").font(mono(.regular)).italic().foregroundColor(Palette.muted))
            Text("the beat. from Latin ").font(mono(.regular)).foregroundColor(Palette.muted)
                + Text("tactus").font(mono(.regular)).italic().foregroundColor(Palette.muted)
                + Text(", \u{201C}touch.\u{201D}").font(mono(.regular)).foregroundColor(Palette.muted)
            Text("find it.").font(mono(.regular)).foregroundColor(Palette.text)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(definitionShown ? 1 : 0)
        .animation(.easeOut(duration: 0.6), value: definitionShown)
        .onAppear { definitionShown = true }
        .accessibilityElement(children: .combine)
    }

    /// SAUBER, rubber-stamped: it slams down from big and tilted. Untranslated.
    private func stamp(size: CGFloat) -> some View {
        Text("SAUBER")
            .font(.display(size))
            .tracking(size * 0.04)
            .foregroundStyle(Palette.signal)
            .padding(.horizontal, size * 0.28)
            .padding(.vertical, size * 0.06)
            .background(Palette.ground.opacity(0.88))
            .overlay(RoundedRectangle(cornerRadius: size * 0.08).strokeBorder(Palette.signal, lineWidth: size * 0.05))
            .rotationEffect(.degrees(-8))
            .transition(.scale(scale: 1.9).combined(with: .opacity))
            .allowsHitTesting(false)
    }

    private func cell(_ i: Int, size: CGFloat, word: CGFloat) -> some View {
        LetterCell(letter: Self.letters[i], word: Self.count[i], state: state(i), size: max(size, 24),
                   wordSize: word, punch: punch[i] ?? 1)
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
    case future, next, now, past, missed

    /// The outline of a letter still to come (`line`) or next (`cue`), or one you missed
    /// (`muted`); a played one is filled.
    var stroke: Color {
        switch self {
        case .future: Palette.line
        case .next: Palette.cue
        case .now: Palette.signal
        case .past: Palette.text
        case .missed: Palette.muted
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
    var punch: CGFloat = 1

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var struck: Bool { state == .now || state == .past || state == .missed }

    var body: some View {
        VStack(spacing: 0) {
            Color.clear
                // An overlay doesn't size the cell, so the letter's ascent can rise past the row;
                // its baseline sits just above the rule.
                .overlay(alignment: .bottomLeading) {
                    glyph
                        .fixedSize()
                        .scaleEffect((state == .now ? 1.035 : 1) * punch, anchor: .bottomLeading)
                        .offset(y: -size * 0.03)
                        .alignmentGuide(.bottom) { $0[.lastTextBaseline] }
                }
                .overlay(alignment: .bottomTrailing) {
                    HStack(spacing: 6) {
                        if state == .next { CueMark().fill(Palette.cue).frame(width: 8, height: 8) }
                        PopWord(word: word, size: wordSize, up: struck || reduceMotion,
                                color: state == .now ? Palette.signal : state == .missed ? Palette.line : Palette.muted)
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
                CountInSplash(bpm: bpm, bandTitle: bandTitle, sound: sound) { stamped in
                    CountInLaunch.counted = true
                    onFinished()
                    // A stamp rides out over the band a little longer.
                    withAnimation(.easeOut(duration: stamped ? 0.8 : 0.25)) { showing = false }
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
    /// The splash, while it counts: a key or a note on the keyboard is a hit (host time).
    /// Set and called on the main thread only.
    nonisolated(unsafe) static var onHit: ((UInt64) -> Void)?
    /// Whether the launch will count in (the band waits for the downbeat).
    static var pending: Bool { !counted && CountInSplash.enabled }
}
