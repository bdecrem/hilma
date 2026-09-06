import Foundation
import UIKit
import os

/// DEBUG-only driver: `-studioScript "<step>;<step>;…"` runs the listed
/// steps against the open Studio once the track has loaded, so the
/// simulator / Catalyst build can be exercised headlessly (no screen
/// control — see "NO SCREEN CONTROL" in PROGRESS.md). Every step appends a
/// line to `-studioScriptLog <path>` (default: the app's tmp dir) and to
/// os_log (category `script`), which the shell tails to time screenshots.
///
/// Steps (all go through the same model methods the UI calls):
///   play / stop            transport key
///   wait:<seconds>         sleep
///   pos                    log playing state, loop position, scope, app state
///   tweak:<path>=<value>   a fader move (what a Controls slider commits)
///   choice:<path>=<string> a Panels choice pill (waveform, sub mode, …)
///   track:<key>=<value>    tempo / swing / bars
///   mute:<id> unmute:<id> solo:<id> unsolo:<id>   the M/S keys
///   render                 force a re-render (logs RMS + phase)
///   send:<text>            a chat turn; blocks until the agent finishes
///   controls / closeControls   open / close the Controls sheet
///   tab:faders|panels|seq  pick the Controls view (remembered like the UI)
///   panels:open:<id>       open one accordion section (jb202, jt90, fx.jt90.d1 …)
///   hits:<seconds>         sample the Panels hit LEDs for N s and log what lit
///   seq:inst:<id>          Seq tab: pick an instrument
///   seq:section:<n>        Seq tab: pick section n (1-based)
///   seq:tap:<voice>:<step> Seq tab: cycle a drum pad (1-based step)
///   seq:tapMono:<step>     Seq tab: toggle a mono gate
///   seq:len:<bars>         Seq tab: LENGTH 1 · 2 · 4
///   seq:clear              Seq tab: one CLEAR tap (twice within 3 s clears)
///   seq:loop:on|off        Seq tab: the LOOP SECTION key
///   seq:page:<n>           Seq tab: go to page n (1-based)
///   pattern:<inst>[:<section>]   log the saved pattern from the engine (what serialize() carries)
///   scope                  log renderScope / playedScope / transport label
///   mixstate               log every track's M/S state + the last render's RMS
///   rename:<title>         the header's tap-to-rename commit
///   publish / unpublish    the header key (saves first)
///   bounce:wav|aac         write the last render with Exporter to -studioExportDir (or tmp); logs path + bytes
///   openBounce / closeBounce   the Bounce sheet (for screenshots)
///   cache                  log the render cache's track ids
///   nowplaying             log the last Now Playing dictionary
///   save                   flush the autosave and wait for it
///   shot:<name>            handshake with the shell: writes <name>.want into
///                          -studioShotDir and waits (≤ 10 s) until it is removed
///   back                   leave Studio (pops to the Library)
///   note:<text>            just log it
enum StudioScript {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "script")

    static var steps: [String]? {
        let args = CommandLine.arguments
        guard let idx = args.firstIndex(of: "-studioScript"), idx + 1 < args.count else { return nil }
        return args[idx + 1].split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    static func argValue(_ flag: String) -> String? {
        let args = CommandLine.arguments
        guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
        return args[idx + 1]
    }

    static var logURL: URL {
        if let p = argValue("-studioScriptLog") { return URL(fileURLWithPath: p) }
        return FileManager.default.temporaryDirectory.appendingPathComponent("studio-script.log")
    }

    static var shotDir: URL {
        if let p = argValue("-studioShotDir") { return URL(fileURLWithPath: p, isDirectory: true) }
        return FileManager.default.temporaryDirectory
    }

    static var exportDir: URL {
        if let p = argValue("-studioExportDir") { return URL(fileURLWithPath: p, isDirectory: true) }
        return FileManager.default.temporaryDirectory
    }

    private static let started = Date()

    @MainActor
    static func emit(_ text: String) {
        let stamp = String(format: "%7.2f", Date().timeIntervalSince(started))
        let line = "[\(stamp)] \(text)\n"
        log.notice("\(text, privacy: .public)")
        print("[script] \(text)"); fflush(stdout)
        let url = logURL
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close()
        } else {
            try? Data(line.utf8).write(to: url)
        }
    }

    @MainActor
    private static var appState: String {
        switch UIApplication.shared.applicationState {
        case .active: return "active"
        case .inactive: return "inactive"
        case .background: return "background"
        @unknown default: return "unknown"
        }
    }

    /// Screenshot handshake shared with the Library driver: write
    /// `<name>.want`, wait until the shell has taken the shot and removed it.
    @MainActor
    static func shot(_ name: String) async {
        let file = shotDir.appendingPathComponent("\(name).want")
        try? FileManager.default.createDirectory(at: shotDir, withIntermediateDirectories: true)
        try? Data("\(name)\n".utf8).write(to: file)
        emit("  shot \(name): waiting for the shell")
        let deadline = Date().addingTimeInterval(10)
        while FileManager.default.fileExists(atPath: file.path) && Date() < deadline {
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        if FileManager.default.fileExists(atPath: file.path) {
            try? FileManager.default.removeItem(at: file)
            emit("  shot \(name): nobody took it")
        }
    }

    @MainActor
    static func run(_ steps: [String], model: StudioModel, back: @escaping () -> Void) async {
        emit("script start: \(steps.count) steps; track=\(model.title) status=\(model.status) bpm=\(model.bpm) bars=\(model.shownBars) hasBuffer=\(model.hasBuffer) published=\(model.sharing.published)")
        for (i, step) in steps.enumerated() {
            let (name, arg) = split(step)
            let t0 = Date()
            switch name {
            case "play":
                if !model.playing { model.togglePlay() }
            case "stop":
                if model.playing { model.togglePlay() }
            case "wait":
                let s = Double(arg) ?? 1
                try? await Task.sleep(nanoseconds: UInt64(s * 1_000_000_000))
            case "pos":
                emit("  pos: playing=\(model.playing) pos=\(String(format: "%.3f", model.player.position())) step16=\(model.playStep16.map(String.init) ?? "-") \(scopeSummary(model)) state=\(appState) rendering=\(model.rendering) save=\(model.saveState)")
            case "tweak":
                let (path, value) = splitAssign(arg)
                let before = model.player.position()
                model.onParam(path: path, value: value, label: path)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                emit("  tweak \(path)=\(value): pos before=\(String(format: "%.3f", before)) after=\(String(format: "%.3f", model.player.position())) playing=\(model.playing) desc value=\(descValue(model, path))")
            case "choice":
                let parts = arg.split(separator: "=", maxSplits: 1).map(String.init)
                let path = parts.first ?? arg, value = parts.count > 1 ? parts[1] : ""
                model.onPanelParam(path: path, value: .string(value), label: path)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                emit("  choice \(path)=\(value): desc value=\(descValue(model, path)) playing=\(model.playing)")
            case "track":
                let (key, value) = splitAssign(arg)
                model.onTrack(key: key, value: value)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            case "mute", "unmute", "solo", "unsolo":
                let on = !name.hasPrefix("un")
                let what = name.hasSuffix("solo") ? "solo" : "mute"
                model.onMix(id: arg, what: what, on: on)
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                let st = model.desc?.tracks?[arg]
                emit("  \(name) \(arg): tracks[\(arg)] mute=\(st?.mute ?? false) solo=\(st?.solo ?? false) anySolo=\(model.desc?.anySolo ?? false)")
            case "render":
                let before = model.player.position()
                await model.renderNow()
                emit("  render: done in \(String(format: "%.2f", Date().timeIntervalSince(t0)))s hasBuffer=\(model.hasBuffer) bars=\(model.shownBars) \(scopeSummary(model)) pos before=\(String(format: "%.3f", before)) after=\(String(format: "%.3f", model.player.position())) state=\(appState)")
            case "send":
                let count = model.feed.count
                model.send(arg) // the composer's path: pending [controls] notes ride along
                try? await Task.sleep(nanoseconds: 300_000_000)
                while model.busy { try? await Task.sleep(nanoseconds: 250_000_000) }
                let added = model.feed.suffix(from: count)
                let tools = added.compactMap { if case .tool(_, let n, _, let r, let e) = $0 { return "\(n)\(r == nil ? "(no result)" : "")\((e ?? false) ? "(error)" : "")" } else { return nil } }
                let texts = added.compactMap { if case .assistant(_, let t) = $0 { return t } else { return nil } }
                let notes = added.compactMap { if case .note(_, let t, _) = $0 { return t } else { return nil } }
                emit("  send done in \(String(format: "%.1f", Date().timeIntervalSince(t0)))s: tools=\(tools) text=\(texts.map { String($0.prefix(120)) }) notes=\(notes) busy=\(model.busy) save=\(model.saveState) playing=\(model.playing)")
            case "controls":
                model.controlsOpen = true
                try? await Task.sleep(nanoseconds: 900_000_000)
                emit("  controls open: mode=\(UserDefaults.standard.string(forKey: ControlsMode.storageKey) ?? "faders") \(model.groups.count) groups \(model.groups.map(\.title))")
            case "closeControls":
                model.controlsOpen = false
                try? await Task.sleep(nanoseconds: 700_000_000)
            case "tab":
                UserDefaults.standard.set(arg, forKey: ControlsMode.storageKey)
                try? await Task.sleep(nanoseconds: 900_000_000)
                emit("  tab \(arg): hitsWanted=\(model.hitsWanted) seq target inst=\(model.seqModel.inst ?? "-") section=\(model.seqModel.section.map { "\($0 + 1)" } ?? "loop") len=\(model.seqModel.length)")
            case "panels":
                // panels:open:<id>
                let parts = arg.split(separator: ":", maxSplits: 1).map(String.init)
                if parts.first == "open", parts.count > 1 {
                    UserDefaults.standard.set(parts[1] == "none" ? "__closed__" : parts[1], forKey: "jam.panelsOpen")
                    try? await Task.sleep(nanoseconds: 700_000_000)
                    emit("  panels open \(parts[1]); effects=\(model.desc?.effects?.map { "\($0.target):\($0.chain.map { "\($0.id)/\($0.type)" })" } ?? [])")
                } else {
                    emit("  unknown panels step '\(arg)'")
                }
            case "hits":
                let seconds = Double(arg) ?? 1
                let polls0 = model.hitPolls, lit0 = model.hitPollsLit
                var seen: [String: Set<String>] = [:]
                var samples = 0, litSamples = 0
                let end = Date().addingTimeInterval(seconds)
                while Date() < end {
                    let h = model.hits
                    samples += 1
                    if !h.isEmpty { litSamples += 1 }
                    for (k, v) in h { seen[k, default: []].formUnion(v) }
                    try? await Task.sleep(nanoseconds: 40_000_000)
                }
                let summary = seen.keys.sorted().map { "\($0)=\(seen[$0]!.sorted())" }
                emit("  hits over \(seconds)s: polls=\(model.hitPolls - polls0) lit polls=\(model.hitPollsLit - lit0) samples=\(samples) lit samples=\(litSamples) voices=\(summary) playing=\(model.playing) wanted=\(model.hitsWanted)")
            case "seq":
                await seqStep(arg, model: model)
            case "pattern":
                let parts = arg.split(separator: ":").map(String.init)
                let inst = parts.first ?? ""
                let section = parts.count > 1 ? (Int(parts[1]).map { max(0, $0 - 1) }) : nil
                if let p = try? await model.engine.pattern(inst: inst, section: section) {
                    emit("  pattern \(inst) \(section.map { "section \($0 + 1)" } ?? "loop"): \(patternSummary(p))")
                } else {
                    emit("  pattern \(inst): failed")
                }
            case "mixstate":
                let t = (model.desc?.tracks ?? [:]).sorted { $0.key < $1.key }.map { "\($0.key):\($0.value.mute ? "M" : "-")\($0.value.solo ? "S" : "-")" }
                emit("  mixstate: anySolo=\(model.desc?.anySolo ?? false) \(t) rms=\(model.lastRender.map { String(format: "%.4f", StudioModel.rmsFirstSecond($0)) } ?? "-")")
            case "scope":
                emit("  scope: \(scopeSummary(model)) transport=\"\(model.transportLabel)\" bars=\(model.shownBars) playing=\(model.playing)")
            case "rename":
                model.rename(arg)
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                emit("  rename → title=\(model.title) sharing.title=\(model.sharing.title) nowPlaying=\(NowPlaying.shared.title) save=\(model.saveState)")
            case "publish", "unpublish":
                let want = name == "publish"
                if model.sharing.published != want {
                    await model.togglePublish()
                }
                emit("  \(name): published=\(model.sharing.published) slug=\(model.sharing.slug ?? "-") url=\(model.sharing.publicURL?.absoluteString ?? "-") error=\(model.sharing.error ?? "-")")
            case "bounce":
                guard let r = model.lastRender else { emit("  bounce: no render yet"); break }
                let format: ExportFormat = arg == "aac" ? .aac : .wav
                let dir = exportDir
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let url = dir.appendingPathComponent(Exporter.filename(bpm: model.bpm, format: format))
                do {
                    let bpm = model.bpm
                    let bytes = try await Task.detached(priority: .userInitiated) { () throws -> Int in
                        switch format {
                        case .wav: return try Exporter.writeWav(pcm: r.pcm, sampleRate: r.sampleRate, channels: r.channels, to: url)
                        case .aac: return try Exporter.writeAac(pcm: r.pcm, sampleRate: r.sampleRate, channels: r.channels, to: url)
                        }
                    }.value
                    _ = bpm
                    emit("  bounce \(format.rawValue): \(url.path) \(bytes) bytes (\(r.bars) bars, \(r.length) frames × \(r.channels) ch) in \(String(format: "%.2f", Date().timeIntervalSince(t0)))s")
                } catch {
                    emit("  bounce \(format.rawValue) FAILED: \(error.localizedDescription)")
                }
            case "openBounce":
                model.bounceOpen = true
                try? await Task.sleep(nanoseconds: 900_000_000)
            case "closeBounce":
                model.bounceOpen = false
                try? await Task.sleep(nanoseconds: 700_000_000)
            case "cache":
                let ids = await RenderCache.shared.cachedTrackIds()
                emit("  cache: \(ids.count) tracks \(ids)")
            case "nowplaying":
                let info = NowPlaying.shared.lastPublished
                let keys = ["title": "title", "artist": "artist", "album": "albumTitle", "duration": "playbackDuration", "elapsed": "MPNowPlayingInfoPropertyElapsedPlaybackTime", "rate": "MPNowPlayingInfoPropertyPlaybackRate"]
                let summary = keys.keys.sorted().map { k in "\(k)=\(info[keys[k]!].map { "\($0)" } ?? "-")" }.joined(separator: " ")
                emit("  nowplaying: \(summary) artwork=\(info["artwork"] != nil || info["MPMediaItemPropertyArtwork"] != nil)")
            case "save":
                await model.saveNow()
                emit("  save: state=\(model.saveState)")
            case "shot":
                await shot(arg)
            case "back":
                back()
                try? await Task.sleep(nanoseconds: 800_000_000)
            case "note":
                break
            default:
                emit("  unknown step '\(step)'")
            }
            emit("step \(i + 1)/\(steps.count) \(step) done (\(String(format: "%.1f", Date().timeIntervalSince(t0)))s)")
        }
        emit("script done")
    }

    // MARK: - Seq tab steps (drive the shared SeqModel the tab renders)

    @MainActor
    private static func seqStep(_ arg: String, model: StudioModel) async {
        let parts = arg.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        let op = parts.first ?? ""
        let a1 = parts.count > 1 ? parts[1] : ""
        let a2 = parts.count > 2 ? parts[2] : ""
        let seq = model.seqModel
        let per = 8
        switch op {
        case "inst": model.seqInst = a1
        case "section": model.seqSection = max(0, (Int(a1) ?? 1) - 1)
        case "tap": seq.tapDrum(voice: a1, i: max(0, (Int(a2) ?? 1) - 1))
        case "tapMono": seq.tapMono(max(0, (Int(a1) ?? 1) - 1))
        case "sel": seq.setSel(max(0, (Int(a1) ?? 1) - 1), per: per)
        case "shift": seq.shift(Int(a1) ?? 0)
        case "acc": seq.toggleAccent()
        case "slide": seq.toggleSlide()
        case "off": seq.gateOff()
        case "len": seq.setLength(Int(a1) ?? 1)
        case "clear": seq.clear()
        case "page": seq.setPage(max(0, (Int(a1) ?? 1) - 1), per: per)
        case "loop": seq.loopSection = a1 != "off"
        default: emit("  unknown seq step '\(arg)'"); return
        }
        try? await Task.sleep(nanoseconds: 400_000_000)
        while seq.inflight > 0 { try? await Task.sleep(nanoseconds: 100_000_000) }
        try? await Task.sleep(nanoseconds: 200_000_000)
        var s = "inst=\(seq.inst ?? "-") section=\(seq.section.map { "\($0 + 1)" } ?? "loop") page=\(seq.page + 1) len=\(seq.length) silent=\(seq.silent) armed=\(seq.armed) loop=\(seq.loopSection)"
        if let p = seq.pattern { s += " " + patternSummary(p) }
        if let e = seq.loadError { s += " error=\(e)" }
        emit("  seq \(arg) → \(s) \(scopeSummary(model))")
    }

    @MainActor
    private static func scopeSummary(_ model: StudioModel) -> String {
        func f(_ s: RenderScope) -> String { if case .section(let i) = s { return "section\(i + 1)" } else { return "song" } }
        return "renderScope=\(f(model.renderScope)) playedScope=\(f(model.playedScope))"
    }

    private static func patternSummary(_ p: SeqPattern) -> String {
        switch p.data {
        case .drums(let d):
            let on = d.compactMap { v, row -> String? in
                let steps = row.enumerated().filter { $0.element.isOn }.map { "\($0.offset + 1)\($0.element.accent ? "!" : "")" }
                return steps.isEmpty ? nil : "\(v)[\(steps.joined(separator: ","))]"
            }.sorted()
            return "name=\(p.name ?? "-") len=\(p.length) drums=\(on)"
        case .mono(let m):
            let on = m.enumerated().filter { $0.element.gate }.map { "\($0.offset + 1):\($0.element.note)\($0.element.accent ? "!" : "")\($0.element.slide ? "~" : "")" }
            return "name=\(p.name ?? "-") len=\(p.length) mono=\(on)"
        }
    }

    private static func split(_ step: String) -> (String, String) {
        guard let c = step.firstIndex(of: ":") else { return (step, "") }
        return (String(step[..<c]), String(step[step.index(after: c)...]))
    }

    private static func splitAssign(_ s: String) -> (String, Double) {
        guard let e = s.firstIndex(of: "=") else { return (s, 0) }
        return (String(s[..<e]), Double(s[s.index(after: e)...]) ?? 0)
    }

    @MainActor
    private static func descValue(_ model: StudioModel, _ path: String) -> String {
        // Exact path first; then the same instrument type + sub (the engine
        // may describe an instance under an alias id, e.g. `bass` for jb202).
        let parts = path.split(separator: ".", maxSplits: 1).map(String.init)
        for inst in model.desc?.instruments ?? [] {
            if let p = inst.params.first(where: { $0.path == path }) { return "\(p.value)" }
        }
        if parts.count == 2 {
            for inst in model.desc?.instruments ?? [] where inst.id == parts[0] || inst.type == parts[0] {
                if let p = inst.params.first(where: { $0.sub == parts[1] || $0.sub.hasSuffix("." + parts[1]) }) { return "\(p.value) (\(p.path))" }
            }
        }
        return "?"
    }
}
