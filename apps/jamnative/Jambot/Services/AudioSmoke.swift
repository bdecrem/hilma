import SwiftUI
import AVFoundation
import MediaPlayer
import os

// Headless verification of stage 8 (render cache, hot-swap phase, Now
// Playing, interruption / route handling). Launch with:
//
//   xcrun simctl launch --console-pty "iPhone 16" com.bartdecrem.Jambot -audioSmoke
//
// INTEGRATION: JambotApp.swift routes `-audioSmoke` to `AudioSmokeView()`
// the same way it routes `-engineSmoke` to `EngineSmokeView()`. The view
// parents the app's EngineHost and calls `AudioSmoke.run(engine:)`.
//
// Every line is printed to stdout and logged at notice level under
// subsystem com.bartdecrem.Jambot, category smoke, as "PASS"/"FAIL" lines
// plus a final "AUDIO SMOKE DONE: n PASS, m FAIL".

@MainActor
enum AudioSmoke {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "smoke")

    final class Report: ObservableObject {
        @Published var lines: [String] = []
        @Published var finished = false
        private(set) var pass = 0
        private(set) var fail = 0
        private let started = Date()

        func log(_ text: String) {
            let stamp = String(format: "%6.2f", Date().timeIntervalSince(started))
            let line = "[\(stamp)] \(text)"
            lines.append(line)
            AudioSmoke.log.notice("\(line, privacy: .public)")
            print("[audio-smoke] \(line)")
            fflush(stdout)
        }

        func check(_ ok: Bool, _ what: String) {
            if ok { pass += 1 } else { fail += 1 }
            log("\(ok ? "PASS" : "FAIL"): \(what)")
        }
    }

    /// Runs every check against a real engine (signs in as jamtest, loads
    /// "SEQ TEST techno copy", renders it). Nothing is saved to the server.
    static func run(engine: EngineAPI, report: Report = Report()) async -> Report {
        let r = report
        let player = AudioPlayer()
        defer { NowPlaying.shared.detach(player: player) }
        do {
            r.log("audio smoke start")

            // ---- 1. Cache round trip on a synthetic 128-bar stereo render (the 42 MB case)
            let big = syntheticRender(bars: 128, bpm: 128)
            let bigKey = RenderCache.key(sessionJSON: Data("{\"synthetic\":true}".utf8), stamp: "smoke")
            let cache = RenderCache(directory: FileManager.default.temporaryDirectory.appendingPathComponent("audio-smoke-renders", isDirectory: true))
            var t = Date()
            await cache.save(trackId: "smoke-big", key: bigKey, big)
            let saveMs = Int(Date().timeIntervalSince(t) * 1000)
            t = Date()
            let loadedBig = await cache.load(trackId: "smoke-big", key: bigKey)
            let loadMs = Int(Date().timeIntervalSince(t) * 1000)
            let sizeMB = big.pcm.count * 2 / 1_048_576
            r.check(loadedBig != nil, "cache load after save (128 bars stereo, \(sizeMB) MB): save \(saveMs) ms, load \(loadMs) ms")
            if let lb = loadedBig {
                r.check(lb.pcm == big.pcm, "cache round trip: [Int16] identical (\(lb.pcm.count) samples)")
                r.check(lb.bars == big.bars && lb.bpm == big.bpm && lb.hasArrangement == big.hasArrangement && lb.message == big.message
                        && lb.sampleRate == big.sampleRate && lb.channels == big.channels && lb.length == big.length,
                        "cache round trip: metadata identical (bars=\(lb.bars) bpm=\(lb.bpm) sr=\(Int(lb.sampleRate)) ch=\(lb.channels) length=\(lb.length))")
                r.check(loadMs < 500, "cache read under 500 ms for \(sizeMB) MB (\(loadMs) ms)")
            }
            let missed = await cache.load(trackId: "smoke-big", key: bigKey + "x")
            r.check(missed == nil, "cache miss on a different key")
            let nokey = RenderCache.key(sessionJSON: Data("{}".utf8), stamp: "a")
            r.check(nokey.count == 64 && nokey == RenderCache.key(sessionJSON: Data("{}".utf8), stamp: "a")
                    && nokey != RenderCache.key(sessionJSON: Data("{}".utf8), stamp: "b"),
                    "cache key: 64 hex chars, stable, stamp-sensitive (\(nokey.prefix(12))…)")
            // Prune: 8 small saves keep only 6.
            for i in 0..<8 {
                await cache.save(trackId: "smoke-p\(i)", key: "k\(i)", syntheticRender(bars: 1, bpm: 120))
            }
            let ids = await cache.cachedTrackIds()
            r.check(ids.count == RenderCache.keep && ids.contains("smoke-p7") && !ids.contains("smoke-big"),
                    "cache prunes to \(RenderCache.keep) most recent (\(ids.count) on disk, oldest gone)")
            cache.drop(trackId: "smoke-p7")
            try? await Task.sleep(nanoseconds: 100_000_000)
            let afterDrop = await cache.cachedTrackIds()
            r.check(!afterDrop.contains("smoke-p7"), "cache drop removes the track")
            try? FileManager.default.removeItem(at: cache.directory!)

            // ---- 2. Real engine: render the test track
            try await engine.ready()
            let user = try await JamAPI.shared.login(username: "jamtest", password: "jamtest1")
            r.log("signed in as \(user.username)")
            let tracks = try await JamAPI.shared.tracks()
            guard let meta = tracks.first(where: { $0.title == "SEQ TEST techno copy" }) else {
                throw NSError(domain: "smoke", code: 1, userInfo: [NSLocalizedDescriptionKey: "track 'SEQ TEST techno copy' not found"])
            }
            let track = try await JamAPI.shared.track(meta.id)
            let loaded = try await engine.loadSession(session: track.session, bpm: track.bpm)
            let stamp = (engine as? EngineHost)?.engineVersion ?? "mock"
            let session = try await engine.serialize()
            let key1 = RenderCache.key(session: session, stamp: stamp)
            r.check(key1 != nil, "cache key from serialize() + engine stamp \(stamp) → \(key1?.prefix(12) ?? "nil")…")
            let r1 = try await engine.render(scope: .song)
            r.log("render: \(r1.bars) bars @ \(r1.bpm), \(r1.length) frames, \(r1.channels) ch (bpm desc=\(loaded.desc.bpm))")

            // Real render through the cache too (the path StudioModel will use).
            await RenderCache.shared.save(trackId: "smoke-real", key: key1 ?? "k", r1)
            let cached = await RenderCache.shared.load(trackId: "smoke-real", key: key1 ?? "k")
            r.check(cached?.pcm == r1.pcm && cached?.length == r1.length, "cache round trip of a real render (\(r1.length) frames)")
            RenderCache.shared.drop(trackId: "smoke-real")

            // ---- 3. Now Playing + playback
            NowPlaying.shared.attach(player: player, title: track.title)
            NowPlaying.shared.onToggle = { player.toggle(); return true }
            NowPlaying.shared.onPlay = { player.play(); return true }
            NowPlaying.shared.onPause = { player.stop(); return true }
            NowPlaying.shared.onStop = { player.stop(); return true }
            player.load(r1)
            player.play()
            r.check(player.isPlaying, "isPlaying true right after play()")
            try await Task.sleep(nanoseconds: 1_500_000_000)
            let p1 = player.position()
            let info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            let npTitle = info[MPMediaItemPropertyTitle] as? String
            let npArtist = info[MPMediaItemPropertyArtist] as? String
            let npDuration = info[MPMediaItemPropertyPlaybackDuration] as? Double
            let npRate = info[MPNowPlayingInfoPropertyPlaybackRate] as? Double
            let npElapsed = info[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? Double
            let npArt = info[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork
            r.check(npTitle == track.title && npArtist == "Jambot" && (info[MPMediaItemPropertyAlbumTitle] as? String) == "jambot.to",
                    "Now Playing title/artist/album = \(npTitle ?? "nil") / \(npArtist ?? "nil") / \(info[MPMediaItemPropertyAlbumTitle] as? String ?? "nil")")
            r.check(npDuration.map { abs($0 - player.loopSeconds) < 0.001 } ?? false, "Now Playing duration = loop length (\(npDuration ?? -1) s)")
            r.check(npRate == 1.0, "Now Playing rate 1.0 while playing (\(npRate ?? -1))")
            r.check(npElapsed != nil, "Now Playing elapsed set (\(String(format: "%.2f", npElapsed ?? -1)) s)")
            r.check(npArt != nil && npArt!.image(at: CGSize(width: 512, height: 512))?.size == CGSize(width: 512, height: 512), "Now Playing artwork 512×512 present")
            r.check(MPNowPlayingInfoCenter.default().playbackState == .playing, "MPNowPlayingInfoCenter.playbackState == .playing")
            let cc = MPRemoteCommandCenter.shared()
            r.check(cc.playCommand.isEnabled && cc.pauseCommand.isEnabled && cc.togglePlayPauseCommand.isEnabled && cc.stopCommand.isEnabled,
                    "remote commands play/pause/toggle/stop enabled")
            r.check(!cc.nextTrackCommand.isEnabled && !cc.previousTrackCommand.isEnabled, "remote next/previous disabled")
            // Artwork file for eyeballing (.shots is gitignored; the app sandbox can't reach it, so tmp).
            if let png = NowPlaying.renderArtwork(size: 512).pngData() {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("nowplaying-artwork.png")
                try? png.write(to: url)
                r.log("artwork written to \(url.path)")
            }

            // ---- 4. Hot swap, same length (in place) — the fader case
            let groups = try await engine.controls()
            if let kick = groups.flatMap(\.controls).first(where: { $0.path == "jt90.kick.decay" }) {
                let target = kick.value > (kick.min + kick.max) / 2 ? kick.min + (kick.max - kick.min) * 0.15 : kick.min + (kick.max - kick.min) * 0.85
                _ = try await engine.tweak(path: "jt90.kick.decay", value: (target / kick.step).rounded() * kick.step)
            }
            let r2 = try await engine.render(scope: .song)
            let before = player.position()
            let tSwap = Date()
            player.load(r2)
            let swapMs = Date().timeIntervalSince(tSwap) * 1000
            let after = player.position()
            let deltaMs = (after - before) * player.loopSeconds * 1000
            r.check(player.lastSwapKind == "inplace", "same-length swap used the in-place path (\(player.lastSwapKind ?? "nil"))")
            r.check(deltaMs >= 0 && deltaMs < 10, "swap phase delta < 10 ms: \(String(format: "%.2f", deltaMs)) ms (copy took \(String(format: "%.1f", swapMs)) ms; pos \(String(format: "%.4f", before)) → \(String(format: "%.4f", after)))")
            r.check(player.isPlaying, "isPlaying stays true across the swap")
            try await Task.sleep(nanoseconds: 700_000_000)
            let p3 = player.position()
            let expected = after + 0.7 / player.loopSeconds
            r.check(abs(p3 - expected) * player.loopSeconds * 1000 < 25, "position keeps time after the swap (\(String(format: "%.4f", p3)) vs expected \(String(format: "%.4f", expected)))")
            let rms1 = StudioModel.rmsFirstSecond(r1), rms2 = StudioModel.rmsFirstSecond(r2)
            r.log("render RMS \(String(format: "%.4f", rms1)) → \(String(format: "%.4f", rms2)) (\(abs(rms1 - rms2) > 0.0005 ? "audio changed" : "audio unchanged"))")

            // ---- 5. Hot swap, length changed (timed restart): loop half the bars
            let halfLoop = loopSecondsFor(bars: max(1, r2.bars / 2), bpm: r2.bpm)
            let fullLoop = player.loopSeconds
            let b2 = player.position()
            player.setBuffer(r2, loopSeconds: halfLoop)
            let a2 = player.position()
            // Same fraction carried over (web semantics); allow the lead.
            let carried = ((b2 - a2 + 1).truncatingRemainder(dividingBy: 1))
            let carriedMs = min(carried, 1 - carried) * halfLoop * 1000
            r.check(player.lastSwapKind == "restart", "length-changed swap used the timed restart (\(player.lastSwapKind ?? "nil"), loop \(String(format: "%.2f", fullLoop)) → \(String(format: "%.2f", player.loopSeconds)) s)")
            r.check(carriedMs < 40, "restart carried the phase fraction (\(String(format: "%.4f", b2)) → \(String(format: "%.4f", a2)), \(String(format: "%.1f", carriedMs)) ms off)")
            r.check(player.isPlaying, "isPlaying true after the restart swap")
            try await Task.sleep(nanoseconds: 400_000_000)
            let a3 = player.position()
            r.check(a3 > 0, "position advancing after the restart swap (\(String(format: "%.4f", a3)))")
            player.setBuffer(r2, loopSeconds: fullLoop) // back to the full loop
            _ = p1

            // ---- 6. Interruption simulation
            let avSession = AVAudioSession.sharedInstance()
            let posBeforeInt = player.position()
            NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: avSession,
                                            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
            try await Task.sleep(nanoseconds: 300_000_000)
            r.check(!player.isPlaying, "interruption began → paused (isPlaying=\(player.isPlaying))")
            r.check((MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] as? Double) == 0.0, "Now Playing rate 0 while interrupted")
            NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: avSession,
                                            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue,
                                                       AVAudioSessionInterruptionOptionKey: AVAudioSession.InterruptionOptions.shouldResume.rawValue])
            try await Task.sleep(nanoseconds: 300_000_000)
            let posAfterInt = player.position()
            r.check(player.isPlaying, "interruption ended (.shouldResume) → resumed (isPlaying=\(player.isPlaying))")
            let resumeOff = ((posAfterInt - posBeforeInt + 1).truncatingRemainder(dividingBy: 1)) * player.loopSeconds
            r.check(resumeOff >= 0 && resumeOff < 0.6, "resumed near the interrupted phase (\(String(format: "%.4f", posBeforeInt)) → \(String(format: "%.4f", posAfterInt)), +\(String(format: "%.2f", resumeOff)) s incl. 0.3 s wait)")
            r.check((MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] as? Double) == 1.0, "Now Playing rate back to 1 after resume")

            // Interruption ended WITHOUT shouldResume stays paused.
            NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: avSession,
                                            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
            try await Task.sleep(nanoseconds: 200_000_000)
            NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: avSession,
                                            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue,
                                                       AVAudioSessionInterruptionOptionKey: UInt(0)])
            try await Task.sleep(nanoseconds: 200_000_000)
            r.check(!player.isPlaying, "interruption ended without .shouldResume → stays paused")
            player.play()
            try await Task.sleep(nanoseconds: 300_000_000)

            // ---- 7. Route change: old device unavailable → pause
            let route = avSession.currentRoute
            NotificationCenter.default.post(name: AVAudioSession.routeChangeNotification, object: avSession,
                                            userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue,
                                                       AVAudioSessionRouteChangePreviousRouteKey: route])
            try await Task.sleep(nanoseconds: 300_000_000)
            r.check(!player.isPlaying, "route change (oldDeviceUnavailable) → paused")
            r.check(MPNowPlayingInfoCenter.default().playbackState == .paused, "Now Playing state paused after route loss")
            player.play()
            try await Task.sleep(nanoseconds: 300_000_000)
            r.check(player.isPlaying && player.position() > 0, "play again after route loss works")

            // ---- 8. Media services reset simulation → engine rebuilt, still playing
            let pr = player.position()
            NotificationCenter.default.post(name: AVAudioSession.mediaServicesWereResetNotification, object: avSession)
            try await Task.sleep(nanoseconds: 500_000_000)
            r.check(player.isPlaying && player.position() > 0, "media services reset → rebuilt and playing (\(String(format: "%.4f", pr)) → \(String(format: "%.4f", player.position())))")

            // ---- 9. Remote command closures round-trip
            let toggled = NowPlaying.shared.onToggle?() ?? false
            try await Task.sleep(nanoseconds: 200_000_000)
            r.check(toggled && !player.isPlaying, "toggle closure stops playback")
            let played = NowPlaying.shared.onPlay?() ?? false
            try await Task.sleep(nanoseconds: 200_000_000)
            r.check(played && player.isPlaying, "play closure starts playback")

            player.stop()
            let rateAtStop = NowPlaying.shared.lastPublished[MPNowPlayingInfoPropertyPlaybackRate] as? Double
            try await Task.sleep(nanoseconds: 300_000_000) // playbackState reads back through the media remote daemon
            r.check(!player.isPlaying, "stop → isPlaying false")
            r.check(rateAtStop == 0.0, "stop → Now Playing rate 0 published synchronously (\(rateAtStop.map { String($0) } ?? "nil"))")
            let st = MPNowPlayingInfoCenter.default().playbackState
            r.check(st == .paused, "stop → paused state on the lock screen, buffer kept (state raw=\(st.rawValue))")
        } catch {
            r.check(false, "threw: \(error.localizedDescription)")
        }
        player.stop()
        r.log("AUDIO SMOKE DONE: \(r.pass) PASS, \(r.fail) FAIL")
        r.finished = true
        return r
    }

    /// A deterministic stereo render of the given size (sine on the left,
    /// ramp on the right) — for cache timing/identity checks.
    static func syntheticRender(bars: Int, bpm: Int) -> RenderResult {
        let sr = 44100.0
        let length = Int((loopSecondsFor(bars: bars, bpm: bpm) + 2) * sr)
        var pcm = [Int16](repeating: 0, count: length * 2)
        for i in 0..<length {
            pcm[i] = Int16(sin(Double(i) * 2 * .pi * 110 / sr) * 12000)
            pcm[length + i] = Int16(truncatingIfNeeded: (i * 7) % 65536 - 32768)
        }
        return RenderResult(bars: bars, bpm: bpm, hasArrangement: true, message: "synthetic \(bars) bars",
                            sampleRate: sr, channels: 2, length: length, pcm: pcm)
    }
}

/// Screen for `-audioSmoke`: parents the app's engine host and runs the
/// checks, printing the log on the panel.
struct AudioSmokeView: View {
    @StateObject private var report = AudioSmoke.Report()

    var body: some View {
        ZStack(alignment: .topLeading) {
            JBTheme.panel.ignoresSafeArea()
            if let host = EngineFactory.host {
                EngineHostAnchor(host: host)
                    .frame(width: 2, height: 2)
                    .allowsHitTesting(false)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("AUDIO SMOKE")
                    .font(JBTheme.panelFont(14))
                    .foregroundStyle(JBTheme.ink2)
                ScrollView {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(Array(report.lines.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(JBTheme.monoFont(10))
                                .foregroundStyle(line.contains("FAIL") ? JBTheme.orange : JBTheme.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                if report.finished {
                    Text("done")
                        .font(JBTheme.panelFont(12))
                        .foregroundStyle(JBTheme.green)
                }
            }
            .padding(16)
        }
        .task { _ = await AudioSmoke.run(engine: EngineFactory.shared, report: report) }
    }
}
