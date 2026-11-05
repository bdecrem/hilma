#if DEBUG
import SwiftUI

/// Launch-argument hooks for headless checks. Compiled out of Release.
///
/// `-RenderTo <wav> [-RenderSeconds 30] [-Tempo 70] [-RenderScript "0:play,10:tempo=90"]`
///   renders the band offline (no device, faster than realtime) and exits. Script items are
///   `<seconds>:<command>`: play, pause, stop, tempo=N, mute=<channel>, unmute=<channel>,
///   on=<note>@<velocity>, off=<note>, band=<band>, song=<song>/<part> (the song with your keys on
///   the part's instrument, as the Stage loads it). Channels: drums, bass, keys, horns.
///
/// `-RecordTo <wav> [-RecordSeconds 10]` records the live render (use with `-Silent 1`) and exits.
///
/// `-TestPress <note>` holds that key down a second after launch, through the same path as a touch.
///
/// `-Autoplay perfect|loose|sloppy|rush` plays the lesson for you (Autoplay.swift).
///
/// `-AutoTap 1` on a song taps each chord the frame it is heard, through tap mode's path.
///
/// `-ClockTo <file>` writes, once the band rolls, the host time at which tick 0 is heard:
///   `<mach ticks> <seconds> <bpm>`, for a player outside the app (scripts/midiplay.swift).
///
/// `-LessonCheck` runs the Scorer and the LessonEngine against scripted players and exits
///   (LessonCheck.swift).
///
/// `-SnapshotAt "name:tick,..." -SnapshotDir <dir>` renders the wide (Mac) lesson screen
///   offscreen when each transport tick is heard, in both themes: `<dir>/<name>-dark.png` and
///   `-paper.png`, 1100×768 pt at 2x. ImageRenderer needs no window, so it works with the screen
///   locked, when a window capture fails.
enum DebugHooks {
    private static var snapshots: [(name: String, tick: Double)] = {
        guard let list = UserDefaults.standard.string(forKey: "SnapshotAt") else { return [] }
        return list.split(separator: ",").map { item in
            let parts = item.split(separator: ":")
            guard parts.count == 2, let tick = Double(parts[1]) else { fatalError("-SnapshotAt item \(item)") }
            return (String(parts[0]), tick)
        }.sorted { $0.tick < $1.tick }
    }()

    static func snapshotIfDue(_ player: Player, tick: Double) {
        // "result:0" waits for a song's run to end instead of a tick; the others take their turn.
        guard let i = snapshots.firstIndex(where: { $0.name == "result" ? player.gameResult != nil : tick >= $0.tick }) else { return }
        let next = snapshots.remove(at: i)
        guard let dir = UserDefaults.standard.string(forKey: "SnapshotDir") else { fatalError("-SnapshotAt needs -SnapshotDir") }
        snapshot(player, name: next.name, dir: dir)
    }

    /// The screen now, both themes, to `<dir>/<name>-<theme>.png` (the Mac layout, offscreen).
    static func snapshot(_ player: Player, name: String, dir: String) {
        MainActor.assumeIsolated {
            for theme in [Theme.dark, .paper] {
                // A song under way renders the game screen instead of the lesson's.
                let screen = Group {
                    if player.game != nil {
                        GameScreen(state: player.gameState())
                    } else {
                        LessonScreen(state: player.lessonState())
                    }
                }
                    .environment(\.horizontalSizeClass, .regular)
                    .environment(\.colorScheme, theme.colorScheme)
                    .environment(\.offscreen, true)
                    .frame(width: 1100, height: 768)
                let renderer = ImageRenderer(content: screen)
                renderer.scale = 2
                guard let png = renderer.uiImage?.pngData() else { fatalError("snapshot \(name) did not render") }
                try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name)-\(theme.rawValue).png"))
            }
        }
    }

    /// `-LaunchSoundCheck 1`: every launch set's six cues load from the bundle; prints their
    /// lengths and exits.
    @MainActor static func launchSoundCheckIfRequested(_ audio: AudioEngine) {
        guard UserDefaults.standard.bool(forKey: "LaunchSoundCheck") else { return }
        var ok = true
        for set in LaunchSound.sets {
            guard let s = LaunchSound.make(on: audio, set: set) else { print("FAIL  launch sound \(set) did not load"); ok = false; continue }
            let lengths = LaunchSound.Cue.allCases.map { String(format: "%@ %.2f", $0.rawValue, s.seconds($0)) }
            print("PASS  launch sound \(set): \(lengths.joined(separator: ", "))")
        }
        exit(ok ? 0 : 1)
    }

    static func autoplayIfRequested(_ player: Player) {
        guard let name = UserDefaults.standard.string(forKey: "Autoplay") else { return }
        guard let mode = Autoplay.Mode(rawValue: name) else { fatalError("unknown -Autoplay \(name)") }
        player.autoplayMode = mode
    }

    /// `-ChartDump <song>/<part>` prints every tier's chart (tick, bar.beat, key, length, weight)
    /// and exits: what the highway will show at each level.
    static func chartDumpIfRequested() {
        guard let v = UserDefaults.standard.string(forKey: "ChartDump") else { return }
        let sp = v.split(separator: "/").map(String.init)
        guard sp.count == 2, let part = Song.PartKey(rawValue: sp[1]) else { fatalError("-ChartDump <song>/<part>") }
        let song = Song.bundled(sp[0])
        let notes = song.notes(part)
        let masks = song.masks(part, charting: .bundled)
        let tpb = song.band.ticksPerBeat, tpBar = song.ticksPerBar
        for (ti, mask) in masks.enumerated() {
            let picked = notes.indices.filter { mask[$0] }
            // The tier's fingers as the Stage shows them: a melody by hand position, a chords
            // part as the file sets them.
            let fingers = part == .melody ? Fingering.plan(picked.map { notes[$0] }, ticksPerBeat: tpb) : picked.map { notes[$0].f ?? 0 }
            print("tier \(ti + 1): \(picked.count) notes")
            for (k, i) in picked.enumerated() {
                let n = notes[i]
                print(String(format: "  t=%4d  %2d.%d  n=%2d len=%2d lv=%d f=%d", n.t, n.t / tpBar + 1, (n.t % tpBar) / tpb + 1, n.n, n.len, n.lv, fingers[k]))
            }
        }
        exit(0)
    }

    /// `-DumpCharts <file.json>` writes every bundled song's charts — per part, per tier, the
    /// indices of the notes that play (over `Song.notes`, in time order) — and exits. The
    /// server's charter (src/lib/takt/charting.ts, Agent mode) is checked against it by
    /// `scripts/takt/charting-check.ts`.
    static func chartsDumpIfRequested() {
        guard let path = UserDefaults.standard.string(forKey: "DumpCharts") else { return }
        var out: [String: [String: [[Int]]]] = [:]
        for name in Song.catalog where Bundle.main.url(forResource: name, withExtension: "json") != nil {
            let song = Song.bundled(name)
            var parts: [String: [[Int]]] = [:]
            for k in song.partKeys {
                parts[k.rawValue] = song.masks(k).map { m in m.indices.filter { m[$0] } }
            }
            out[name] = parts
        }
        do {
            try JSONSerialization.data(withJSONObject: out).write(to: URL(fileURLWithPath: path))
            print("TAKT charts dumped to \(path)")
            exit(0)
        } catch {
            print("TAKT charts dump failed: \(error)")
            exit(1)
        }
    }

    static func lessonCheckIfRequested() {
        guard UserDefaults.standard.bool(forKey: "LessonCheck") else { return }
        exit(LessonCheck.run() ? 0 : 1)
    }

    /// The epoch last written: a Stop and Play (calibration, Play it back) writes it again.
    private static var clockEpoch = -1

    static func writeClockIfRequested(_ clock: TransportClock) {
        guard clock.snapshot.epoch != clockEpoch, let path = UserDefaults.standard.string(forKey: "ClockTo"),
              clock.snapshot.anchor.rolling, clock.snapshot.anchor.tick == 0,
              let h0 = clock.hostTime(atTick: 0) else { return }
        clockEpoch = clock.snapshot.epoch
        let line = String(format: "%llu %.6f %.3f\n", h0, Double(h0) / clock.hostTicksPerSecond, clock.snapshot.anchor.tempo)
        try? line.write(toFile: path, atomically: true, encoding: .utf8)
    }

    /// `-Calibrate 1` starts the calibration a second after launch (with `-Route calibrate`).
    static func calibrateIfRequested(_ player: Player) {
        guard UserDefaults.standard.bool(forKey: "Calibrate") else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { player.startCalibration() }
    }

    static func pressIfRequested(_ player: Player) {
        let note = UserDefaults.standard.integer(forKey: "TestPress")
        guard note > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { player.press(note) }
    }

    /// `-ReplayLog <lesson-log.txt> -ReplayModule S1 -ReplayStep 14 -ReplayTempo 50 [-ReplayEpoch 4]
    /// [-ReplayFilter 2026-11-04T18]`: runs a session's presses (the lines `Player.dump` wrote)
    /// through a fresh engine on that step and prints every verdict, run by run, with the
    /// scoring rules as they are now; then exits. For tuning the rules on real playing.
    static func replayIfRequested() {
        let d = UserDefaults.standard
        guard let path = d.string(forKey: "ReplayLog") else { return }
        let code = d.string(forKey: "ReplayModule") ?? "S1"
        let stepNumber = max(1, d.integer(forKey: "ReplayStep"))
        let tempo = d.double(forKey: "ReplayTempo") > 0 ? d.double(forKey: "ReplayTempo") : 60
        let epoch = d.object(forKey: "ReplayEpoch") == nil ? nil : d.integer(forKey: "ReplayEpoch")
        let filter = d.string(forKey: "ReplayFilter") ?? ""
        let lesson = Lesson.bundled("lesson-\(code)")
        let tpb = 12
        let engine = LessonEngine(lesson: lesson, ticksPerBeat: tpb, gated: false)
        engine.start(step: stepNumber - 1)
        let msPerTick = 60000 / (tempo * Double(tpb))
        var count = 0, clean = 0, perfect = 0
        engine.onVerdict = { v in
            count += 1
            if let r = v.result {
                if r.clean { clean += 1 }
                if r.hits == r.notes.count && r.extras.isEmpty { perfect += 1 }
                let extras = r.extras.map { "\($0.bar + 1):\(LessonEngine.noteName($0.note))" }.joined(separator: " ")
                print("TAKT replay unit \(v.chorus + 1): \(r.detail) · \(r.clean ? "clean" : "not clean") · \(r.hits == r.notes.count && r.extras.isEmpty ? "100%" : "") [\(r.problems.joined(separator: " "))]\(extras.isEmpty ? "" : " extras \(extras)")")
            } else {
                print("TAKT replay unit \(v.chorus + 1): not judged (\(v.line))")
            }
        }
        guard let text = try? String(contentsOfFile: path, encoding: .utf8) else { fatalError("-ReplayLog \(path) unreadable") }
        let regex = try! NSRegularExpression(pattern: #"press (\d+) tick ([-\d.]+) \(bar \d+ beat [\d.]+\) epoch (\d+)"#)
        var last = 0.0, n = 0
        for line in text.split(separator: "\n") where filter.isEmpty || line.contains(filter) {
            let s = String(line)
            guard let m = regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { continue }
            let note = Int(s[Range(m.range(at: 1), in: s)!])!, tick = Double(s[Range(m.range(at: 2), in: s)!])!, e = Int(s[Range(m.range(at: 3), in: s)!])!
            if let epoch, e != epoch { continue }
            engine.heard(tick: tick, tempo: tempo, rolling: true, epoch: e)
            engine.played(note: note, tick: tick, msPerTick: msPerTick, epoch: e)
            last = tick
            n += 1
        }
        engine.heard(tick: last + Double(2 * engine.loopTicks), tempo: tempo, rolling: true, epoch: epoch ?? 0)
        print("TAKT replay: \(n) presses, \(count) units judged, \(clean) clean, \(perfect) at 100% with nothing extra, unit \(engine.loopTicks) ticks, \(engine.expected.count) notes")
        exit(0)
    }

    static func renderIfRequested() {
        let d = UserDefaults.standard
        guard let path = d.string(forKey: "RenderTo") else { return }
        let seconds = d.double(forKey: "RenderSeconds") > 0 ? d.double(forKey: "RenderSeconds") : 30
        let tempo = d.double(forKey: "Tempo") > 0 ? d.double(forKey: "Tempo") : 70
        let audio = AudioEngine(band: .bundled("band-blues-C"), tempo: tempo)
        let script = parse(d.string(forKey: "RenderScript") ?? "0:play", audio: audio)
        do {
            try audio.renderOffline(seconds: seconds, script: script, to: URL(fileURLWithPath: path))
            print("TAKT rendered \(seconds)s at \(audio.sampleRate) Hz to \(path)")
            exit(0)
        } catch {
            print("TAKT render failed: \(error)")
            exit(1)
        }
    }

    static func recordIfRequested(_ audio: AudioEngine) {
        let d = UserDefaults.standard
        guard let path = d.string(forKey: "RecordTo") else { return }
        let seconds = d.double(forKey: "RecordSeconds") > 0 ? d.double(forKey: "RecordSeconds") : 10
        do {
            try audio.record(seconds: seconds, to: URL(fileURLWithPath: path)) {
                print("TAKT recorded \(seconds)s to \(path)")
                exit(0)
            }
        } catch {
            print("TAKT record failed: \(error)")
            exit(1)
        }
    }

    /// `band=band-minor-A` swaps the band, `transpose=2` moves its pitched notes.
    static func parse(_ script: String, audio: AudioEngine? = nil) -> [(at: Double, command: EngineCommand)] {
        let channels: [String: Channel] = ["drums": .drums, "bass": .bass, "keys": .keys, "horns": .horns]
        return script.split(separator: ",").map { item in
            let parts = item.split(separator: ":", maxSplits: 1).map(String.init)
            guard parts.count == 2, let at = Double(parts[0]) else { fatalError("RenderScript item \(item)") }
            let kv = parts[1].split(separator: "=", maxSplits: 1).map(String.init)
            let command: EngineCommand
            switch (kv[0], kv.count > 1 ? kv[1] : nil) {
            case ("play", nil): command = .play
            case ("pause", nil): command = .pause
            case ("stop", nil): command = .stop
            case ("tempo", let v?): command = .tempo(Double(v)!)
            case ("mute", let v?): command = .mute(channels[v]!, true)
            case ("unmute", let v?): command = .mute(channels[v]!, false)
            case ("on", let v?):
                let nv = v.split(separator: "@")
                command = .noteOn(note: Int(nv[0])!, velocity: nv.count > 1 ? Float(nv[1])! : 0.8)
            case ("off", let v?): command = .noteOff(note: Int(v)!)
            case ("transpose", let v?): command = .transpose(Int(v)!)
            case ("organ", let v?): command = .monitor(v == "1" ? SampledInstrument.shared("organ") : nil)
            case ("keys", let v?): command = .monitor(v == "0" ? nil : SampledInstrument.shared(v))  // your keys' instrument by name
            case ("band", let v?): command = .band(audio!.load(band: v))  // the room follows the band
            case ("straight", let v?): command = .band(audio!.load(band: v, straight: true))  // on the straight grid
            case ("song", let v?):
                let sp = v.split(separator: "/").map(String.init)
                command = .band(audio!.load(song: .bundled(sp[0]), part: Song.PartKey(rawValue: sp[1])!))
            default: fatalError("RenderScript command \(parts[1])")
            }
            return (at, command)
        }
    }
}
#endif
