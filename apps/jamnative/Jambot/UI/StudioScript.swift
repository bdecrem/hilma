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
///   pos                    log playing state, loop position, app state
///   tweak:<path>=<value>   a fader move (what a Controls slider commits)
///   track:<key>=<value>    tempo / swing / bars
///   mute:<id> unmute:<id> solo:<id> unsolo:<id>   the M/S keys
///   render                 force a re-render (logs RMS + phase)
///   send:<text>            a chat turn; blocks until the agent finishes
///   controls / closeControls   open / close the Controls sheet
///   save                   flush the autosave and wait for it
///   back                   leave Studio (pops to the Library)
///   note:<text>            just log it
enum StudioScript {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "script")

    static var steps: [String]? {
        let args = CommandLine.arguments
        guard let idx = args.firstIndex(of: "-studioScript"), idx + 1 < args.count else { return nil }
        return args[idx + 1].split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    static var logURL: URL {
        let args = CommandLine.arguments
        if let idx = args.firstIndex(of: "-studioScriptLog"), idx + 1 < args.count {
            return URL(fileURLWithPath: args[idx + 1])
        }
        return FileManager.default.temporaryDirectory.appendingPathComponent("studio-script.log")
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

    @MainActor
    static func run(_ steps: [String], model: StudioModel, back: @escaping () -> Void) async {
        emit("script start: \(steps.count) steps; track=\(model.title) status=\(model.status) bpm=\(model.bpm) bars=\(model.shownBars) hasBuffer=\(model.hasBuffer)")
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
                emit("  pos: playing=\(model.playing) pos=\(String(format: "%.3f", model.player.position())) bar=\(model.barNow)/\(model.shownBars) state=\(appState) rendering=\(model.rendering) save=\(model.saveState)")
            case "tweak":
                let (path, value) = splitAssign(arg)
                let before = model.player.position()
                model.onParam(path: path, value: value, label: path)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                emit("  tweak \(path)=\(value): pos before=\(String(format: "%.3f", before)) after=\(String(format: "%.3f", model.player.position())) playing=\(model.playing) desc value=\(descValue(model, path))")
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
                emit("  render: done in \(String(format: "%.2f", Date().timeIntervalSince(t0)))s hasBuffer=\(model.hasBuffer) pos before=\(String(format: "%.3f", before)) after=\(String(format: "%.3f", model.player.position())) state=\(appState)")
            case "send":
                let count = model.feed.count
                model.send(arg) // the composer's path: pending [controls] notes ride along
                try? await Task.sleep(nanoseconds: 300_000_000)
                while model.busy { try? await Task.sleep(nanoseconds: 250_000_000) }
                let added = model.feed.suffix(from: count)
                let tools = added.compactMap { if case .tool(_, let n, _, let r, let e) = $0 { return "\(n)\(r == nil ? "(no result)" : "")\((e ?? false) ? "(error)" : "")" } else { return nil } }
                let texts = added.compactMap { if case .assistant(_, let t) = $0 { return t } else { return nil } }
                let notes = added.compactMap { if case .note(_, let t, _) = $0 { return t } else { return nil } }
                emit("  send done in \(String(format: "%.1f", Date().timeIntervalSince(t0)))s: tools=\(tools) text=\(texts.map { String($0.prefix(120)) }) notes=\(notes) busy=\(model.busy) save=\(model.saveState)")
            case "controls":
                model.controlsOpen = true
                try? await Task.sleep(nanoseconds: 800_000_000)
                emit("  controls open: \(model.groups.count) groups \(model.groups.map(\.title))")
            case "closeControls":
                model.controlsOpen = false
                try? await Task.sleep(nanoseconds: 600_000_000)
            case "save":
                await model.saveNow()
                emit("  save: state=\(model.saveState)")
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
        for inst in model.desc?.instruments ?? [] {
            if let p = inst.params.first(where: { $0.path == path }) { return "\(p.value)" }
        }
        return "?"
    }
}
