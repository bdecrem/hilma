import SwiftUI

/// One channel of the band: name, LED, mute button, level meter.
/// A locked channel shows its unlock condition instead of a meter.
struct ChannelStrip: View {
    let channel: ChannelState
    var compact = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        VStack(alignment: .leading, spacing: compact ? 8 : 10) {
            HStack(spacing: compact ? 6 : 8) {
                LED(lit: channel.unlocked, size: compact ? 7 : 8)
                Text(channel.name)
                    .dataLabel(compact ? 11 : 13, weight: .semibold)
                    .foregroundStyle(channel.unlocked ? Palette.text : Palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if !compact && channel.unlocked {
                    MuteButton()
                }
            }
            if channel.unlocked {
                LevelMeter(level: channel.level, segments: compact ? 8 : 12)
            } else if let at = channel.unlockAt {
                Text("At \(at)")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                    .frame(height: 6, alignment: .leading)
            }
        }
        .padding(compact ? 10 : 12)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        if channel.unlocked { return "\(channel.name), playing" }
        return "\(channel.name), locked, unlocks at \(channel.unlockAt ?? 0) bpm"
    }
}

struct MuteButton: View {
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 3)
        Button {} label: {
            Text("M")
                .dataLabel(11, weight: .semibold)
                .foregroundStyle(Palette.muted)
                .frame(width: 22, height: 22)
                .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Mute")
    }
}

/// Segmented level meter: lit segments in `muted`, unlit in `line`.
struct LevelMeter: View {
    let level: Int
    var segments = 12

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<segments, id: \.self) { i in
                Rectangle()
                    .fill(i < level * segments / 12 ? Palette.muted : Palette.line)
                    .frame(height: 6)
            }
        }
    }
}
