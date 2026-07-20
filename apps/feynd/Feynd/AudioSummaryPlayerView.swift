import SwiftUI
import AVFoundation

/// Player sheet for a topic's narrated Audio Summary — streams the MP3 from
/// Supabase storage. Just a recording: play/pause, ±15s skip, scrubber.
/// Sets the audio session to .playback so it keeps playing in silent mode
/// and (with the `audio` background mode) with the screen locked.
struct AudioSummaryPlayerView: View {
    let title: String
    let url: URL

    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer? = nil
    @State private var playing = false
    @State private var duration: Double = 0
    @State private var current: Double = 0
    @State private var scrubbing = false
    @State private var timeObserver: Any? = nil
    @State private var endObserver: NSObjectProtocol? = nil

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                Capsule()
                    .fill(FeyndTheme.border)
                    .frame(width: 40, height: 5)
                    .padding(.top, 10)

                Spacer()

                Image(systemName: "waveform")
                    .font(.system(size: 44, weight: .medium))
                    .foregroundStyle(FeyndTheme.coral)
                    .padding(.bottom, 22)

                Text("AUDIO SUMMARY")
                    .font(.system(size: 11.5, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(FeyndTheme.text3)
                    .padding(.bottom, 8)

                Text(title)
                    .font(.system(size: 21, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(FeyndTheme.text)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .padding(.horizontal, 28)

                Spacer()

                scrubber
                    .padding(.horizontal, 28)
                    .padding(.bottom, 26)

                transport
                    .padding(.bottom, 44)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
        .onAppear(perform: setup)
        .onDisappear(perform: teardown)
    }

    private var scrubber: some View {
        VStack(spacing: 6) {
            Slider(
                value: Binding(get: { current }, set: { current = $0 }),
                in: 0...max(duration, 1)
            ) { editing in
                scrubbing = editing
                if !editing {
                    player?.seek(to: CMTime(seconds: current, preferredTimescale: 600))
                }
            }
            .tint(FeyndTheme.coral)

            HStack {
                Text(timeString(current))
                Spacer()
                Text("-" + timeString(max(0, duration - current)))
            }
            .font(.system(size: 12, weight: .medium).monospacedDigit())
            .foregroundStyle(FeyndTheme.text3)
        }
    }

    private var transport: some View {
        HStack(spacing: 44) {
            Button { skip(-15) } label: {
                Image(systemName: "gobackward.15")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(FeyndTheme.text2)
            }
            .buttonStyle(.plain)

            Button(action: togglePlay) {
                ZStack {
                    Circle()
                        .fill(FeyndTheme.coral)
                        .frame(width: 68, height: 68)
                    Image(systemName: playing ? "pause.fill" : "play.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(.white)
                        // Optical centering — the play triangle reads
                        // left-heavy in a circle; pause needs no shift.
                        .offset(x: playing ? 0 : 2)
                }
            }
            .buttonStyle(.plain)

            Button { skip(15) } label: {
                Image(systemName: "goforward.15")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(FeyndTheme.text2)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Playback

    private func setup() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)

        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        player = p

        timeObserver = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { time in
            if !scrubbing { current = time.seconds }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { _ in
            playing = false
            current = 0
            p.seek(to: .zero)
        }

        Task {
            if let d = try? await item.asset.load(.duration), d.isNumeric {
                duration = d.seconds
            }
        }

        p.play()
        playing = true
    }

    private func teardown() {
        player?.pause()
        if let obs = timeObserver { player?.removeTimeObserver(obs) }
        if let obs = endObserver { NotificationCenter.default.removeObserver(obs) }
        timeObserver = nil
        endObserver = nil
        player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func togglePlay() {
        guard let p = player else { return }
        if playing { p.pause() } else { p.play() }
        playing.toggle()
    }

    private func skip(_ seconds: Double) {
        guard let p = player else { return }
        let target = max(0, min(duration > 0 ? duration : .greatestFiniteMagnitude, current + seconds))
        current = target
        p.seek(to: CMTime(seconds: target, preferredTimescale: 600))
    }

    private func timeString(_ secs: Double) -> String {
        guard secs.isFinite else { return "0:00" }
        let total = Int(secs.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
