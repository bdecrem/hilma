import SwiftUI
import UniformTypeIdentifiers

/// The end of a lesson (brief §4): the payoff chorus as a piano roll, the bars you played
/// alone in `signal`, the expected notes as `cue` outlines, and the way on.
struct ResultScreen: View {
    let app: AppModel
    let finish: LessonEngine.Finish
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        let player = app.player
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                Text("\(player?.content.code ?? "") \(player?.content.title ?? "")")
                    .font(.display(compact ? 30 : 44))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                StaffLines()
                    .frame(maxWidth: .infinity)
                Text("Done")
                    .dataLabel(13, weight: .semibold)
                    .foregroundStyle(Palette.signal)
            }
            .padding(.top, compact ? 8 : 24)

            Text("Your last chorus at \(finish.tempo) bpm. Bars 11 and 12 were yours alone.")
                .bodyText(compact ? 17 : 20, weight: .semibold, relativeTo: .title3)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 20)
            Text(finish.detail ?? finish.summary)
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
                .padding(.top, 6)

            TimelineView(.animation(paused: player?.playbackEpoch == nil)) { _ in
                PianoRoll(finish: finish, form: player?.content.form ?? [], playhead: playhead(player))
            }
            .frame(maxWidth: .infinity)
            .frame(height: compact ? 220 : 320)
            .padding(.top, 20)

            HStack(spacing: 10) {
                LED(lit: true, size: 7)
                Text("A2 The Right Hand is unlocked")
                    .dataLabel(11)
                    .foregroundStyle(Palette.text)
            }
            .padding(.top, 18)

            Spacer(minLength: 16)
            let export = HStack(spacing: 10) {
                #if targetEnvironment(macCatalyst)
                PrimaryButton(title: "Export MIDI") { app.exporting = true }
                #else
                if let url = exportURL {
                    ShareLink(item: url) {
                        Text("Export MIDI")
                            .dataLabel(13, weight: .semibold)
                            .foregroundStyle(Palette.blackKey)
                            .padding(.horizontal, 22)
                            .frame(height: 44)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Palette.signal))
                    }
                    .buttonStyle(.plain)
                    .simultaneousGesture(TapGesture().onEnded { MIDIExport.exported(finish.code) })
                }
                #endif
                QuietButton(title: player?.playbackEpoch == nil ? "Play it back" : "Playing") {
                    player?.playBack(finish)
                }
            }
            let leave = HStack(spacing: 10) {
                QuietButton(title: "Play it again") { app.restart(lesson: player?.content.code ?? "") }
                QuietButton(title: "Lessons") { app.route = .lessons }
            }
            Group {
                if compact {
                    VStack(alignment: .leading, spacing: 10) { export; leave }
                } else {
                    HStack(spacing: 10) { export; Spacer(); leave }
                }
            }
            .padding(.bottom, compact ? 8 : 24)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Palette.ground.ignoresSafeArea())
        #if targetEnvironment(macCatalyst)
        .fileExporter(isPresented: Bindable(app).exporting, document: MIDIDocument(data: MIDIExport.data(finish)),
                      contentType: .midi, defaultFilename: MIDIExport.fileName(finish.code)) { result in
            if case .success = result { MIDIExport.exported(finish.code) }
        }
        #else
        .task(id: finish) { exportURL = MIDIExport.write(finish) }
        #endif
    }

    #if !targetEnvironment(macCatalyst)
    @State private var exportURL: URL?
    #endif

    /// Ticks into the chorus while it plays back.
    private func playhead(_ player: Player?) -> Double? {
        guard let t = player?.playbackTick() else { return nil }
        // Reduce Motion: the playhead steps by beat (like the LEDs) instead of gliding.
        return reduceMotion ? (t / 12).rounded(.down) * 12 : t
    }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
}

/// The exported loop's name and bytes: `Takt A1 Chorus 01.mid`, numbered per lesson.
enum MIDIExport {
    static func fileName(_ code: String) -> String {
        String(format: "Takt %@ Chorus %02d", code, UserDefaults.standard.integer(forKey: "exports.\(code)") + 1)
    }

    static func exported(_ code: String) {
        UserDefaults.standard.set(UserDefaults.standard.integer(forKey: "exports.\(code)") + 1, forKey: "exports.\(code)")
    }

    static func data(_ f: LessonEngine.Finish) -> Data {
        MIDIFile.data(notes: MIDIFile.notes(f, ticksPerBeat: 12, bars: f.bars), tempo: Double(f.tempo), bars: f.bars,
                      name: "Takt \(f.code) Chorus")
    }

    /// iOS: the file for the share sheet, in the temporary directory.
    static func write(_ f: LessonEngine.Finish) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName(f.code) + ".mid")
        do { try data(f).write(to: url, options: .atomic); return url } catch { return nil }
    }
}

struct MIDIDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.midi] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

/// One chorus, 12 bars across, pitch up. Lanes cover the notes played and expected (at least an
/// octave and a half); expected notes show at their key in the display octave.
struct PianoRoll: View {
    let finish: LessonEngine.Finish
    let form: [String]
    /// Ticks into the chorus, while it plays back.
    var playhead: Double? = nil

    var body: some View {
        Canvas { ctx, size in
            let bars = max(form.count, 1)
            let ticksPerBar = 48.0
            let chorusTicks = Double(bars) * ticksPerBar
            let notes = finish.presses.map(\.note) + finish.expected.map(\.display)
            var low = (notes.min() ?? 48) - 2
            var high = (notes.max() ?? 67) + 2
            if high - low < 18 { let pad = (18 - (high - low)) / 2; low -= pad; high += 18 - (high - low) }
            let labelH: CGFloat = 22
            let rollH = size.height - labelH
            let laneH = rollH / CGFloat(high - low + 1)
            let barW = size.width / CGFloat(bars)
            func x(_ tick: Double) -> CGFloat { CGFloat(tick / chorusTicks) * size.width }
            func y(_ note: Int) -> CGFloat { CGFloat(high - note) * laneH }

            // Ground, the alone bars, bar lines.
            ctx.fill(Path(CGRect(origin: .zero, size: CGSize(width: size.width, height: rollH))), with: .color(Palette.panel))
            for b in finish.aloneBars {
                ctx.fill(Path(CGRect(x: CGFloat(b) * barW, y: 0, width: barW, height: rollH)),
                         with: .color(Palette.signal.opacity(0.14)))
            }
            for n in low...high where [1, 3, 6, 8, 10].contains(((n % 12) + 12) % 12) {
                ctx.fill(Path(CGRect(x: 0, y: y(n), width: size.width, height: laneH)), with: .color(Palette.ground.opacity(0.35)))
            }
            for b in 0...bars {
                let p = Path(CGRect(x: CGFloat(b) * barW, y: 0, width: 1, height: rollH))
                ctx.fill(p, with: .color(Palette.line))
            }
            // Expected: cue outlines a quarter note long.
            for e in finish.expected {
                let r = CGRect(x: x(Double(e.tick)), y: y(e.display), width: x(12), height: laneH).insetBy(dx: 1, dy: 1)
                ctx.stroke(Path(roundedRect: r, cornerRadius: 2), with: .color(Palette.cue), lineWidth: 1.5)
            }
            // Played: filled, signal in the alone bars, text elsewhere.
            for p in finish.presses {
                let bar = Int(p.tick / ticksPerBar)
                let alone = finish.aloneBars.contains(bar)
                let r = CGRect(x: x(max(0, p.tick)), y: y(p.note), width: x(12), height: laneH).insetBy(dx: 3, dy: 3)
                ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(alone ? Palette.signal : Palette.text))
            }
            if let t = playhead {
                ctx.fill(Path(CGRect(x: x(t) - 1, y: 0, width: 2, height: rollH)), with: .color(Palette.signal))
            }
            // Chords under the bars.
            for (b, chord) in form.enumerated() {
                let t = Text(chord).font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundColor(Palette.muted)
                ctx.draw(t, at: CGPoint(x: (CGFloat(b) + 0.5) * barW, y: rollH + labelH / 2))
            }
        }
        .accessibilityLabel("Piano roll of your last chorus: \(finish.presses.count) notes")
    }
}
