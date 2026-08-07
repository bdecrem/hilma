import SwiftUI

/// Voice mode — the Dodo Radio. Talking to Dodo is a charming little
/// tabletop machine that IS the dodo: sprout antenna, blinking eyes, beak
/// dial, and a belly grille whose equalizer bars move with the session
/// (big bounce while Dodo speaks, a calm idle while it listens). The sky
/// behind it matches the app's modes: sunny morning in light, starry dusk
/// in dark. Palette comes straight from BRANDING.md / the Peck map.
struct VoiceSessionView: View {
    let mode: String
    let threadId: String?
    /// Optional header override ("Flash round · Big History").
    let title: String?
    /// When set, End hands the finished session off instead of dismissing:
    /// the transcript upload is AWAITED, then this runs with the voice
    /// session id (nil = abandoned via X / never connected). The host owns
    /// dismissal + whatever grading happens next.
    let onFinished: ((String?) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var client: RealtimeVoiceClient
    @State private var muted = false
    @State private var ending = false

    init(mode: String, threadId: String? = nil, cardIds: [String]? = nil,
         title: String? = nil, onFinished: ((String?) -> Void)? = nil) {
        self.mode = mode
        self.threadId = threadId
        self.title = title
        self.onFinished = onFinished
        _client = State(initialValue: RealtimeVoiceClient(mode: mode, threadId: threadId, cardIds: cardIds))
    }

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            VoiceSkyBackdrop().ignoresSafeArea()

            VStack(spacing: 0) {
                headerRow

                Text("TALKING ABOUT")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(2.2)
                    .foregroundStyle(FeyndTheme.text3)
                    .padding(.top, 14)

                Spacer(minLength: 0)

                DodoRadio(tape: tapeText, activity: activity)

                Spacer(minLength: 0)

                Text(transcriptText)
                    .font(.custom("Fredoka", size: 21).weight(.medium))
                    .foregroundStyle(FeyndTheme.text)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)

                controls
                    .padding(.top, 26)
                    .padding(.bottom, 50)
            }
        }
        .task {
            await client.start()
        }
        .onDisappear { client.stop() }
    }

    /// What the radio's label tape reads — the session's subject.
    private var tapeText: String {
        (title ?? "Dodo voice session").uppercased()
    }

    /// How lively the grille is: full bounce while speaking, gentle sway
    /// while listening, near-still before the session is up.
    private var activity: Double {
        switch client.phase {
        case .speaking: return 1.0
        case .connected: return 0.35
        default: return 0.12
        }
    }

    // MARK: - Sections

    private var headerRow: some View {
        HStack {
            // Green-dot status pill.
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: 0x46D18A))
                    .frame(width: 6, height: 6)
                    .shadow(color: Color(hex: 0x46D18A).opacity(0.8), radius: 4)
                Text("Voice session")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(FeyndTheme.text2)
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
            .padding(.vertical, 6)
            .background(FeyndTheme.surface.opacity(0.7), in: Capsule())
            .overlay(Capsule().stroke(FeyndTheme.border, lineWidth: 1))

            Spacer()

            Button {
                client.stop()
                if let onFinished { onFinished(nil) } else { dismiss() }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(FeyndTheme.text2)
                    .frame(width: 32, height: 32)
                    .background(FeyndTheme.surface2, in: Circle())
                    .overlay(Circle().stroke(FeyndTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 4)
    }

    private var transcriptText: String {
        switch client.phase {
        case .idle, .requestingPermission, .creatingSession, .connecting:
            return "Tuning in…"
        case .connected:
            return "Dodo is listening — just talk."
        case .speaking:
            return "Dodo is speaking…"
        case .failed(let m): return m
        case .ended: return "Session ended."
        }
    }

    private var controls: some View {
        HStack(spacing: 16) {
            CircleControlButton(
                label: "Mute", systemImage: muted ? "mic.slash.fill" : "mic.fill",
                danger: false
            ) { muted.toggle() }
            CircleControlButton(label: "Keyboard", systemImage: "keyboard", danger: false) { }
            CircleControlButton(label: ending ? "…" : "End", systemImage: "phone.down.fill", danger: true) {
                guard !ending else { return }
                if let onFinished {
                    // Flash / Final Review: wait for the transcript to land,
                    // then hand off for grading — the host dismisses.
                    ending = true
                    Task {
                        let id = await client.end()
                        onFinished(id)
                    }
                } else {
                    client.stop()
                    dismiss()
                }
            }
        }
    }
}

// MARK: - The Dodo Radio

/// The radio that is the dodo: sprout antenna, blinking eyes, blush, beak
/// dial, equalizer grille, marigold feet, and a label tape naming the topic.
struct DodoRadio: View {
    let tape: String
    /// 0…1 — how much the equalizer moves.
    let activity: Double

    private let barSpeeds: [Double] = [5.2, 6.4, 4.5, 6.9, 5.7, 4.9, 6.1]
    private let barPhases: [Double] = [0.0, 1.3, 2.4, 3.1, 4.3, 5.2, 0.7]

    var body: some View {
        VStack(spacing: 0) {
            // Sprout antenna.
            ZStack {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(hex: 0x6FAE5C))
                    .frame(width: 6, height: 36)
                Ellipse()
                    .fill(Color(hex: 0x7BB662))
                    .frame(width: 34, height: 18)
                    .rotationEffect(.degrees(-24))
                    .offset(x: -18, y: -14)
                Ellipse()
                    .fill(Color(hex: 0x5F9E4C))
                    .frame(width: 34, height: 18)
                    .rotationEffect(.degrees(22))
                    .offset(x: 18, y: -16)
            }
            .frame(height: 40)
            .zIndex(1)

            // Body.
            VStack(spacing: 0) {
                TimelineView(.animation(minimumInterval: 1.0 / 20.0)) { timeline in
                    let t = timeline.date.timeIntervalSinceReferenceDate
                    VStack(spacing: 0) {
                        // Face: blush · eye · eye · blush.
                        HStack(spacing: 26) {
                            cheek
                            eye(t: t)
                            eye(t: t)
                            cheek
                        }
                        .padding(.top, 2)

                        // Beak dial.
                        ZStack {
                            Ellipse()
                                .fill(Color(hex: 0xC9821F))
                                .frame(width: 52, height: 40)
                                .offset(y: 2.5)
                            Ellipse()
                                .fill(Color(hex: 0xF0A830))
                                .frame(width: 52, height: 40)
                        }
                        .padding(.top, 4)
                        .padding(.bottom, 16)

                        // Grille + equalizer.
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color(hex: 0x33383E))
                            .frame(height: 106)
                            .overlay(
                                HStack(spacing: 7) {
                                    ForEach(0..<7, id: \.self) { i in
                                        Capsule()
                                            .fill(Color(hex: 0xF6B04E))
                                            .frame(width: 9, height: barHeight(i, t: t))
                                    }
                                }
                            )
                    }
                }

                // Label tape — the topic.
                Text(tape)
                    .font(.system(size: 11.5, weight: .heavy))
                    .tracking(1.6)
                    .lineLimit(1)
                    .foregroundStyle(Color(hex: 0x3E3324))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Color(hex: 0xF6B04E), in: RoundedRectangle(cornerRadius: 7))
                    .frame(maxWidth: 216)
                    .padding(.top, 15)
            }
            .padding(EdgeInsets(top: 24, leading: 24, bottom: 21, trailing: 24))
            .frame(width: 272)
            .background(Color(hex: 0xF9EFDA), in: RoundedRectangle(cornerRadius: 34))
            .overlay(
                RoundedRectangle(cornerRadius: 34)
                    .stroke(FeyndTheme.border.opacity(0.6), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.28), radius: 20, y: 10)

            // Feet.
            HStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: 0xF0A830))
                    .frame(width: 34, height: 12)
                Spacer()
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: 0xF0A830))
                    .frame(width: 34, height: 12)
            }
            .padding(.horizontal, 54)
            .frame(width: 272)
            .offset(y: -3)
        }
        .accessibilityElement()
        .accessibilityLabel(activity >= 1 ? "Dodo is speaking" : "Dodo is listening")
    }

    private var cheek: some View {
        Ellipse()
            .fill(Color(hex: 0xF2A19A))
            .frame(width: 22, height: 13)
            .opacity(0.65)
            .offset(y: 8)
    }

    /// Blinking eye — closes for a beat every ~4.6s.
    private func eye(t: Double) -> some View {
        let phase = t.truncatingRemainder(dividingBy: 4.6)
        let closed = phase > 4.38 && phase < 4.52
        return ZStack {
            Circle()
                .fill(Color(hex: 0x33383E))
                .frame(width: 30, height: 30)
            Circle()
                .fill(.white)
                .frame(width: 10, height: 10)
                .offset(x: -5, y: -5)
        }
        .scaleEffect(y: closed ? 0.12 : 1, anchor: .center)
    }

    /// Deterministic per-bar wave — amplitude scales with session activity.
    private func barHeight(_ i: Int, t: Double) -> CGFloat {
        let wave = 0.5 + 0.5 * sin(t * barSpeeds[i] + barPhases[i])
        let base = 14.0
        let amp = 8.0 + 52.0 * activity
        return CGFloat(base + amp * wave)
    }
}

// MARK: - Sky backdrop (starry dusk / sunny morning, like the Peck map)

private struct VoiceSkyBackdrop: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            if scheme == .dark {
                // Dusk glow + crescent moon + a few calm stars.
                RadialGradient(
                    colors: [Color(hex: 0x4A3D63).opacity(0.55), Color(hex: 0x4A3D63).opacity(0)],
                    center: UnitPoint(x: 0.5, y: 0.30),
                    startRadius: 10, endRadius: w * 0.85
                )
                ZStack {
                    Circle().fill(Color(hex: 0xF3E3B2))
                        .frame(width: 44, height: 44)
                    Circle().fill(Color(hex: 0x1E2440).opacity(0.92))
                        .frame(width: 44, height: 44)
                        .offset(x: 13, y: -4)
                }
                .position(x: 62, y: 118)
                ForEach(0..<8, id: \.self) { i in
                    let fi = Double(i)
                    Circle()
                        .fill(Color(hex: 0xF3E9C8).opacity(0.30 + 0.35 * ((fi * 0.618).truncatingRemainder(dividingBy: 1))))
                        .frame(width: 3, height: 3)
                        .position(
                            x: w * (0.10 + 0.82 * ((fi * 0.618 + 0.21).truncatingRemainder(dividingBy: 1))),
                            y: 70 + 620 * ((fi * 0.755).truncatingRemainder(dividingBy: 1))
                        )
                }
            } else {
                // Morning: soft sun + two cloud puffs.
                Circle()
                    .fill(Color(hex: 0xFFD469))
                    .frame(width: 56, height: 56)
                    .background(
                        Circle().fill(Color(hex: 0xFFD469).opacity(0.28))
                            .frame(width: 92, height: 92)
                    )
                    .position(x: 66, y: 122)
                cloud(width: 74).position(x: w - 82, y: 168)
                cloud(width: 54).position(x: w - 120, y: 148)
            }
        }
        .allowsHitTesting(false)
    }

    private func cloud(width: CGFloat) -> some View {
        Capsule()
            .fill(Color.white.opacity(0.85))
            .frame(width: width, height: 15)
    }
}

// MARK: - Circle control button

struct CircleControlButton: View {
    let label: String
    let systemImage: String
    let danger: Bool
    var action: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(danger ? .white : FeyndTheme.text)
                    .frame(width: 58, height: 58)
                    .background(
                        Circle().fill(danger ? Color(hex: 0xC84A3C) : FeyndTheme.surface2)
                    )
                    .overlay(
                        Circle().stroke(danger ? Color(hex: 0xE0635A) : FeyndTheme.border, lineWidth: 1)
                    )
                    .shadow(color: danger ? Color(hex: 0xC84A3C).opacity(0.4) : .black.opacity(0.3),
                            radius: danger ? 18 : 14, y: 4)
            }
            .buttonStyle(.plain)

            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.2)
                .foregroundStyle(danger ? Color(hex: 0xE88A82) : FeyndTheme.text2)
        }
    }
}
