import SwiftUI
import UIKit
import os

// Throwaway harness for the sequencer (no screen control — see PROGRESS.md):
//
//   xcrun simctl launch --console-pty "iPhone 16" com.bartdecrem.Jambot \
//     -engineSmoke -seqPreview [-seqScript "<step>;<step>;…"] [-seqShotDir <dir>] [-seqScriptLog <file>]
//
// Shows `SeqView` on the real engine with the jamtest track "SEQ TEST
// techno copy" loaded (nothing is ever saved). `-seqScript` drives the same
// SeqModel the view renders:
//
//   inst:<id>            pick an instrument (jt90, jb202, …)
//   section:<n>          pick section n (1-based)
//   tap:<voice>:<step>   cycle a drum pad (1-based step)
//   tapMono:<step>       toggle a mono gate (selects the step)
//   sel:<step>           select a mono step
//   shift:<semitones>    −12 / −1 / +1 / +12 keys
//   acc | slide | off    the editor keys
//   len:<bars>           LENGTH 1 · 2 · 4
//   clear                one CLEAR tap (twice within 3 s clears)
//   page:<n> | next | prev
//   loop:on|off          LOOP SECTION key
//   step:<n>|none        fake the playhead at absolute 16th n (0-based)
//   scope:song | scope:section:<n>   fake the playing scope
//   wide:on|off          16 steps per page
//   wait:<seconds>
//   shot:<name>          writes <seqShotDir>/<name>.want and waits (≤ 8 s) until
//                        the shell has taken the screenshot and removed the file
//   note:<text>          just log it

@MainActor
@Observable
final class SeqPreviewState {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "seqpreview")

    let host = EngineHost()
    let model = SeqModel()
    let notes = SeqNoteCoalescer()

    var desc: SessionDescription? = nil
    var instId: String? = nil
    var section: Int? = nil
    var playStep16: Int? = nil
    var playScope: RenderScope = .song
    var wide: Bool? = nil
    var status = "loading…"
    var lastNote = ""
    var lastScope = "song"

    private let started = Date()

    func emit(_ text: String) {
        let stamp = String(format: "%7.2f", Date().timeIntervalSince(started))
        let line = "[\(stamp)] \(text)\n"
        Self.log.notice("\(text, privacy: .public)")
        print("[seq] \(text)"); fflush(stdout)
        let url = Self.logURL
        if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close() }
        else { try? Data(line.utf8).write(to: url) }
    }

    static var logURL: URL {
        let a = CommandLine.arguments
        if let i = a.firstIndex(of: "-seqScriptLog"), i + 1 < a.count { return URL(fileURLWithPath: a[i + 1]) }
        return FileManager.default.temporaryDirectory.appendingPathComponent("seq-script.log")
    }

    static var shotDir: URL {
        let a = CommandLine.arguments
        if let i = a.firstIndex(of: "-seqShotDir"), i + 1 < a.count { return URL(fileURLWithPath: a[i + 1], isDirectory: true) }
        return FileManager.default.temporaryDirectory
    }

    static var steps: [String] {
        let a = CommandLine.arguments
        guard let i = a.firstIndex(of: "-seqScript"), i + 1 < a.count else { return [] }
        return a[i + 1].split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    func load() async {
        do {
            try await host.ready()
            let user = try await JamAPI.shared.login(username: "jamtest", password: "jamtest1")
            let tracks = try await JamAPI.shared.tracks()
            guard let meta = tracks.first(where: { $0.title == "SEQ TEST techno copy" }) else {
                status = "track not found"; emit("FAIL: track not found in \(tracks.map(\.title))"); return
            }
            let track = try await JamAPI.shared.track(meta.id)
            let loaded = try await host.loadSession(session: track.session, bpm: track.bpm)
            desc = loaded.desc
            status = "\(user.username) · \(track.title)"
            emit("loaded \(track.title): bpm=\(loaded.desc.bpm) arrangement=\(loaded.desc.arrangement.map(\.bars)) instruments=\(loaded.desc.instruments.filter(\.active).map(\.id))")
            await runScript()
        } catch {
            status = "FAIL: \(error.localizedDescription)"
            emit("FAIL: \(error.localizedDescription)")
        }
    }

    private func runScript() async {
        let steps = Self.steps
        guard !steps.isEmpty else { return }
        try? await Task.sleep(nanoseconds: 800_000_000)
        emit("script start: \(steps.count) steps")
        for (n, step) in steps.enumerated() {
            let parts = step.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
            let name = parts[0]
            let a1 = parts.count > 1 ? parts[1] : ""
            let a2 = parts.count > 2 ? parts[2] : ""
            switch name {
            case "inst": instId = a1
            case "section": section = max(0, (Int(a1) ?? 1) - 1)
            case "tap": model.tapDrum(voice: a1, i: max(0, (Int(a2) ?? 1) - 1))
            case "tapMono": model.tapMono(max(0, (Int(a1) ?? 1) - 1))
            case "sel": model.setSel(max(0, (Int(a1) ?? 1) - 1), per: per)
            case "shift": model.shift(Int(a1) ?? 0)
            case "acc": model.toggleAccent()
            case "slide": model.toggleSlide()
            case "off": model.gateOff()
            case "len": model.setLength(Int(a1) ?? 1)
            case "clear": model.clear()
            case "page": model.setPage(max(0, (Int(a1) ?? 1) - 1), per: per)
            case "next": model.setPage(model.page + 1, per: per)
            case "prev": model.setPage(model.page - 1, per: per)
            case "loop": model.loopSection = a1 != "off"
            case "step": playStep16 = a1 == "none" ? nil : Int(a1)
            case "scope": playScope = a1 == "section" ? .section(index: max(0, (Int(a2) ?? 1) - 1)) : .song
            case "wide": wide = a1 == "on"
            case "wait": try? await Task.sleep(nanoseconds: UInt64((Double(a1) ?? 1) * 1_000_000_000))
            case "shot": await shot(a1)
            case "note": break
            default: emit("  unknown step '\(step)'")
            }
            // Let the optimistic edit reach the engine and the view settle.
            if !["wait", "shot", "note"].contains(name) {
                try? await Task.sleep(nanoseconds: 350_000_000)
                while model.inflight > 0 { try? await Task.sleep(nanoseconds: 100_000_000) }
            }
            emit("step \(n + 1)/\(steps.count) \(step) done → \(summary)")
        }
        emit("script done")
    }

    private var per: Int { (wide ?? false) ? 16 : 8 }

    private var summary: String {
        var s = "inst=\(model.inst ?? "-") section=\(model.section.map { "\($0 + 1)" } ?? "loop") page=\(model.page + 1) sel=\(model.sel + 1) len=\(model.length) silent=\(model.silent) armed=\(model.armed)"
        if let p = model.pattern {
            switch p.data {
            case .drums(let d):
                let on = d.compactMap { v, row -> String? in
                    let steps = row.enumerated().filter { $0.element.isOn }.map { "\($0.offset + 1)\($0.element.accent ? "!" : "")" }
                    return steps.isEmpty ? nil : "\(v)[\(steps.joined(separator: ","))]"
                }.sorted()
                s += " drums=\(on)"
            case .mono(let m):
                let on = m.enumerated().filter { $0.element.gate }.map { "\($0.offset + 1):\($0.element.note)\($0.element.accent ? "!" : "")\($0.element.slide ? "~" : "")" }
                s += " mono=\(on)"
            }
        }
        if let e = model.loadError { s += " error=\(e)" }
        s += " note=\"\(lastNote)\" scope=\(lastScope)"
        return s
    }

    private func shot(_ name: String) async {
        let file = Self.shotDir.appendingPathComponent("\(name).want")
        try? Data("\(name)\n".utf8).write(to: file)
        emit("  shot \(name): waiting for the shell")
        let deadline = Date().addingTimeInterval(8)
        while FileManager.default.fileExists(atPath: file.path) && Date() < deadline {
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        if FileManager.default.fileExists(atPath: file.path) {
            try? FileManager.default.removeItem(at: file)
            emit("  shot \(name): nobody took it")
        }
    }
}

struct SeqPreviewView: View {
    @State private var state = SeqPreviewState()

    var body: some View {
        ZStack(alignment: .topLeading) {
            JBTheme.panel.ignoresSafeArea()
            EngineHostAnchor(host: state.host)
                .frame(width: 2, height: 2)
                .allowsHitTesting(false)
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Text("CONTROLS").font(JBTheme.panelFont(22, weight: .semibold))
                    Circle().fill(JBTheme.green).frame(width: 6, height: 6)
                    Text("live").font(JBTheme.monoFont(11)).foregroundStyle(JBTheme.ink2)
                    Spacer()
                    Text("SEQ").font(JBTheme.panelFont(12, weight: .semibold)).tracking(1.2)
                        .padding(.horizontal, 14).frame(height: 30)
                        .background(JBTheme.ink).foregroundStyle(JBTheme.panel2)
                        .clipShape(Capsule())
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 10)
                ScrollView {
                    if let desc = state.desc {
                        SeqView(
                            engine: state.host,
                            desc: desc,
                            playStep16: state.playStep16,
                            playScope: state.playScope,
                            instId: Binding(get: { state.instId }, set: { state.instId = $0 }),
                            section: Binding(get: { state.section }, set: { state.section = $0 }),
                            wide: state.wide,
                            notes: state.notes,
                            externalModel: state.model,
                            onEdited: { key, text in
                                state.lastNote = text
                                state.emit("  onEdited \(key): \(text)")
                            },
                            onScope: { scope in
                                state.lastScope = { if case .section(let i) = scope { return "section \(i + 1)" } else { return "song" } }()
                                state.emit("  onScope \(state.lastScope)")
                            },
                            onDesc: { d in state.desc = d }
                        )
                        .padding(.horizontal, 16)
                        .padding(.bottom, 40)
                    } else {
                        Text(state.status)
                            .font(JBTheme.monoFont(12))
                            .foregroundStyle(JBTheme.ink2)
                            .padding(.top, 40)
                    }
                }
            }
        }
        .task { await state.load() }
    }
}
