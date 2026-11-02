import AVFoundation
import Foundation
import os

/// The launch's sound: the count-in's four cues, a swell and the landing, one set per
/// Settings → Sound → Launch sound (`launchSound`: blues, the default; acid; deep; off),
/// played by the splash (`CountInSplash`) as T, A, K, T light up. Six one-shots a set in
/// `Takt/Sounds/launch-<set>-<cue>.caf`, synthesized by `scripts/launch-sounds/render.py`
/// (numpy, our own): b1…b4 one per count, each under 300 ms of music with a tail that rings
/// over the next count; `swell`, a reversed tail that ends exactly on the landing; `land`,
/// the 1 the app opens on. Blues is a Rhodes warming up (C2 and middle C, the blue third,
/// the C9 on the landing), acid a 303 opening its filter count by count, deep a Sub 37 gliding
/// (the design, 2026-11-01, from the count-in package in misc/takt-countin2.zip). Since 0.1 (77)
/// every cue is a gesture rather than one note: a double, a held double stop, a bend, a shake
/// (blues); a slide, an octave pop, a held squelch, a slide into the 1 (acid); an octave
/// double, a slow bend, a double tap, a wah (deep).
///
/// The cues play through the app's own AVAudioEngine (`AudioEngine.makePlayer`), one
/// AVAudioPlayerNode each, scheduled at host times (`AVAudioTime(hostTime:)`), so they share
/// the output, the `-Silent` volume and the clock the splash animates on. The band comes in
/// on the same downbeat as the landing (the menu band is in C, so is the landing).
@MainActor
final class LaunchSound {
    enum Cue: String, CaseIterable { case b1, b2, b3, b4, swell, land }

    static let key = "launchSound"
    static let sets = ["blues", "acid", "deep"]
    static let defaultSet = "blues"

    /// The set Settings names, nil when it is off.
    nonisolated static var chosen: String? {
        let v = UserDefaults.standard.string(forKey: key) ?? defaultSet
        return sets.contains(v) ? v : nil
    }

    let set: String
    private let audio: AudioEngine
    private var players: [Cue: AVAudioPlayerNode] = [:]
    private var buffers: [Cue: AVAudioPCMBuffer] = [:]
    private var landed = false
    private var teardown: Task<Void, Never>?
    private static let log = Logger(subsystem: "takt", category: "launch")

    /// The chosen set on this engine, nil when launch sound is off or a file is missing.
    static func make(on audio: AudioEngine, set: String? = chosen) -> LaunchSound? {
        guard let set else { return nil }
        return LaunchSound(set: set, on: audio)
    }

    private init?(set: String, on audio: AudioEngine) {
        self.set = set
        self.audio = audio
        for cue in Cue.allCases {
            guard let url = Bundle.main.url(forResource: "launch-\(set)-\(cue.rawValue)", withExtension: "caf"),
                  let file = try? AVAudioFile(forReading: url),
                  let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
                  (try? file.read(into: buf)) != nil
            else {
                Self.log.error("launch sound \(set, privacy: .public): \(cue.rawValue, privacy: .public) is not in the bundle")
                return nil
            }
            buffers[cue] = buf
            players[cue] = audio.makePlayer(format: buf.format)
        }
    }

    func seconds(_ cue: Cue) -> Double {
        guard let b = buffers[cue] else { return 0 }
        return Double(b.frameLength) / b.format.sampleRate
    }

    /// The whole count against the host clock: beat 1 at `startHostTime`, a cue a beat, the
    /// swell ending on the landing `beats` beats later, the landing there.
    func schedule(startHostTime: UInt64, interval: Double, beats: Int = 4) {
        func at(_ s: Double) -> AVAudioTime { AVAudioTime(hostTime: startHostTime + AVAudioTime.hostTime(forSeconds: max(0, s))) }
        for (k, cue) in [Cue.b1, .b2, .b3, .b4].prefix(beats).enumerated() {
            play(cue, at: at(Double(k) * interval))
        }
        let land = Double(beats) * interval
        play(.swell, at: at(land - seconds(.swell)))
        play(.land, at: at(land))
        landed = true
        finish(after: land + seconds(.land) + 0.5)
    }

    /// The landing alone, now (a tap that skips the count, Reduce Motion).
    func landNow() {
        for p in players.values { p.stop() }
        play(.land, at: nil)
        landed = true
        finish(after: seconds(.land) + 0.5)
    }

    /// Nothing more: a skip after the landing was scheduled lets it ring.
    func skip() {
        if !landed { landNow() }
    }

    private func play(_ cue: Cue, at time: AVAudioTime?) {
        guard let node = players[cue], let buf = buffers[cue] else { return }
        node.scheduleBuffer(buf, at: time, options: [], completionHandler: nil)
        if !node.isPlaying { node.play() }
    }

    /// The players come off the engine once the landing has rung out.
    private func finish(after s: Double) {
        teardown?.cancel()
        teardown = Task { [weak self] in
            try? await Task.sleep(for: .seconds(s))
            guard !Task.isCancelled, let self else { return }
            for p in self.players.values { p.stop(); self.audio.detach(p) }
            self.players.removeAll()
        }
    }
}
