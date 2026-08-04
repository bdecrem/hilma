import SwiftUI

/// Voice mode — matches `VoiceScreen` in feynd-screens.jsx.
/// Coral-glow background, conic-gradient orb with Feynman center mark,
/// live transcript, listen wave, three big circle controls (Mute / Keyboard / End).
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
    @State private var orbRotation: Double = 0
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
                colors: [FeyndTheme.coral.opacity(0.25), FeyndTheme.coral.opacity(0)],
                center: UnitPoint(x: 0.5, y: 0.38),
                startRadius: 1, endRadius: 320
            )
            .ignoresSafeArea()
            RadialGradient(
                colors: [FeyndTheme.coral.opacity(0.10), FeyndTheme.coral.opacity(0)],
                center: UnitPoint(x: 0.5, y: 1.0),
                startRadius: 1, endRadius: 360
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                headerRow
                topicLabel
                Spacer(minLength: 0)
                VoiceOrb(rotation: orbRotation)
                Spacer(minLength: 0)
                transcript
                statusRow
                controls
                    .padding(.bottom, 50)
            }
        }
        .task {
            // Slow continuous rotation of the conic ring — animation drives
            // a state value rather than mutating the view to keep it smooth.
            withAnimation(.linear(duration: 16).repeatForever(autoreverses: false)) {
                orbRotation = 360
            }
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
            Text(title ?? (client.model.isEmpty ? "F2 voice session" : "F2 · \(client.voice)"))
                .font(.system(size: 22, weight: .semibold))
                .tracking(-0.5)
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
            return "Start speaking. F2 will respond when you pause."
        case .speaking:
            return "F2 is speaking."
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
        case .speaking: return "F2 is speaking…"
        case .connected: return "F2 is listening…"
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

// MARK: - Voice orb

struct VoiceOrb: View {
    let rotation: Double

    var body: some View {
        ZStack {
            // Outer halo — soft coral bloom.
            Circle()
                .fill(
                    RadialGradient(
                        colors: [FeyndTheme.coral.opacity(0.35), FeyndTheme.coral.opacity(0)],
                        center: .center, startRadius: 30, endRadius: 165
                    )
                )
                .frame(width: 320, height: 320)
                .blur(radius: 8)

            // Mid conic ring — coral cycle around the orb. Slow rotation.
            Circle()
                .fill(
                    AngularGradient(
                        colors: [
                            FeyndTheme.coral,
                            Color(hex: 0xFFB89A),
                            FeyndTheme.coral,
                            Color(hex: 0xB85A3F),
                            FeyndTheme.coral
                        ],
                        center: .center
                    )
                )
                .frame(width: 200, height: 200)
                .blur(radius: 2)
                .opacity(0.85)
                .rotationEffect(.degrees(rotation))

            // Inner glass — radial light highlight, dark falloff, faint rim.
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.white.opacity(0.18), Color.white.opacity(0)],
                        center: UnitPoint(x: 0.35, y: 0.30),
                        startRadius: 1, endRadius: 60
                    )
                )
                .background(
                    Circle().fill(
                        RadialGradient(
                            colors: [Color.black.opacity(0.45), Color.black.opacity(0)],
                            center: UnitPoint(x: 0.6, y: 0.7),
                            startRadius: 1, endRadius: 70
                        )
                    )
                )
                .frame(width: 168, height: 168)
                .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
                .shadow(color: .black.opacity(0.6), radius: 8)

            // Center two-node Feynman mark, white.
            Canvas { ctx, size in
                let y = size.height / 2
                let inset: CGFloat = 16
                let p1 = CGPoint(x: inset, y: y)
                let p2 = CGPoint(x: size.width - inset, y: y)
                var line = Path()
                line.move(to: p1); line.addLine(to: p2)
                ctx.stroke(line, with: .color(.white.opacity(0.85)), lineWidth: 2)
                let r: CGFloat = 6
                ctx.fill(Path(ellipseIn: CGRect(x: p1.x - r, y: p1.y - r, width: r*2, height: r*2)), with: .color(.white))
                ctx.fill(Path(ellipseIn: CGRect(x: p2.x - r, y: p2.y - r, width: r*2, height: r*2)), with: .color(.white))
            }
            .frame(width: 70, height: 70)
        }
        .frame(width: 240, height: 240)
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
                    .fill(FeyndTheme.coral)
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
