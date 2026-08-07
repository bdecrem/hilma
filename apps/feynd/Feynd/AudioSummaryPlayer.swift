import AVFoundation
import MediaPlayer
import Observation

/// App-wide audio-summary playback. Owns the AVPlayer, the audio session,
/// the lock-screen Now Playing card, and the remote (lock screen / Control
/// Center / AirPods) commands, so playback survives the player sheet being
/// dismissed and keeps going in the background. The sheet is just a UI over
/// this controller.
@Observable
final class AudioSummaryPlayer {
    static let shared = AudioSummaryPlayer()

    private(set) var title: String = ""
    private(set) var url: URL? = nil
    private(set) var playing = false
    private(set) var duration: Double = 0
    var current: Double = 0
    /// While the user drags the scrubber the periodic observer leaves
    /// `current` alone; the sheet sets this.
    var scrubbing = false

    /// Playback speed, remembered across summaries (same defaults key the
    /// sheet has always used). Pitch is preserved via timeDomain.
    private(set) var speed: Double = UserDefaults.standard.object(forKey: "audioSummarySpeed") as? Double ?? 1.0
    let speeds: [Double] = [1.0, 1.1, 1.25, 1.5]

    private var player: AVPlayer? = nil
    private var timeObserver: Any? = nil
    private var endObserver: NSObjectProtocol? = nil
    private var interruptionObserver: NSObjectProtocol? = nil
    private var commandsConfigured = false

    private init() {}

    /// Start (or re-attach to) playback of a summary. Same URL already
    /// loaded → no-op, so reopening the sheet mid-playback doesn't restart;
    /// a different URL switches playback to the new summary.
    func load(title: String, url: URL) {
        if self.url == url, player != nil {
            self.title = title
            updateNowPlaying()
            return
        }
        stop()

        self.title = title
        self.url = url

        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)

        let item = AVPlayerItem(url: url)
        item.audioTimePitchAlgorithm = .timeDomain
        let p = AVPlayer(playerItem: item)
        player = p

        timeObserver = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            if !self.scrubbing { self.current = time.seconds }
            self.updateNowPlayingElapsed()
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.playing = false
            self.current = 0
            self.player?.seek(to: .zero)
            self.updateNowPlaying()
        }

        // A call / Siri / another app's audio pausing us. Resume when the
        // system says the interruption ended and resumption is expected.
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            guard let self,
                  let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            switch type {
            case .began:
                self.playing = false
                self.updateNowPlaying()
            case .ended:
                let optRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                if AVAudioSession.InterruptionOptions(rawValue: optRaw).contains(.shouldResume) {
                    self.resume()
                }
            @unknown default:
                break
            }
        }

        Task { [weak self] in
            if let d = try? await item.asset.load(.duration), d.isNumeric {
                self?.duration = d.seconds
                self?.updateNowPlaying()
            }
        }

        configureRemoteCommands()
        p.rate = Float(speed)
        playing = true
        updateNowPlaying()
    }

    func togglePlay() {
        playing ? pause() : resume()
    }

    func pause() {
        player?.pause()
        playing = false
        updateNowPlaying()
    }

    func resume() {
        guard let p = player else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        p.rate = Float(speed)   // resume at the chosen speed, not 1×
        playing = true
        updateNowPlaying()
    }

    func seek(to seconds: Double) {
        guard let p = player else { return }
        let target = max(0, min(duration > 0 ? duration : .greatestFiniteMagnitude, seconds))
        current = target
        p.seek(to: CMTime(seconds: target, preferredTimescale: 600)) { [weak self] _ in
            guard let self else { return }
            // seek can reset rate to 0 mid-playback; restore it.
            if self.playing { self.player?.rate = Float(self.speed) }
            self.updateNowPlayingElapsed()
        }
    }

    func skip(_ seconds: Double) {
        seek(to: current + seconds)
    }

    func cycleSpeed() {
        let i = speeds.firstIndex(of: speed) ?? 0
        speed = speeds[(i + 1) % speeds.count]
        UserDefaults.standard.set(speed, forKey: "audioSummarySpeed")
        if playing { player?.rate = Float(speed) }
        updateNowPlaying()
    }

    /// Full teardown — releases the player and the audio session and clears
    /// the lock-screen card. Called when switching to a different summary.
    func stop() {
        player?.pause()
        if let obs = timeObserver { player?.removeTimeObserver(obs) }
        if let obs = endObserver { NotificationCenter.default.removeObserver(obs) }
        if let obs = interruptionObserver { NotificationCenter.default.removeObserver(obs) }
        timeObserver = nil
        endObserver = nil
        interruptionObserver = nil
        player = nil
        url = nil
        playing = false
        current = 0
        duration = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Lock screen / Control Center

    private func configureRemoteCommands() {
        guard !commandsConfigured else { return }
        commandsConfigured = true
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            guard let self, self.player != nil else { return .commandFailed }
            self.resume(); return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            guard let self, self.player != nil else { return .commandFailed }
            self.pause(); return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self, self.player != nil else { return .commandFailed }
            self.togglePlay(); return .success
        }
        center.skipForwardCommand.preferredIntervals = [15]
        center.skipForwardCommand.addTarget { [weak self] _ in
            guard let self, self.player != nil else { return .commandFailed }
            self.skip(15); return .success
        }
        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            guard let self, self.player != nil else { return .commandFailed }
            self.skip(-15); return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self, self.player != nil,
                  let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self.seek(to: e.positionTime); return .success
        }
    }

    private func updateNowPlaying() {
        guard url != nil else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: "Dodo — Audio Summary",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: current,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? speed : 0,
        ]
        if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func updateNowPlayingElapsed() {
        guard url != nil,
              var info = MPNowPlayingInfoCenter.default().nowPlayingInfo else { return }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = current
        info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? speed : 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
