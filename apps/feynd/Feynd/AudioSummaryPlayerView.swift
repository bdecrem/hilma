import SwiftUI
import AVFoundation

/// Player sheet for a topic's narrated Audio Summary — a UI over the shared
/// AudioSummaryPlayer, which owns the actual playback. Closing this sheet
/// leaves the audio running (background mode + lock-screen controls live in
/// the controller); reopening it re-attaches to the running playback.
struct AudioSummaryPlayerView: View {
    let title: String
    let url: URL

    @Environment(\.dismiss) private var dismiss
    private var ctl: AudioSummaryPlayer { AudioSummaryPlayer.shared }

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

                speedControl
                    .padding(.top, 26)
                    .padding(.bottom, 40)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
        .onAppear { ctl.load(title: title, url: url) }
    }

    private var scrubber: some View {
        VStack(spacing: 6) {
            Slider(
                value: Binding(get: { ctl.current }, set: { ctl.current = $0 }),
                in: 0...max(ctl.duration, 1)
            ) { editing in
                ctl.scrubbing = editing
                if !editing {
                    ctl.seek(to: ctl.current)
                }
            }
            .tint(FeyndTheme.coral)

            HStack {
                Text(timeString(ctl.current))
                Spacer()
                Text("-" + timeString(max(0, ctl.duration - ctl.current)))
            }
            .font(.system(size: 12, weight: .medium).monospacedDigit())
            .foregroundStyle(FeyndTheme.text3)
        }
    }

    private var transport: some View {
        HStack(spacing: 44) {
            Button { ctl.skip(-15) } label: {
                Image(systemName: "gobackward.15")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(FeyndTheme.text2)
            }
            .buttonStyle(.plain)

            Button { ctl.togglePlay() } label: {
                ZStack {
                    Circle()
                        .fill(FeyndTheme.coral)
                        .frame(width: 68, height: 68)
                    Image(systemName: ctl.playing ? "pause.fill" : "play.fill")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(.white)
                        // Optical centering — the play triangle reads
                        // left-heavy in a circle; pause needs no shift.
                        .offset(x: ctl.playing ? 0 : 2)
                }
            }
            .buttonStyle(.plain)

            Button { ctl.skip(15) } label: {
                Image(systemName: "goforward.15")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(FeyndTheme.text2)
            }
            .buttonStyle(.plain)
        }
    }

    /// Compact speed pill — tap to cycle 1× → 1.1× → 1.25× → 1.5×. Sits on its own
    /// centered line below the transport so the play/skip row is untouched.
    private var speedControl: some View {
        Button { ctl.cycleSpeed() } label: {
            Text(speedLabel)
                .font(.system(size: 13.5, weight: .semibold).monospacedDigit())
                .foregroundStyle(ctl.speed == 1.0 ? FeyndTheme.text3 : FeyndTheme.coral)
                .frame(minWidth: 40)
                .padding(.vertical, 7)
                .padding(.horizontal, 14)
                .background(FeyndTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(ctl.speed == 1.0 ? FeyndTheme.border : FeyndTheme.coral.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Playback speed \(speedLabel)")
    }

    private var speedLabel: String {
        // 1 → "1×", 1.25 → "1.25×", 1.5 → "1.5×"
        let s = String(format: "%g", ctl.speed)
        return "\(s)×"
    }

    private func timeString(_ secs: Double) -> String {
        guard secs.isFinite else { return "0:00" }
        let total = Int(secs.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
