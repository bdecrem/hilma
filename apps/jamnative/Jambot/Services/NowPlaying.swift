import Foundation
import MediaPlayer
import UIKit
import os

// Lock screen / Control Center integration for the loop player.
//
// One `NowPlaying` per app (`NowPlaying.shared`): the studio hands it the
// `AudioPlayer` and the track title, and it keeps
// `MPNowPlayingInfoCenter` current (title, artist "Jambot", album
// "jambot.to", duration = loop length, elapsed = player position, playback
// rate) — refreshed on every play/stop/swap and every ~5 s while playing
// so the lock-screen scrubber stays honest across loop wraps — and wires
// `MPRemoteCommandCenter` play / pause / togglePlayPause / stop to closures
// the StudioModel provides. Artwork is a generated 512×512 putty square
// with the wordmark (the same enamel + orange LED as the app icon).
@MainActor
final class NowPlaying {
    static let log = Logger(subsystem: "com.bartdecrem.Jambot", category: "nowplaying")
    static let shared = NowPlaying()

    /// Track title shown on the lock screen. Set it whenever the studio
    /// opens or renames a track.
    var title: String = "Jambot" { didSet { if title != oldValue { refresh() } } }

    /// Remote-command handlers — the StudioModel sets these when a track
    /// opens (and clears them when it leaves). Each returns whether it
    /// handled the command.
    var onPlay: (() -> Bool)?
    var onPause: (() -> Bool)?
    var onToggle: (() -> Bool)?
    var onStop: (() -> Bool)?

    /// The dictionary last handed to `MPNowPlayingInfoCenter` (its own
    /// getter lags the media remote daemon; this is what we published).
    private(set) var lastPublished: [String: Any] = [:]

    private weak var player: AudioPlayer?
    private var playerObserver: NSObjectProtocol?
    private var timer: Timer?
    private var commandsWired = false
    private lazy var artwork: MPMediaItemArtwork = Self.makeArtwork()

    private init() {}

    // MARK: - Attach

    /// Bind to a player. Called once per open track; re-binding to the same
    /// player is a no-op. Info is published immediately and on every state
    /// change or swap the player reports.
    func attach(player: AudioPlayer, title: String) {
        self.title = title
        if self.player !== player {
            self.player = player
            player.onNowPlayingChange = { [weak self] in
                // Synchronous when already on main (the player's callers
                // are), so the lock screen never lags a run-loop hop.
                if Thread.isMainThread {
                    MainActor.assumeIsolated { self?.refresh() }
                } else {
                    Task { @MainActor in self?.refresh() }
                }
            }
        }
        wireCommands()
        refresh()
    }

    /// Drop the binding (track closed): clears the lock-screen entry and
    /// disables the remote commands.
    func detach(player: AudioPlayer) {
        guard self.player === player else { return }
        player.onNowPlayingChange = nil
        self.player = nil
        onPlay = nil; onPause = nil; onToggle = nil; onStop = nil
        stopTimer()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        MPNowPlayingInfoCenter.default().playbackState = .stopped
        setCommandsEnabled(false)
    }

    // MARK: - Info

    /// Republish the Now Playing dictionary from the player's state.
    func refresh() {
        guard let player else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: "Jambot",
            MPMediaItemPropertyAlbumTitle: "jambot.to",
            MPMediaItemPropertyArtwork: artwork,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
            MPNowPlayingInfoPropertyIsLiveStream: false,
        ]
        let loop = player.loopSeconds
        if loop > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = loop
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player.position() * loop
        }
        info[MPNowPlayingInfoPropertyPlaybackRate] = player.isPlaying ? 1.0 : 0.0
        info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0
        lastPublished = info
        let center = MPNowPlayingInfoCenter.default()
        center.nowPlayingInfo = info
        center.playbackState = player.isPlaying ? .playing : (player.hasBuffer() ? .paused : .stopped)
        setCommandsEnabled(player.hasBuffer())
        if player.isPlaying { startTimer() } else { stopTimer() }
    }

    private func startTimer() {
        guard timer == nil else { return }
        let t = Timer(timeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - Remote commands

    private func wireCommands() {
        guard !commandsWired else { return }
        commandsWired = true
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.handle(\.onPlay) ?? .noActionableNowPlayingItem }
        c.pauseCommand.addTarget { [weak self] _ in self?.handle(\.onPause) ?? .noActionableNowPlayingItem }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in self?.handle(\.onToggle) ?? .noActionableNowPlayingItem }
        c.stopCommand.addTarget { [weak self] _ in self?.handle(\.onStop) ?? .noActionableNowPlayingItem }
        // A loop has no next/previous; hide those keys.
        c.nextTrackCommand.isEnabled = false
        c.previousTrackCommand.isEnabled = false
        c.skipForwardCommand.isEnabled = false
        c.skipBackwardCommand.isEnabled = false
        c.changePlaybackPositionCommand.isEnabled = false
    }

    private func handle(_ key: ReferenceWritableKeyPath<NowPlaying, (() -> Bool)?>) -> MPRemoteCommandHandlerStatus {
        guard let handler = self[keyPath: key] else { return .noActionableNowPlayingItem }
        let ok = handler()
        refresh()
        return ok ? .success : .commandFailed
    }

    private func setCommandsEnabled(_ on: Bool) {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.isEnabled = on
        c.pauseCommand.isEnabled = on
        c.togglePlayPauseCommand.isEnabled = on
        c.stopCommand.isEnabled = on
    }

    // MARK: - Artwork

    /// 512×512 putty enamel square with the wordmark: "JAMBOT" in condensed
    /// black uppercase and the raised 909-orange LED after the T (never a
    /// dot). Same tokens as Theme.swift / jam.css.
    static func makeArtwork() -> MPMediaItemArtwork {
        let image = renderArtwork(size: 512)
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }

    static func renderArtwork(size: CGFloat) -> UIImage {
        let panel = UIColor(red: 0xDC / 255, green: 0xDF / 255, blue: 0xD8 / 255, alpha: 1)
        let panel2 = UIColor(red: 0xE9 / 255, green: 0xEB / 255, blue: 0xE5 / 255, alpha: 1)
        let ink = UIColor(red: 0x14 / 255, green: 0x16 / 255, blue: 0x1A / 255, alpha: 1)
        let orange = UIColor(red: 0xFF / 255, green: 0x4F / 255, blue: 0x1F / 255, alpha: 1)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: format).image { ctx in
            let cg = ctx.cgContext
            // Enamel ground with a soft raised card in the middle.
            panel.setFill()
            cg.fill(CGRect(x: 0, y: 0, width: size, height: size))
            let card = CGRect(x: size * 0.08, y: size * 0.30, width: size * 0.84, height: size * 0.40)
            panel2.setFill()
            UIBezierPath(roundedRect: card, cornerRadius: size * 0.04).fill()
            ink.withAlphaComponent(0.18).setStroke()
            let rim = UIBezierPath(roundedRect: card.insetBy(dx: 1, dy: 1), cornerRadius: size * 0.04)
            rim.lineWidth = 2
            rim.stroke()

            // Wordmark: condensed heavy uppercase, tracked.
            let fontSize = size * 0.19
            let descriptor = UIFont.systemFont(ofSize: fontSize, weight: .black).fontDescriptor
                .withDesign(.default)?
                .addingAttributes([.traits: [UIFontDescriptor.TraitKey.width: -0.3]]) ?? UIFont.systemFont(ofSize: fontSize, weight: .black).fontDescriptor
            let font = UIFont(descriptor: descriptor, size: fontSize)
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: ink, .kern: size * 0.004]
            let text = NSAttributedString(string: "JAMBOT", attributes: attrs)
            let textSize = text.size()
            let led = size * 0.055                 // LED diameter
            let gap = size * 0.03                  // space between the T and the LED
            let total = textSize.width + gap + led
            let x = (size - total) / 2
            let y = card.midY - textSize.height / 2
            text.draw(at: CGPoint(x: x, y: y))

            // Raised orange LED after the T, its top on the cap-height line
            // (baseline = y + ascender; cap top = baseline − capHeight).
            let capTop = y + font.ascender - font.capHeight
            let ledRect = CGRect(x: x + textSize.width + gap, y: capTop, width: led, height: led)
            cg.saveGState()
            cg.setShadow(offset: CGSize(width: 0, height: size * 0.004), blur: size * 0.02, color: orange.withAlphaComponent(0.7).cgColor)
            orange.setFill()
            UIBezierPath(ovalIn: ledRect).fill()
            cg.restoreGState()
            UIColor.white.withAlphaComponent(0.55).setFill()
            UIBezierPath(ovalIn: CGRect(x: ledRect.minX + led * 0.22, y: ledRect.minY + led * 0.18, width: led * 0.3, height: led * 0.22)).fill()

            // Silkscreen line under the card.
            let label = NSAttributedString(string: "DESK INSTRUMENT · JAMBOT.TO", attributes: [
                .font: UIFont.monospacedSystemFont(ofSize: size * 0.032, weight: .medium),
                .foregroundColor: ink.withAlphaComponent(0.55),
                .kern: size * 0.006,
            ])
            let ls = label.size()
            label.draw(at: CGPoint(x: (size - ls.width) / 2, y: card.maxY + size * 0.06))
        }
    }
}
