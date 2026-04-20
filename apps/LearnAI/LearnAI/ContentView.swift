import SwiftUI
import RealtimeAPI

struct ContentView: View {
    @State private var session = RealtimeSession()

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.black, Color(red: 0.08, green: 0.05, blue: 0.18)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                Text("LearnAI")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Text(subtitle)
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.65))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()

                MicOrb(
                    isListening: session.conversation.isUserSpeaking,
                    isSpeaking: session.conversation.isModelSpeaking,
                    isMuted: session.conversation.muted,
                    isReady: isReady,
                    onTap: toggleMute
                )

                Spacer()

                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(session.conversation.messages.suffix(6), id: \.id) { message in
                            MessageRow(message: message)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
                }
                .frame(maxHeight: 220)

                Spacer().frame(height: 8)
            }
        }
        .preferredColorScheme(.dark)
        .task {
            await session.start()
        }
    }

    private var isReady: Bool {
        if case .ready = session.phase { return true }
        return false
    }

    private var subtitle: String {
        switch session.phase {
        case .idle: return "Starting…"
        case .connecting: return "Connecting…"
        case .ready:
            if let s = session.toolStatus { return s }
            return session.conversation.muted
                ? "Tap to un-mute and start talking"
                : "Listening. Ask me anything about AI."
        case .failed(let msg): return "Error: \(msg)"
        }
    }

    private func toggleMute() {
        guard isReady else { return }
        session.conversation.muted.toggle()
    }
}

private struct MicOrb: View {
    let isListening: Bool
    let isSpeaking: Bool
    let isMuted: Bool
    let isReady: Bool
    let onTap: () -> Void

    @State private var pulse = false

    var body: some View {
        Button(action: onTap) {
            ZStack {
                Circle()
                    .fill(ringColor.opacity(0.25))
                    .frame(width: 240, height: 240)
                    .scaleEffect(pulse ? 1.08 : 1.0)

                Circle()
                    .fill(ringColor.opacity(0.45))
                    .frame(width: 190, height: 190)
                    .scaleEffect(pulse ? 1.04 : 1.0)

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [ringColor, ringColor.opacity(0.6)],
                            center: .center, startRadius: 10, endRadius: 90
                        )
                    )
                    .frame(width: 160, height: 160)

                Image(systemName: iconName)
                    .font(.system(size: 60, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
        .disabled(!isReady)
        .opacity(isReady ? 1 : 0.5)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }

    private var ringColor: Color {
        if !isReady { return .gray }
        if isMuted { return Color(red: 0.5, green: 0.5, blue: 0.55) }
        if isSpeaking { return Color(red: 0.45, green: 0.35, blue: 0.95) }
        if isListening { return Color(red: 0.95, green: 0.35, blue: 0.55) }
        return Color(red: 0.35, green: 0.65, blue: 0.95)
    }

    private var iconName: String {
        if isMuted { return "mic.slash.fill" }
        if isSpeaking { return "waveform" }
        return "mic.fill"
    }
}

private struct MessageRow: View {
    let message: Item.Message

    var body: some View {
        let label: String = {
            switch message.role {
            case .user: return "You"
            case .assistant: return "Tutor"
            case .system: return "System"
            }
        }()
        HStack(alignment: .top, spacing: 8) {
            Text(label)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.5))
                .frame(width: 52, alignment: .leading)
            Text(transcript(of: message))
                .font(.system(size: 14, design: .rounded))
                .foregroundStyle(.white.opacity(0.9))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func transcript(of message: Item.Message) -> String {
        message.content.compactMap { $0.text }.joined(separator: " ")
    }
}

#Preview {
    ContentView()
}
