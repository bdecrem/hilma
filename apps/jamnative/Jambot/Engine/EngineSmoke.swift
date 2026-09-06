import SwiftUI
import UIKit
import os

// Headless-ish verification of the engine host + audio player, no screens
// involved. Launch with:
//
//   xcrun simctl launch --console-pty "iPhone 16" com.bartdecrem.Jambot -engineSmoke
//
// Optional extras:
//   -engineSmokeAgent        one real agent turn ("make the kick shorter")
//                            through the Swift LLM proxy (spends one Opus call
//                            on the jamtest account; nothing is saved)
//   -engineSmokeBackground   after the checks, play for 60 s and render at
//                            t≈20 s and t≈40 s, logging the app state each
//                            step — background the app meanwhile
//                            (`xcrun simctl openurl "iPhone 16" https://example.com`
//                            brings Safari to the front) to see whether
//                            playback and rendering survive
//   -engineNoForegroundPriority   run without the WebKit foreground-priority flag
//
// Every line is printed to stdout and logged at notice level under
// subsystem com.bartdecrem.Jambot, category smoke.

@MainActor
final class EngineSmokeRunner: ObservableObject {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "smoke")

    @Published var lines: [String] = []
    @Published var finished = false
    let host = EngineHost()
    let player = AudioPlayer()

    private let started = Date()

    func log(_ text: String) {
        let stamp = String(format: "%6.2f", Date().timeIntervalSince(started))
        let line = "[\(stamp)] \(text)"
        lines.append(line)
        Self.log.notice("\(line, privacy: .public)")
        print("[smoke] \(line)")
        fflush(stdout)
    }

    func run() async {
        let args = CommandLine.arguments
        do {
            try await checks(agent: args.contains("-engineSmokeAgent"))
            if args.contains("-engineSmokeBackground") {
                await backgroundProbe()
            }
        } catch {
            log("FAIL: \(error.localizedDescription)")
        }
        player.stop()
        log("SMOKE DONE")
        finished = true
    }

    // MARK: - The sequence

    private func checks(agent: Bool) async throws {
        log("engine smoke start; foregroundPriority=\(EngineHost.runsAtForegroundPriority)")

        try await host.ready()
        log("ready: version=\(host.engineVersion ?? "?") tools=\(host.toolNames.count) [\(host.toolNames.prefix(6).joined(separator: ", "))…]")

        let user = try await JamAPI.shared.login(username: "jamtest", password: "jamtest1")
        log("signed in as \(user.username)")

        let tracks = try await JamAPI.shared.tracks()
        guard let meta = tracks.first(where: { $0.title == "SEQ TEST techno copy" }) else {
            throw NSError(domain: "smoke", code: 1, userInfo: [NSLocalizedDescriptionKey: "track 'SEQ TEST techno copy' not found in \(tracks.map(\.title))"])
        }
        let track = try await JamAPI.shared.track(meta.id)
        log("track \(track.title): bpm=\(track.bpm) bars=\(track.bars) session=\(track.session != nil) messages=\(track.messages.count)")

        let loaded = try await host.loadSession(session: track.session, bpm: track.bpm)
        let d = loaded.desc
        let active = d.instruments.filter(\.active).map(\.id)
        log("loadSession: bpm=\(d.bpm) bars=\(d.bars) swing=\(d.swing) active=\(active) arrangement=\(d.arrangement.map(\.bars))")

        // Render 1
        let t0 = Date()
        let r1 = try await host.render(scope: .song)
        let renderSeconds = Date().timeIntervalSince(t0)
        let expected = (Double(r1.bars) * 4 * 60 / Double(r1.bpm) + 2) * r1.sampleRate
        let frameDelta = Double(r1.length) - expected
        let framesOK = abs(frameDelta) <= r1.sampleRate * 0.1
        log("render#1: bars=\(r1.bars) bpm=\(r1.bpm) hasArrangement=\(r1.hasArrangement) sr=\(Int(r1.sampleRate)) ch=\(r1.channels) length=\(r1.length) expected≈\(Int(expected)) delta=\(Int(frameDelta)) frames → \(framesOK ? "PASS" : "FAIL") (\(String(format: "%.2f", renderSeconds)) s)")
        log("render#1 channels==2 → \(r1.channels == 2 ? "PASS" : "FAIL"); pcm samples=\(r1.pcm.count) (\(r1.pcm.count == r1.length * r1.channels ? "PASS" : "FAIL"))")
        let rms1 = Self.rmsFirstSecond(r1)
        log("render#1 RMS first second ch0=\(String(format: "%.4f", rms1)) → \(rms1 > 0.01 ? "PASS" : "FAIL")")

        // Play 3 s
        player.setBuffer(r1, loopSeconds: loopSecondsFor(bars: r1.bars, bpm: r1.bpm))
        player.play()
        log("player.play(): playing=\(player.playing) loopSeconds=\(String(format: "%.3f", player.loopSeconds))")
        try await Task.sleep(nanoseconds: 1_500_000_000)
        let p1 = player.position()
        try await Task.sleep(nanoseconds: 1_500_000_000)
        let p2 = player.position()
        log("player position at 1.5 s=\(String(format: "%.4f", p1)) at 3.0 s=\(String(format: "%.4f", p2)) → \(p2 > p1 && p1 > 0 ? "PASS (advancing)" : "FAIL")")

        // Controls before the tweak, to pick a legal value.
        let groups0 = try await host.controls()
        guard let kickDecay = groups0.flatMap(\.controls).first(where: { $0.path == "jt90.kick.decay" }) else {
            throw NSError(domain: "smoke", code: 2, userInfo: [NSLocalizedDescriptionKey: "no jt90.kick.decay control; groups=\(groups0.map(\.title))"])
        }
        let target = kickDecay.value > (kickDecay.min + kickDecay.max) / 2 ? kickDecay.min + (kickDecay.max - kickDecay.min) * 0.15 : kickDecay.min + (kickDecay.max - kickDecay.min) * 0.85
        let snapped = (target / kickDecay.step).rounded() * kickDecay.step
        let descAfter = try await host.tweak(path: "jt90.kick.decay", value: snapped)
        let newValue = descAfter.instruments.first(where: { $0.id == "jt90" })?.params.first(where: { $0.path == "jt90.kick.decay" })?.value
        log("tweak jt90.kick.decay \(kickDecay.value) → \(snapped) [\(kickDecay.min)…\(kickDecay.max) \(kickDecay.unit)]; desc now says \(String(describing: newValue))")

        // Render 2 (hot-swapped into the running player)
        let t1 = Date()
        let r2 = try await host.render(scope: .song)
        let rms2 = Self.rmsFirstSecond(r2)
        let before = player.position()
        player.setBuffer(r2, loopSeconds: loopSecondsFor(bars: r2.bars, bpm: r2.bpm))
        let after = player.position()
        log("render#2: length=\(r2.length) (\(r2.length == r1.length ? "same length" : "LENGTH CHANGED")) RMS=\(String(format: "%.4f", rms2)) vs \(String(format: "%.4f", rms1)) → \(abs(rms2 - rms1) > 0.0005 ? "audio changed (PASS)" : "audio unchanged (check)") (\(String(format: "%.2f", Date().timeIntervalSince(t1))) s)")
        log("hot swap kept phase: pos before=\(String(format: "%.4f", before)) after=\(String(format: "%.4f", after)) → \(abs(after - before) < 0.02 ? "PASS" : "FAIL")")

        // Controls
        let groups = try await host.controls()
        let titles = groups.map(\.title)
        log("controls: \(groups.count) groups \(titles) → \(titles.contains("JT90 drums") ? "PASS" : "FAIL")")
        if let jt90 = groups.first(where: { $0.id == "jt90" }) {
            log("  JT90 drums: \(jt90.controls.count) controls, subtitle=\(jt90.subtitle ?? "-"), first=\(jt90.controls.prefix(5).map { "\($0.label)=\($0.value)" })")
        }

        // Round trip through serialize → the desc must survive.
        let serialized = try await host.serialize()
        if case .object(let o) = serialized {
            log("serialize: \(o.count) top-level keys \(o.keys.sorted().prefix(8))")
        } else {
            log("serialize: unexpected shape → FAIL")
        }

        try await Task.sleep(nanoseconds: 1_000_000_000)
        player.stop()
        log("player.stop(): playing=\(player.playing)")

        if agent {
            try await agentTurn(track: track)
        }
    }

    private func agentTurn(track: Track) async throws {
        log("agent: 'make the kick shorter' (messages in=\(track.messages.count))")
        let t0 = Date()
        var events = 0
        for try await ev in host.agent(task: "make the kick shorter", messages: track.messages, notes: []) {
            events += 1
            switch ev {
            case .tool(let name, _): log("  agent tool: \(name)")
            case .toolResult(let name, let result, let isError): log("  agent toolResult \(name)\(isError ? " (error)" : ""): \(result.prefix(90))")
            case .text(let t): log("  agent text: \(t.prefix(140))")
            case .render(let r): log("  agent render: \(r.bars) bars, \(r.length) frames, RMS=\(String(format: "%.4f", Self.rmsFirstSecond(r)))")
            case .end(let stop, let desc): log("  agent end: stopReason=\(stop) bpm=\(desc.bpm) bars=\(desc.bars)")
            case .failure(let msg): log("  agent FAILURE: \(msg)")
            }
        }
        let history = try await host.agentMessages()
        log("agent done: \(events) events in \(String(format: "%.1f", Date().timeIntervalSince(t0))) s; history now \(history.count) messages (last role=\(history.last?.role ?? "-")) → \(history.count > track.messages.count ? "PASS" : "FAIL")")
    }

    // MARK: - Background probe

    private func backgroundProbe() async {
        log("background probe: playing for 60 s; background the app now (simctl openurl …). Renders at ~20 s and ~40 s.")
        do {
            let r = try await host.render(scope: .song)
            player.setBuffer(r, loopSeconds: loopSecondsFor(bars: r.bars, bpm: r.bpm))
            player.play()
        } catch {
            log("background probe: initial render failed: \(error.localizedDescription)")
            return
        }
        let probeStart = Date()
        var renderedAt: Set<Int> = []
        while Date().timeIntervalSince(probeStart) < 60 {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            let t = Int(Date().timeIntervalSince(probeStart))
            log("  t=\(t)s state=\(Self.stateName) playing=\(player.playing) pos=\(String(format: "%.3f", player.position()))")
            for mark in [20, 40] where t >= mark && !renderedAt.contains(mark) {
                renderedAt.insert(mark)
                let stateBefore = Self.stateName
                let t0 = Date()
                do {
                    let r = try await host.render(scope: .song)
                    player.setBuffer(r, loopSeconds: loopSecondsFor(bars: r.bars, bpm: r.bpm))
                    log("  render while \(stateBefore): DONE in \(String(format: "%.2f", Date().timeIntervalSince(t0))) s (state now \(Self.stateName)), \(r.length) frames, swapped in at pos=\(String(format: "%.3f", player.position()))")
                } catch {
                    log("  render while \(stateBefore): FAILED after \(String(format: "%.2f", Date().timeIntervalSince(t0))) s: \(error.localizedDescription)")
                }
            }
        }
        log("background probe finished; state=\(Self.stateName) playing=\(player.playing)")
    }

    private static var stateName: String {
        switch UIApplication.shared.applicationState {
        case .active: return "active"
        case .inactive: return "inactive"
        case .background: return "background"
        @unknown default: return "unknown"
        }
    }

    private static func rmsFirstSecond(_ r: RenderResult) -> Double {
        let n = min(Int(r.sampleRate), r.length)
        guard n > 0 else { return 0 }
        var sum = 0.0
        r.pcm.withUnsafeBufferPointer { p in
            for i in 0..<n {
                let v = Double(p[i]) / 32768
                sum += v * v
            }
        }
        return (sum / Double(n)).squareRoot()
    }
}

struct EngineSmokeView: View {
    @StateObject private var runner = EngineSmokeRunner()

    var body: some View {
        ZStack(alignment: .topLeading) {
            JBTheme.panel.ignoresSafeArea()
            EngineHostAnchor(host: runner.host)
                .frame(width: 2, height: 2)
                .allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 6) {
                Text("ENGINE SMOKE")
                    .font(JBTheme.panelFont(14))
                    .foregroundStyle(JBTheme.ink2)
                ScrollView {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(Array(runner.lines.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(JBTheme.monoFont(10))
                                .foregroundStyle(line.contains("FAIL") ? JBTheme.orange : JBTheme.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                if runner.finished {
                    Text("done")
                        .font(JBTheme.panelFont(12))
                        .foregroundStyle(JBTheme.green)
                }
            }
            .padding(16)
        }
        .task { await runner.run() }
    }
}
