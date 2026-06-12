import SwiftUI

/// Voice mode inside Loci — the Peri session in Loci's clothes. Presented
/// full-screen from Today (global walk) or from any topic (scoped session).
/// Moss orb, glanceable captions, live tallies, End.
struct VoiceView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let topicId: String?
    let topicTitle: String?

    @State private var client: VoiceClient
    @State private var started = false

    init(topicId: String? = nil, topicTitle: String? = nil) {
        self.topicId = topicId
        self.topicTitle = topicTitle
        _client = State(initialValue: VoiceClient(threadId: topicId))
    }

    private var active: Bool {
        switch client.phase {
        case .idle, .ended, .failed: return false
        default: return true
        }
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            if case .ended = client.phase {
                summaryView
            } else if case .failed(let message) = client.phase {
                failedView(message)
            } else {
                liveView
            }
        }
        .task {
            guard !started else { return }
            started = true
            await client.start()
        }
        .onDisappear {
            if active { client.stop() }
        }
    }

    // MARK: Live

    private var liveView: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    client.stop()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink2)
                        .frame(width: 36, height: 36)
                        .background(Theme.raised, in: Circle())
                }
                .buttonStyle(.plain)
                Spacer()
                VStack(spacing: 2) {
                    Text(statusLabel)
                        .font(.system(size: 12, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(Theme.ink3)
                    if let topicTitle {
                        Text(topicTitle)
                            .font(.system(size: 13, weight: .medium, design: .serif))
                            .foregroundStyle(Theme.ink2)
                            .lineLimit(1)
                    }
                }
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)

            Spacer()

            VoiceOrb(speaking: client.phase == .speaking,
                     connecting: client.phase != .speaking && client.phase != .listening)

            Spacer()

            VStack(spacing: 10) {
                if !client.lastPeriLine.isEmpty {
                    Text(client.lastPeriLine)
                        .font(.system(size: 15, design: .serif))
                        .lineSpacing(3)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(4)
                        .multilineTextAlignment(.center)
                        .id("peri-" + client.lastPeriLine)
                }
                if !client.lastUserLine.isEmpty {
                    Text(client.lastUserLine)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink3)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .id("user-" + client.lastUserLine)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: client.lastPeriLine)
            .padding(.horizontal, 30)
            .frame(minHeight: 110, alignment: .top)

            if client.reviewedCount > 0 {
                HStack(spacing: 16) {
                    tallyDot(client.tally[2], Theme.solid)
                    tallyDot(client.tally[1], Theme.ochre)
                    tallyDot(client.tally[0], Theme.clay)
                }
                .padding(.bottom, 16)
            }

            Button {
                client.stop()
            } label: {
                Text("End session")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(Theme.raised, in: RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            .padding(.bottom, 30)
        }
    }

    private var statusLabel: String {
        switch client.phase {
        case .speaking: return "PERI"
        case .listening: return "LISTENING"
        default: return client.status.uppercased()
        }
    }

    private func tallyDot(_ n: Int, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text("\(n)")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink2)
        }
    }

    // MARK: End states

    private var summaryView: some View {
        VStack(spacing: 0) {
            Spacer()
            Text(client.reviewedCount > 0 ? "Nice session." : "Session ended.")
                .font(.system(size: 32, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            if client.reviewedCount > 0 {
                HStack(spacing: 22) {
                    summaryStat(client.tally[2], "solid", Theme.solid)
                    summaryStat(client.tally[1], "shaky", Theme.ochre)
                    summaryStat(client.tally[0], "forgot", Theme.clay)
                }
                .padding(.top, 24)
            } else if topicId != nil {
                Text("The conversation was saved to this topic's chat.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.ink2)
                    .padding(.top, 10)
            }
            Spacer()
            PrimaryButton(label: "Done") {
                Task { await session.refreshHome() }
                dismiss()
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 30)
        }
    }

    private func failedView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "waveform.slash")
                .font(.system(size: 30))
                .foregroundStyle(Theme.ink3)
            Text("Couldn't start voice")
                .font(.system(size: 20, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(Theme.ink2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 36)
            Spacer()
            PrimaryButton(label: "Close") { dismiss() }
                .padding(.horizontal, 24)
                .padding(.bottom, 30)
        }
    }

    private func summaryStat(_ n: Int, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 3) {
            Text("\(n)")
                .font(.system(size: 24, weight: .semibold, design: .serif))
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.ink3)
        }
        .frame(minWidth: 56)
    }
}

/// Moss-green breathing orb — Loci's voice presence.
struct VoiceOrb: View {
    let speaking: Bool
    let connecting: Bool
    @State private var breathe = false

    private static let gradient = RadialGradient(
        colors: [
            Color(red: 0.62, green: 0.80, blue: 0.67),
            Color(red: 0.33, green: 0.55, blue: 0.41),
            Color(red: 0.15, green: 0.30, blue: 0.21),
        ],
        center: UnitPoint(x: 0.35, y: 0.3),
        startRadius: 4,
        endRadius: 140
    )

    var body: some View {
        ZStack {
            Circle()
                .fill(Self.gradient)
                .frame(width: 170, height: 170)
                .scaleEffect(breathe ? (speaking ? 1.08 : 1.04) : (speaking ? 0.96 : 0.98))
                .opacity(connecting ? 0.35 : 1)
                .shadow(color: Theme.moss.opacity(speaking ? 0.5 : 0.22), radius: speaking ? 44 : 26)
            Circle()
                .stroke(Theme.moss.opacity(0.3), lineWidth: 1)
                .frame(width: 208, height: 208)
                .scaleEffect(breathe ? 1.05 : 0.97)
        }
        .animation(
            .easeInOut(duration: speaking ? 0.9 : 2.6).repeatForever(autoreverses: true),
            value: breathe
        )
        .onAppear { breathe = true }
    }
}
