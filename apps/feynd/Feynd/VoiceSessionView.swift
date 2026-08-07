import SwiftUI

/// Voice mode — the dodo takes the call. Warm marigold glow, the dodo
/// character front and center (bobbing while it listens, breathing ring
/// while it speaks), live caption, three big circle controls.
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
            // Layered radial glow + warm-dark base.
            FeyndTheme.bg.ignoresSafeArea()
            RadialGradient(
                colors: [FeyndTheme.accent.opacity(0.25), FeyndTheme.accent.opacity(0)],
                center: UnitPoint(x: 0.5, y: 0.38),
                startRadius: 1, endRadius: 320
            )
            .ignoresSafeArea()
            RadialGradient(
                colors: [FeyndTheme.accent.opacity(0.10), FeyndTheme.accent.opacity(0)],
                center: UnitPoint(x: 0.5, y: 1.0),
                startRadius: 1, endRadius: 360
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                headerRow
                topicLabel
                Spacer(minLength: 0)
                DodoVoiceOrb(speaking: client.phase == .speaking)
                Spacer(minLength: 0)
                transcript
                statusRow
                controls
                    .padding(.bottom, 50)
            }
        }
        .task {
            await client.start()
        }
        .onDisappear { client.stop() }
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
            .background(Color.white.opacity(0.05), in: Capsule())
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

    private var topicLabel: some View {
        VStack(spacing: 4) {
            Text("TALKING ABOUT")
                .font(.system(size: 12, weight: .semibold))
                .tracking(0.5)
                .foregroundStyle(FeyndTheme.text3)
            Text(title ?? (client.model.isEmpty ? "Dodo voice session" : "Dodo · \(client.voice)"))
                .font(.custom("Fredoka", size: 23).weight(.semibold))
                .tracking(-0.3)
                .foregroundStyle(FeyndTheme.text)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 24)
        .padding(.top, 10)
    }

    private var transcript: some View {
        // Phase-driven live caption — in the design this is the keyword-highlighted
        // sentence F2 is speaking. We don't yet stream transcripts, so show a
        // phase-appropriate cue with the same typography.
        Text(transcriptText)
            .font(.system(size: 19, weight: .regular))
            .tracking(-0.3)
            .lineSpacing(7)
            .foregroundStyle(FeyndTheme.text)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 28)
            .padding(.bottom, 18)
            .frame(maxWidth: 360)
    }

    private var transcriptText: String {
        switch client.phase {
        case .idle, .requestingPermission, .creatingSession, .connecting:
            return "Connecting…"
        case .connected:
            return "Start speaking. Dodo will answer when you pause."
        case .speaking:
            return "Dodo is speaking."
        case .failed(let m): return m
        case .ended: return "Session ended."
        }
    }

    private var statusRow: some View {
        HStack(spacing: 10) {
            ListenWave(active: client.phase == .connected || client.phase == .speaking)
            Text(statusItalic)
                .italic()
                .font(.system(size: 13))
                .tracking(-0.1)
                .foregroundStyle(FeyndTheme.text2)
        }
        .padding(.bottom, 20)
        .padding(.top, 8)
    }

    private var statusItalic: String {
        switch client.phase {
        case .speaking: return "Dodo is speaking…"
        case .connected: return "Dodo is listening…"
        case .failed: return "Couldn't connect"
        case .ended: return "Ended"
        default: return "Connecting…"
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

// MARK: - Listen wave (7 thin coral bars, bouncing)

struct ListenWave: View {
    let active: Bool
    @State private var phase = 0
    private let timer = Timer.publish(every: 0.18, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<7, id: \.self) { i in
                Capsule()
                    .fill(FeyndTheme.accent)
                    .frame(width: 3, height: barHeight(i))
                    .animation(.easeInOut(duration: 0.25), value: phase)
            }
        }
        .frame(height: 14)
        .onReceive(timer) { _ in if active { phase = (phase + 1) % 4 } }
    }

    private func barHeight(_ i: Int) -> CGFloat {
        // Base pattern (matches the JSX example) shifted by `phase` for bounce.
        let base: [CGFloat] = [3, 6, 11, 6, 4, 9, 3]
        let offset = (i + phase) % base.count
        return active ? base[offset] : 4
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
